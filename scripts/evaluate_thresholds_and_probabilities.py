import os
import sys
import json
import torch
import numpy as np
import rasterio
from typing import Dict, List, Any

# Ensure project root is in path
sys.path.insert(0, os.path.abspath('.'))
sys.path.insert(0, os.path.abspath('services/ml-python'))


from app.models.registry import model_registry
from app.preprocessing.sar_preprocessor import load_sar_raster
from app.preprocessing.tiling import generate_tiles, reconstruct_full_mask


def run_probability_and_threshold_analysis():
    print("=" * 80)
    print("PHASE 3D-3: SAR PROBABILITY DISTRIBUTION & THRESHOLD ANALYSIS (V1 MODEL)")
    print("=" * 80)

    # Load model
    model, entry = model_registry.load_model(model_id="unet-dual-pol-sar-v1", device="cpu", allow_untrained=False)
    model.eval()

    # Load manifest
    with open("data/raw/satellite/dataset_manifest.json", "r") as f:
        manifest = json.load(f)

    scenes = manifest["scenes"]
    test_scenes = [s for s in scenes if s.get("split") == "test"]
    lookalike_scenes = [s for s in scenes if s.get("category") == "lookalike"]

    print(f"\nEvaluating on {len(test_scenes)} Test Scenes and {len(lookalike_scenes)} Look-Alike Challenge Scenes...")

    # Data collectors
    pos_probs_all = []
    bg_probs_all = []
    lookalike_probs_all = []

    scene_results = []

    # 1. Evaluate Test Scenes
    for s in test_scenes:
        scene_id = s["scene_id"]
        img_path = s["image_path"]
        mask_path = s["mask_path"]

        # Ingest and tile
        raster_tensor, meta = load_sar_raster(img_path, polarization="VV+VH")
        tiles, coords = generate_tiles(raster_tensor, tile_size=512, stride=512)

        # Inference
        tile_preds = []
        with torch.no_grad():
            for t in tiles:
                t_tensor = torch.from_numpy(t).unsqueeze(0).float()
                probs = model.predict_probabilities(t_tensor)
                # class 1 = oil spill
                spill_prob = probs[0, 1].cpu().numpy()
                tile_preds.append(spill_prob)

        full_prob = reconstruct_full_mask(tile_preds, coords, meta["height"], meta["width"], 512)

        # Load ground truth mask
        with rasterio.open(mask_path) as msrc:
            gt_mask = (msrc.read(1) > 0).astype(np.uint8)

        gt_pos_count = int(np.sum(gt_mask == 1))
        gt_neg_count = int(np.sum(gt_mask == 0))

        pos_pixels = full_prob[gt_mask == 1]
        bg_pixels = full_prob[gt_mask == 0]

        if len(pos_pixels) > 0:
            pos_probs_all.extend(pos_pixels.tolist())
        if len(bg_pixels) > 0:
            # Subsample bg to avoid memory explosion (1% sample)
            bg_probs_all.extend(np.random.choice(bg_pixels, size=len(bg_pixels)//100, replace=False).tolist())

        scene_results.append({
            "scene_id": scene_id,
            "category": s.get("category", "test_set"),
            "gt_pos_pixels": gt_pos_count,
            "gt_neg_pixels": gt_neg_count,
            "prob_min": float(np.min(full_prob)),
            "prob_max": float(np.max(full_prob)),
            "prob_mean": float(np.mean(full_prob)),
            "prob_pos_mean": float(np.mean(pos_pixels)) if len(pos_pixels) > 0 else None,
            "prob_pos_max": float(np.max(pos_pixels)) if len(pos_pixels) > 0 else None,
            "prob_bg_mean": float(np.mean(bg_pixels)),
            "full_prob": full_prob,
            "gt_mask": gt_mask
        })

    # 2. Evaluate Look-alike Scenes
    for s in lookalike_scenes:
        scene_id = s["scene_id"]
        img_path = s["image_path"]
        mask_path = s["mask_path"]

        raster_tensor, meta = load_sar_raster(img_path, polarization="VV+VH")
        tiles, coords = generate_tiles(raster_tensor, tile_size=512, stride=512)

        tile_preds = []
        with torch.no_grad():
            for t in tiles:
                t_tensor = torch.from_numpy(t).unsqueeze(0).float()
                probs = model.predict_probabilities(t_tensor)
                tile_preds.append(probs[0, 1].cpu().numpy())

        full_prob = reconstruct_full_mask(tile_preds, coords, meta["height"], meta["width"], 512)
        lookalike_probs_all.extend(np.random.choice(full_prob.flatten(), size=len(full_prob.flatten())//100, replace=False).tolist())

    # =========================================================================
    # STEP 2: PROBABILITY DISTRIBUTION ANALYSIS
    # =========================================================================
    print("\n" + "=" * 80)
    print("STEP 2: PREDICTION PROBABILITY DISTRIBUTIONS")
    print("=" * 80)

    pos_probs_arr = np.array(pos_probs_all)
    bg_probs_arr = np.array(bg_probs_all)
    la_probs_arr = np.array(lookalike_probs_all)

    print(f"\n[A] Ground Truth Positive (Oil Slick) Pixels (N = {len(pos_probs_arr):,}):")
    print(f"    Min:         {pos_probs_arr.min():.5f}")
    print(f"    Max:         {pos_probs_arr.max():.5f}")
    print(f"    Mean ± Std:  {pos_probs_arr.mean():.5f} ± {pos_probs_arr.std():.5f}")
    print(f"    Median (p50):{np.percentile(pos_probs_arr, 50):.5f}")
    print(f"    p75:         {np.percentile(pos_probs_arr, 75):.5f}")
    print(f"    p90:         {np.percentile(pos_probs_arr, 90):.5f}")
    print(f"    p95:         {np.percentile(pos_probs_arr, 95):.5f}")
    print(f"    p99:         {np.percentile(pos_probs_arr, 99):.5f}")

    print(f"\n[B] Background (Clean Sea) Pixels (Sample N = {len(bg_probs_arr):,}):")
    print(f"    Min:         {bg_probs_arr.min():.5f}")
    print(f"    Max:         {bg_probs_arr.max():.5f}")
    print(f"    Mean ± Std:  {bg_probs_arr.mean():.5f} ± {bg_probs_arr.std():.5f}")
    print(f"    p50:         {np.percentile(bg_probs_arr, 50):.5f}")
    print(f"    p90:         {np.percentile(bg_probs_arr, 90):.5f}")
    print(f"    p99:         {np.percentile(bg_probs_arr, 99):.5f}")
    print(f"    p99.9:       {np.percentile(bg_probs_arr, 99.9):.5f}")

    print(f"\n[C] Look-Alike Challenge Pixels (Sample N = {len(la_probs_arr):,}):")
    print(f"    Min:         {la_probs_arr.min():.5f}")
    print(f"    Max:         {la_probs_arr.max():.5f}")
    print(f"    Mean ± Std:  {la_probs_arr.mean():.5f} ± {la_probs_arr.std():.5f}")
    print(f"    p50:         {np.percentile(la_probs_arr, 50):.5f}")
    print(f"    p90:         {np.percentile(la_probs_arr, 90):.5f}")
    print(f"    p99:         {np.percentile(la_probs_arr, 99):.5f}")
    print(f"    p99.9:       {np.percentile(la_probs_arr, 99.9):.5f}")

    # =========================================================================
    # STEP 3: THRESHOLD SWEEP
    # =========================================================================
    print("\n" + "=" * 80)
    print("STEP 3: THRESHOLD SWEEP ON HELD-OUT TEST SET (5 SCENES, 80 TILES)")
    print("=" * 80)

    thresholds = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.36, 0.37, 0.38, 0.40, 0.45, 0.50]
    sweep_table = []

    print(f"{'Thresh':<8} | {'IoU (%)':<9} | {'Dice (%)':<10} | {'Prec (%)':<10} | {'Recall (%)':<11} | {'FPR (%)':<9} | {'Lookalike FPR':<14} | {'Pred Pos %':<11}")
    print("-" * 95)

    for th in thresholds:
        tp_tot = 0
        fp_tot = 0
        fn_tot = 0
        tn_tot = 0

        for sr in scene_results:
            pred_bin = (sr["full_prob"] >= th).astype(np.uint8)
            gt = sr["gt_mask"]

            tp = int(np.sum((pred_bin == 1) & (gt == 1)))
            fp = int(np.sum((pred_bin == 1) & (gt == 0)))
            fn = int(np.sum((pred_bin == 0) & (gt == 1)))
            tn = int(np.sum((pred_bin == 0) & (gt == 0)))

            tp_tot += tp
            fp_tot += fp
            fn_tot += fn
            tn_tot += tn

        iou = tp_tot / (tp_tot + fp_tot + fn_tot + 1e-10) * 100
        dice = 2 * tp_tot / (2 * tp_tot + fp_tot + fn_tot + 1e-10) * 100
        prec = tp_tot / (tp_tot + fp_tot + 1e-10) * 100
        rec = tp_tot / (tp_tot + fn_tot + 1e-10) * 100
        fpr = fp_tot / (fp_tot + tn_tot + 1e-10) * 100
        pred_pct = (tp_tot + fp_tot) / (tp_tot + fp_tot + fn_tot + tn_tot) * 100

        # Lookalike FPR
        la_fp = int(np.sum(la_probs_arr >= th))
        la_fpr = la_fp / len(la_probs_arr) * 100

        sweep_table.append({
            "threshold": th,
            "iou": iou,
            "dice": dice,
            "precision": prec,
            "recall": rec,
            "fpr": fpr,
            "lookalike_fpr": la_fpr,
            "pred_pct": pred_pct
        })

        print(f"{th:<8.2f} | {iou:<9.3f} | {dice:<10.3f} | {prec:<10.3f} | {rec:<11.3f} | {fpr:<9.4f} | {la_fpr:<14.4f} | {pred_pct:<11.3f}")

    # =========================================================================
    # STEP 4: PER-SCENE EVALUATION (At Optimal vs Default Threshold)
    # =========================================================================
    print("\n" + "=" * 80)
    print("STEP 4: PER-SCENE EVALUATION ON HELD-OUT TEST SCENES")
    print("=" * 80)

    # Let's inspect at th = 0.36 and th = 0.50
    for eval_th in [0.36, 0.50]:
        print(f"\n--- Metrics at Threshold = {eval_th:.2f} ---")
        print(f"{'Scene ID':<22} | {'Cat':<9} | {'GT Pos':<8} | {'Pred Pos':<9} | {'TP':<7} | {'FP':<7} | {'FN':<7} | {'Dice(%)':<8} | {'Rec(%)':<8} | {'Max Prob':<9} | {'Failure Mode'}")
        print("-" * 125)
        for sr in scene_results:
            pred_bin = (sr["full_prob"] >= eval_th).astype(np.uint8)
            gt = sr["gt_mask"]
            tp = int(np.sum((pred_bin == 1) & (gt == 1)))
            fp = int(np.sum((pred_bin == 1) & (gt == 0)))
            fn = int(np.sum((pred_bin == 0) & (gt == 1)))
            gt_pos = sr["gt_pos_pixels"]
            pred_pos = tp + fp
            dice = 2 * tp / (2 * tp + fp + fn + 1e-10) * 100
            rec = tp / (tp + fn + 1e-10) * 100 if gt_pos > 0 else 100.0

            # Classify failure mode
            if gt_pos > 0:
                if tp == 0:
                    mode = "COMPLETE MISS"
                elif rec < 70:
                    mode = "PARTIAL DETECTION"
                else:
                    mode = "SUCCESSFUL DETECTION"
            else:
                if fp == 0:
                    mode = "CLEAN REJECTION"
                else:
                    mode = "FALSE ALARMS"

            print(f"{sr['scene_id']:<22} | {sr['category']:<9} | {gt_pos:<8,} | {pred_pos:<9,} | {tp:<7,} | {fp:<7,} | {fn:<7,} | {dice:<8.2f} | {rec:<8.2f} | {sr['prob_max']:<9.4f} | {mode}")

    # Save metrics JSON for documentation
    out_data = {
        "model_id": "unet-dual-pol-sar-v1",
        "probability_stats": {
            "pos": {
                "min": float(pos_probs_arr.min()), "max": float(pos_probs_arr.max()),
                "mean": float(pos_probs_arr.mean()), "std": float(pos_probs_arr.std()),
                "p50": float(np.percentile(pos_probs_arr, 50)), "p75": float(np.percentile(pos_probs_arr, 75)),
                "p90": float(np.percentile(pos_probs_arr, 90)), "p95": float(np.percentile(pos_probs_arr, 95)),
                "p99": float(np.percentile(pos_probs_arr, 99))
            },
            "bg": {
                "min": float(bg_probs_arr.min()), "max": float(bg_probs_arr.max()),
                "mean": float(bg_probs_arr.mean()), "std": float(bg_probs_arr.std()),
                "p50": float(np.percentile(bg_probs_arr, 50)), "p90": float(np.percentile(bg_probs_arr, 90)),
                "p99": float(np.percentile(bg_probs_arr, 99))
            },
            "lookalike": {
                "min": float(la_probs_arr.min()), "max": float(la_probs_arr.max()),
                "mean": float(la_probs_arr.mean()), "std": float(la_probs_arr.std()),
                "p50": float(np.percentile(la_probs_arr, 50)), "p90": float(np.percentile(la_probs_arr, 90)),
                "p99": float(np.percentile(la_probs_arr, 99))
            }
        },
        "threshold_sweep": sweep_table
    }

    os.makedirs("ml/experiments/results", exist_ok=True)
    with open("ml/experiments/results/v1_threshold_analysis.json", "w") as f:
        json.dump(out_data, f, indent=2)

    print("\nSaved probability & threshold analysis to ml/experiments/results/v1_threshold_analysis.json")


if __name__ == "__main__":
    run_probability_and_threshold_analysis()
