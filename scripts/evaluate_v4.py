"""
Comprehensive Evaluation and Analysis Script for Model V4
Executes:
1. Preprocessing validation statistics (raw vs normalized)
2. Fine validation threshold sweep (0.10 to 0.50, step 0.01)
3. Operating threshold selection from validation data
4. Held-out test evaluation on Part III scenes (both stride 512 and 50% overlap stride 256)
5. Look-alike and Clean-Ocean FPR evaluation
6. Probability distributions calculation for True Oil, Clean Ocean, Look-Alike
7. Forensic visualizations and JSON artifacts generation
"""

import os
import sys
import json
import torch
import numpy as np
import rasterio
from pyproj import Geod
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

sys.path.insert(0, os.path.abspath('.'))
sys.path.insert(0, os.path.abspath('services/ml-python'))

from app.models.registry import model_registry
from app.preprocessing.sar_preprocessor import load_sar_raster
from app.preprocessing.tiling import generate_tiles, reconstruct_full_mask
from app.preprocessing.normalization import normalize_sar_band


def generate_gaussian_window(tile_size: int = 512, sigma: float = 0.25) -> np.ndarray:
    """Generate 2D Gaussian blending kernel for overlapping inference."""
    x = np.linspace(-1, 1, tile_size)
    y = np.linspace(-1, 1, tile_size)
    xx, yy = np.meshgrid(x, y)
    kernel = np.exp(-(xx**2 + yy**2) / (2 * sigma**2))
    return kernel.astype(np.float32)


def evaluate_model_on_scenes(model, scenes, thresholds, tile_size=512, stride=512, use_gaussian=False):
    """
    Evaluates a model over a list of scenes for given thresholds.
    Supports standard non-overlapping (stride=tile_size) or overlapping with Gaussian blending.
    """
    gaussian_kernel = generate_gaussian_window(tile_size) if use_gaussian else np.ones((tile_size, tile_size), dtype=np.float32)

    scene_results = []
    for sc in scenes:
        img_p = sc["image_path"]
        msk_p = sc.get("mask_path")
        cat = sc.get("category", "unknown")

        raster_tensor, meta = load_sar_raster(img_p, polarization="VV+VH")
        h, w = meta["height"], meta["width"]

        # Generate tiles with custom stride
        tiles = []
        coords = []
        for y in range(0, max(1, h - tile_size + 1), stride):
            if y + tile_size > h:
                y = max(0, h - tile_size)
            for x in range(0, max(1, w - tile_size + 1), stride):
                if x + tile_size > w:
                    x = max(0, w - tile_size)
                patch = raster_tensor[:, y:y+tile_size, x:x+tile_size]
                if patch.shape[1] == tile_size and patch.shape[2] == tile_size:
                    tiles.append(patch)
                    coords.append((y, x))

        # Run inference
        prob_accum = np.zeros((h, w), dtype=np.float32)
        weight_accum = np.zeros((h, w), dtype=np.float32)

        with torch.no_grad():
            for patch, (y, x) in zip(tiles, coords):
                t_tensor = torch.from_numpy(patch).unsqueeze(0).float()
                probs = model.predict_probabilities(t_tensor)
                p_oil = probs[0, 1].cpu().numpy()

                prob_accum[y:y+tile_size, x:x+tile_size] += p_oil * gaussian_kernel
                weight_accum[y:y+tile_size, x:x+tile_size] += gaussian_kernel

        full_prob = prob_accum / np.maximum(weight_accum, 1e-6)

        gt_mask = np.zeros((h, w), dtype=np.uint8)
        if msk_p and os.path.exists(msk_p):
            with rasterio.open(msk_p) as msrc:
                gt_mask = (msrc.read(1) > 0).astype(np.uint8)

        scene_results.append({
            "scene_id": sc["scene_id"],
            "category": cat,
            "full_prob": full_prob,
            "gt_mask": gt_mask,
            "height": h, "width": w
        })

    # Calculate metrics across thresholds
    metrics_by_threshold = []
    for th in thresholds:
        tp_tot, fp_tot, fn_tot, tn_tot = 0, 0, 0, 0
        cat_stats = {}

        for sr in scene_results:
            cat = sr["category"]
            if cat not in cat_stats:
                cat_stats[cat] = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}

            pred = (sr["full_prob"] >= th).astype(np.uint8)
            gt = sr["gt_mask"]

            tp = int(np.sum((pred == 1) & (gt == 1)))
            fp = int(np.sum((pred == 1) & (gt == 0)))
            fn = int(np.sum((pred == 0) & (gt == 1)))
            tn = int(np.sum((pred == 0) & (gt == 0)))

            tp_tot += tp
            fp_tot += fp
            fn_tot += fn
            tn_tot += tn

            cat_stats[cat]["tp"] += tp
            cat_stats[cat]["fp"] += fp
            cat_stats[cat]["fn"] += fn
            cat_stats[cat]["tn"] += tn

        tot_px = tp_tot + fp_tot + fn_tot + tn_tot
        iou = tp_tot / (tp_tot + fp_tot + fn_tot + 1e-10) * 100
        dice = 2 * tp_tot / (2 * tp_tot + fp_tot + fn_tot + 1e-10) * 100
        precision = tp_tot / (tp_tot + fp_tot + 1e-10) * 100
        recall = tp_tot / (tp_tot + fn_tot + 1e-10) * 100
        fpr = fp_tot / (fp_tot + tn_tot + 1e-10) * 100

        per_cat = {}
        for c, cs in cat_stats.items():
            c_tp, c_fp, c_fn, c_tn = cs["tp"], cs["fp"], cs["fn"], cs["tn"]
            per_cat[c] = {
                "tp": c_tp, "fp": c_fp, "fn": c_fn, "tn": c_tn,
                "iou": c_tp / (c_tp + c_fp + c_fn + 1e-10) * 100,
                "dice": 2 * c_tp / (2 * c_tp + c_fp + c_fn + 1e-10) * 100,
                "precision": c_tp / (c_tp + c_fp + 1e-10) * 100,
                "recall": c_tp / (c_tp + c_fn + 1e-10) * 100,
                "fpr": c_fp / (c_fp + c_tn + 1e-10) * 100
            }

        metrics_by_threshold.append({
            "threshold": float(th),
            "tp": tp_tot, "fp": fp_tot, "fn": fn_tot, "tn": tn_tot,
            "total_pixels": tot_px,
            "iou": float(iou), "dice": float(dice),
            "precision": float(precision), "recall": float(recall),
            "fpr": float(fpr),
            "by_category": per_cat
        })

    return metrics_by_threshold, scene_results


