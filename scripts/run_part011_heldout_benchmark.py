"""
Execution Script for PART 0.11 — Formal Held-Out Benchmark Evaluation.
=======================================================================

Sealed benchmark evaluation on the 5 previously quarantined Sentinel-1 Part III test scenes:
- real_part3_test_00060 (Clean ocean / negative scene)
- real_part3_test_00062 (Oil spill scene)
- real_part3_test_00063 (Clean ocean / negative scene)
- real_part3_test_00064 (Oil spill scene)
- real_part3_test_00080 (Oil spill scene)

Models Evaluated:
1. Primary Experimental Candidate: unet-dual-pol-sar-v09d-residual-loss
2. Controlled Baseline Reference: unet-dual-pol-sar-v6
3. Historical Reference (Non-Comparable): unet-dual-pol-sar-v2

Strict Controls:
- Sealed evaluation: No training, no fine-tuning, no hyperparameter tuning, no post-hoc threshold tuning.
- Pre-registered primary operating threshold: 0.50.
- Standardized full-scene reconstruction (512x512, stride 448, Hann window blending).
- Preprocessing: sentinel1_sigma0_db_v1 (for V09D and V6); historical arr*(arr>0) for V2.
"""

import os
import sys
import json
import time
import hashlib
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
from PIL import Image
import rasterio
import torch
import torch.nn as nn

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)
if os.path.join(_REPO_ROOT, "services", "ml-python") not in sys.path:
    sys.path.insert(0, os.path.join(_REPO_ROOT, "services", "ml-python"))

from app.models.unet.architecture import UNet, UNetResidual
from app.preprocessing.tiling import generate_tiles, reconstruct_full_mask
from app.preprocessing.normalization import normalize_sar_band
from ml.evaluation.confusion_matrix import generate_confusion_matrix, calculate_confusion_metrics as calc_cm_metrics
from ml.evaluation.metrics import compute_fpr


TEST_SCENE_IDS = [
    "real_part3_test_00060",
    "real_part3_test_00062",
    "real_part3_test_00063",
    "real_part3_test_00064",
    "real_part3_test_00080",
]


def compute_file_sha256(filepath: str) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(8192):
            h.update(chunk)
    return h.hexdigest()


def save_rgb_image(arr: np.ndarray, path: str):
    """Save uint8 RGB/grayscale array as PNG using PIL."""
    if arr.dtype != np.uint8:
        arr = np.clip(arr, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr)
    img.save(path, format="PNG")


def create_sar_overlay(vv_norm: np.ndarray, mask: np.ndarray, color=(255, 60, 60)) -> np.ndarray:
    """Create RGB overlay of binary mask on normalized SAR background."""
    bg_gray = (vv_norm * 255.0).astype(np.uint8)
    rgb = np.stack([bg_gray, bg_gray, bg_gray], axis=-1)
    # Apply color overlay where mask == 1
    pos_idx = mask == 1
    rgb[pos_idx, 0] = int(color[0])
    rgb[pos_idx, 1] = int(color[1])
    rgb[pos_idx, 2] = int(color[2])
    return rgb


def run_model_inference_on_scene(
    model: nn.Module,
    img_path: str,
    device: torch.device,
    preprocessing_type: str = "sentinel1_sigma0_db_v1",
) -> np.ndarray:
    """Run full-scene sliding window inference with Hann window blending."""
    with rasterio.open(img_path) as src:
        vv_raw = src.read(1).astype(np.float32)
        vh_raw = src.read(2).astype(np.float32) if src.count >= 2 else vv_raw.copy()

    if preprocessing_type == "sentinel1_sigma0_db_v1":
        vv_norm = normalize_sar_band(vv_raw, polarization="VV")
        vh_norm = normalize_sar_band(vh_raw, polarization="VH")
    elif preprocessing_type == "historical_zero_clipping":
        # Historical V2 preprocessing
        vv_norm = vv_raw * (vv_raw > 0)
        vh_norm = vh_raw * (vh_raw > 0)
    else:
        raise ValueError(f"Unknown preprocessing: {preprocessing_type}")

    preprocessed = np.stack([vv_norm, vh_norm], axis=0)
    tiles, coords = generate_tiles(preprocessed, tile_size=512, stride=448)

    tile_preds = []
    with torch.no_grad():
        for tile in tiles:
            tile_t = torch.from_numpy(tile).unsqueeze(0).to(device)
            logits = model(tile_t)
            probs = torch.softmax(logits, dim=1)[:, 1, :, :]
            tile_preds.append(probs[0].cpu().numpy())

    full_prob = reconstruct_full_mask(
        tile_predictions=tile_preds,
        tile_coords=coords,
        full_height=2048,
        full_width=2048,
        tile_size=512,
    )
    return full_prob, vv_norm


