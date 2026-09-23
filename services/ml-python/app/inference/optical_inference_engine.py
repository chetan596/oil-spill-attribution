"""
Optical Oil Spill Inference Engine (Part 0.14D).
Provides end-to-end inference for manual optical marine imagery uploads:
  1. Cryptographic model integrity verification (Classifier V2 + Segmentation V2).
  2. 3-Class Oil vs Look-Alike vs Clean Ocean classification (ResNet-18 V2).
  3. Pixel-level domain-adaptive semantic segmentation (UNet ResNet-18 V2) at frozen threshold tau = 0.80.
  4. Non-destructive visual annotation generator (semi-transparent overlay + contour).
  5. Deterministic artifact persistence and metadata generation.
"""

import os
import time
import hashlib
from enum import Enum
from typing import Dict, Any, Optional, Tuple, List, Union
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import transforms
from PIL import Image
import scipy.ndimage

from app.models.rgb_classifier_v2 import (
    RgbOilClassifierV2,
    predict_optical_image,
    CLASS_NAMES,
    NORMALIZE_MEAN as CLF_NORM_MEAN,
    NORMALIZE_STD as CLF_NORM_STD,
)
from app.models.optical_unet_resnet18_v2 import OpticalUNetResNet18V2
from app.preprocessing.optical_preprocessor import (
    letterbox_image,
    reverse_letterbox_mask,
    generate_optical_tiles,
    reconstruct_optical_probability_map,
    LetterboxMetadata,
    TileMetadata,
)


CLASSIFIER_MODEL_ID = "rgb-oil-classifier-resnet18-v2"
CLASSIFIER_EXPECTED_SHA256 = "6ccf88c8be6764384297005effedbaf047165ef20dc4148911bc66ddfc10dd84"

SEGMENTATION_MODEL_ID = "optical-oil-seg-unet-resnet18-v2"
SEGMENTATION_EXPECTED_SHA256 = "e3d44f7e480daedf42ef5e96fd0e650193f5763f8dac38630fd21a034e5ea398"
SEGMENTATION_FROZEN_THRESHOLD = 0.80

SEG_IMAGE_SIZE = (256, 256)
SEG_NORM_MEAN = [0.485, 0.456, 0.406]
SEG_NORM_STD = [0.229, 0.224, 0.225]


class InferenceMode(str, Enum):
    """Supported optical preprocessing and inference execution modes."""
    LEGACY_V2 = "LEGACY_V2"
    ASPECT_PRESERVING = "ASPECT_PRESERVING"
    TILED = "TILED"


class ModelVerificationError(Exception):
    """Raised when model checkpoint is missing, corrupted, or fails SHA-256 integrity verification."""
    pass


class ModalityValidationError(Exception):
    """Raised when input image cannot be decoded or is not a valid optical image."""
    pass


def compute_file_sha256(filepath: str) -> str:
    """Compute SHA-256 digest of a file on disk."""
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def resolve_checkpoint_path(filename: str, subfolder: str) -> str:
    """Resolve checkpoint file path dynamically across supported repository structures."""
    candidates = [
        os.path.join(os.path.dirname(__file__), f"../models/{subfolder}/{filename}"),
        os.path.join(os.path.dirname(__file__), f"../models/{filename}"),
        os.path.abspath(f"services/ml-python/app/models/{subfolder}/{filename}"),
        os.path.abspath(f"services/ml-python/app/models/{filename}"),
        os.path.abspath(f"ml/experiments/results/{subfolder}/{filename}"),
    ]
    for p in candidates:
        norm_p = os.path.normpath(p)
        if os.path.exists(norm_p) and os.path.isfile(norm_p):
            return norm_p
    raise FileNotFoundError(f"Checkpoint '{filename}' not found in candidate paths.")