def main():
    print("=" * 80)
    print("PHASE: V4 EVALUATION & MODEL CARD BENCHMARKING")
    print("=" * 80)

    os.makedirs("docs/artifacts", exist_ok=True)
    os.makedirs("docs/model", exist_ok=True)

    with open("data/raw/satellite/dataset_manifest.json", "r") as f:
        manifest = json.load(f)

    scenes = manifest["scenes"]
    train_scenes = [s for s in scenes if s.get("split") == "train"]
    val_scenes = [s for s in scenes if s.get("split") == "val"]
    test_scenes = [s for s in scenes if s.get("split") == "test"]
    lookalike_scenes = [s for s in scenes if s.get("category") == "lookalike"]
    no_oil_scenes = [s for s in scenes if s.get("category") == "no_oil"]

    # 1. Preprocessing Validation Statistics
    print("\n[1] GENERATING PREPROCESSING VALIDATION REPORT")
    sample_ids = {
        "part1_oil": "real_part1_oil_00000",
        "part2_no_oil": "real_part2_no_oil_00000",
        "part2_lookalike": "real_part2_lookalike_00000",
        "part3_test": "real_part3_test_00060"
    }
    prep_val_data = {}
    for label, sid in sample_ids.items():
        s = next(sc for sc in scenes if sc["scene_id"] == sid)
        with rasterio.open(s["image_path"]) as src:
            raw_vv = src.read(1)
            raw_vh = src.read(2)
        tensor, _ = load_sar_raster(s["image_path"], polarization="VV+VH")
        norm_vv = tensor[0]
        norm_vh = tensor[1]

        prep_val_data[label] = {
            "scene_id": sid,
            "raw_vv": {
                "min": float(np.nanmin(raw_vv)), "max": float(np.nanmax(raw_vv)),
                "mean": float(np.nanmean(raw_vv)), "median": float(np.nanmedian(raw_vv)),
                "p01": float(np.percentile(raw_vv, 1)), "p99": float(np.percentile(raw_vv, 99))
            },
            "raw_vh": {
                "min": float(np.nanmin(raw_vh)), "max": float(np.nanmax(raw_vh)),
                "mean": float(np.nanmean(raw_vh)), "median": float(np.nanmedian(raw_vh)),
                "p01": float(np.percentile(raw_vh, 1)), "p99": float(np.percentile(raw_vh, 99))
            },
            "normalized_vv": {
                "min": float(np.min(norm_vv)), "max": float(np.max(norm_vv)),
                "mean": float(np.mean(norm_vv)), "median": float(np.median(norm_vv)),
                "pct_zeros": float(np.mean(norm_vv == 0.0) * 100),
                "pct_ones": float(np.mean(norm_vv == 1.0) * 100)
            },
            "normalized_vh": {
                "min": float(np.min(norm_vh)), "max": float(np.max(norm_vh)),
                "mean": float(np.mean(norm_vh)), "median": float(np.median(norm_vh)),
                "pct_zeros": float(np.mean(norm_vh == 0.0) * 100),
                "pct_ones": float(np.mean(norm_vh == 1.0) * 100)
            }
        }
    with open("docs/artifacts/v4-preprocessing-validation.json", "w") as f:
        json.dump(prep_val_data, f, indent=2)
    print("Saved docs/artifacts/v4-preprocessing-validation.json")

    # 2. Load Models
    print("\n[2] LOADING MODEL REGISTRY CHECKPOINTS")
    model_v2, _ = model_registry.load_model("unet-dual-pol-sar-v2", device="cpu", allow_untrained=False)
    model_v2.eval()
    model_v3, _ = model_registry.load_model("unet-dual-pol-sar-v3", device="cpu", allow_untrained=False)
    model_v3.eval()
    model_v4, _ = model_registry.load_model("unet-dual-pol-sar-v4", device="cpu", allow_untrained=False)
    model_v4.eval()

    # 3. Fine Validation Threshold Sweep (0.10 to 0.50, step 0.01) on Validation Split
    print("\n[3] RUNNING FINE VALIDATION THRESHOLD SWEEP ON V4 (0.10 - 0.50, step=0.01)")
    val_thresholds = [round(t, 2) for t in np.arange(0.10, 0.51, 0.01)]
    v4_val_sweep, _ = evaluate_model_on_scenes(model_v4, val_scenes, val_thresholds, tile_size=512, stride=512)

    with open("docs/artifacts/v4-threshold-sweep.json", "w") as f:
        json.dump({
            "model_id": "unet-dual-pol-sar-v4",
            "validation_scenes_count": len(val_scenes),
            "step_size": 0.01,
            "threshold_sweep": v4_val_sweep
        }, f, indent=2)
    print("Saved docs/artifacts/v4-threshold-sweep.json")

    # Select threshold: find threshold with max Dice where FPR <= 5% (or best balance)
    candidate_th = [r for r in v4_val_sweep if r["fpr"] <= 5.0 and r["dice"] > 0]
    if candidate_th:
        best_val = max(candidate_th, key=lambda x: (x["dice"], x["precision"]))
    else:
        best_val = max(v4_val_sweep, key=lambda x: (x["dice"], -x["fpr"]))

    selected_threshold = best_val["threshold"]
    print(f"\nOptimal Threshold selected from validation data: {selected_threshold:.2f}")
    print(f"  Validation Dice: {best_val['dice']:.4f}%, IoU: {best_val['iou']:.4f}%, Precision: {best_val['precision']:.4f}%, Recall: {best_val['recall']:.4f}%, FPR: {best_val['fpr']:.4f}%")

    # 4. Held-out Test Set Evaluation (Standard Stride 512)
    print("\n[4] EVALUATING HELD-OUT TEST BENCHMARK (Stride 512)")
    v4_test_res, _ = evaluate_model_on_scenes(model_v4, test_scenes, [0.35, selected_threshold], tile_size=512, stride=512)
    v4_test_selected = next(r for r in v4_test_res if r["threshold"] == selected_threshold)
    v4_test_th35 = next(r for r in v4_test_res if r["threshold"] == 0.35)

    v2_test_res, _ = evaluate_model_on_scenes(model_v2, test_scenes, [0.35], tile_size=512, stride=512)
    v2_test_th35 = v2_test_res[0]

    v3_test_res, _ = evaluate_model_on_scenes(model_v3, test_scenes, [0.25, 0.35], tile_size=512, stride=512)
    v3_test_th25 = next(r for r in v3_test_res if r["threshold"] == 0.25)

    # 5. Overlapping Inference Experiment (Tile 512, Stride 256, 50% Overlap with Gaussian Blending)
    print("\n[5] EVALUATING V4 OVERLAPPING INFERENCE (Stride 256 + Gaussian Blending)")
    v4_overlap_test_res, _ = evaluate_model_on_scenes(
        model_v4, test_scenes, [selected_threshold],
        tile_size=512, stride=256, use_gaussian=True
    )
    v4_test_overlap = v4_overlap_test_res[0]

    # 6. Look-Alike & No-Oil Benchmarks
    print("\n[6] EVALUATING LOOK-ALIKE & CLEAN-OCEAN BENCHMARKS")
    v4_la_res, _ = evaluate_model_on_scenes(model_v4, lookalike_scenes, [selected_threshold, 0.35], tile_size=512, stride=512)
    v4_no_oil_res, _ = evaluate_model_on_scenes(model_v4, no_oil_scenes, [selected_threshold, 0.35], tile_size=512, stride=512)

    v4_la_fpr = next(r for r in v4_la_res if r["threshold"] == selected_threshold)["fpr"]
    v4_no_oil_fpr = next(r for r in v4_no_oil_res if r["threshold"] == selected_threshold)["fpr"]

    # 7. Probability Distributions
    print("\n[7] COMPUTING PROBABILITY DISTRIBUTIONS FOR V4")
    def get_prob_distribution(model, scene_list):
        oil_p, clean_p, la_p = [], [], []
        for sc in scene_list:
            cat = sc.get("category", "")
            img_p = sc["image_path"]
            msk_p = sc.get("mask_path")

            raster_tensor, meta = load_sar_raster(img_p, polarization="VV+VH")
            tiles, coords = generate_tiles(raster_tensor, tile_size=512, stride=512)

            tile_preds = []
            with torch.no_grad():
                for t in tiles:
                    t_tensor = torch.from_numpy(t).unsqueeze(0).float()
                    probs = model.predict_probabilities(t_tensor)
                    tile_preds.append(probs[0, 1].cpu().numpy())
            full_prob = reconstruct_full_mask(tile_preds, coords, meta["height"], meta["width"], 512)

            gt = np.zeros_like(full_prob, dtype=np.uint8)
            if msk_p and os.path.exists(msk_p):
                with rasterio.open(msk_p) as msrc:
                    gt = (msrc.read(1) > 0).astype(np.uint8)

            if np.sum(gt == 1) > 0:
                oil_p.extend(full_prob[gt == 1].flatten().tolist())
                clean_sample = full_prob[gt == 0].flatten()
                if len(clean_sample) > 5000:
                    clean_sample = np.random.choice(clean_sample, size=5000, replace=False)
                clean_p.extend(clean_sample.tolist())
            elif cat == "lookalike":
                la_sample = full_prob.flatten()
                if len(la_sample) > 10000:
                    la_sample = np.random.choice(la_sample, size=10000, replace=False)
                la_p.extend(la_sample.tolist())
            else:
                clean_sample = full_prob.flatten()
                if len(clean_sample) > 10000:
                    clean_sample = np.random.choice(clean_sample, size=10000, replace=False)
                clean_p.extend(clean_sample.tolist())
        return np.array(oil_p), np.array(clean_p), np.array(la_p)

    np.random.seed(42)
    v4_oil_arr, v4_clean_arr, v4_la_arr = get_prob_distribution(model_v4, scenes)

    def stats_dict(arr):
        if len(arr) == 0:
            return {}
        return {
            "count": int(len(arr)),
            "min": float(np.min(arr)), "max": float(np.max(arr)),
            "mean": float(np.mean(arr)), "median": float(np.median(arr)),
            "p90": float(np.percentile(arr, 90)), "p95": float(np.percentile(arr, 95)),
            "p99": float(np.percentile(arr, 99))
        }

    v4_prob_dists = {
        "model_id": "unet-dual-pol-sar-v4",
        "true_oil_pixels": stats_dict(v4_oil_arr),
        "clean_ocean_pixels": stats_dict(v4_clean_arr),
        "lookalike_pixels": stats_dict(v4_la_arr)
    }
    with open("docs/artifacts/v4-probability-distributions.json", "w") as f:
        json.dump(v4_prob_dists, f, indent=2)
    print("Saved docs/artifacts/v4-probability-distributions.json")

    # 8. Forensic Visualizations (Scene 00000 Train Diagnostic & Scene 00015 Validation)
    print("\n[8] GENERATING FORENSIC VISUALIZATION ARTIFACTS")
    s_diag = next(sc for sc in scenes if sc["scene_id"] == "real_part1_oil_00000")
    s_val = next(sc for sc in scenes if sc["scene_id"] == "real_part1_oil_00015")

    def run_scene_inference(model, scene_obj):
        raster_tensor, meta = load_sar_raster(scene_obj["image_path"], polarization="VV+VH")
        tiles, coords = generate_tiles(raster_tensor, tile_size=512, stride=512)
        tile_preds = []
        with torch.no_grad():
            for t in tiles:
                t_tensor = torch.from_numpy(t).unsqueeze(0).float()
                p = model.predict_probabilities(t_tensor)
                tile_preds.append(p[0, 1].cpu().numpy())
        full_prob = reconstruct_full_mask(tile_preds, coords, meta["height"], meta["width"], 512)
        with rasterio.open(scene_obj["mask_path"]) as msrc:
            gt_mask = (msrc.read(1) > 0).astype(np.uint8)
        return raster_tensor, full_prob, gt_mask

    vv_diag, p_v2_diag, gt_diag = run_scene_inference(model_v2, s_diag)
    _, p_v4_diag, _ = run_scene_inference(model_v4, s_diag)

    vv_val, p_v2_val, gt_val = run_scene_inference(model_v2, s_val)
    _, p_v4_val, _ = run_scene_inference(model_v4, s_val)

    fig, axes = plt.subplots(2, 6, figsize=(24, 8))
    fig.patch.set_facecolor('#0b1311')

    # Row 1: Train Scene 00000 Diagnostic
    # Row 2: Validation Scene 00015
    for row_idx, (sc_name, vv_t, p_v2, p_v4, gt_m) in enumerate([
        ("Train Diagnostic Scene 00000", vv_diag, p_v2_diag, p_v4_diag, gt_diag),
        ("Validation Scene 00015", vv_val, p_v2_val, p_v4_val, gt_val)
    ]):
        # 1. VV
        axes[row_idx, 0].imshow(vv_t[0], cmap='gray')
        axes[row_idx, 0].set_title(f"{sc_name}\n1. SAR VV (Decibel Normalized)", color='white', fontsize=9)
        axes[row_idx, 0].axis('off')

        # 2. GT
        gt_rgb = np.zeros((2048, 2048, 3), dtype=np.float32)
        gt_rgb[gt_m == 1] = [0.06, 0.73, 0.51] # Emerald
        axes[row_idx, 1].imshow(gt_rgb)
        axes[row_idx, 1].set_title(f"2. Ground Truth Slick\n({int(np.sum(gt_m)):,} px)", color='white', fontsize=9)
        axes[row_idx, 1].axis('off')

        # 3. V2 Pred
        p2_bin = (p_v2 >= 0.35).astype(np.uint8)
        p2_rgb = np.zeros((2048, 2048, 3), dtype=np.float32)
        p2_rgb[p2_bin == 1] = [1.0, 0.3, 0.37]
        axes[row_idx, 2].imshow(p2_rgb)
        axes[row_idx, 2].set_title(f"3. V2 Baseline Pred (@0.35)\n({int(np.sum(p2_bin)):,} px)", color='white', fontsize=9)
        axes[row_idx, 2].axis('off')

        # 4. V4 Pred
        p4_bin = (p_v4 >= selected_threshold).astype(np.uint8)
        p4_rgb = np.zeros((2048, 2048, 3), dtype=np.float32)
        p4_rgb[p4_bin == 1] = [0.22, 0.74, 0.97] # Cyan
        axes[row_idx, 3].imshow(p4_rgb)
        axes[row_idx, 3].set_title(f"4. V4 Corrected Pred (@{selected_threshold:.2f})\n({int(np.sum(p4_bin)):,} px)", color='white', fontsize=9)
        axes[row_idx, 3].axis('off')

        # 5. V2 Confusion
        v2_ov = np.zeros((2048, 2048, 3), dtype=np.float32)
        v2_ov[(gt_m == 1) & (p2_bin == 0)] = [0.06, 0.73, 0.51] # FN green
        v2_ov[(gt_m == 0) & (p2_bin == 1)] = [0.95, 0.15, 0.15] # FP red
        v2_ov[(gt_m == 1) & (p2_bin == 1)] = [1.0, 0.85, 0.0]  # TP yellow
        tp2 = int(np.sum((gt_m == 1) & (p2_bin == 1)))
        fp2 = int(np.sum((gt_m == 0) & (p2_bin == 1)))
        fn2 = int(np.sum((gt_m == 1) & (p2_bin == 0)))
        axes[row_idx, 4].imshow(v2_ov)
        axes[row_idx, 4].set_title(f"5. V2 Confusion\nTP={tp2:,} | FP={fp2:,} | FN={fn2:,}", color='white', fontsize=9)
        axes[row_idx, 4].axis('off')

        # 6. V4 Confusion
        v4_ov = np.zeros((2048, 2048, 3), dtype=np.float32)
        v4_ov[(gt_m == 1) & (p4_bin == 0)] = [0.06, 0.73, 0.51] # FN green
        v4_ov[(gt_m == 0) & (p4_bin == 1)] = [0.95, 0.15, 0.15] # FP red
        v4_ov[(gt_m == 1) & (p4_bin == 1)] = [1.0, 0.85, 0.0]  # TP yellow
        tp4 = int(np.sum((gt_m == 1) & (p4_bin == 1)))
        fp4 = int(np.sum((gt_m == 0) & (p4_bin == 1)))
        fn4 = int(np.sum((gt_m == 1) & (p4_bin == 0)))
        axes[row_idx, 5].imshow(v4_ov)
        axes[row_idx, 5].set_title(f"6. V4 Confusion\nTP={tp4:,} | FP={fp4:,} | FN={fn4:,}", color='white', fontsize=9)
        axes[row_idx, 5].axis('off')

    plt.tight_layout()
    plt.savefig("docs/artifacts/v4-forensic-comparison.png", dpi=150, facecolor=fig.get_facecolor())
    plt.close()
    print("Saved docs/artifacts/v4-forensic-comparison.png")

    # 9. Complete Metrics & Comparison Artifact
    print("\n[9] SAVING METRICS & COMPARISON ARTIFACTS")
    comparison_metrics = {
        "evaluation_timestamp": "2026-09-14T00:30:00Z",
        "selected_validation_threshold": selected_threshold,
        "models": {
            "v2_baseline": {
                "model_id": "unet-dual-pol-sar-v2",
                "threshold": 0.35,
                "iou": v2_test_th35["iou"],
                "dice": v2_test_th35["dice"],
                "precision": v2_test_th35["precision"],
                "recall": v2_test_th35["recall"],
                "fpr": v2_test_th35["fpr"],
                "tp": v2_test_th35["tp"], "fp": v2_test_th35["fp"],
                "fn": v2_test_th35["fn"], "tn": v2_test_th35["tn"]
            },
            "v3_experimental": {
                "model_id": "unet-dual-pol-sar-v3",
                "threshold": 0.25,
                "iou": v3_test_th25["iou"],
                "dice": v3_test_th25["dice"],
                "precision": v3_test_th25["precision"],
                "recall": v3_test_th25["recall"],
                "fpr": v3_test_th25["fpr"],
                "tp": v3_test_th25["tp"], "fp": v3_test_th25["fp"],
                "fn": v3_test_th25["fn"], "tn": v3_test_th25["tn"]
            },
            "v4_corrected_baseline_stride512": {
                "model_id": "unet-dual-pol-sar-v4",
                "threshold": selected_threshold,
                "inference_strategy": "stride_512_non_overlapping",
                "iou": v4_test_selected["iou"],
                "dice": v4_test_selected["dice"],
                "precision": v4_test_selected["precision"],
                "recall": v4_test_selected["recall"],
                "fpr": v4_test_selected["fpr"],
                "lookalike_fpr": v4_la_fpr,
                "clean_ocean_fpr": v4_no_oil_fpr,
                "tp": v4_test_selected["tp"], "fp": v4_test_selected["fp"],
                "fn": v4_test_selected["fn"], "tn": v4_test_selected["tn"]
            },
            "v4_corrected_overlapping_stride256": {
                "model_id": "unet-dual-pol-sar-v4",
                "threshold": selected_threshold,
                "inference_strategy": "stride_256_50pct_overlap_gaussian_blending",
                "iou": v4_test_overlap["iou"],
                "dice": v4_test_overlap["dice"],
                "precision": v4_test_overlap["precision"],
                "recall": v4_test_overlap["recall"],
                "fpr": v4_test_overlap["fpr"],
                "tp": v4_test_overlap["tp"], "fp": v4_test_overlap["fp"],
                "fn": v4_test_overlap["fn"], "tn": v4_test_overlap["tn"]
            }
        }
    }
    with open("docs/artifacts/v4-metrics.json", "w") as f:
        json.dump(comparison_metrics, f, indent=2)
    print("Saved docs/artifacts/v4-metrics.json")

    # 10. Model Card Artifact
    model_card = {
        "model_id": "unet-dual-pol-sar-v4",
        "model_type": "Dual-Polarization U-Net Segmentation",
        "release_status": "experimental",
        "normalization": {
            "type": "Decibel_Calibrated_Clipping",
            "vv_range_db": [-35.0, -5.0],
            "vh_range_db": [-45.0, -15.0],
            "finite_masking": True
        },
        "training": {
            "loss": "FocalTverskyLoss(alpha=0.3, beta=0.7, gamma=1.33)",
            "optimizer": "AdamW(lr=0.0005, weight_decay=0.0001)",
            "sampler": "WeightedRandomSampler(pos_weight=2.5)",
            "epochs": 15,
            "seed": 42
        },
        "performance_summary": {
            "operating_threshold": selected_threshold,
            "test_dice": float(v4_test_selected["dice"]),
            "test_iou": float(v4_test_selected["iou"]),
            "test_precision": float(v4_test_selected["precision"]),
            "test_recall": float(v4_test_selected["recall"]),
            "test_fpr": float(v4_test_selected["fpr"]),
            "lookalike_fpr": float(v4_la_fpr),
            "clean_ocean_fpr": float(v4_no_oil_fpr)
        }
    }
    with open("docs/artifacts/v4-model-card.json", "w") as f:
        json.dump(model_card, f, indent=2)
    print("Saved docs/artifacts/v4-model-card.json")

    print("\n" + "=" * 80)
    print("V2 vs V3 vs V4 HEAD-TO-HEAD BENCHMARK TABLE")
    print("=" * 80)
    print(f"{'Metric':<25} | {'V2 (@0.35)':<15} | {'V3 (@0.25)':<15} | {'V4 Stride 512 (@' + str(selected_threshold) + ')':<25} | {'V4 Overlap 256':<15}")
    print("-" * 105)
    print(f"{'IoU (%)':<25} | {v2_test_th35['iou']:<15.4f} | {v3_test_th25['iou']:<15.4f} | {v4_test_selected['iou']:<25.4f} | {v4_test_overlap['iou']:<15.4f}")
    print(f"{'Dice / F1 (%)':<25} | {v2_test_th35['dice']:<15.4f} | {v3_test_th25['dice']:<15.4f} | {v4_test_selected['dice']:<25.4f} | {v4_test_overlap['dice']:<15.4f}")
    print(f"{'Precision (%)':<25} | {v2_test_th35['precision']:<15.4f} | {v3_test_th25['precision']:<15.4f} | {v4_test_selected['precision']:<25.4f} | {v4_test_overlap['precision']:<15.4f}")
    print(f"{'Recall (%)':<25} | {v2_test_th35['recall']:<15.4f} | {v3_test_th25['recall']:<15.4f} | {v4_test_selected['recall']:<25.4f} | {v4_test_overlap['recall']:<15.4f}")
    print(f"{'Overall Test FPR (%)':<25} | {v2_test_th35['fpr']:<15.4f} | {v3_test_th25['fpr']:<15.4f} | {v4_test_selected['fpr']:<25.4f} | {v4_test_overlap['fpr']:<15.4f}")
    print(f"{'True Positives (TP)':<25} | {v2_test_th35['tp']:<15,d} | {v3_test_th25['tp']:<15,d} | {v4_test_selected['tp']:<25,d} | {v4_test_overlap['tp']:<15,d}")
    print(f"{'False Positives (FP)':<25} | {v2_test_th35['fp']:<15,d} | {v3_test_th25['fp']:<15,d} | {v4_test_selected['fp']:<25,d} | {v4_test_overlap['fp']:<15,d}")
    print(f"{'False Negatives (FN)':<25} | {v2_test_th35['fn']:<15,d} | {v3_test_th25['fn']:<15,d} | {v4_test_selected['fn']:<25,d} | {v4_test_overlap['fn']:<15,d}")


if __name__ == "__main__":
    main()
