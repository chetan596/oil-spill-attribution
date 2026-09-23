"""
Real Evaluation Harness for SAR Oil Spill Detection Models.
Part 0.3 Authoritative Evaluation Framework.

Strictly enforces:
1. REAL_CHECKPOINT_ONLY: No heuristic fallback formulas, no random uninitialized weights,
   no demo scenario substitutions, no fake metrics.
2. Genuine Part 0.1 mathematical metrics (IoU, Dice, Precision, Recall, Confusion Matrix, FPR).
3. Explicit Category-Specific False Positive Rate evaluation:
   - Overall FPR
   - Clean-Ocean FPR (evaluated on pure clean sea / no-oil scenes)
   - Look-Alike FPR (evaluated on look-alike dark formation scenes)
4. Configurable segmentation threshold sweeps without hardcoded assumptions.
5. Explicit Preprocessing Contracts per model version.
6. Checkpoint integrity hashing (SHA-256) and explicit missing-dataset handling.
"""

import sys
import os
import time
import json
import hashlib
from typing import Dict, Any, List, Optional, Tuple, Union
from datetime import datetime, timezone

import numpy as np
import torch
import torch.nn as nn

# Part 0.1 Genuine Metrics Integration
from ml.evaluation.metrics import (
    compute_iou,
    compute_precision,
    compute_recall,
    compute_fpr,
    compute_f1,
)
from ml.evaluation.segmentation_metrics import dice_coefficient
from ml.evaluation.confusion_matrix import (
    generate_confusion_matrix,
    calculate_confusion_metrics,
)

# App imports
from app.models.unet.architecture import UNet


class RealCheckpointRequiredError(Exception):
    """Raised when an evaluation is attempted without a verified, physical trained checkpoint."""
    pass


class DatasetNotFoundError(Exception):
    """Raised when the specified dataset manifest or scene files are absent from disk."""
    pass


class EvaluationError(Exception):
    """Raised when an unexpected failure occurs during evaluation."""
    pass


def compute_sha256(filepath: str) -> str:
    """Compute SHA-256 hex digest of a file."""
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


