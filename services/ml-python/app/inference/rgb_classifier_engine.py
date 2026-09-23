"""
RGB Oil Spill Inference Engine (Part 0.14B).
Provides deterministic evaluation of optical marine imagery (JPG, JPEG, PNG).
Enforces modality guard against raw SAR/TIFF raster data.
"""

import os
import time
import hashlib
from typing import Dict, Any, Optional
import numpy as np
import torch
from PIL import Image

from app.models.rgb_classifier import (
    load_rgb_classifier,
    INFERENCE_TRANSFORMS,
    DEFAULT_DECISION_THRESHOLD,
    MODEL_ID,
    MODEL_VERSION,
)


class ModalityGuardError(Exception):
    """Raised when an inappropriate image modality (e.g. SAR TIFF) is passed to the RGB classifier."""
    pass


class InvalidImageInputError(Exception):
    """Raised when the input file is missing, unreadable, corrupted, or not a supported image format."""
    pass


# Global cached model instance
_CACHED_MODEL = None
_CACHED_METADATA = None


def get_or_load_model() -> tuple:
    global _CACHED_MODEL, _CACHED_METADATA
    if _CACHED_MODEL is None:
        _CACHED_MODEL, _CACHED_METADATA = load_rgb_classifier()
    return _CACHED_MODEL, _CACHED_METADATA


def check_modality(file_path: str) -> Dict[str, Any]:
    """
    Inspect magic bytes and extension to enforce the RGB Modality Guard.
    TIFF / GeoTIFF rasters must NOT be processed by the RGB optical classifier.
    """
    if not os.path.exists(file_path):
        raise InvalidImageInputError(f"Image file does not exist on disk.")

    file_size = os.path.getsize(file_path)
    if file_size == 0:
        raise InvalidImageInputError("Image file is empty (0 bytes).")

    with open(file_path, "rb") as f:
        head = f.read(16)

    # TIFF Magic Bytes
    if head.startswith(b"II\x2a\x00") or head.startswith(b"MM\x00\x2a"):
        raise ModalityGuardError(
            "TIFF/SAR imagery detected. Multi-band scientific SAR rasters must not be routed through "
            "the optical RGB classifier. Please use the SAR-specific analysis pipeline."
        )

    # Check for valid JPEG / PNG
    is_jpeg = head.startswith(b"\xff\xd8\xff")
    is_png = head.startswith(b"\x89PNG\r\n\x1a\n")

    if not (is_jpeg or is_png):
        # Fallback check extension
        ext = os.path.splitext(file_path)[1].lower()
        if ext in [".tif", ".tiff"]:
            raise ModalityGuardError(
                "TIFF/SAR format detected. TIFF/SAR rasters must be analyzed via the SAR pipeline, not the RGB classifier."
            )
        if ext not in [".jpg", ".jpeg", ".png"]:
            raise InvalidImageInputError(f"Unsupported file format '{ext}'. Only JPG, JPEG, and PNG are supported for optical RGB classification.")

    return {
        "modality": "OPTICAL_RGB",
        "format": "PNG" if is_png else "JPEG",
        "size_bytes": file_size,
    }


def classify_rgb_image(
    image_path: str,
    threshold: Optional[float] = None,
    device: Optional[torch.device] = None
) -> Dict[str, Any]:
    """
    Execute RGB Oil vs Non-Oil binary classification.
    Returns:
      - status: "OIL_SPILL_DETECTED" | "NO_OIL_SPILL_DETECTED"
      - model_probability: float (0.0 to 1.0)
      - threshold: float
      - decision_rule: str
      - model_metadata: Dict
      - location: "NOT_ESTABLISHED"
    """
    start_time = time.time()

    # 1. Modality Guard & File Integrity
    modality_info = check_modality(image_path)

    # 2. Open and verify image with PIL
    try:
        with Image.open(image_path) as img:
            img.verify()
        # Re-open for actual processing since verify() closes/invalidates the handle
        with Image.open(image_path) as img:
            rgb_img = img.convert("RGB")
            orig_width, orig_height = img.size
    except Exception as e:
        raise InvalidImageInputError(f"Failed to decode image: Corrupted or invalid image data.")

    # 3. Deterministic Preprocessing
    tensor = INFERENCE_TRANSFORMS(rgb_img).unsqueeze(0)  # Shape: (1, 3, 224, 224)

    # 4. Load Model
    model, meta = get_or_load_model()
    target_device = device or next(model.parameters()).device
    tensor = tensor.to(target_device)

    # 5. Forward Pass
    with torch.no_grad():
        logit = model(tensor)
        prob = torch.sigmoid(logit).item()

    operating_threshold = threshold if threshold is not None else meta.get("decision_threshold", DEFAULT_DECISION_THRESHOLD)
    oil_detected = prob >= operating_threshold

    inference_time_ms = round((time.time() - start_time) * 1000, 2)

    return {
        "status": "OIL_SPILL_DETECTED" if oil_detected else "NO_OIL_SPILL_DETECTED",
        "oil_spill_detected": oil_detected,
        "model_probability": round(float(prob), 4),
        "decision_threshold": float(operating_threshold),
        "probability_label": "MODEL_PROBABILITY",
        "modality": "OPTICAL_RGB",
        "location": "NOT_ESTABLISHED",
        "input_metadata": {
            "format": modality_info["format"],
            "width": orig_width,
            "height": orig_height,
            "size_bytes": modality_info["size_bytes"],
        },
        "model_info": {
            "model_id": meta["model_id"],
            "version": meta["version"],
            "architecture": meta["architecture"],
            "checkpoint_sha256": meta["checkpoint_sha256"],
            "device": str(target_device),
        },
        "inference_time_ms": inference_time_ms,
    }