class OpticalInferenceEngine:
    """
    Singleton inference engine for manual optical imagery.
    Loads and caches verified frozen checkpoints for Classifier V2 and Segmentation V2.
    Supports LEGACY_V2, ASPECT_PRESERVING, and TILED preprocessing modes.
    """
    def __init__(self, device: Optional[torch.device] = None):
        self.device = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self._classifier_model: Optional[RgbOilClassifierV2] = None
        self._classifier_meta: Optional[Dict[str, Any]] = None
        self._segmentation_model: Optional[OpticalUNetResNet18V2] = None
        self._segmentation_meta: Optional[Dict[str, Any]] = None

    def load_and_verify_classifier(self) -> Tuple[RgbOilClassifierV2, Dict[str, Any]]:
        """Load and verify frozen Classifier V2 checkpoint (FAIL-CLOSED)."""
        if self._classifier_model is not None:
            return self._classifier_model, self._classifier_meta

        ckpt_path = resolve_checkpoint_path("rgb_oil_classifier_v2.pth", "rgb_oil_classifier_v2")
        calc_sha = compute_file_sha256(ckpt_path)

        if calc_sha != CLASSIFIER_EXPECTED_SHA256:
            raise ModelVerificationError(
                f"[FAIL-CLOSED] Classifier V2 SHA-256 mismatch! "
                f"Computed: '{calc_sha}', Expected: '{CLASSIFIER_EXPECTED_SHA256}'."
            )

        model = RgbOilClassifierV2(pretrained=False, num_classes=3)
        state_dict = torch.load(ckpt_path, map_location=self.device, weights_only=True)
        model.load_state_dict(state_dict)
        model.to(self.device)
        model.eval()

        self._classifier_model = model
        self._classifier_meta = {
            "model_id": CLASSIFIER_MODEL_ID,
            "version": "2.0.0",
            "checkpoint_path": ckpt_path,
            "checkpoint_sha256": calc_sha,
            "classes": CLASS_NAMES,
            "status": "EXPERIMENTAL",
        }
        return self._classifier_model, self._classifier_meta

    def load_and_verify_segmentation(self) -> Tuple[OpticalUNetResNet18V2, Dict[str, Any]]:
        """Load and verify frozen Segmentation V2 checkpoint (FAIL-CLOSED)."""
        if self._segmentation_model is not None:
            return self._segmentation_model, self._segmentation_meta

        ckpt_path = resolve_checkpoint_path("optical_oil_segmentation_v2.pth", "optical_oil_segmentation_v2")
        calc_sha = compute_file_sha256(ckpt_path)

        if calc_sha != SEGMENTATION_EXPECTED_SHA256:
            raise ModelVerificationError(
                f"[FAIL-CLOSED] Segmentation V2 SHA-256 mismatch! "
                f"Computed: '{calc_sha}', Expected: '{SEGMENTATION_EXPECTED_SHA256}'."
            )

        model = OpticalUNetResNet18V2(pretrained=False, num_classes=1, use_deep_supervision=False)
        ckpt_data = torch.load(ckpt_path, map_location=self.device, weights_only=False)
        state_dict = ckpt_data["model_state_dict"] if isinstance(ckpt_data, dict) and "model_state_dict" in ckpt_data else ckpt_data
        model.load_state_dict(state_dict)
        model.to(self.device)
        model.eval()

        self._segmentation_model = model
        self._segmentation_meta = {
            "model_id": SEGMENTATION_MODEL_ID,
            "version": "2.0.0",
            "checkpoint_path": ckpt_path,
            "checkpoint_sha256": calc_sha,
            "threshold": SEGMENTATION_FROZEN_THRESHOLD,
            "status": "EXPERIMENTAL",
        }
        return self._segmentation_model, self._segmentation_meta

    def generate_visual_artifacts(
        self,
        pil_image: Image.Image,
        prob_map_full: np.ndarray,
        binary_mask_full: np.ndarray,
        output_dir: str,
        prefix: str = "manual"
    ) -> Dict[str, str]:
        """
        Generate non-destructive visual artifacts:
          1. original_image: Normalized source image.
          2. mask_image: Binary 0/255 segmentation mask PNG.
          3. annotated_image: Source RGB + semi-transparent red/magenta overlay (#EF4444) + 2px boundary contour.
        """
        os.makedirs(output_dir, exist_ok=True)
        w, h = pil_image.size

        # 1. Original image
        orig_path = os.path.join(output_dir, f"{prefix}_original.png")
        pil_image.save(orig_path, format="PNG")

        # 2. Binary mask image (0 or 255)
        mask_uint8 = (binary_mask_full * 255).astype(np.uint8)
        mask_pil = Image.fromarray(mask_uint8, mode="L")
        mask_path = os.path.join(output_dir, f"{prefix}_mask.png")
        mask_pil.save(mask_path, format="PNG")

        # 3. Composite Annotated Image
        img_rgb_arr = np.array(pil_image.convert("RGB")).astype(np.float32)
        annotated_arr = img_rgb_arr.copy()

        oil_mask_bool = (binary_mask_full == 1)
        if np.any(oil_mask_bool):
            # Overlay color: Restrained Red/Magenta (#EF4444 -> R:239, G:68, B:68)
            overlay_color = np.array([239.0, 68.0, 68.0], dtype=np.float32)
            alpha = 0.40  # 40% opacity overlay

            # Blend overlay on spill pixels
            annotated_arr[oil_mask_bool] = (
                annotated_arr[oil_mask_bool] * (1.0 - alpha) + overlay_color * alpha
            )

            # Outer boundary contour (dilation difference)
            dilated = scipy.ndimage.binary_dilation(oil_mask_bool, iterations=2)
            boundary = dilated ^ oil_mask_bool
            annotated_arr[boundary] = overlay_color

        annotated_arr = np.clip(annotated_arr, 0, 255).astype(np.uint8)
        annotated_pil = Image.fromarray(annotated_arr, mode="RGB")
        annotated_path = os.path.join(output_dir, f"{prefix}_annotated.png")
        annotated_pil.save(annotated_path, format="PNG")

        return {
            "original_image": orig_path,
            "mask_image": mask_path,
            "annotated_image": annotated_path,
        }

    def run_inference(
        self,
        image_path: str,
        output_dir: Optional[str] = None,
        prefix: str = "manual",
        mode: Union[InferenceMode, str] = InferenceMode.LEGACY_V2,
        tile_size: int = 256,
        overlap_ratio: float = 0.25
    ) -> Dict[str, Any]:
        """
        Execute frozen optical inference pipeline:
          - Modality & file integrity validation
          - Classifier V2 execution
          - Segmentation V2 execution (threshold tau = 0.80) with selected Preprocessing Mode:
              * LEGACY_V2 (default): direct isotropic square resize
              * ASPECT_PRESERVING: letterbox with inverse mapping back to original dimensions
              * TILED: sliding overlapping tiles with 2D Hann window reconstruction
          - Artifact generation
          - Structured results compilation
        """
        start_time = time.time()
        if isinstance(mode, str):
            mode = InferenceMode(mode)

        if not os.path.exists(image_path):
            raise ModalityValidationError(f"Image file does not exist at path: '{image_path}'")

        # 1. Load Image
        try:
            with Image.open(image_path) as img:
                img.verify()
            with Image.open(image_path) as img:
                orig_width, orig_height = img.size
                pil_rgb = img.convert("RGB")
        except Exception as e:
            raise ModalityValidationError(f"Failed to open or decode image: {str(e)}")

        # 2. Checkpoint Verification & Model Loading
        clf_model, clf_meta = self.load_and_verify_classifier()
        seg_model, seg_meta = self.load_and_verify_segmentation()

        # 3. Classifier V2 Inference
        if mode == InferenceMode.ASPECT_PRESERVING:
            clf_img, clf_letterbox_meta = letterbox_image(pil_rgb, target_size=(224, 224))
        else:
            clf_img = pil_rgb

        clf_res = predict_optical_image(
            model=clf_model,
            image=clf_img,
            decision_threshold=0.50, # uses frozen decision rule
            device=self.device
        )

        pred_label = clf_res["predicted_class"] # "CLEAN_OCEAN" | "LOOK_ALIKE" | "OIL_SPILL"
        confidence = round(clf_res["confidence"], 4)
        probs_dict = {
            "CLEAN_OCEAN": round(clf_res["probabilities"]["clean_ocean"], 4),
            "LOOK_ALIKE": round(clf_res["probabilities"]["look_alike"], 4),
            "OIL_SPILL": round(clf_res["probabilities"]["oil_spill"], 4),
        }

        # 4. Segmentation V2 Inference
        seg_transform = transforms.Compose([
            transforms.ToTensor(),
            transforms.Normalize(mean=SEG_NORM_MEAN, std=SEG_NORM_STD),
        ])

        preprocessing_meta: Dict[str, Any] = {"mode": mode.value}

        if mode == InferenceMode.LEGACY_V2:
            # Legacy direct square resize
            legacy_transform = transforms.Compose([
                transforms.Resize(SEG_IMAGE_SIZE, interpolation=transforms.InterpolationMode.BILINEAR),
                transforms.ToTensor(),
                transforms.Normalize(mean=SEG_NORM_MEAN, std=SEG_NORM_STD),
            ])
            input_tensor = legacy_transform(pil_rgb).unsqueeze(0).to(self.device)

            with torch.no_grad():
                seg_logits = seg_model(input_tensor, return_aux=False)
                seg_probs_256 = torch.sigmoid(seg_logits) # (1, 1, 256, 256)

                # Bilinear upsample back to original image resolution (1, 1, H, W)
                seg_probs_orig = F.interpolate(
                    seg_probs_256,
                    size=(orig_height, orig_width),
                    mode="bilinear",
                    align_corners=True
                )
                prob_map_full = seg_probs_orig.squeeze().cpu().numpy() # (H, W)

        elif mode == InferenceMode.ASPECT_PRESERVING:
            # Aspect-preserving letterbox
            padded_img, letterbox_meta = letterbox_image(pil_rgb, target_size=SEG_IMAGE_SIZE)
            preprocessing_meta["letterbox"] = letterbox_meta.to_dict()
            input_tensor = seg_transform(padded_img).unsqueeze(0).to(self.device)

            with torch.no_grad():
                seg_logits = seg_model(input_tensor, return_aux=False)
                seg_probs_256 = torch.sigmoid(seg_logits).squeeze().cpu().numpy() # (256, 256)

            # Invert letterbox padding back to exact original dimensions
            prob_map_full = reverse_letterbox_mask(
                prediction_map=seg_probs_256,
                metadata=letterbox_meta,
                interpolation="bilinear"
            )

        elif mode == InferenceMode.TILED:
            # Overlapping tiles inference with 2D Hann blending
            tiles, tile_coords, tile_meta = generate_optical_tiles(
                pil_rgb,
                tile_size=tile_size,
                overlap_ratio=overlap_ratio
            )
            preprocessing_meta["tiling"] = tile_meta.to_dict()

            tile_probs: List[np.ndarray] = []
            with torch.no_grad():
                for chip in tiles:
                    t_tensor = seg_transform(chip).unsqueeze(0).to(self.device)
                    t_logits = seg_model(t_tensor, return_aux=False)
                    t_prob = torch.sigmoid(t_logits).squeeze().cpu().numpy()
                    tile_probs.append(t_prob)

            prob_map_full, recon_ms = reconstruct_optical_probability_map(
                tile_probabilities=tile_probs,
                tile_coords=tile_coords,
                full_height=orig_height,
                full_width=orig_width,
                tile_size=tile_size,
                blend_window="hann"
            )
            preprocessing_meta["tiling"]["reconstruction_time_ms"] = recon_ms

        else:
            raise ValueError(f"Unsupported inference mode: {mode}")

        # Apply frozen threshold tau = 0.80
        binary_mask_full = (prob_map_full >= SEGMENTATION_FROZEN_THRESHOLD).astype(np.uint8)
        fg_pixels = int(np.sum(binary_mask_full == 1))
        total_pixels = int(orig_width * orig_height)
        fg_fraction = round(float(fg_pixels / total_pixels) if total_pixels > 0 else 0.0, 6)

        # 5. Visual Artifact Generation
        artifact_paths = {}
        if output_dir:
            artifact_paths = self.generate_visual_artifacts(
                pil_image=pil_rgb,
                prob_map_full=prob_map_full,
                binary_mask_full=binary_mask_full,
                output_dir=output_dir,
                prefix=prefix
            )

        inference_time_ms = round((time.time() - start_time) * 1000, 2)

        return {
            "model": {
                "classifier": CLASSIFIER_MODEL_ID,
                "classifier_version": clf_meta["version"],
                "classifier_checkpoint_sha256": clf_meta["checkpoint_sha256"],
                "segmentation": SEGMENTATION_MODEL_ID,
                "segmentation_version": seg_meta["version"],
                "segmentation_checkpoint_sha256": seg_meta["checkpoint_sha256"],
                "segmentation_threshold": SEGMENTATION_FROZEN_THRESHOLD,
                "status": "EXPERIMENTAL",
                "preprocessing_mode": mode.value,
            },
            "classification": {
                "label": pred_label,
                "confidence": confidence,
                "probabilities": probs_dict,
                "is_oil_spill": bool(pred_label == "OIL_SPILL" or probs_dict["OIL_SPILL"] >= 0.50)
            },
            "segmentation": {
                "performed": True,
                "mask_available": True,
                "foreground_pixels": fg_pixels,
                "foreground_fraction": fg_fraction,
                "confidence_threshold": SEGMENTATION_FROZEN_THRESHOLD,
                "oil_detected": bool(fg_pixels >= 10)
            },
            "input_metadata": {
                "width": orig_width,
                "height": orig_height,
                "total_pixels": total_pixels,
                "format": pil_rgb.format or "RGB"
            },
            "preprocessing": preprocessing_meta,
            "artifacts": artifact_paths,
            "geospatial": {
                "status": "NOT_ESTABLISHED"
            },
            "inference_time_ms": inference_time_ms
        }


# Global singleton instance
optical_engine = OpticalInferenceEngine()

