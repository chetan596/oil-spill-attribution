"""
Baseline Evaluation Engine for SAR Oil Spill Detection Models.
Part 0.5 Authoritative Benchmark Evaluator.

Enforces:
1. Real Checkpoint Only (SHA-256 verification).
2. Real Data Only (40-scene verified subset).
3. Explicit Preprocessing Lineage (V2 uncorrected vs V4 calibrated dB).
4. Full-Scene 2048x2048 Reconstruction via 512x512 Tiling.
5. Separation of Validation (7 scenes) and Held-Out Test (5 scenes).
6. Threshold Sweeps: 0.30, 0.35, 0.40, 0.45, 0.50, 0.60.
7. Category-Isolated False Positive Rates (Clean Ocean & Look-Alike).
8. Micro (Pixel-Level) and Macro (Scene-Level) Aggregations.
9. Full Reproducibility Metadata and Runtime Profiling.
"""

import os
import sys
import time
import json
import hashlib
from typing import Dict, Any, List, Optional, Tuple, Union
from datetime import datetime, timezone

import numpy as np
import torch
import torch.nn as nn

# Ensure paths
_CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.abspath(os.path.join(_CURRENT_DIR, "../.."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)
_ML_PYTHON = os.path.join(_REPO_ROOT, "services", "ml-python")
if _ML_PYTHON not in sys.path:
    sys.path.insert(0, _ML_PYTHON)

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

# App Imports
from app.models.unet.architecture import UNet
from app.preprocessing.tiling import generate_tiles, reconstruct_full_mask


def compute_file_sha256(filepath: str) -> str:
    """Compute SHA-256 hex digest of a file."""
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


class BaselineEvaluationRunner:
    """
    Executes reproducible, deterministic evaluations of V2 and V4 model checkpoints.
    """

    EXPECTED_CHECKPOINT_HASHES = {
        "unet-dual-pol-sar-v2": "905ef8e47c1f4b12eb490b33f1726fb91714b3dfcdf5184d8dfd96ec312f0dbd",
        "unet-dual-pol-sar-v4": "c1395f1deae819b222f9e1034472d18a84f502fd89d4076981d3291f4af4fd63",
    }

    SWEEP_THRESHOLDS = [0.30, 0.35, 0.40, 0.45, 0.50, 0.60]

    def __init__(
        self,
        repo_root: Optional[str] = None,
        manifest_path: Optional[str] = None,
        device: Optional[str] = None,
        tile_size: int = 512,
        stride: int = 448,
    ):
        self.repo_root = repo_root or _REPO_ROOT
        self.manifest_path = manifest_path or os.path.join(self.repo_root, "ml", "datasets", "manifest.json")
        self.tile_size = tile_size
        self.stride = stride

        if device is None:
            self.device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
        else:
            self.device = torch.device(device)

        self.manifest_data = self._load_and_verify_manifest()

    def _load_and_verify_manifest(self) -> Dict[str, Any]:
        """Verify existence and baseline integrity of manifest."""
        if not os.path.exists(self.manifest_path):
            raise FileNotFoundError(f"Manifest not found: {self.manifest_path}")
        with open(self.manifest_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        scenes = data.get("scenes", [])
        if len(scenes) != 40:
            raise ValueError(f"Expected exactly 40 scenes in manifest, found {len(scenes)}")

        # Verify split counts
        train_count = sum(1 for s in scenes if s.get("split") == "train")
        val_count = sum(1 for s in scenes if s.get("split") == "val")
        test_count = sum(1 for s in scenes if s.get("split") == "test")

        if train_count != 28 or val_count != 7 or test_count != 5:
            raise ValueError(
                f"Split mismatch: expected 28 train, 7 val, 5 test. Got {train_count}/{val_count}/{test_count}"
            )

        return data

    def load_model(self, model_id: str) -> Tuple[nn.Module, Dict[str, Any]]:
        """
        Load registered model checkpoint with SHA-256 verification and CUDA transfer.
        """
        if model_id == "unet-dual-pol-sar-v2":
            rel_ckpt = "ml/model_registry/versions/unet_dual_pol_sar_v2.pth"
            version = "V2"
            base_channels = 16
            preprocessing = {
                "name": "Historical_Uncorrected_Positive_Mask",
                "vv_range_db": "NOT_CALIBRATED (clipped > 0)",
                "vh_range_db": "NOT_CALIBRATED (clipped > 0)",
                "formula": "arr * (arr > 0)",
                "channel_order": ["VV", "VH"],
                "invalid_handling": "clipped_to_zero",
                "verified": True,
                "note": "Historical baseline with negative dB truncation."
            }
        elif model_id == "unet-dual-pol-sar-v4":
            rel_ckpt = "ml/model_registry/versions/unet_dual_pol_sar_v4.pth"
            version = "V4"
            base_channels = 16
            preprocessing = {
                "name": "Decibel_Calibrated_Clipping",
                "vv_range_db": [-35.0, -5.0],
                "vh_range_db": [-45.0, -15.0],
                "formula": "clip((value_db - min_db) / (max_db - min_db), 0, 1)",
                "channel_order": ["VV", "VH"],
                "invalid_handling": "fill_zero",
                "verified": True
            }
        else:
            raise ValueError(f"Unsupported model_id for baseline evaluation: {model_id}")

        full_ckpt = os.path.join(self.repo_root, rel_ckpt)
        if not os.path.exists(full_ckpt):
            raise FileNotFoundError(f"Checkpoint not found: {full_ckpt}")

        actual_sha256 = compute_file_sha256(full_ckpt)
        expected_sha256 = self.EXPECTED_CHECKPOINT_HASHES.get(model_id)

        if expected_sha256 and actual_sha256 != expected_sha256:
            raise ValueError(
                f"CHECKPOINT_HASH_CHANGED: Model '{model_id}' hash mismatch! "
                f"Expected: {expected_sha256}, Got: {actual_sha256}"
            )

        # Load weights
        raw_ckpt = torch.load(full_ckpt, map_location="cpu")
        if isinstance(raw_ckpt, dict) and "model_state_dict" in raw_ckpt:
            state_dict = raw_ckpt["model_state_dict"]
        elif isinstance(raw_ckpt, dict):
            state_dict = raw_ckpt
        else:
            raise ValueError(f"Unrecognized checkpoint format: {type(raw_ckpt)}")

        model = UNet(in_channels=2, num_classes=2, base_channels=base_channels)
        missing, unexpected = model.load_state_dict(state_dict, strict=True)
        if missing or unexpected:
            raise RuntimeError(f"State dict mismatch: missing {missing}, unexpected {unexpected}")

        model.to(self.device)
        model.eval()

        meta = {
            "model_id": model_id,
            "version": version,
            "checkpoint_path": rel_ckpt,
            "sha256": actual_sha256,
            "size_bytes": os.path.getsize(full_ckpt),
            "base_channels": base_channels,
            "preprocessing": preprocessing,
        }
        return model, meta

    def preprocess_scene(self, raw_raster: np.ndarray, preprocessing_contract: Dict[str, Any]) -> np.ndarray:
        """Apply model-specific preprocessing."""
        p_name = preprocessing_contract["name"]
        if p_name == "Decibel_Calibrated_Clipping":
            vv_min, vv_max = preprocessing_contract["vv_range_db"]
            vh_min, vh_max = preprocessing_contract["vh_range_db"]
            vv_norm = np.clip((raw_raster[0] - vv_min) / (vv_max - vv_min), 0.0, 1.0)
            if raw_raster.shape[0] >= 2:
                vh_norm = np.clip((raw_raster[1] - vh_min) / (vh_max - vh_min), 0.0, 1.0)
            else:
                vh_norm = vv_norm.copy()
            vv_norm = np.nan_to_num(vv_norm, nan=0.0, posinf=1.0, neginf=0.0)
            vh_norm = np.nan_to_num(vh_norm, nan=0.0, posinf=1.0, neginf=0.0)
            return np.stack([vv_norm, vh_norm], axis=0).astype(np.float32)

        elif p_name == "Historical_Uncorrected_Positive_Mask":
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

    def evaluate_scene(
        self,
        model: nn.Module,
        scene_info: Dict[str, Any],
        preprocessing_contract: Dict[str, Any],
        thresholds: List[float],
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        Run inference on a single 2048x2048 scene and evaluate at all thresholds.
        Returns:
            - scene_metrics_dict: Dict with results per threshold
            - runtime_info: Dict with timing and tile counts
        """
        import rasterio

        img_path = os.path.join(self.repo_root, scene_info["image_path"])
        msk_path = scene_info.get("mask_path")

        with rasterio.open(img_path) as src:
            if src.count >= 2:
                raw_raster = np.stack([src.read(1), src.read(2)], axis=0).astype(np.float32)
            else:
                raw_raster = np.stack([src.read(1), src.read(1)], axis=0).astype(np.float32)

        if msk_path:
            full_msk_path = os.path.join(self.repo_root, msk_path)
            with rasterio.open(full_msk_path) as src_m:
                gt_mask = (src_m.read(1) > 0).astype(np.uint8)
        else:
            gt_mask = np.zeros((raw_raster.shape[1], raw_raster.shape[2]), dtype=np.uint8)

        # Preprocess
        preprocessed = self.preprocess_scene(raw_raster, preprocessing_contract)
        _, h, w = preprocessed.shape

        # Tiling
        tiles, coords = generate_tiles(preprocessed, tile_size=self.tile_size, stride=self.stride)

        # Inference on tiles
        tile_preds = []
        t0 = time.perf_counter()
        with torch.no_grad():
            for tile in tiles:
                tile_t = torch.from_numpy(tile).unsqueeze(0).to(self.device)
                logits = model(tile_t)
                # Channel 1 represents oil probability
                probs = torch.softmax(logits, dim=1)[:, 1, :, :]
                tile_preds.append(probs[0].cpu().numpy())
        inference_time = time.perf_counter() - t0

        # Full-scene reconstruction
        full_prob = reconstruct_full_mask(
            tile_predictions=tile_preds,
            tile_coords=coords,
            full_height=h,
            full_width=w,
            tile_size=self.tile_size,
        )

        gt_pos_pixels = int(gt_mask.sum())

        # Evaluate across thresholds
        threshold_results = {}
        for th in thresholds:
            cm = generate_confusion_matrix(gt_mask, full_prob, threshold=th)
            m = calculate_confusion_metrics(cm)
            pred_pixels = int((full_prob >= th).sum())

            threshold_results[str(th)] = {
                "threshold": th,
                "tp": cm["tp"],
                "fp": cm["fp"],
                "fn": cm["fn"],
                "tn": cm["tn"],
                "iou": float(m["iou"]),
                "dice": float(m["dice"]),
                "precision": float(m["precision"]),
                "recall": float(m["recall"]),
                "fpr": float(m["fpr"]),
                "prediction_pixels": pred_pixels,
                "ground_truth_pixels": gt_pos_pixels,
                "inference_status": "PASSED",
            }

        runtime_info = {
            "scene_id": scene_info["scene_id"],
            "tile_count": len(tiles),
            "inference_time_seconds": round(inference_time, 4),
            "avg_tile_time_ms": round((inference_time / len(tiles)) * 1000, 2),
        }

        scene_record = {
            "scene_id": scene_info["scene_id"],
            "sample_id": scene_info.get("sample_id", scene_info["scene_id"]),
            "split": scene_info["split"],
            "category": scene_info.get("category", "unknown"),
            "image_path": scene_info["image_path"],
            "mask_path": scene_info.get("mask_path"),
            "height": h,
            "width": w,
            "ground_truth_pixels": gt_pos_pixels,
            "metrics_by_threshold": threshold_results,
            "runtime": runtime_info,
        }

        return scene_record, runtime_info

    def evaluate_split(
        self,
        model_id: str,
        split: str,
        thresholds: Optional[List[float]] = None,
    ) -> Dict[str, Any]:
        """
        Evaluate all scenes in a given split ('val' or 'test') for a specific model.
        """
        if thresholds is None:
            thresholds = self.SWEEP_THRESHOLDS

        model, meta = self.load_model(model_id)
        scenes = [s for s in self.manifest_data["scenes"] if s.get("split") == split]

        if not scenes:
            raise ValueError(f"No scenes found for split='{split}' in manifest")

        # Track GPU memory if available
        if torch.cuda.is_available():
            torch.cuda.reset_peak_memory_stats(self.device)

        start_time = time.time()
        scene_evaluations = []
        runtime_records = []

        for s in scenes:
            scene_rec, rt = self.evaluate_scene(
                model=model,
                scene_info=s,
                preprocessing_contract=meta["preprocessing"],
                thresholds=thresholds,
            )
            scene_evaluations.append(scene_rec)
            runtime_records.append(rt)

        total_elapsed = time.time() - start_time
        peak_vram_mb = (
            torch.cuda.max_memory_allocated(self.device) / (1024 * 1024)
            if torch.cuda.is_available()
            else 0.0
        )

        manifest_sha256 = compute_file_sha256(self.manifest_path)

        # Build output structure conforming to Step 13 & Step 19
        result = {
            "evaluation_status": "COMPLETE",
            "model_id": model_id,
            "model_version": meta["version"],
            "checkpoint": {
                "path": meta["checkpoint_path"],
                "sha256": meta["sha256"],
                "size_bytes": meta["size_bytes"],
            },
            "preprocessing": meta["preprocessing"],
            "dataset": {
                "manifest_path": "ml/datasets/manifest.json",
                "manifest_sha256": manifest_sha256,
                "split": split,
                "scene_count": len(scenes),
                "scene_ids": [s["scene_id"] for s in scenes],
            },
            "environment": {
                "device": str(self.device),
                "device_name": torch.cuda.get_device_name(self.device) if torch.cuda.is_available() else "CPU",
                "pytorch_version": torch.__version__,
                "cuda_version": torch.version.cuda if torch.cuda.is_available() else None,
                "tile_size": self.tile_size,
                "stride": self.stride,
                "evaluated_at": datetime.now(timezone.utc).isoformat(),
            },
            "runtime": {
                "total_duration_seconds": round(total_elapsed, 3),
                "total_tiles": sum(r["tile_count"] for r in runtime_records),
                "peak_cuda_vram_mb": round(peak_vram_mb, 2),
                "scene_runtimes": runtime_records,
            },
            "scenes": scene_evaluations,
        }

        return result

    def compute_aggregate(
        self,
        split_result: Dict[str, Any],
        thresholds: Optional[List[float]] = None,
    ) -> Dict[str, Any]:
        """
        Compute micro (pixel-level) and macro (scene-level) aggregates across all scenes.
        Calculates overall, clean-ocean, and look-alike FPRs.
        """
        if thresholds is None:
            thresholds = self.SWEEP_THRESHOLDS

        scenes = split_result["scenes"]
        split = split_result["dataset"]["split"]
        model_id = split_result["model_id"]
        model_version = split_result["model_version"]

        threshold_aggregates = []

        for th in thresholds:
            th_str = str(th)
            # Accumulators for micro aggregate
            cm_all = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}
            cm_oil = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}
            cm_clean = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}
            cm_lookalike = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}

            # Macro lists
            macro_ious = []
            macro_dices = []
            macro_precs = []
            macro_recalls = []
            macro_fprs = []

            for s in scenes:
                cat = s["category"].lower()
                m = s["metrics_by_threshold"][th_str]

                cm_all["tp"] += m["tp"]
                cm_all["fp"] += m["fp"]
                cm_all["fn"] += m["fn"]
                cm_all["tn"] += m["tn"]

                macro_ious.append(m["iou"])
                macro_dices.append(m["dice"])
                macro_precs.append(m["precision"])
                macro_recalls.append(m["recall"])
                macro_fprs.append(m["fpr"])

                if "oil" in cat and "no_oil" not in cat:
                    cm_oil["tp"] += m["tp"]
                    cm_oil["fp"] += m["fp"]
                    cm_oil["fn"] += m["fn"]
                    cm_oil["tn"] += m["tn"]
                elif "clean" in cat or "no_oil" in cat:
                    cm_clean["tp"] += m["tp"]
                    cm_clean["fp"] += m["fp"]
                    cm_clean["fn"] += m["fn"]
                    cm_clean["tn"] += m["tn"]
                elif "lookalike" in cat or "look_alike" in cat:
                    cm_lookalike["tp"] += m["tp"]
                    cm_lookalike["fp"] += m["fp"]
                    cm_lookalike["fn"] += m["fn"]
                    cm_lookalike["tn"] += m["tn"]

            # Compute Micro Metrics
            micro_metrics = calculate_confusion_metrics(cm_all)

            # Clean Ocean FPR
            clean_total = cm_clean["fp"] + cm_clean["tn"]
            if clean_total > 0:
                clean_ocean_fpr = compute_fpr(cm_clean["fp"], cm_clean["tn"])
            else:
                clean_ocean_fpr = None

            # Look-Alike FPR
            look_total = cm_lookalike["fp"] + cm_lookalike["tn"]
            if look_total > 0:
                look_alike_fpr = compute_fpr(cm_lookalike["fp"], cm_lookalike["tn"])
            else:
                look_alike_fpr = None

            # Macro averages
            macro_summary = {
                "mean_iou": round(float(np.mean(macro_ious)), 6),
                "mean_dice": round(float(np.mean(macro_dices)), 6),
                "mean_precision": round(float(np.mean(macro_precs)), 6),
                "mean_recall": round(float(np.mean(macro_recalls)), 6),
                "mean_fpr": round(float(np.mean(macro_fprs)), 6),
            }

            th_agg = {
                "threshold": th,
                "micro_pixel_aggregate": {
                    "tp": cm_all["tp"],
                    "fp": cm_all["fp"],
                    "fn": cm_all["fn"],
                    "tn": cm_all["tn"],
                    "iou": round(float(micro_metrics["iou"]), 6),
                    "dice": round(float(micro_metrics["dice"]), 6),
                    "precision": round(float(micro_metrics["precision"]), 6),
                    "recall": round(float(micro_metrics["recall"]), 6),
                    "fpr": round(float(micro_metrics["fpr"]), 6),
                },
                "macro_scene_average": macro_summary,
                "category_breakdown": {
                    "clean_ocean": {
                        "confusion_matrix": cm_clean,
                        "fpr": round(float(clean_ocean_fpr), 6) if clean_ocean_fpr is not None else "CLASS_NOT_AVAILABLE",
                        "status": "EVALUATED" if clean_total > 0 else "CLASS_NOT_AVAILABLE",
                    },
                    "look_alike": {
                        "confusion_matrix": cm_lookalike,
                        "fpr": round(float(look_alike_fpr), 6) if look_alike_fpr is not None else "CLASS_NOT_AVAILABLE",
                        "status": "EVALUATED" if look_total > 0 else "CLASS_NOT_AVAILABLE",
                    },
                    "oil_scenes": {
                        "confusion_matrix": cm_oil,
                        "iou": round(float(calculate_confusion_metrics(cm_oil)["iou"]), 6) if (cm_oil["tp"]+cm_oil["fp"]+cm_oil["fn"]) > 0 else 0.0,
                        "status": "EVALUATED" if (cm_oil["tp"]+cm_oil["fp"]+cm_oil["fn"]+cm_oil["tn"]) > 0 else "CLASS_NOT_AVAILABLE",
                    }
                }
            }
            threshold_aggregates.append(th_agg)

        return {
            "model_id": model_id,
            "model_version": model_version,
            "split": split,
            "scene_count": len(scenes),
            "checkpoint": split_result["checkpoint"],
            "preprocessing": split_result["preprocessing"],
            "environment": split_result["environment"],
            "threshold_aggregates": threshold_aggregates,
        }
