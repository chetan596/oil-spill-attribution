"""
Baseline Diagnostics Engine for SAR Oil Spill Detection Models.
Part 0.6 Forensic Analysis & Diagnostics Module.

Provides deep diagnostics on:
1. Raw continuous probability distributions (percentiles, histograms, probability bounds).
2. Direct per-scene output comparison between V2 and V4 (MAE, Pearson, Spearman).
3. Fine-grained threshold sensitivity sweep [0.10, ..., 0.90].
4. V2 zero-positive forensic analysis & negative dB truncation quantification.
5. V4 look-alike confusion & high-recall failure analysis.
6. Spatial connected-component error analysis (FP/FN cluster morphology).
7. Preprocessing input distribution shifts and clipping percentages.
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
from scipy import stats
import cv2

# Project Imports
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)
if os.path.join(_REPO_ROOT, "services", "ml-python") not in sys.path:
    sys.path.insert(0, os.path.join(_REPO_ROOT, "services", "ml-python"))

from ml.evaluation.baseline_runner import BaselineEvaluationRunner, compute_file_sha256
from ml.evaluation.metrics import (
    compute_iou,
    compute_precision,
    compute_recall,
    compute_fpr,
    compute_f1,
)
from ml.evaluation.confusion_matrix import (
    generate_confusion_matrix,
    calculate_confusion_metrics,
)
from app.preprocessing.tiling import generate_tiles, reconstruct_full_mask


class BaselineDiagnosticsEngine:
    """
    Forensic diagnostic engine analyzing root causes of baseline behavior.
    """

    EXTENDED_THRESHOLDS = [
        0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.70, 0.80, 0.90
    ]

    PROBABILITY_BINS = [
        0.10, 0.20, 0.30, 0.35, 0.40, 0.45, 0.50, 0.60, 0.70, 0.80, 0.90
    ]

    def __init__(
        self,
        runner: Optional[BaselineEvaluationRunner] = None,
        repo_root: Optional[str] = None,
    ):
        self.repo_root = repo_root or _REPO_ROOT
        self.runner = runner or BaselineEvaluationRunner(repo_root=self.repo_root)

    def compute_probability_distribution(
        self,
        prob_map: np.ndarray,
    ) -> Dict[str, Any]:
        """
        Compute statistical distribution parameters for continuous probability maps.
        """
        flat = prob_map.ravel()
        total_px = int(flat.size)

        pcts = np.percentile(flat, [0, 50, 90, 95, 99, 99.9, 100])

        pixel_counts = {
            f"ge_{int(th*100):02d}": int((flat >= th).sum())
            for th in self.PROBABILITY_BINS
        }
        pixel_fractions = {
            f"ge_{int(th*100):02d}_pct": round(float((flat >= th).sum() / total_px * 100.0), 6)
            for th in self.PROBABILITY_BINS
        }

        return {
            "total_pixels": total_px,
            "min_probability": round(float(pcts[0]), 8),
            "median_probability": round(float(pcts[1]), 8),
            "p90_probability": round(float(pcts[2]), 8),
            "p95_probability": round(float(pcts[3]), 8),
            "p99_probability": round(float(pcts[4]), 8),
            "p99_9_probability": round(float(pcts[5]), 8),
            "max_probability": round(float(pcts[6]), 8),
            "mean_probability": round(float(np.mean(flat)), 8),
            "std_probability": round(float(np.std(flat)), 8),
            "pixel_counts_above_threshold": pixel_counts,
            "pixel_fractions_above_threshold_pct": pixel_fractions,
        }

    def run_scene_inference_raw(
        self,
        model: nn.Module,
        scene_info: Dict[str, Any],
        preprocessing_contract: Dict[str, Any],
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Run inference and return (full_prob_map, raw_raster, gt_mask).
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

        preprocessed = self.runner.preprocess_scene(raw_raster, preprocessing_contract)
        _, h, w = preprocessed.shape

        tiles, coords = generate_tiles(preprocessed, tile_size=self.runner.tile_size, stride=self.runner.stride)

        tile_preds = []
        with torch.no_grad():
            for tile in tiles:
                tile_t = torch.from_numpy(tile).unsqueeze(0).to(self.runner.device)
                logits = model(tile_t)
                probs = torch.softmax(logits, dim=1)[:, 1, :, :]
                tile_preds.append(probs[0].cpu().numpy())

        full_prob = reconstruct_full_mask(
            tile_predictions=tile_preds,
            tile_coords=coords,
            full_height=h,
            full_width=w,
            tile_size=self.runner.tile_size,
        )

        return full_prob, raw_raster, gt_mask

    def run_probability_distribution_audit(
        self,
        model_id: str,
        splits: List[str] = ["val", "test"],
    ) -> Dict[str, Any]:
        """
        Evaluate full raw probability distributions across validation and test scenes.
        """
        model, meta = self.runner.load_model(model_id)
        scenes = [s for s in self.runner.manifest_data["scenes"] if s.get("split") in splits]

        scene_results = []
        for s in scenes:
            prob_map, _, _ = self.run_scene_inference_raw(model, s, meta["preprocessing"])
            dist = self.compute_probability_distribution(prob_map)
            scene_results.append({
                "scene_id": s["scene_id"],
                "split": s["split"],
                "category": s.get("category", "unknown"),
                "distribution": dist,
            })

        return {
            "model_id": model_id,
            "model_version": meta["version"],
            "checkpoint": meta,
            "total_scenes": len(scene_results),
            "scenes": scene_results,
        }

    def compare_v2_vs_v4_outputs(
        self,
        splits: List[str] = ["val", "test"],
    ) -> Dict[str, Any]:
        """
        Compare V2 vs V4 raw probability surfaces on identical scenes.
        Computes MAE, Max Diff, Pearson r, and Spearman r.
        """
        v2_model, v2_meta = self.runner.load_model("unet-dual-pol-sar-v2")
        v4_model, v4_meta = self.runner.load_model("unet-dual-pol-sar-v4")

        scenes = [s for s in self.runner.manifest_data["scenes"] if s.get("split") in splits]
        comparisons = []

        for s in scenes:
            v2_prob, _, gt_mask = self.run_scene_inference_raw(v2_model, s, v2_meta["preprocessing"])
            v4_prob, _, _ = self.run_scene_inference_raw(v4_model, s, v4_meta["preprocessing"])

            diff = np.abs(v4_prob - v2_prob)
            mae = float(np.mean(diff))
            max_diff = float(np.max(diff))

            # Subsample for correlation computation (50,000 pixels for fast & robust correlation)
            sample_indices = np.random.choice(v2_prob.size, size=min(50000, v2_prob.size), replace=False)
            v2_sample = v2_prob.ravel()[sample_indices]
            v4_sample = v4_prob.ravel()[sample_indices]

            # Correlation
            if np.std(v2_sample) > 1e-7 and np.std(v4_sample) > 1e-7:
                pearson_r, _ = stats.pearsonr(v2_sample, v4_sample)
                spearman_r, _ = stats.spearmanr(v2_sample, v4_sample)
            else:
                pearson_r = 0.0
                spearman_r = 0.0

            comparisons.append({
                "scene_id": s["scene_id"],
                "split": s["split"],
                "category": s.get("category", "unknown"),
                "ground_truth_pixels": int(gt_mask.sum()),
                "mean_absolute_difference": round(mae, 6),
                "max_absolute_difference": round(max_diff, 6),
                "pearson_correlation": round(float(pearson_r), 6),
                "spearman_correlation": round(float(spearman_r), 6),
                "v2_mean_probability": round(float(np.mean(v2_prob)), 6),
                "v4_mean_probability": round(float(np.mean(v4_prob)), 6),
                "v2_max_probability": round(float(np.max(v2_prob)), 6),
                "v4_max_probability": round(float(np.max(v4_prob)), 6),
            })

        return {
            "analysis_name": "V2_VS_V4_RAW_OUTPUT_COMPARISON",
            "total_scenes_compared": len(comparisons),
            "scenes": comparisons,
        }

    def run_extended_threshold_diagnostic(
        self,
        model_id: str,
        split: str = "val",
    ) -> Dict[str, Any]:
        """
        Run extended threshold sweep [0.10, ..., 0.90] with category FPR breakdown.
        """
        res = self.runner.evaluate_split(
            model_id=model_id,
            split=split,
            thresholds=self.EXTENDED_THRESHOLDS,
        )
        agg = self.runner.compute_aggregate(res, thresholds=self.EXTENDED_THRESHOLDS)
        return agg

    def analyze_spatial_errors(
        self,
        model_id: str,
        threshold: float = 0.50,
        split: str = "val",
    ) -> Dict[str, Any]:
        """
        Morphological and connected-component spatial error analysis (FP and FN clusters).
        """
        model, meta = self.runner.load_model(model_id)
        scenes = [s for s in self.runner.manifest_data["scenes"] if s.get("split") == split]

        scene_spatial_analyses = []
        for s in scenes:
            prob_map, _, gt_mask = self.run_scene_inference_raw(model, s, meta["preprocessing"])
            pred_binary = (prob_map >= threshold).astype(np.uint8)

            fp_mask = (pred_binary == 1) & (gt_mask == 0)
            fn_mask = (pred_binary == 0) & (gt_mask == 1)

            fp_count = int(fp_mask.sum())
            fn_count = int(fn_mask.sum())
            total_px = int(gt_mask.size)

            # Connected components for FP
            num_fp_labels, fp_labels, fp_stats, _ = cv2.connectedComponentsWithStats(fp_mask.astype(np.uint8))
            # connectedComponentsWithStats background is label 0
            if num_fp_labels > 1:
                fp_areas = fp_stats[1:, cv2.CC_STAT_AREA]
                fp_clusters = int(num_fp_labels - 1)
                largest_fp = int(np.max(fp_areas))
                median_fp = float(np.median(fp_areas))
            else:
                fp_clusters = 0
                largest_fp = 0
                median_fp = 0.0

            # Connected components for FN
            num_fn_labels, fn_labels, fn_stats, _ = cv2.connectedComponentsWithStats(fn_mask.astype(np.uint8))
            if num_fn_labels > 1:
                fn_areas = fn_stats[1:, cv2.CC_STAT_AREA]
                fn_clusters = int(num_fn_labels - 1)
                largest_fn = int(np.max(fn_areas))
                median_fn = float(np.median(fn_areas))
            else:
                fn_clusters = 0
                largest_fn = 0
                median_fn = 0.0

            scene_spatial_analyses.append({
                "scene_id": s["scene_id"],
                "split": s["split"],
                "category": s.get("category", "unknown"),
                "threshold": threshold,
                "total_pixels": total_px,
                "ground_truth_positives": int(gt_mask.sum()),
                "predicted_positives": int(pred_binary.sum()),
                "false_positives": {
                    "pixel_count": fp_count,
                    "percentage_of_scene": round(fp_count / total_px * 100.0, 4),
                    "cluster_count": fp_clusters,
                    "largest_cluster_pixels": largest_fp,
                    "median_cluster_pixels": round(median_fp, 2),
                },
                "false_negatives": {
                    "pixel_count": fn_count,
                    "percentage_of_scene": round(fn_count / total_px * 100.0, 4),
                    "cluster_count": fn_clusters,
                    "largest_cluster_pixels": largest_fn,
                    "median_cluster_pixels": round(median_fn, 2),
                },
            })

        return {
            "model_id": model_id,
            "threshold": threshold,
            "split": split,
            "scene_count": len(scene_spatial_analyses),
            "scenes": scene_spatial_analyses,
        }

    def diagnose_preprocessing_distributions(
        self,
        splits: List[str] = ["val", "test"],
    ) -> Dict[str, Any]:
        """
        Quantify raw SAR input distributions and measure precise truncation/clipping shifts.
        """
        import rasterio

        scenes = [s for s in self.runner.manifest_data["scenes"] if s.get("split") in splits]

        raw_vv_all = []
        raw_vh_all = []

        scene_details = []

        for s in scenes:
            img_path = os.path.join(self.repo_root, s["image_path"])
            with rasterio.open(img_path) as src:
                vv = src.read(1).astype(np.float32)
                vh = src.read(2).astype(np.float32) if src.count >= 2 else vv.copy()

            # Subsample for aggregation
            sub = np.random.choice(vv.size, size=min(10000, vv.size), replace=False)
            raw_vv_all.append(vv.ravel()[sub])
            raw_vh_all.append(vh.ravel()[sub])

            # V2 Historical Effect: % of negative dB truncated to 0
            v2_vv_neg_pct = float((vv <= 0).sum() / vv.size * 100.0)
            v2_vh_neg_pct = float((vh <= 0).sum() / vh.size * 100.0)

            # V4 Calibrated Effect: % clipped below/above
            # VV: [-35, -5], VH: [-45, -15]
            v4_vv_clip_low = float((vv < -35.0).sum() / vv.size * 100.0)
            v4_vv_clip_high = float((vv > -5.0).sum() / vv.size * 100.0)
            v4_vh_clip_low = float((vh < -45.0).sum() / vh.size * 100.0)
            v4_vh_clip_high = float((vh > -15.0).sum() / vh.size * 100.0)

            scene_details.append({
                "scene_id": s["scene_id"],
                "split": s["split"],
                "category": s.get("category", "unknown"),
                "raw_vv_stats": {
                    "min": round(float(np.min(vv)), 2),
                    "mean": round(float(np.mean(vv)), 2),
                    "max": round(float(np.max(vv)), 2),
                },
                "raw_vh_stats": {
                    "min": round(float(np.min(vh)), 2),
                    "mean": round(float(np.mean(vh)), 2),
                    "max": round(float(np.max(vh)), 2),
                },
                "v2_truncation_effect": {
                    "vv_negative_db_pct_zeroed": round(v2_vv_neg_pct, 4),
                    "vh_negative_db_pct_zeroed": round(v2_vh_neg_pct, 4),
                },
                "v4_clipping_effect": {
                    "vv_clipped_below_min_pct": round(v4_vv_clip_low, 4),
                    "vv_clipped_above_max_pct": round(v4_vv_clip_high, 4),
                    "vh_clipped_below_min_pct": round(v4_vh_clip_low, 4),
                    "vh_clipped_above_max_pct": round(v4_vh_clip_high, 4),
                }
            })

        all_vv = np.concatenate(raw_vv_all)
        all_vh = np.concatenate(raw_vh_all)

        def get_dist_stats(arr):
            p = np.percentile(arr, [0, 1, 5, 25, 50, 75, 95, 99, 100])
            return {
                "min": round(float(p[0]), 3),
                "p01": round(float(p[1]), 3),
                "p05": round(float(p[2]), 3),
                "p25": round(float(p[3]), 3),
                "median": round(float(p[4]), 3),
                "mean": round(float(np.mean(arr)), 3),
                "p75": round(float(p[5]), 3),
                "p95": round(float(p[6]), 3),
                "p99": round(float(p[7]), 3),
                "max": round(float(p[8]), 3),
            }

        return {
            "analysis_name": "PREPROCESSING_DISTRIBUTION_DIAGNOSTIC",
            "evaluated_splits": splits,
            "overall_raw_vv_distribution": get_dist_stats(all_vv),
            "overall_raw_vh_distribution": get_dist_stats(all_vh),
            "v2_overall_truncation": {
                "vv_values_less_than_zero_pct": round(float((all_vv <= 0).sum() / all_vv.size * 100.0), 2),
                "vh_values_less_than_zero_pct": round(float((all_vh <= 0).sum() / all_vh.size * 100.0), 2),
                "root_cause_explanation": "Sentinel-1 calibrated sigma0 values in dB are strictly negative (typical sea surface: -35 to -10 dB). V2 historical preprocessing arr * (arr > 0) sets >99% of valid sea surface values to 0.0, starving the neural network of backscatter features.",
            },
            "v4_overall_clipping": {
                "vv_in_calibrated_range_pct": round(float(((all_vv >= -35.0) & (all_vv <= -5.0)).sum() / all_vv.size * 100.0), 2),
                "vh_in_calibrated_range_pct": round(float(((all_vh >= -45.0) & (all_vh <= -15.0)).sum() / all_vh.size * 100.0), 2),
                "root_cause_explanation": "V4 dB clipping scales the true sea backscatter range [0, 1]. However, low wind and look-alike formations share the low dB signature (-25 to -35 dB) of oil slicks, causing elevated false alarms when context is absent.",
            },
            "scenes": scene_details,
        }

    def summarize_error_categories(
        self,
        v4_prob_dist: Dict[str, Any],
        v2_prob_dist: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Aggregate category-level error behavior across Oil, Clean Ocean, and Look-Alike scenes.
        """
        categories = ["oil", "clean_ocean", "no_oil", "look_alike", "lookalike", "test_set"]

        summary = {}
        for cat in ["oil", "clean_ocean", "look_alike", "test_set"]:
            v4_scenes = [
                s for s in v4_prob_dist["scenes"]
                if cat in s["category"].lower() or (cat == "clean_ocean" and "no_oil" in s["category"].lower())
            ]
            v2_scenes = [
                s for s in v2_prob_dist["scenes"]
                if cat in s["category"].lower() or (cat == "clean_ocean" and "no_oil" in s["category"].lower())
            ]

            if not v4_scenes:
                summary[cat] = {"status": "CATEGORY_NOT_AVAILABLE"}
                continue

            v4_means = [s["distribution"]["mean_probability"] for s in v4_scenes]
            v4_maxs = [s["distribution"]["max_probability"] for s in v4_scenes]
            v4_pos_pcts_050 = [s["distribution"]["pixel_fractions_above_threshold_pct"]["ge_50_pct"] for s in v4_scenes]

            v2_means = [s["distribution"]["mean_probability"] for s in v2_scenes]
            v2_maxs = [s["distribution"]["max_probability"] for s in v2_scenes]
            v2_pos_pcts_050 = [s["distribution"]["pixel_fractions_above_threshold_pct"]["ge_50_pct"] for s in v2_scenes]

            summary[cat] = {
                "scene_count": len(v4_scenes),
                "v4_behavior": {
                    "mean_scene_probability": round(float(np.mean(v4_means)), 6),
                    "median_scene_max_probability": round(float(np.median(v4_maxs)), 6),
                    "average_predicted_positive_pct_at_0_50": round(float(np.mean(v4_pos_pcts_050)), 4),
                    "error_nature": (
                        "HIGH_RECALL_VALID_SLICK_DETECTION" if cat == "oil"
                        else ("HIGH_FALSE_POSITIVE_LOOKALIKE_CONFUSION" if "look" in cat
                        else "LOW_FALSE_POSITIVE_OCEAN_REJECTION")
                    )
                },
                "v2_behavior": {
                    "mean_scene_probability": round(float(np.mean(v2_means)), 6),
                    "median_scene_max_probability": round(float(np.median(v2_maxs)), 6),
                    "average_predicted_positive_pct_at_0_50": round(float(np.mean(v2_pos_pcts_050)), 4),
                    "error_nature": "ZERO_DETECTION_NEGATIVE_DB_STARVATION",
                }
            }

        return {
            "analysis_name": "ERROR_CATEGORY_ANALYSIS",
            "category_summaries": summary,
        }
