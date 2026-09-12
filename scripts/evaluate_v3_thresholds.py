import os
import sys
import json
import torch
import numpy as np
import rasterio

sys.path.insert(0, os.path.abspath('.'))
sys.path.insert(0, os.path.abspath('services/ml-python'))

from app.models.registry import model_registry
from app.preprocessing.sar_preprocessor import load_sar_raster
from app.preprocessing.tiling import generate_tiles, reconstruct_full_mask


def evaluate_model_at_thresholds(model_id: str):
    print(f"Evaluating {model_id} across thresholds...")
    model, entry = model_registry.load_model(model_id=model_id, device="cpu", allow_untrained=False)
    model.eval()

    with open("data/raw/satellite/dataset_manifest.json", "r") as f:
        manifest = json.load(f)

    test_scenes = [s for s in manifest["scenes"] if s.get("split") == "test"]
    la_scenes = [s for s in manifest["scenes"] if s.get("category") == "lookalike"]

    thresholds = [0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50]
    
    # Store predictions for each test scene
    scene_preds = []
    for s in test_scenes:
        raster_tensor, meta = load_sar_raster(s["image_path"], polarization="VV+VH")
        tiles, coords = generate_tiles(raster_tensor, tile_size=512, stride=512)

        tile_preds = []
        with torch.no_grad():
            for t in tiles:
                t_tensor = torch.from_numpy(t).unsqueeze(0).float()
                probs = model.predict_probabilities(t_tensor)
                tile_preds.append(probs[0, 1].cpu().numpy())

        full_prob = reconstruct_full_mask(tile_preds, coords, meta["height"], meta["width"], 512)
        with rasterio.open(s["mask_path"]) as msrc:
            gt_mask = (msrc.read(1) > 0).astype(np.uint8)

        scene_preds.append({
            "scene_id": s["scene_id"],
            "full_prob": full_prob,
            "gt_mask": gt_mask
        })

    # Store predictions for lookalike challenge scenes
    la_probs = []
    for s in la_scenes:
        raster_tensor, meta = load_sar_raster(s["image_path"], polarization="VV+VH")
        tiles, coords = generate_tiles(raster_tensor, tile_size=512, stride=512)

        tile_preds = []
        with torch.no_grad():
            for t in tiles:
                t_tensor = torch.from_numpy(t).unsqueeze(0).float()
                probs = model.predict_probabilities(t_tensor)
                tile_preds.append(probs[0, 1].cpu().numpy())

        full_prob = reconstruct_full_mask(tile_preds, coords, meta["height"], meta["width"], 512)
        la_probs.extend(full_prob.flatten()[:10000])  # Subsample for speed

    la_probs_arr = np.array(la_probs)

    sweep_results = []
    for th in thresholds:
        tp_tot = 0
        fp_tot = 0
        fn_tot = 0
        tn_tot = 0

        for sp in scene_preds:
            p_bin = (sp["full_prob"] >= th).astype(np.uint8)
            gt = sp["gt_mask"]

            tp = int(np.sum((p_bin == 1) & (gt == 1)))
            fp = int(np.sum((p_bin == 1) & (gt == 0)))
            fn = int(np.sum((p_bin == 0) & (gt == 1)))
            tn = int(np.sum((p_bin == 0) & (gt == 0)))

            tp_tot += tp
            fp_tot += fp
            fn_tot += fn
            tn_tot += tn

        tot_p = tp_tot + fp_tot + fn_tot + tn_tot
        iou = tp_tot / (tp_tot + fp_tot + fn_tot + 1e-10) * 100
        dice = 2 * tp_tot / (2 * tp_tot + fp_tot + fn_tot + 1e-10) * 100
        prec = tp_tot / (tp_tot + fp_tot + 1e-10) * 100
        rec = tp_tot / (tp_tot + fn_tot + 1e-10) * 100
        fpr = fp_tot / (fp_tot + tn_tot + 1e-10) * 100
        la_fpr = float(np.sum(la_probs_arr >= th)) / (len(la_probs_arr) + 1e-10) * 100
        pred_pos_pct = (tp_tot + fp_tot) / (tot_p + 1e-10) * 100

        sweep_results.append({
            "threshold": th,
            "iou": iou,
            "dice": dice,
            "precision": prec,
            "recall": rec,
            "fpr": fpr,
            "lookalike_fpr": la_fpr,
            "pred_pos_pct": pred_pos_pct,
            "tp": tp_tot,
            "fp": fp_tot,
            "fn": fn_tot,
            "tn": tn_tot
        })

    return sweep_results, scene_preds


def main():
    print("=" * 80)
    print("PHASE 3D-4: MODEL V3 THRESHOLD SWEEP & V2 vs V3 COMPARISON")
    print("=" * 80)

    v3_sweep, v3_preds = evaluate_model_at_thresholds("unet-dual-pol-sar-v3")
    v2_sweep, _ = evaluate_model_at_thresholds("unet-dual-pol-sar-v2")

    print("\n--- Model V3 Threshold Sweep Table ---")
    print(f"{'Thresh':<8} | {'IoU (%)':<9} | {'Dice (%)':<10} | {'Prec (%)':<10} | {'Recall (%)':<11} | {'FPR (%)':<9} | {'Lookalike FPR':<14} | {'Pred Pos %':<11}")
    print("-" * 95)
    for r in v3_sweep:
        print(f"{r['threshold']:<8.2f} | {r['iou']:<9.4f} | {r['dice']:<10.4f} | {r['precision']:<10.4f} | {r['recall']:<11.4f} | {r['fpr']:<9.4f} | {r['lookalike_fpr']:<14.4f} | {r['pred_pos_pct']:<11.4f}")

    print("\n--- Head-to-Head Comparison: V2 vs V3 ---")
    print(f"{'Metric (at Th = 0.35)':<25} | {'Model V2':<20} | {'Model V3':<20}")
    print("-" * 72)
    v2_35 = next(r for r in v2_sweep if r["threshold"] == 0.35)
    v3_35 = next(r for r in v3_sweep if r["threshold"] == 0.35)

    print(f"{'Training Scenes':<25} | {'12 scenes':<20} | {'28 scenes (40 total)':<20}")
    print(f"{'Positive Training Tiles':<25} | {'17 tiles':<20} | {'61 tiles':<20}")
    print(f"{'Positive Pixels in Train':<25} | {'99,693':<20} | {'710,790':<20}")
    print(f"{'Test Dice (%)':<25} | {v2_35['dice']:<20.4f} | {v3_35['dice']:<20.4f}")
    print(f"{'Test Precision (%)':<25} | {v2_35['precision']:<20.4f} | {v3_35['precision']:<20.4f}")
    print(f"{'Test Recall (%)':<25} | {v2_35['recall']:<20.4f} | {v3_35['recall']:<20.4f}")
    print(f"{'Look-Alike FPR (%)':<25} | {v2_35['lookalike_fpr']:<20.4f} | {v3_35['lookalike_fpr']:<20.4f}")
    print(f"{'False Positives (FP)':<25} | {v2_35['fp']:<20,} | {v3_35['fp']:<20,}")

    # Save to JSON
    with open("ml/experiments/results/v3_threshold_analysis.json", "w") as f:
        json.dump({
            "v3_sweep": v3_sweep,
            "v2_vs_v3": {"v2_th35": v2_35, "v3_th35": v3_35}
        }, f, indent=2)
    print("\nSaved evaluation results to ml/experiments/results/v3_threshold_analysis.json")


if __name__ == "__main__":
    main()