def main():
    print("=" * 80)
    print("PART 0.11 — FORMAL HELD-OUT BENCHMARK EVALUATION")
    print("=" * 80)

    out_dir = os.path.join(_REPO_ROOT, "ml/experiments/results/v011_heldout_benchmark")
    os.makedirs(out_dir, exist_ok=True)
    plots_dir = os.path.join(out_dir, "visual_artifacts")
    os.makedirs(plots_dir, exist_ok=True)

    manifest_path = os.path.join(_REPO_ROOT, "ml/datasets/manifest.json")
    v09d_ckpt_path = os.path.join(_REPO_ROOT, "ml/model_registry/versions/unet_dual_pol_sar_v09d_residual_loss.pth")
    v6_ckpt_path = os.path.join(_REPO_ROOT, "ml/model_registry/versions/unet_dual_pol_sar_v6.pth")
    v2_ckpt_path = os.path.join(_REPO_ROOT, "ml/model_registry/versions/unet_dual_pol_sar_v2.pth")

    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device} ({torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'})")

    # 1. Test Lock Release Audit
    print("\n[1/7] Recording Formal Test Lock Release Audit Event...")
    manifest_sha = compute_file_sha256(manifest_path)
    v09d_sha = compute_file_sha256(v09d_ckpt_path)
    v6_sha = compute_file_sha256(v6_ckpt_path)
    v2_sha = compute_file_sha256(v2_ckpt_path)

    test_lock_release = {
        "event": "PART_0_11_TEST_LOCK_RELEASED_FOR_SEALED_BENCHMARK",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "reason": "One-time sealed held-out benchmark evaluation of pre-selected primary candidate V09D vs baseline V6 and historical V2.",
        "held_out_test_scenes": TEST_SCENE_IDS,
        "dataset_manifest_sha256": manifest_sha,
        "model_checkpoints": {
            "v09d_residual_loss": {
                "model_id": "unet-dual-pol-sar-v09d-residual-loss",
                "role": "PRIMARY_EXPERIMENTAL_CANDIDATE",
                "sha256": v09d_sha
            },
            "v6_baseline": {
                "model_id": "unet-dual-pol-sar-v6",
                "role": "CONTROLLED_BASELINE_REFERENCE",
                "sha256": v6_sha
            },
            "v2_historical": {
                "model_id": "unet-dual-pol-sar-v2",
                "role": "HISTORICAL_REFERENCE_NON_COMPARABLE",
                "sha256": v2_sha
            }
        },
        "evaluation_protocol": {
            "pre_registered_primary_threshold": 0.50,
            "descriptive_threshold_sweep": [0.30, 0.35, 0.40, 0.45, 0.50, 0.60],
            "tile_size": 512,
            "stride": 448,
            "blending": "hann_window",
            "full_resolution": [2048, 2048]
        }
    }
    with open(os.path.join(out_dir, "test_lock_release.json"), "w", encoding="utf-8") as f:
        json.dump(test_lock_release, f, indent=2)
    print("  [OK] Test Lock Release recorded in test_lock_release.json")

    # 2. Inspect and Extract Test Scenes from Manifest
    print("\n[2/7] Loading Test Scenes from Manifest...")
    with open(manifest_path, "r", encoding="utf-8") as f:
        m_data = json.load(f)

    test_scenes = [s for s in m_data["scenes"] if s["split"] == "test"]
    assert len(test_scenes) == 5, f"Expected 5 test scenes, got {len(test_scenes)}"

    test_scene_records = []
    for s in test_scenes:
        assert s["scene_id"] in TEST_SCENE_IDS, f"Unknown test scene: {s['scene_id']}"
        test_scene_records.append(s)
        print(f"  Scene: {s['scene_id']} | Category: {s.get('category')} | Dimensions: {s['width']}x{s['height']} | Mask: {s.get('mask_path')}")

    # Save dataset manifest snapshot
    with open(os.path.join(out_dir, "dataset_manifest.json"), "w", encoding="utf-8") as f:
        json.dump({
            "test_scenes": test_scene_records,
            "manifest_sha256": manifest_sha,
            "total_scenes": len(test_scene_records),
        }, f, indent=2)

    # 3. Load Model Architectures and Weights
    print("\n[3/7] Loading Models for Sealed Evaluation...")
    # Model 1: V09D
    v09d_model = UNetResidual(in_channels=2, num_classes=2, base_channels=16, bilinear=True).to(device)
    v09d_ckpt = torch.load(v09d_ckpt_path, map_location=device, weights_only=False)
    v09d_model.load_state_dict(v09d_ckpt["model_state_dict"])
    v09d_model.eval()
    print("  [OK] V09D Residual U-Net loaded (1,114,338 parameters)")

    # Model 2: V6
    v6_model = UNet(in_channels=2, num_classes=2, base_channels=16, bilinear=True).to(device)
    v6_ckpt = torch.load(v6_ckpt_path, map_location=device, weights_only=False)
    v6_model.load_state_dict(v6_ckpt["model_state_dict"])
    v6_model.eval()
    print("  [OK] V6 Standard U-Net loaded (1,080,802 parameters)")

    # Model 3: V2
    v2_model = UNet(in_channels=2, num_classes=2, base_channels=16, bilinear=True).to(device)
    v2_ckpt = torch.load(v2_ckpt_path, map_location=device, weights_only=False)
    v2_state = v2_ckpt["model_state_dict"] if "model_state_dict" in v2_ckpt else v2_ckpt
    v2_model.load_state_dict(v2_state)
    v2_model.eval()
    print("  [OK] V2 Historical U-Net loaded (1,080,802 parameters)")

    # Save model manifest
    with open(os.path.join(out_dir, "model_manifest.json"), "w", encoding="utf-8") as f:
        json.dump({
            "models_evaluated": [
                {
                    "model_id": "unet-dual-pol-sar-v09d-residual-loss",
                    "role": "PRIMARY_EXPERIMENTAL_CANDIDATE",
                    "checkpoint": v09d_ckpt_path,
                    "sha256": v09d_sha,
                    "parameters": 1114338,
                    "preprocessing": "sentinel1_sigma0_db_v1",
                    "status": "EXPERIMENTAL"
                },
                {
                    "model_id": "unet-dual-pol-sar-v6",
                    "role": "CONTROLLED_BASELINE_REFERENCE",
                    "checkpoint": v6_ckpt_path,
                    "sha256": v6_sha,
                    "parameters": 1080802,
                    "preprocessing": "sentinel1_sigma0_db_v1",
                    "status": "EXPERIMENTAL"
                },
                {
                    "model_id": "unet-dual-pol-sar-v2",
                    "role": "HISTORICAL_REFERENCE_NON_COMPARABLE",
                    "checkpoint": v2_ckpt_path,
                    "sha256": v2_sha,
                    "parameters": 1080802,
                    "preprocessing": "historical_zero_clipping",
                    "status": "ACTIVE_BASELINE (Historical Artifact)"
                }
            ]
        }, f, indent=2)

    # 4. Execute Inference & Metric Calculation across All 5 Scenes
    print("\n[4/7] Executing Sealed Benchmark Inference on Held-Out Test Set...")
    thresholds = [0.30, 0.35, 0.40, 0.45, 0.50, 0.60]
    primary_th = 0.50

    per_scene_results = []
    models_to_run = [
        ("V09D_RESIDUAL_LOSS", "unet-dual-pol-sar-v09d-residual-loss", v09d_model, "sentinel1_sigma0_db_v1"),
        ("V6_BASELINE", "unet-dual-pol-sar-v6", v6_model, "sentinel1_sigma0_db_v1"),
        ("V2_HISTORICAL", "unet-dual-pol-sar-v2", v2_model, "historical_zero_clipping"),
    ]

    for s_idx, scene in enumerate(test_scene_records):
        s_id = scene["scene_id"]
        img_path = os.path.join(_REPO_ROOT, scene["image_path"])
        msk_path = scene.get("mask_path")

        print(f"\n  Evaluating Test Scene [{s_idx+1}/5]: {s_id}...")
        if msk_path:
            with rasterio.open(os.path.join(_REPO_ROOT, msk_path)) as src_m:
                gt_mask = (src_m.read(1) > 0).astype(np.uint8)
        else:
            gt_mask = np.zeros((2048, 2048), dtype=np.uint8)

        gt_pixels = int(np.sum(gt_mask))
        scene_entry = {
            "scene_id": s_id,
            "sample_id": scene.get("sample_id"),
            "category": scene.get("category", "test_set"),
            "ground_truth_pixels": gt_pixels,
            "total_pixels": 2048 * 2048,
            "models": {}
        }

        # Save ground truth PNG
        gt_rgb = np.stack([gt_mask * 255, gt_mask * 255, gt_mask * 255], axis=-1)
        save_rgb_image(gt_rgb, os.path.join(plots_dir, f"{s_id}_ground_truth.png"))

        for m_key, m_id, m_net, p_type in models_to_run:
            full_prob, vv_norm = run_model_inference_on_scene(m_net, img_path, device, preprocessing_type=p_type)

            # Generate PNG artifacts for V09D and V6
            if m_key in ("V09D_RESIDUAL_LOSS", "V6_BASELINE"):
                prefix = "v09d" if "v09d" in m_id else "v6"
                pred_bin_50 = (full_prob >= 0.50).astype(np.uint8)
                pred_rgb = np.stack([pred_bin_50 * 255, pred_bin_50 * 255, pred_bin_50 * 255], axis=-1)
                save_rgb_image(pred_rgb, os.path.join(plots_dir, f"{s_id}_{prefix}_prediction.png"))

                # Overlay: Green for TP, Red for FP, Blue for FN
                bg_gray = (vv_norm * 255.0).astype(np.uint8)
                overlay = np.stack([bg_gray, bg_gray, bg_gray], axis=-1)
                tp_idx = (pred_bin_50 == 1) & (gt_mask == 1)
                fp_idx = (pred_bin_50 == 1) & (gt_mask == 0)
                fn_idx = (pred_bin_50 == 0) & (gt_mask == 1)

                overlay[tp_idx] = [0, 255, 100]    # Green = TP
                overlay[fp_idx] = [255, 50, 50]    # Red = FP
                overlay[fn_idx] = [50, 150, 255]   # Blue = FN
                save_rgb_image(overlay, os.path.join(plots_dir, f"{s_id}_{prefix}_overlay.png"))

            th_metrics = {}
            for th in thresholds:
                cm = generate_confusion_matrix(gt_mask, full_prob, threshold=th)
                m = calc_cm_metrics(cm)
                th_metrics[str(th)] = {
                    "threshold": th,
                    "tp": int(cm["tp"]),
                    "fp": int(cm["fp"]),
                    "fn": int(cm["fn"]),
                    "tn": int(cm["tn"]),
                    "iou": round(float(m["iou"]), 6),
                    "dice": round(float(m["dice"]), 6),
                    "precision": round(float(m["precision"]), 6),
                    "recall": round(float(m["recall"]), 6),
                    "fpr": round(float(m["fpr"]), 6),
                    "predicted_positive_pixels": int(cm["tp"] + cm["fp"]),
                }

            scene_entry["models"][m_key] = {
                "model_id": m_id,
                "metrics_at_preregistered_threshold_0_50": th_metrics["0.5"],
                "threshold_sweep": th_metrics
            }

            m50 = th_metrics["0.5"]
            print(f"    [{m_key:20s}] @ 0.50: IoU={m50['iou']:.4f} | Dice={m50['dice']:.4f} | Prec={m50['precision']:.4f} | Rec={m50['recall']:.4f} | FPR={m50['fpr']:.6f} | PredPos={m50['predicted_positive_pixels']:,} | GTPos={gt_pixels:,}")

        per_scene_results.append(scene_entry)

    with open(os.path.join(out_dir, "per_scene_metrics.json"), "w", encoding="utf-8") as f:
        json.dump(per_scene_results, f, indent=2)

    # 5. Calculate Micro-Pixel Aggregate Metrics across the Entire Held-Out Test Set
    print("\n[5/7] Calculating Aggregate Benchmark Metrics...")
    aggregate_metrics = {
        "benchmark_set": "Sentinel-1 Part III Held-Out Test Set (5 scenes)",
        "total_test_scenes": len(test_scene_records),
        "total_pixels_evaluated": len(test_scene_records) * 2048 * 2048,
        "total_ground_truth_oil_pixels": sum(s["ground_truth_pixels"] for s in per_scene_results),
        "preregistered_operating_threshold": primary_th,
        "models_at_threshold_0_50": {},
        "descriptive_threshold_sweeps": {}
    }

    for m_key, m_id, _, _ in models_to_run:
        sweep_aggs = []
        for th in thresholds:
            th_s = str(th)
            tot_tp = sum(sr["models"][m_key]["threshold_sweep"][th_s]["tp"] for sr in per_scene_results)
            tot_fp = sum(sr["models"][m_key]["threshold_sweep"][th_s]["fp"] for sr in per_scene_results)
            tot_fn = sum(sr["models"][m_key]["threshold_sweep"][th_s]["fn"] for sr in per_scene_results)
            tot_tn = sum(sr["models"][m_key]["threshold_sweep"][th_s]["tn"] for sr in per_scene_results)

            cm_all = {"tp": tot_tp, "fp": tot_fp, "fn": tot_fn, "tn": tot_tn}
            micro_m = calc_cm_metrics(cm_all)

            # Separate oil-present scenes vs clean/negative scenes in test set
            oil_scenes = [sr for sr in per_scene_results if sr["ground_truth_pixels"] > 0]
            clean_scenes = [sr for sr in per_scene_results if sr["ground_truth_pixels"] == 0]

            oil_tp = sum(sr["models"][m_key]["threshold_sweep"][th_s]["tp"] for sr in oil_scenes)
            oil_fp = sum(sr["models"][m_key]["threshold_sweep"][th_s]["fp"] for sr in oil_scenes)
            oil_fn = sum(sr["models"][m_key]["threshold_sweep"][th_s]["fn"] for sr in oil_scenes)
            oil_iou = float(oil_tp / (oil_tp + oil_fp + oil_fn)) if (oil_tp + oil_fp + oil_fn) > 0 else 0.0

            clean_fp = sum(sr["models"][m_key]["threshold_sweep"][th_s]["fp"] for sr in clean_scenes)
            clean_tn = sum(sr["models"][m_key]["threshold_sweep"][th_s]["tn"] for sr in clean_scenes)
            clean_fpr = float(clean_fp / (clean_fp + clean_tn)) if (clean_fp + clean_tn) > 0 else 0.0

            agg_entry = {
                "threshold": th,
                "micro_pixel_aggregate": {
                    "tp": tot_tp,
                    "fp": tot_fp,
                    "fn": tot_fn,
                    "tn": tot_tn,
                    "iou": round(float(micro_m["iou"]), 6),
                    "dice": round(float(micro_m["dice"]), 6),
                    "precision": round(float(micro_m["precision"]), 6),
                    "recall": round(float(micro_m["recall"]), 6),
                    "fpr": round(float(micro_m["fpr"]), 6),
                    "total_predicted_pixels": tot_tp + tot_fp,
                },
                "category_breakdown": {
                    "oil_scenes_iou": round(oil_iou, 6),
                    "clean_ocean_fpr": round(clean_fpr, 6),
                    "clean_ocean_fp_pixels": clean_fp,
                    "clean_ocean_total_pixels": clean_fp + clean_tn,
                    "look_alike_fpr": "NOT_AVAILABLE (No verified look-alike scenes in Part III test partition)"
                }
            }
            sweep_aggs.append(agg_entry)

        aggregate_metrics["descriptive_threshold_sweeps"][m_key] = sweep_aggs
        th50_data = next(item for item in sweep_aggs if item["threshold"] == 0.50)
        aggregate_metrics["models_at_threshold_0_50"][m_key] = {
            "model_id": m_id,
            "metrics": th50_data["micro_pixel_aggregate"],
            "category_metrics": th50_data["category_breakdown"]
        }

    with open(os.path.join(out_dir, "aggregate_metrics.json"), "w", encoding="utf-8") as f:
        json.dump(aggregate_metrics, f, indent=2)

    with open(os.path.join(out_dir, "threshold_sweep.json"), "w", encoding="utf-8") as f:
        json.dump(aggregate_metrics["descriptive_threshold_sweeps"], f, indent=2)

    # 6. Validation vs Held-Out Test Generalization
    print("\n[6/7] Comparing Validation vs Held-Out Test Generalization...")
    # Load validation metrics from Part 0.10
    val_metrics_path = os.path.join(_REPO_ROOT, "ml/experiments/results/v010_synthesis_audit/normalized_metrics.json")
    with open(val_metrics_path, "r", encoding="utf-8") as f:
        val_all_data = json.load(f)

    v09d_val_50 = next(item for item in val_all_data["models"]["V09D_RESIDUAL_LOSS"] if item["threshold"] == 0.50)
    v6_val_50 = next(item for item in val_all_data["models"]["V6_BASELINE"] if item["threshold"] == 0.50)

    v09d_test_50 = aggregate_metrics["models_at_threshold_0_50"]["V09D_RESIDUAL_LOSS"]["metrics"]
    v6_test_50 = aggregate_metrics["models_at_threshold_0_50"]["V6_BASELINE"]["metrics"]

    generalization_data = {
        "description": "Descriptive comparison of validation performance vs sealed held-out test performance at threshold 0.50.",
        "models": {
            "V09D_RESIDUAL_LOSS": {
                "model_id": "unet-dual-pol-sar-v09d-residual-loss",
                "validation": {
                    "micro_iou": v09d_val_50["micro_pixel_aggregate"]["iou"],
                    "micro_dice": v09d_val_50["micro_pixel_aggregate"]["dice"],
                    "precision": v09d_val_50["micro_pixel_aggregate"]["precision"],
                    "recall": v09d_val_50["micro_pixel_aggregate"]["recall"],
                    "fpr": v09d_val_50["micro_pixel_aggregate"]["fpr"],
                },
                "held_out_test": {
                    "micro_iou": v09d_test_50["iou"],
                    "micro_dice": v09d_test_50["dice"],
                    "precision": v09d_test_50["precision"],
                    "recall": v09d_test_50["recall"],
                    "fpr": v09d_test_50["fpr"],
                },
                "absolute_difference": {
                    "micro_iou": round(v09d_test_50["iou"] - v09d_val_50["micro_pixel_aggregate"]["iou"], 6),
                    "micro_dice": round(v09d_test_50["dice"] - v09d_val_50["micro_pixel_aggregate"]["dice"], 6),
                    "precision": round(v09d_test_50["precision"] - v09d_val_50["micro_pixel_aggregate"]["precision"], 6),
                    "recall": round(v09d_test_50["recall"] - v09d_val_50["micro_pixel_aggregate"]["recall"], 6),
                    "fpr": round(v09d_test_50["fpr"] - v09d_val_50["micro_pixel_aggregate"]["fpr"], 6),
                }
            },
            "V6_BASELINE": {
                "model_id": "unet-dual-pol-sar-v6",
                "validation": {
                    "micro_iou": v6_val_50["micro_pixel_aggregate"]["iou"],
                    "micro_dice": v6_val_50["micro_pixel_aggregate"]["dice"],
                    "precision": v6_val_50["micro_pixel_aggregate"]["precision"],
                    "recall": v6_val_50["micro_pixel_aggregate"]["recall"],
                    "fpr": v6_val_50["micro_pixel_aggregate"]["fpr"],
                },
                "held_out_test": {
                    "micro_iou": v6_test_50["iou"],
                    "micro_dice": v6_test_50["dice"],
                    "precision": v6_test_50["precision"],
                    "recall": v6_test_50["recall"],
                    "fpr": v6_test_50["fpr"],
                },
                "absolute_difference": {
                    "micro_iou": round(v6_test_50["iou"] - v6_val_50["micro_pixel_aggregate"]["iou"], 6),
                    "micro_dice": round(v6_test_50["dice"] - v6_val_50["micro_pixel_aggregate"]["dice"], 6),
                    "precision": round(v6_test_50["precision"] - v6_val_50["micro_pixel_aggregate"]["precision"], 6),
                    "recall": round(v6_test_50["recall"] - v6_val_50["micro_pixel_aggregate"]["recall"], 6),
                    "fpr": round(v6_test_50["fpr"] - v6_val_50["micro_pixel_aggregate"]["fpr"], 6),
                }
            }
        },
        "possible_explanatory_factors": [
            "Geographic and sea-state variation across Part III test scenes.",
            "Higher proportion of true oil slick pixels in the test set (205K positive pixels in 5 scenes vs 155K in 7 validation scenes).",
            "Different slick dispersion patterns and backscatter contrast ranges."
        ]
    }
    with open(os.path.join(out_dir, "validation_vs_test.json"), "w", encoding="utf-8") as f:
        json.dump(generalization_data, f, indent=2)

    # 7. Error Analysis & Summary
    print("\n[7/7] Synthesizing Benchmark Summary and Error Analysis...")
    error_analysis = {
        "per_scene_diagnostics": [
            {
                "scene_id": "real_part3_test_00060",
                "ground_truth": "0 oil pixels (Negative clean ocean scene)",
                "v09d_behavior": f"{per_scene_results[0]['models']['V09D_RESIDUAL_LOSS']['metrics_at_preregistered_threshold_0_50']['fp']} false positive pixels (FPR: {per_scene_results[0]['models']['V09D_RESIDUAL_LOSS']['metrics_at_preregistered_threshold_0_50']['fpr']:.6f})",
                "v6_behavior": f"{per_scene_results[0]['models']['V6_BASELINE']['metrics_at_preregistered_threshold_0_50']['fp']} false positive pixels (FPR: {per_scene_results[0]['models']['V6_BASELINE']['metrics_at_preregistered_threshold_0_50']['fpr']:.6f})"
            },
            {
                "scene_id": "real_part3_test_00062",
                "ground_truth": "24,162 oil pixels (Moderate slick)",
                "v09d_behavior": f"Recall: {per_scene_results[1]['models']['V09D_RESIDUAL_LOSS']['metrics_at_preregistered_threshold_0_50']['recall']:.4f}, Prec: {per_scene_results[1]['models']['V09D_RESIDUAL_LOSS']['metrics_at_preregistered_threshold_0_50']['precision']:.4f}, IoU: {per_scene_results[1]['models']['V09D_RESIDUAL_LOSS']['metrics_at_preregistered_threshold_0_50']['iou']:.4f}",
                "v6_behavior": f"Recall: {per_scene_results[1]['models']['V6_BASELINE']['metrics_at_preregistered_threshold_0_50']['recall']:.4f}, Prec: {per_scene_results[1]['models']['V6_BASELINE']['metrics_at_preregistered_threshold_0_50']['precision']:.4f}, IoU: {per_scene_results[1]['models']['V6_BASELINE']['metrics_at_preregistered_threshold_0_50']['iou']:.4f}"
            },
            {
                "scene_id": "real_part3_test_00063",
                "ground_truth": "0 oil pixels (Negative clean ocean scene)",
                "v09d_behavior": f"{per_scene_results[2]['models']['V09D_RESIDUAL_LOSS']['metrics_at_preregistered_threshold_0_50']['fp']} false positive pixels (FPR: {per_scene_results[2]['models']['V09D_RESIDUAL_LOSS']['metrics_at_preregistered_threshold_0_50']['fpr']:.6f})",
                "v6_behavior": f"{per_scene_results[2]['models']['V6_BASELINE']['metrics_at_preregistered_threshold_0_50']['fp']} false positive pixels (FPR: {per_scene_results[2]['models']['V6_BASELINE']['metrics_at_preregistered_threshold_0_50']['fpr']:.6f})"
            },
            {
                "scene_id": "real_part3_test_00064",
                "ground_truth": "52,620 oil pixels (Large slick)",
                "v09d_behavior": f"Recall: {per_scene_results[3]['models']['V09D_RESIDUAL_LOSS']['metrics_at_preregistered_threshold_0_50']['recall']:.4f}, Prec: {per_scene_results[3]['models']['V09D_RESIDUAL_LOSS']['metrics_at_preregistered_threshold_0_50']['precision']:.4f}, IoU: {per_scene_results[3]['models']['V09D_RESIDUAL_LOSS']['metrics_at_preregistered_threshold_0_50']['iou']:.4f}",
                "v6_behavior": f"Recall: {per_scene_results[3]['models']['V6_BASELINE']['metrics_at_preregistered_threshold_0_50']['recall']:.4f}, Prec: {per_scene_results[3]['models']['V6_BASELINE']['metrics_at_preregistered_threshold_0_50']['precision']:.4f}, IoU: {per_scene_results[3]['models']['V6_BASELINE']['metrics_at_preregistered_threshold_0_50']['iou']:.4f}"
            },
            {
                "scene_id": "real_part3_test_00080",
                "ground_truth": "128,475 oil pixels (Extensive slick)",
                "v09d_behavior": f"Recall: {per_scene_results[4]['models']['V09D_RESIDUAL_LOSS']['metrics_at_preregistered_threshold_0_50']['recall']:.4f}, Prec: {per_scene_results[4]['models']['V09D_RESIDUAL_LOSS']['metrics_at_preregistered_threshold_0_50']['precision']:.4f}, IoU: {per_scene_results[4]['models']['V09D_RESIDUAL_LOSS']['metrics_at_preregistered_threshold_0_50']['iou']:.4f}",
                "v6_behavior": f"Recall: {per_scene_results[4]['models']['V6_BASELINE']['metrics_at_preregistered_threshold_0_50']['recall']:.4f}, Prec: {per_scene_results[4]['models']['V6_BASELINE']['metrics_at_preregistered_threshold_0_50']['precision']:.4f}, IoU: {per_scene_results[4]['models']['V6_BASELINE']['metrics_at_preregistered_threshold_0_50']['iou']:.4f}"
            }
        ]
    }
    with open(os.path.join(out_dir, "error_analysis.json"), "w", encoding="utf-8") as f:
        json.dump(error_analysis, f, indent=2)

    # Benchmark config & summary
    benchmark_config = {
        "benchmark_id": "PART_0_11_FORMAL_HELDOUT_BENCHMARK",
        "dataset_split": "test",
        "held_out_scenes": TEST_SCENE_IDS,
        "preregistered_operating_threshold": primary_th,
        "executed_at": datetime.now(timezone.utc).isoformat(),
        "hardware": {
            "device": str(device),
            "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
            "torch_version": torch.__version__,
        }
    }
    with open(os.path.join(out_dir, "benchmark_config.json"), "w", encoding="utf-8") as f:
        json.dump(benchmark_config, f, indent=2)

    reproducibility = {
        "python_version": sys.version,
        "torch_version": torch.__version__,
        "cuda_version": torch.version.cuda if torch.cuda.is_available() else None,
        "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "dataset_manifest_sha256": manifest_sha,
        "checkpoints": {
            "v09d_residual_loss": v09d_sha,
            "v6_baseline": v6_sha,
            "v2_historical": v2_sha,
        }
    }
    with open(os.path.join(out_dir, "reproducibility.json"), "w", encoding="utf-8") as f:
        json.dump(reproducibility, f, indent=2)

    benchmark_summary = {
        "status": "COMPLETE",
        "preregistered_threshold": primary_th,
        "aggregate_results_at_0_50": {
            "V09D_RESIDUAL_LOSS": aggregate_metrics["models_at_threshold_0_50"]["V09D_RESIDUAL_LOSS"]["metrics"],
            "V6_BASELINE": aggregate_metrics["models_at_threshold_0_50"]["V6_BASELINE"]["metrics"],
            "V2_HISTORICAL": aggregate_metrics["models_at_threshold_0_50"]["V2_HISTORICAL"]["metrics"],
        },
        "generalization_summary": {
            "v09d_test_iou": v09d_test_50["iou"],
            "v09d_test_dice": v09d_test_50["dice"],
            "v09d_test_precision": v09d_test_50["precision"],
            "v09d_test_recall": v09d_test_50["recall"],
            "v6_test_iou": v6_test_50["iou"],
            "v6_test_dice": v6_test_50["dice"],
            "v6_test_precision": v6_test_50["precision"],
            "v6_test_recall": v6_test_50["recall"],
        }
    }
    with open(os.path.join(out_dir, "benchmark_summary.json"), "w", encoding="utf-8") as f:
        json.dump(benchmark_summary, f, indent=2)

    print("\n" + "=" * 80)
    print("PART 0.11 SEALED BENCHMARK COMPLETED SUCCESSFULLY!")
    print("=" * 80)
    print(f"Pre-registered Operating Threshold: {primary_th:.2f}")
    print(f"V09D Aggregate: IoU={v09d_test_50['iou']:.6f} | Dice={v09d_test_50['dice']:.6f} | Prec={v09d_test_50['precision']:.6f} | Rec={v09d_test_50['recall']:.6f} | FPR={v09d_test_50['fpr']:.6f}")
    print(f"V6 Aggregate:   IoU={v6_test_50['iou']:.6f} | Dice={v6_test_50['dice']:.6f} | Prec={v6_test_50['precision']:.6f} | Rec={v6_test_50['recall']:.6f} | FPR={v6_test_50['fpr']:.6f}")
    print(f"V2 Aggregate:   IoU={aggregate_metrics['models_at_threshold_0_50']['V2_HISTORICAL']['metrics']['iou']:.6f} | Dice={aggregate_metrics['models_at_threshold_0_50']['V2_HISTORICAL']['metrics']['dice']:.6f} | Prec={aggregate_metrics['models_at_threshold_0_50']['V2_HISTORICAL']['metrics']['precision']:.6f} | Rec={aggregate_metrics['models_at_threshold_0_50']['V2_HISTORICAL']['metrics']['recall']:.6f}")
    print("=" * 80)


if __name__ == "__main__":
    main()
