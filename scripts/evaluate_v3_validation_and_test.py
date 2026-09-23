"""
Script: evaluate_v3_validation_and_test.py
Forensic & Scientific Validation Threshold Sweep and Test Evaluation for V2 vs V3
"""

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


def evaluate_scenes(model, scenes, thresholds):
    """
    Evaluate a model on a set of scenes across multiple thresholds.
    """
    # First, generate continuous probability maps for all scenes
    scene_prob_maps = []
    for s in scenes:
        img_path = s["image_path"]
        mask_path = s["mask_path"]
        
        raster_tensor, meta = load_sar_raster(img_path, polarization="VV+VH")
        tiles, coords = generate_tiles(raster_tensor, tile_size=512, stride=512)
        
        tile_preds = []
        with torch.no_grad():
            for t in tiles:
                t_tensor = torch.from_numpy(t).unsqueeze(0).float()
                probs = model.predict_probabilities(t_tensor)
                # Channel 1 is oil spill probability
                tile_preds.append(probs[0, 1].cpu().numpy())
                
        full_prob = reconstruct_full_mask(tile_preds, coords, meta["height"], meta["width"], 512)
        
        gt_mask = np.zeros((meta["height"], meta["width"]), dtype=np.uint8)
        if mask_path and os.path.exists(mask_path):
            with rasterio.open(mask_path) as msrc:
                gt_mask = (msrc.read(1) > 0).astype(np.uint8)
                
        scene_prob_maps.append({
            "scene_id": s["scene_id"],
            "category": s.get("category", "unknown"),
            "full_prob": full_prob,
            "gt_mask": gt_mask,
            "height": meta["height"],
            "width": meta["width"]
        })
        
    threshold_metrics = []
    for th in thresholds:
        tp_tot = 0
        fp_tot = 0
        fn_tot = 0
        tn_tot = 0
        
        cat_stats = {}
        
        for sp in scene_prob_maps:
            cat = sp["category"]
            if cat not in cat_stats:
                cat_stats[cat] = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}
                
            pred_bin = (sp["full_prob"] >= th).astype(np.uint8)
            gt = sp["gt_mask"]
            
            tp = int(np.sum((pred_bin == 1) & (gt == 1)))
            fp = int(np.sum((pred_bin == 1) & (gt == 0)))
            fn = int(np.sum((pred_bin == 0) & (gt == 1)))
            tn = int(np.sum((pred_bin == 0) & (gt == 0)))
            
            tp_tot += tp
            fp_tot += fp
            fn_tot += fn
            tn_tot += tn
            
            cat_stats[cat]["tp"] += tp
            cat_stats[cat]["fp"] += fp
            cat_stats[cat]["fn"] += fn
            cat_stats[cat]["tn"] += tn
            
        total_pixels = tp_tot + fp_tot + fn_tot + tn_tot
        iou = tp_tot / (tp_tot + fp_tot + fn_tot + 1e-10) * 100
        dice = 2 * tp_tot / (2 * tp_tot + fp_tot + fn_tot + 1e-10) * 100
        precision = tp_tot / (tp_tot + fp_tot + 1e-10) * 100
        recall = tp_tot / (tp_tot + fn_tot + 1e-10) * 100
        fpr = fp_tot / (fp_tot + tn_tot + 1e-10) * 100
        pred_pos_pct = (tp_tot + fp_tot) / (total_pixels + 1e-10) * 100
        pred_area_km2 = (tp_tot + fp_tot) * 0.0001 # 10m x 10m = 100m2 = 0.0001 km2
        
        # Per category metrics
        per_cat = {}
        for cat, cs in cat_stats.items():
            c_tp, c_fp, c_fn, c_tn = cs["tp"], cs["fp"], cs["fn"], cs["tn"]
            c_iou = c_tp / (c_tp + c_fp + c_fn + 1e-10) * 100
            c_dice = 2 * c_tp / (2 * c_tp + c_fp + c_fn + 1e-10) * 100
            c_prec = c_tp / (c_tp + c_fp + 1e-10) * 100
            c_rec = c_tp / (c_tp + c_fn + 1e-10) * 100
            c_fpr = c_fp / (c_fp + c_tn + 1e-10) * 100
            per_cat[cat] = {
                "tp": c_tp, "fp": c_fp, "fn": c_fn, "tn": c_tn,
                "iou": c_iou, "dice": c_dice, "precision": c_prec, "recall": c_rec, "fpr": c_fpr
            }
            
        threshold_metrics.append({
            "threshold": float(th),
            "tp": tp_tot,
            "fp": fp_tot,
            "fn": fn_tot,
            "tn": tn_tot,
            "total_pixels": total_pixels,
            "iou": float(iou),
            "dice": float(dice),
            "precision": float(precision),
            "recall": float(recall),
            "fpr": float(fpr),
            "pred_pos_pct": float(pred_pos_pct),
            "pred_area_km2": float(pred_area_km2),
            "by_category": per_cat
        })
        
    return threshold_metrics, scene_prob_maps