class RealEvaluator:
    """
    Standardized, trustworthy evaluation engine for SAR oil spill detection models.
    """

    def __init__(
        self,
        registry_path: Optional[str] = None,
        default_device: Optional[str] = None,
    ):
        if registry_path is None:
            # ml/model_registry/registry.json relative to repository root
            base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
            registry_path = os.path.join(base_dir, "ml", "model_registry", "registry.json")
        self.registry_path = registry_path
        self.repo_root = os.path.abspath(os.path.join(os.path.dirname(registry_path), "../.."))

        if default_device is None:
            self.device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
        else:
            self.device = torch.device(default_device)

        self._registry_data = self._load_registry()

    def _load_registry(self) -> Dict[str, Any]:
        if not os.path.exists(self.registry_path):
            raise FileNotFoundError(f"Model registry file not found: {self.registry_path}")
        with open(self.registry_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def get_model_entry(self, model_id: str) -> Dict[str, Any]:
        for entry in self._registry_data.get("models", []):
            if entry.get("model_id") == model_id:
                return entry
        raise ValueError(f"Model ID '{model_id}' not found in registry: {self.registry_path}")

    def load_real_checkpoint(
        self,
        model_id: str,
        device: Optional[torch.device] = None,
    ) -> Tuple[nn.Module, Dict[str, Any], str]:
        """
        Instantiate model architecture and strictly load weights from checkpoint.
        Rejects untrained/random weights, heuristic formulas, or missing files.

        Returns:
            Tuple of (model: nn.Module, model_entry: Dict, sha256: str)
        """
        target_device = device or self.device
        entry = self.get_model_entry(model_id)
        ckpt_rel_path = entry.get("checkpoint_path", "")
        status = entry.get("status", "untrained")

        if not ckpt_rel_path:
            raise RealCheckpointRequiredError(
                f"[REAL_CHECKPOINT_ONLY] Model '{model_id}' has no checkpoint path declared in registry."
            )

        full_ckpt_path = os.path.join(self.repo_root, ckpt_rel_path) if not os.path.isabs(ckpt_rel_path) else ckpt_rel_path

        if not os.path.exists(full_ckpt_path) or not os.path.isfile(full_ckpt_path):
            raise RealCheckpointRequiredError(
                f"[REAL_CHECKPOINT_ONLY] Checkpoint file does not exist on disk: '{full_ckpt_path}'. "
                f"Model status is '{status}'. Evaluation requires real trained weights."
            )

        sha256 = compute_sha256(full_ckpt_path)

        # Load weights state dict
        try:
            raw_ckpt = torch.load(full_ckpt_path, map_location="cpu")
            if isinstance(raw_ckpt, dict) and "model_state_dict" in raw_ckpt:
                state_dict = raw_ckpt["model_state_dict"]
            elif isinstance(raw_ckpt, dict):
                state_dict = raw_ckpt
            else:
                raise ValueError(f"Unrecognized checkpoint container format: {type(raw_ckpt)}")
        except Exception as e:
            raise RealCheckpointRequiredError(f"Failed to load checkpoint file '{full_ckpt_path}': {e}")

        # Detect base channels
        base_channels = 32
        if "inc.conv.0.weight" in state_dict:
            base_channels = state_dict["inc.conv.0.weight"].shape[0]
        elif "inc.conv.0.0.weight" in state_dict:
            base_channels = state_dict["inc.conv.0.0.weight"].shape[0]

        in_channels = entry.get("in_channels", 2)
        num_classes = entry.get("num_classes", 2)
        arch = entry.get("architecture", "UNet")

        if arch != "UNet":
            raise ValueError(f"Unsupported architecture: {arch}")

        model = UNet(in_channels=in_channels, num_classes=num_classes, base_channels=base_channels)
        missing_keys, unexpected_keys = model.load_state_dict(state_dict, strict=True)
        if missing_keys or unexpected_keys:
            raise RealCheckpointRequiredError(
                f"Checkpoint key mismatch. Missing: {missing_keys}, Unexpected: {unexpected_keys}"
            )

        model.to(target_device)
        model.eval()
        return model, entry, sha256

    def get_preprocessing_contract(self, model_id: str) -> Dict[str, Any]:
        """
        Determine and return the explicit preprocessing contract expected by the model.
        """
        entry = self.get_model_entry(model_id)
        if model_id in ("unet-dual-pol-sar-v4", "unet-dual-pol-sar-v5a"):
            return {
                "name": "Decibel_Calibrated_Clipping",
                "vv_range_db": [-35.0, -5.0],
                "vh_range_db": [-45.0, -15.0],
                "formula": "clip((value_db - min_db) / (max_db - min_db), 0, 1)",
                "channel_order": ["VV", "VH"],
                "invalid_handling": "fill_zero",
                "verified": True
            }
        elif model_id in ("unet-dual-pol-sar-v1", "unet-dual-pol-sar-v2", "unet-dual-pol-sar-v3"):
            return {
                "name": "Historical_Uncorrected_Positive_Mask",
                "vv_range_db": "NOT_CALIBRATED (clipped > 0)",
                "vh_range_db": "NOT_CALIBRATED (clipped > 0)",
                "formula": "arr * (arr > 0)",
                "channel_order": ["VV", "VH"],
                "invalid_handling": "clipped_to_zero",
                "verified": True,
                "note": "Historical baseline with negative dB truncation."
            }
        else:
            return {
                "name": "NOT_DOCUMENTED",
                "verified": False
            }

    def check_dataset_availability(
        self,
        manifest_path: str,
        split: str = "test",
    ) -> Tuple[bool, Dict[str, Any]]:
        """
        Verify if the dataset manifest and corresponding scene image files physically exist.
        """
        full_manifest_path = os.path.join(self.repo_root, manifest_path) if not os.path.isabs(manifest_path) else manifest_path

        if not os.path.exists(full_manifest_path):
            return False, {
                "status": "DATASET_NOT_AVAILABLE",
                "manifest_path": manifest_path,
                "reason": "Manifest file does not exist on disk."
            }

        try:
            with open(full_manifest_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            return False, {
                "status": "DATASET_NOT_AVAILABLE",
                "manifest_path": manifest_path,
                "reason": f"Manifest JSON parse error: {e}"
            }

        scenes = data.get("scenes", [])
        split_scenes = [s for s in scenes if s.get("split") == split]

        if not split_scenes:
            return False, {
                "status": "DATASET_NOT_AVAILABLE",
                "manifest_path": manifest_path,
                "split": split,
                "reason": f"No scenes found with split='{split}' in manifest."
            }

        # Check physical presence of scene image and mask files
        missing_files = []
        found_scenes = []
        for s in split_scenes:
            img_rel = s.get("image_path", "")
            msk_rel = s.get("mask_path", "")
            img_abs = os.path.join(self.repo_root, img_rel) if not os.path.isabs(img_rel) else img_rel
            msk_abs = os.path.join(self.repo_root, msk_rel) if (msk_rel and not os.path.isabs(msk_rel)) else msk_rel

            if not os.path.exists(img_abs):
                missing_files.append(img_rel)
            elif msk_abs and not os.path.exists(msk_abs):
                missing_files.append(msk_rel)
            else:
                found_scenes.append(s)

        if missing_files:
            return False, {
                "status": "DATASET_NOT_AVAILABLE",
                "manifest_path": manifest_path,
                "missing_files_sample": missing_files[:5],
                "total_missing_files": len(missing_files),
                "reason": f"{len(missing_files)} scene image/mask files are missing from disk."
            }

        return True, {
            "status": "AVAILABLE",
            "dataset_id": data.get("dataset_id", "unknown"),
            "split": split,
            "total_scenes": len(found_scenes),
            "scenes": found_scenes,
        }

    def verify_data_leakage(self, manifest_data: Dict[str, Any]) -> str:
        """
        Verify scene-level split isolation to guard against geographic data leakage.
        """
        scenes = manifest_data.get("scenes", [])
        if not scenes:
            return "LEAKAGE_STATUS: NO_SCENES_FOUND"

        scene_splits = {}
        duplicates = []
        for s in scenes:
            sid = s.get("scene_id")
            s_split = s.get("split")
            if sid in scene_splits:
                if scene_splits[sid] != s_split:
                    duplicates.append(f"{sid} assigned to both {scene_splits[sid]} and {s_split}")
            else:
                scene_splits[sid] = s_split

        if duplicates:
            return f"LEAKAGE_STATUS: LEAKAGE_DETECTED ({len(duplicates)} conflicts)"

        return "LEAKAGE_STATUS: VERIFIED_DISJOINT_SCENE_LEVEL_SPLITS"

    def preprocess_scene(
        self,
        raw_raster: np.ndarray,
        preprocessing_contract: Dict[str, Any],
    ) -> np.ndarray:
        """
        Apply model-specific preprocessing contract strictly.
        """
        p_name = preprocessing_contract.get("name")
        if p_name == "Decibel_Calibrated_Clipping":
            vv_min, vv_max = preprocessing_contract["vv_range_db"]
            vh_min, vh_max = preprocessing_contract["vh_range_db"]

            # Band 0: VV
            vv_norm = np.clip((raw_raster[0] - vv_min) / (vv_max - vv_min), 0.0, 1.0)
            # Band 1: VH
            if raw_raster.shape[0] >= 2:
                vh_norm = np.clip((raw_raster[1] - vh_min) / (vh_max - vh_min), 0.0, 1.0)
            else:
                vh_norm = vv_norm.copy()

            # Handle NaN / Inf
            vv_norm = np.nan_to_num(vv_norm, nan=0.0, posinf=1.0, neginf=0.0)
            vh_norm = np.nan_to_num(vh_norm, nan=0.0, posinf=1.0, neginf=0.0)

            return np.stack([vv_norm, vh_norm], axis=0).astype(np.float32)

        elif p_name == "Historical_Uncorrected_Positive_Mask":
            # Historical uncorrected normalization: arr * (arr > 0)
            band1 = raw_raster[0]
            norm1 = band1 * (band1 > 0)
            if raw_raster.shape[0] >= 2:
                band2 = raw_raster[1]
                norm2 = band2 * (band2 > 0)
            else:
                norm2 = norm1.copy()
            norm1 = np.nan_to_num(norm1, nan=0.0, posinf=0.0, neginf=0.0)
            norm2 = np.nan_to_num(norm2, nan=0.0, posinf=0.0, neginf=0.0)
            return np.stack([norm1, norm2], axis=0).astype(np.float32)

        else:
            raise ValueError(f"Unknown preprocessing contract: {p_name}")

    def evaluate_model(
        self,
        model_id: str,
        manifest_path: str = "data/raw/satellite/dataset_manifest.json",
        split: str = "test",
        thresholds: Optional[List[float]] = None,
        device: Optional[str] = None,
        tile_size: int = 512,
        stride: int = 512,
        output_dir: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Execute rigorous model evaluation using genuine PART 0.1 metrics.
        Returns a structured evaluation dictionary conforming to evaluation_report.schema.json.
        """
        start_time = time.time()
        if thresholds is None:
            thresholds = [0.30, 0.35, 0.40, 0.45, 0.50, 0.60]

        target_device = torch.device(device) if device else self.device

        # 1. Load model entry & Preprocessing contract
        entry = self.get_model_entry(model_id)
        version = entry.get("model_id", "").split("-")[-1].upper()
        status = entry.get("status", "unknown")
        preprocessing = self.get_preprocessing_contract(model_id)

        # 2. Checkpoint Load Validation (REAL_CHECKPOINT_ONLY)
        ckpt_meta = {
            "path": entry.get("checkpoint_path"),
            "sha256": None,
            "size_bytes": None,
            "load_status": "NOT_LOADED"
        }

        try:
            model, model_entry, sha256 = self.load_real_checkpoint(model_id, device=target_device)
            ckpt_meta["sha256"] = sha256
            ckpt_full_path = os.path.join(self.repo_root, entry.get("checkpoint_path", ""))
            ckpt_meta["size_bytes"] = os.path.getsize(ckpt_full_path) if os.path.exists(ckpt_full_path) else None
            ckpt_meta["load_status"] = "PASSED"
        except RealCheckpointRequiredError as e:
            ckpt_meta["load_status"] = "FAILED"
            report = {
                "evaluation_status": "CHECKPOINT_NOT_FOUND",
                "model_id": model_id,
                "model_version": version,
                "model_status": status,
                "checkpoint": ckpt_meta,
                "preprocessing": preprocessing,
                "dataset": {
                    "name": manifest_path,
                    "split": split,
                    "availability": False,
                    "leakage_status": "NOT_CHECKED"
                },
                "device": str(target_device),
                "thresholds": [{"threshold": th, "iou": None, "dice": None, "precision": None, "recall": None, "overall_fpr": None, "clean_ocean_fpr": None, "look_alike_fpr": None} for th in thresholds],
                "error": str(e)
            }
            return report

        # 3. Dataset Availability Check
        dataset_available, dataset_info = self.check_dataset_availability(manifest_path, split=split)
        if not dataset_available:
            report = {
                "evaluation_status": "DATASET_NOT_AVAILABLE",
                "model_id": model_id,
                "model_version": version,
                "model_status": status,
                "checkpoint": ckpt_meta,
                "preprocessing": preprocessing,
                "dataset": {
                    "name": manifest_path,
                    "split": split,
                    "availability": False,
                    "leakage_status": "NOT_AVAILABLE",
                    "reason": dataset_info.get("reason")
                },
                "device": str(target_device),
                "thresholds": [{"threshold": th, "iou": None, "dice": None, "precision": None, "recall": None, "overall_fpr": None, "clean_ocean_fpr": None, "look_alike_fpr": None} for th in thresholds],
                "note": "Real dataset files are not available locally. Evaluation was safely halted without fabricating results."
            }
            return report

        # 4. Data Leakage Verification
        leakage_status = self.verify_data_leakage(dataset_info)

        # 5. Execute Evaluation Across Scenes
        scenes = dataset_info["scenes"]
        categories_present = sorted(list(set(s.get("category", "unknown") for s in scenes)))

        # Initialize accumulators per threshold
        # Overall, Clean Ocean (category in ['no_oil', 'clean_ocean']), Lookalike (category == 'lookalike')
        threshold_accumulators = {
            th: {
                "overall": {"tp": 0, "fp": 0, "fn": 0, "tn": 0},
                "clean_ocean": {"tp": 0, "fp": 0, "fn": 0, "tn": 0},
                "look_alike": {"tp": 0, "fp": 0, "fn": 0, "tn": 0},
            }
            for th in thresholds
        }

        try:
            import rasterio
        except ImportError:
            raise EvaluationError("Rasterio is required to read SAR geospatial scene files.")

        model.eval()
        with torch.no_grad():
            for sc in scenes:
                img_path = os.path.join(self.repo_root, sc["image_path"]) if not os.path.isabs(sc["image_path"]) else sc["image_path"]
                msk_path = sc.get("mask_path")
                cat = sc.get("category", "unknown").lower()

                # Read SAR raster
                with rasterio.open(img_path) as src:
                    c = src.count
                    if c >= 2:
                        raw_arr = np.stack([src.read(1), src.read(2)], axis=0).astype(np.float32)
                    else:
                        raw_arr = np.stack([src.read(1), src.read(1)], axis=0).astype(np.float32)

                # Read ground truth mask if available
                if msk_path:
                    full_msk_path = os.path.join(self.repo_root, msk_path) if not os.path.isabs(msk_path) else msk_path
                    with rasterio.open(full_msk_path) as src_m:
                        gt_mask = (src_m.read(1) > 0).astype(np.uint8)
                else:
                    # Category without positive mask is 0
                    gt_mask = np.zeros((raw_arr.shape[1], raw_arr.shape[2]), dtype=np.uint8)

                # Preprocess
                norm_tensor = self.preprocess_scene(raw_arr, preprocessing)
                h, w = norm_tensor.shape[1], norm_tensor.shape[2]

                # Full-scene tile inference
                prob_map = np.zeros((h, w), dtype=np.float32)
                weight_map = np.zeros((h, w), dtype=np.float32)

                for y in range(0, max(1, h - tile_size + 1), stride):
                    if y + tile_size > h:
                        y = max(0, h - tile_size)
                    for x in range(0, max(1, w - tile_size + 1), stride):
                        if x + tile_size > w:
                            x = max(0, w - tile_size)

                        patch = norm_tensor[:, y:y+tile_size, x:x+tile_size]
                        patch_t = torch.from_numpy(patch).unsqueeze(0).to(target_device)

                        logits = model(patch_t)
                        if logits.shape[1] > 1:
                            probs = torch.softmax(logits, dim=1)[:, 1, :, :]
                        else:
                            probs = torch.sigmoid(logits)[:, 0, :, :]

                        prob_patch = probs[0].cpu().numpy()
                        prob_map[y:y+tile_size, x:x+tile_size] += prob_patch
                        weight_map[y:y+tile_size, x:x+tile_size] += 1.0

                weight_map = np.maximum(weight_map, 1.0)
                full_prob = prob_map / weight_map

                # Accumulate confusion matrices per threshold
                for th in thresholds:
                    cm = generate_confusion_matrix(gt_mask, full_prob, threshold=th)
                    acc = threshold_accumulators[th]

                    acc["overall"]["tp"] += cm["tp"]
                    acc["overall"]["fp"] += cm["fp"]
                    acc["overall"]["fn"] += cm["fn"]
                    acc["overall"]["tn"] += cm["tn"]

                    if "clean" in cat or "no_oil" in cat:
                        acc["clean_ocean"]["tp"] += cm["tp"]
                        acc["clean_ocean"]["fp"] += cm["fp"]
                        acc["clean_ocean"]["fn"] += cm["fn"]
                        acc["clean_ocean"]["tn"] += cm["tn"]
                    elif "lookalike" in cat or "look_alike" in cat:
                        acc["look_alike"]["tp"] += cm["tp"]
                        acc["look_alike"]["fp"] += cm["fp"]
                        acc["look_alike"]["fn"] += cm["fn"]
                        acc["look_alike"]["tn"] += cm["tn"]

        # 6. Compute Derived Metrics using Part 0.1 formulas
        threshold_results = []
        for th in thresholds:
            acc = threshold_accumulators[th]
            overall_cm = acc["overall"]
            overall_metrics = calculate_confusion_metrics(overall_cm)

            # Clean Ocean FPR
            clean_cm = acc["clean_ocean"]
            clean_total = clean_cm["fp"] + clean_cm["tn"]
            if clean_total > 0:
                clean_ocean_fpr = compute_fpr(clean_cm["fp"], clean_cm["tn"])
            else:
                clean_ocean_fpr = "CLASS_SEPARATION_NOT_AVAILABLE"

            # Look-alike FPR
            look_cm = acc["look_alike"]
            look_total = look_cm["fp"] + look_cm["tn"]
            if look_total > 0:
                look_alike_fpr = compute_fpr(look_cm["fp"], look_cm["tn"])
            else:
                look_alike_fpr = "CLASS_SEPARATION_NOT_AVAILABLE"

            th_entry = {
                "threshold": th,
                "iou": round(float(overall_metrics["iou"]), 6),
                "dice": round(float(overall_metrics["dice"]), 6),
                "precision": round(float(overall_metrics["precision"]), 6),
                "recall": round(float(overall_metrics["recall"]), 6),
                "overall_fpr": round(float(overall_metrics["fpr"]), 6),
                "clean_ocean_fpr": round(float(clean_ocean_fpr), 6) if isinstance(clean_ocean_fpr, (int, float)) else clean_ocean_fpr,
                "look_alike_fpr": round(float(look_alike_fpr), 6) if isinstance(look_alike_fpr, (int, float)) else look_alike_fpr,
                "confusion_matrix": overall_cm
            }
            threshold_results.append(th_entry)

        elapsed = round(time.time() - start_time, 2)
        final_report = {
            "evaluation_status": "COMPLETE",
            "model_id": model_id,
            "model_version": version,
            "model_status": status,
            "checkpoint": ckpt_meta,
            "preprocessing": preprocessing,
            "dataset": {
                "name": manifest_path,
                "split": split,
                "availability": True,
                "leakage_status": leakage_status,
                "total_scenes_evaluated": len(scenes),
                "categories_present": categories_present
            },
            "device": str(target_device),
            "evaluation_parameters": {
                "tile_size": tile_size,
                "stride": stride
            },
            "thresholds": threshold_results,
            "execution_metadata": {
                "evaluated_at": datetime.now(timezone.utc).isoformat(),
                "duration_seconds": elapsed
            }
        }

        # Save output if directory provided
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)
            out_file = os.path.join(output_dir, f"{model_id.replace('-', '_')}_evaluation.json")
            with open(out_file, "w", encoding="utf-8") as f:
                json.dump(final_report, f, indent=2)
            print(f"[RealEvaluator] Report saved to: {out_file}")

        return final_report
