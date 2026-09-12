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


def evaluate_model_on_test(model_id: str, threshold: float = 0.5):
    model, entry = model_registry.load_model(model_id=model_id, device="cpu", allow_untrained=False)
    model.eval()

    with open("data/raw/satellite/dataset_manifest.json", "r") as f:
        manifest = json.load(f)

    test_scenes = [s for s in manifest["scenes"] if s.get("split") == "test"]
    la_scenes = [s for s in manifest["scenes"] if s.get("category") == "lookalike"]

    tp_tot = 0
    fp_tot = 0
    fn_tot = 0
    tn_tot = 0
    la_fp_tot = 0
    la_tn_tot = 0

    # 1. Test set
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
        pred_bin = (full_prob >= threshold).astype(np.uint8)

        with rasterio.open(s["mask_path"]) as msrc:
            gt_mask = (msrc.read(1) > 0).astype(np.uint8)

        tp_tot += int(np.sum((pred_bin == 1) & (gt_mask == 1)))
        fp_tot += int(np.sum((pred_bin == 1) & (gt_mask == 0)))
        fn_tot += int(np.sum((pred_bin == 0) & (gt_mask == 1)))
        tn_tot += int(np.sum((pred_bin == 0) & (gt_mask == 0)))

    # 2. Lookalikes
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
        pred_bin = (full_prob >= threshold).astype(np.uint8)

        la_fp_tot += int(np.sum(pred_bin == 1))
        la_tn_tot += int(np.sum(pred_bin == 0))

    tot_pixels = tp_tot + fp_tot + fn_tot + tn_tot
    iou = tp_tot / (tp_tot + fp_tot + fn_tot + 1e-10) * 100
    dice = 2 * tp_tot / (2 * tp_tot + fp_tot + fn_tot + 1e-10) * 100
    prec = tp_tot / (tp_tot + fp_tot + 1e-10) * 100
    rec = tp_tot / (tp_tot + fn_tot + 1e-10) * 100
    fpr = fp_tot / (fp_tot + tn_tot + 1e-10) * 100
    la_fpr = la_fp_tot / (la_fp_tot + la_tn_tot + 1e-10) * 100
    pred_pct = (tp_tot + fp_tot) / (tot_pixels + 1e-10) * 100

    return {
        "model_id": model_id,
        "threshold": threshold,
        "iou": iou,
        "dice": dice,
        "precision": prec,
        "recall": rec,
        "fpr": fpr,
        "lookalike_fpr": la_fpr,
        "pred_pos_pct": pred_pct,
        "tp": tp_tot,
        "fp": fp_tot,
        "fn": fn_tot,
        "tn": tn_tot
    }


def main():
    print("=" * 80)
    print("HEAD-TO-HEAD COMPARISON: MODEL V1 vs MODEL V2 ON IDENTICAL HELD-OUT SCENES")
    print("=" * 80)

    # Evaluate V1 at th=0.50 and th=0.35
    v1_50 = evaluate_model_on_test("unet-dual-pol-sar-v1", threshold=0.50)
    v1_35 = evaluate_model_on_test("unet-dual-pol-sar-v1", threshold=0.35)

    # Evaluate V2 at th=0.50 and th=0.35
    v2_50 = evaluate_model_on_test("unet-dual-pol-sar-v2", threshold=0.50)
    v2_35 = evaluate_model_on_test("unet-dual-pol-sar-v2", threshold=0.35)

    print("\n--- Summary Comparison Table (Threshold = 0.50 Default) ---")
    print(f"{'Metric':<25} | {'Model V1 (Baseline)':<20} | {'Model V2 (Improved)':<20}")
    print("-" * 72)
    print(f"{'Loss Formulation':<25} | {'Weighted CE + Dice':<20} | {'Focal + Soft-Dice':<20}")
    print(f"{'Sampling Strategy':<25} | {'Uniform Random (93% 0s)':<20} | {'Positive Balanced':<20}")
    print(f"{'Data Augmentation':<25} | {'None':<20} | {'Rotations + Flips':<20}")
    print(f"{'Test Dice (%)':<25} | {v1_50['dice']:<20.4f} | {v2_50['dice']:<20.4f}")
    print(f"{'Test IoU (%)':<25} | {v1_50['iou']:<20.4f} | {v2_50['iou']:<20.4f}")
    print(f"{'Test Precision (%)':<25} | {v1_50['precision']:<20.4f} | {v2_50['precision']:<20.4f}")
    print(f"{'Test Recall (%)':<25} | {v1_50['recall']:<20.4f} | {v2_50['recall']:<20.4f}")
    print(f"{'Look-Alike FPR (%)':<25} | {v1_50['lookalike_fpr']:<20.4f} | {v2_50['lookalike_fpr']:<20.4f}")
    print(f"{'Predicted Positive %':<25} | {v1_50['pred_pos_pct']:<20.4f} | {v2_50['pred_pos_pct']:<20.4f}")

    print("\n--- Summary Comparison Table (Calibrated Threshold = 0.35) ---")
    print(f"{'Metric':<25} | {'Model V1 (th=0.35)':<20} | {'Model V2 (th=0.35)':<20}")
    print("-" * 72)
    print(f"{'Test Dice (%)':<25} | {v1_35['dice']:<20.4f} | {v2_35['dice']:<20.4f}")
    print(f"{'Test IoU (%)':<25} | {v1_35['iou']:<20.4f} | {v2_35['iou']:<20.4f}")
    print(f"{'Test Precision (%)':<25} | {v1_35['precision']:<20.4f} | {v2_35['precision']:<20.4f}")
    print(f"{'Test Recall (%)':<25} | {v1_35['recall']:<20.4f} | {v2_35['recall']:<20.4f}")
    print(f"{'Look-Alike FPR (%)':<25} | {v1_35['lookalike_fpr']:<20.4f} | {v2_35['lookalike_fpr']:<20.4f}")
    print(f"{'Predicted Positive %':<25} | {v1_35['pred_pos_pct']:<20.4f} | {v2_35['pred_pos_pct']:<20.4f}")
    print(f"{'True Positives (TP)':<25} | {v1_35['tp']:<20,} | {v2_35['tp']:<20,}")
    print(f"{'False Positives (FP)':<25} | {v1_35['fp']:<20,} | {v2_35['fp']:<20,}")
    print(f"{'False Negatives (FN)':<25} | {v1_35['fn']:<20,} | {v2_35['fn']:<20,}")

    out_summary = {
        "v1_50": v1_50, "v1_35": v1_35,
        "v2_50": v2_50, "v2_35": v2_35
    }
    with open("ml/experiments/results/v1_vs_v2_comparison.json", "w") as f:
        json.dump(out_summary, f, indent=2)
    print("\nSaved comparison data to ml/experiments/results/v1_vs_v2_comparison.json")


if __name__ == "__main__":
    main()