def main():
    print("=" * 80)
    print("PHASE: V2 VS V3 FORENSIC MODEL EVALUATION & THRESHOLD AUDIT")
    print("=" * 80)
    
    with open("data/raw/satellite/dataset_manifest.json", "r") as f:
        manifest = json.load(f)
        
    scenes = manifest["scenes"]
    train_scenes = [s for s in scenes if s.get("split") == "train"]
    val_scenes = [s for s in scenes if s.get("split") == "val"]
    test_scenes = [s for s in scenes if s.get("split") == "test"]
    
    lookalike_scenes = [s for s in scenes if s.get("category") == "lookalike"]
    no_oil_scenes = [s for s in scenes if s.get("category") == "no_oil"]
    oil_scenes = [s for s in scenes if s.get("category") == "oil_spill"]
    
    print(f"Dataset summary:")
    print(f"  Train: {len(train_scenes)} scenes")
    print(f"  Val:   {len(val_scenes)} scenes")
    print(f"  Test:  {len(test_scenes)} scenes")
    print(f"  Total: {len(scenes)} scenes")
    
    thresholds = [0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50]
    
    # 1. Load V2 Model
    print("\n[1] Loading unet-dual-pol-sar-v2...")
    model_v2, _ = model_registry.load_model("unet-dual-pol-sar-v2", device="cpu", allow_untrained=False)
    model_v2.eval()
    
    # 2. Load V3 Model
    print("\n[2] Loading unet-dual-pol-sar-v3...")
    model_v3, _ = model_registry.load_model("unet-dual-pol-sar-v3", device="cpu", allow_untrained=False)
    model_v3.eval()
    
    # 3. Validation Threshold Sweep on V3
    print("\n[3] Running validation threshold sweep for V3 on validation set (7 scenes)...")
    val_sweep_v3, _ = evaluate_scenes(model_v3, val_scenes, thresholds)
    
    print("\n--- V3 Validation Threshold Sweep Table ---")
    print(f"{'Thresh':<8} | {'IoU (%)':<9} | {'Dice (%)':<10} | {'Prec (%)':<10} | {'Recall (%)':<11} | {'FPR (%)':<9} | {'Pred Area (km2)':<15}")
    print("-" * 85)
    for r in val_sweep_v3:
        print(f"{r['threshold']:<8.2f} | {r['iou']:<9.4f} | {r['dice']:<10.4f} | {r['precision']:<10.4f} | {r['recall']:<11.4f} | {r['fpr']:<9.4f} | {r['pred_area_km2']:<15.4f}")
        
    # Pick optimal threshold from validation set (e.g. max Dice or max IoU; if all 0, default to standard baseline 0.35)
    best_val_entry = max(val_sweep_v3, key=lambda x: (x["dice"], x["iou"], -x["fpr"]))
    selected_threshold = best_val_entry["threshold"]
    if best_val_entry["dice"] == 0:
        # Fallback to 0.35 if all validation dice are 0
        selected_threshold = 0.35
        print(f"\nValidation metrics produced 0 Dice across sweep. Operational threshold selected: {selected_threshold:.2f}")
    else:
        print(f"\nOptimal threshold selected from validation data: {selected_threshold:.2f} (Val Dice: {best_val_entry['dice']:.4f}%)")
        
    # 4. Held-out Test Evaluation on V3
    print(f"\n[4] Evaluating V3 on held-out test set (5 scenes) at selected threshold {selected_threshold} and baseline 0.35...")
    test_sweep_v3, v3_test_maps = evaluate_scenes(model_v3, test_scenes, [0.35, selected_threshold])
    v3_test_metrics_th35 = next(r for r in test_sweep_v3 if r["threshold"] == 0.35)
    v3_test_metrics_selected = next(r for r in test_sweep_v3 if r["threshold"] == selected_threshold)
    
    # 5. Held-out Test Evaluation on V2
    print("\n[5] Evaluating V2 on held-out test set (5 scenes) at baseline threshold 0.35...")
    test_sweep_v2, v2_test_maps = evaluate_scenes(model_v2, test_scenes, [0.35])
    v2_test_metrics_th35 = test_sweep_v2[0]
    
    # 6. Look-alike challenge evaluation on Look-alike scenes
    print("\n[6] Evaluating Look-alike FPR on Look-alike scenes (10 scenes)...")
    la_sweep_v2, _ = evaluate_scenes(model_v2, lookalike_scenes, [0.35])
    la_sweep_v3, _ = evaluate_scenes(model_v3, lookalike_scenes, [0.35, selected_threshold])
    
    v2_la_fpr = la_sweep_v2[0]["fpr"]
    v3_la_fpr_35 = next(r for r in la_sweep_v3 if r["threshold"] == 0.35)["fpr"]
    v3_la_fpr_sel = next(r for r in la_sweep_v3 if r["threshold"] == selected_threshold)["fpr"]
    
    # 7. No-oil clean ocean evaluation on No-oil scenes
    print("\n[7] Evaluating No-oil scenes (10 scenes)...")
    no_oil_sweep_v2, _ = evaluate_scenes(model_v2, no_oil_scenes, [0.35])
    no_oil_sweep_v3, _ = evaluate_scenes(model_v3, no_oil_scenes, [0.35, selected_threshold])
    
    v2_no_oil_fpr = no_oil_sweep_v2[0]["fpr"]
    v3_no_oil_fpr_35 = next(r for r in no_oil_sweep_v3 if r["threshold"] == 0.35)["fpr"]
    v3_no_oil_fpr_sel = next(r for r in no_oil_sweep_v3 if r["threshold"] == selected_threshold)["fpr"]

    print("\n" + "=" * 80)
    print("V2 VS V3 HEAD-TO-HEAD COMPARISON TABLE")
    print("=" * 80)
    print(f"{'Metric':<30} | {'V2 Baseline (@ 0.35)':<22} | {'V3 (@ Selected ' + str(selected_threshold) + ')':<25}")
    print("-" * 80)
    print(f"{'IoU (%)':<30} | {v2_test_metrics_th35['iou']:<22.4f} | {v3_test_metrics_selected['iou']:<25.4f}")
    print(f"{'Dice / F1 (%)':<30} | {v2_test_metrics_th35['dice']:<22.4f} | {v3_test_metrics_selected['dice']:<25.4f}")
    print(f"{'Precision (%)':<30} | {v2_test_metrics_th35['precision']:<22.4f} | {v3_test_metrics_selected['precision']:<25.4f}")
    print(f"{'Recall (%)':<30} | {v2_test_metrics_th35['recall']:<22.4f} | {v3_test_metrics_selected['recall']:<25.4f}")
    print(f"{'Overall Test FPR (%)':<30} | {v2_test_metrics_th35['fpr']:<22.4f} | {v3_test_metrics_selected['fpr']:<25.4f}")
    print(f"{'Look-alike Scene FPR (%)':<30} | {v2_la_fpr:<22.4f} | {v3_la_fpr_sel:<25.4f}")
    print(f"{'Clean Ocean FPR (%)':<30} | {v2_no_oil_fpr:<22.4f} | {v3_no_oil_fpr_sel:<25.4f}")
    print(f"{'Test True Positives (TP)':<30} | {v2_test_metrics_th35['tp']:<22,d} | {v3_test_metrics_selected['tp']:<25,d}")
    print(f"{'Test False Positives (FP)':<30} | {v2_test_metrics_th35['fp']:<22,d} | {v3_test_metrics_selected['fp']:<25,d}")
    print(f"{'Test False Negatives (FN)':<30} | {v2_test_metrics_th35['fn']:<22,d} | {v3_test_metrics_selected['fn']:<25,d}")
    print(f"{'Test True Negatives (TN)':<30} | {v2_test_metrics_th35['tn']:<22,d} | {v3_test_metrics_selected['tn']:<25,d}")
    
    # Save Artifacts
    os.makedirs("docs/artifacts", exist_ok=True)
    os.makedirs("docs/model", exist_ok=True)
    
    sweep_artifact = {
        "model_id": "unet-dual-pol-sar-v3",
        "validation_scenes_count": len(val_scenes),
        "validation_sweep": val_sweep_v3,
        "selected_threshold": selected_threshold,
        "selection_rationale": "Selected based on validation split optimization (Dice/IoU vs FPR trade-off)."
    }
    with open("docs/artifacts/v3-threshold-sweep.json", "w") as f:
        json.dump(sweep_artifact, f, indent=2)
    print("\nSaved docs/artifacts/v3-threshold-sweep.json")
    
    metrics_artifact = {
        "evaluation_timestamp": "2026-09-13T23:35:00Z",
        "v2_baseline": {
            "model_id": "unet-dual-pol-sar-v2",
            "threshold": 0.35,
            "test_metrics": v2_test_metrics_th35,
            "lookalike_fpr": v2_la_fpr,
            "clean_ocean_fpr": v2_no_oil_fpr
        },
        "v3_evaluated": {
            "model_id": "unet-dual-pol-sar-v3",
            "threshold": selected_threshold,
            "test_metrics": v3_test_metrics_selected,
            "lookalike_fpr": v3_la_fpr_sel,
            "clean_ocean_fpr": v3_no_oil_fpr_sel
        }
    }
    with open("docs/artifacts/v2-vs-v3-metrics.json", "w") as f:
        json.dump(metrics_artifact, f, indent=2)
    print("Saved docs/artifacts/v2-vs-v3-metrics.json")


if __name__ == "__main__":
    main()
