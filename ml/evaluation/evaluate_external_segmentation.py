"""
Final Sealed External Segmentation Evaluation Pipeline
Part 0.14C.4 — Optical Oil-Spill Segmentation Evaluation on Isolated 130-Pair External Benchmark

Rules:
1. Purely frozen evaluation at operating threshold tau = 0.80.
2. Zero model modifications, zero retraining, zero post-hoc tuning.
3. Computes both pixel-level segmentation metrics and image-level detection metrics.
4. Evaluates both V2 (primary) and V1 (baseline comparison) models.
5. Saves visual verification panels to ml/experiments/results/optical_oil_segmentation_v2/external_test/.
"""

import sys
import os
import json
import time
import hashlib
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "services" / "ml-python"))

from app.models.optical_unet_resnet18 import OpticalUNetResNet18
from app.models.optical_unet_resnet18_v2 import OpticalUNetResNet18V2

METADATA_DIR = PROJECT_ROOT / "data" / "raw" / "optical_real" / "metadata" / "segmentation"
EXTERNAL_MANIFEST_PATH = METADATA_DIR / "segmentation_external_test_manifest.json"

MODEL_V1_PATH = PROJECT_ROOT / "services" / "ml-python" / "app" / "models" / "optical_oil_segmentation_v1" / "optical_oil_seg_unet_resnet18_v1.pth"
MODEL_V2_PATH = PROJECT_ROOT / "services" / "ml-python" / "app" / "models" / "optical_oil_segmentation_v2" / "optical_oil_segmentation_v2.pth"

OUTPUT_DIR = PROJECT_ROOT / "ml" / "experiments" / "results" / "optical_oil_segmentation_v2"
EXT_VIS_DIR = OUTPUT_DIR / "external_test"

IMAGE_SIZE = (256, 256)
NORMALIZE_MEAN = [0.485, 0.456, 0.406]
NORMALIZE_STD = [0.229, 0.224, 0.225]
THRESHOLD = 0.80


class ExternalSegmentationDataset(Dataset):
    """Loads isolated external test pairs strictly."""
    def __init__(self, manifest_path: Path):
        with open(manifest_path, "r", encoding="utf-8") as f:
            self.records = json.load(f)

        assert len(self.records) == 130, f"Expected 130 external test pairs, got {len(self.records)}"

        self.items = []
        for r in self.records:
            img_p = PROJECT_ROOT / r["image_path"]
            mask_p = PROJECT_ROOT / r["mask_path"]
            assert img_p.exists(), f"Missing external image: {img_p}"
            assert mask_p.exists(), f"Missing external mask: {mask_p}"

            self.items.append({
                "image_id": r["image_id"],
                "image_path": str(img_p),
                "mask_path": str(mask_p),
                "source_dataset": r["source_dataset"],
                "source_type": r.get("source_type", "OPTICAL_REAL"),
                "is_oil_positive": bool(r["is_oil_positive"]),
                "oil_pixel_count": int(r["oil_pixel_count"]),
                "oil_pixel_fraction": float(r["oil_pixel_fraction"]),
                "width": int(r["width"]),
                "height": int(r["height"]),
                "sha256_image": r.get("sha256_image", "")
            })

    def __len__(self):
        return len(self.items)

    def __getitem__(self, idx):
        item = self.items[idx]

        with Image.open(item["image_path"]) as im:
            im_rgb = im.convert("RGB")

        with Image.open(item["mask_path"]) as m_im:
            if item["source_dataset"] == "MADOS_Sentinel2":
                m_arr = np.array(m_im)
                bin_mask = (m_arr == 6).astype(np.uint8)
            else:
                m_arr = np.array(m_im)
                if m_arr.ndim == 3:
                    bin_mask = ((m_arr[:, :, 0] > 200) & (m_arr[:, :, 1] < 50) & (m_arr[:, :, 2] > 100)).astype(np.uint8)
                else:
                    bin_mask = (m_arr == 1).astype(np.uint8)

        mask_pil = Image.fromarray(bin_mask)

        im_resized = im_rgb.resize(IMAGE_SIZE, Image.Resampling.BILINEAR)
        mask_resized = mask_pil.resize(IMAGE_SIZE, Image.Resampling.NEAREST)

        img_tensor = transforms.ToTensor()(im_resized)
        img_tensor = transforms.Normalize(mean=NORMALIZE_MEAN, std=NORMALIZE_STD)(img_tensor)

        mask_arr = np.array(mask_resized, dtype=np.float32)
        mask_tensor = torch.from_numpy(mask_arr).unsqueeze(0)

        return img_tensor, mask_tensor, item


def compute_pixel_metrics(y_true_binary: np.ndarray, y_pred_binary: np.ndarray) -> Dict[str, Any]:
    """Compute aggregate pixel-level segmentation metrics."""
    tp = int(np.sum((y_true_binary == 1) & (y_pred_binary == 1)))
    fp = int(np.sum((y_true_binary == 0) & (y_pred_binary == 1)))
    tn = int(np.sum((y_true_binary == 0) & (y_pred_binary == 0)))
    fn = int(np.sum((y_true_binary == 1) & (y_pred_binary == 0)))

    fg_iou = float(tp / (tp + fp + fn)) if (tp + fp + fn) > 0 else 1.0 if np.sum(y_true_binary) == 0 else 0.0
    bg_iou = float(tn / (tn + fp + fn)) if (tn + fp + fn) > 0 else 1.0
    mean_iou = float((fg_iou + bg_iou) / 2.0)

    precision = float(tp / (tp + fp)) if (tp + fp) > 0 else 0.0
    recall = float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0
    dice = float((2 * tp) / (2 * tp + fp + fn)) if (2 * tp + fp + fn) > 0 else 1.0 if np.sum(y_true_binary) == 0 else 0.0
    specificity = float(tn / (tn + fp)) if (tn + fp) > 0 else 1.0
    fpr = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0
    pixel_acc = float((tp + tn) / (tp + fp + tn + fn)) if (tp + fp + tn + fn) > 0 else 1.0

    return {
        "mean_iou": mean_iou,
        "foreground_iou": fg_iou,
        "background_iou": bg_iou,
        "dice": dice,
        "precision": precision,
        "recall": recall,
        "specificity": specificity,
        "fpr": fpr,
        "pixel_accuracy": pixel_acc,
        "tp_pixels": tp,
        "fp_pixels": fp,
        "tn_pixels": tn,
        "fn_pixels": fn,
        "total_pixels": int(tp + fp + tn + fn)
    }


def compute_image_level_metrics(y_true_imgs: List[bool], y_pred_imgs: List[bool]) -> Dict[str, Any]:
    """Compute binary classification metrics at whole-image level."""
    tp = sum(1 for yt, yp in zip(y_true_imgs, y_pred_imgs) if yt and yp)
    fp = sum(1 for yt, yp in zip(y_true_imgs, y_pred_imgs) if not yt and yp)
    tn = sum(1 for yt, yp in zip(y_true_imgs, y_pred_imgs) if not yt and not yp)
    fn = sum(1 for yt, yp in zip(y_true_imgs, y_pred_imgs) if yt and not yp)

    acc = (tp + tn) / len(y_true_imgs) if len(y_true_imgs) > 0 else 0.0
    prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2 * prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0
    spec = tn / (tn + fp) if (tn + fp) > 0 else 1.0
    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0

    return {
        "accuracy": float(acc),
        "precision": float(prec),
        "recall": float(rec),
        "f1_score": float(f1),
        "specificity": float(spec),
        "fpr": float(fpr),
        "tp_images": tp,
        "fp_images": fp,
        "tn_images": tn,
        "fn_images": fn,
        "total_images": len(y_true_imgs)
    }


def run_model_inference(model: nn.Module, loader: DataLoader, device: torch.device, threshold: float = 0.80):
    """Executes single-pass inference over external dataset."""
    model.eval()
    all_targets = []
    all_probs = []
    all_items = []

    with torch.no_grad():
        for imgs, masks, items in loader:
            imgs = imgs.to(device)
            try:
                logits = model(imgs, return_aux=False)
            except TypeError:
                logits = model(imgs)
            probs = torch.sigmoid(logits)

            all_probs.append(probs.cpu().numpy())
            all_targets.append(masks.numpy())

            for i in range(len(imgs)):
                all_items.append({
                    "image_id": items["image_id"][i],
                    "image_path": items["image_path"][i],
                    "source_dataset": items["source_dataset"][i],
                    "is_oil_positive": bool(items["is_oil_positive"][i]),
                    "oil_pixel_count": int(items["oil_pixel_count"][i]),
                    "oil_pixel_fraction": float(items["oil_pixel_fraction"][i])
                })

    probs_np = np.concatenate(all_probs, axis=0)     # (N, 1, H, W)
    targets_np = np.concatenate(all_targets, axis=0) # (N, 1, H, W)
    preds_np = (probs_np >= threshold).astype(np.uint8)

    return targets_np, probs_np, preds_np, all_items


def main():
    print("=" * 80, flush=True)
    print("PART 0.14C.4: FINAL SEALED EXTERNAL SEGMENTATION EVALUATION", flush=True)
    print("=" * 80, flush=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using Compute Device: {device} ({torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'})\n", flush=True)

    EXT_VIS_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Dataset & Manifest Verification
    assert EXTERNAL_MANIFEST_PATH.exists(), f"Missing manifest: {EXTERNAL_MANIFEST_PATH}"
    dataset = ExternalSegmentationDataset(EXTERNAL_MANIFEST_PATH)
    loader = DataLoader(dataset, batch_size=16, shuffle=False, num_workers=0)

    oil_pos_cnt = sum(1 for item in dataset.items if item["is_oil_positive"])
    oil_neg_cnt = sum(1 for item in dataset.items if not item["is_oil_positive"])
    print(f"External Dataset Verified -> Total: {len(dataset)}, Oil-Positive: {oil_pos_cnt}, Oil-Negative: {oil_neg_cnt}", flush=True)

    with open(EXTERNAL_MANIFEST_PATH, "rb") as f:
        manifest_hash = hashlib.sha256(f.read()).hexdigest()

    # 2. Checkpoint Integrity Verification
    assert MODEL_V2_PATH.exists(), f"Missing V2 model checkpoint: {MODEL_V2_PATH}"
    with open(MODEL_V2_PATH, "rb") as f:
        v2_sha = hashlib.sha256(f.read()).hexdigest()

    print(f"Loading Frozen V2 Checkpoint: {MODEL_V2_PATH.name}")
    print(f"V2 Checkpoint SHA-256:       {v2_sha}")
    print(f"Operating Threshold:         {THRESHOLD:.2f}\n", flush=True)

    model_v2 = OpticalUNetResNet18V2(pretrained=False, num_classes=1, use_deep_supervision=False).to(device)
    ckpt_v2 = torch.load(MODEL_V2_PATH, map_location=device, weights_only=False)
    model_v2.load_state_dict(ckpt_v2["model_state_dict"])
    model_v2.eval()

    # 3. Load V1 Checkpoint for Baseline Comparison
    model_v1 = None
    v1_sha = "NOT_AVAILABLE"
    if MODEL_V1_PATH.exists():
        with open(MODEL_V1_PATH, "rb") as f:
            v1_sha = hashlib.sha256(f.read()).hexdigest()
        model_v1 = OpticalUNetResNet18(pretrained=False, num_classes=1).to(device)
        ckpt_v1 = torch.load(MODEL_V1_PATH, map_location=device, weights_only=False)
        model_v1.load_state_dict(ckpt_v1["model_state_dict"])
        model_v1.eval()
        print(f"Loaded Frozen V1 Baseline Checkpoint: {MODEL_V1_PATH.name} (SHA-256: {v1_sha})", flush=True)

    # 4. Run Frozen Inference
    print("\nExecuting Single-Pass Inference on External Dataset...", flush=True)
    v2_targets, v2_probs, v2_preds, items = run_model_inference(model_v2, loader, device, threshold=THRESHOLD)
    v1_targets, v1_probs, v1_preds, _ = (None, None, None, None)
    if model_v1 is not None:
        v1_targets, v1_probs, v1_preds, _ = run_model_inference(model_v1, loader, device, threshold=THRESHOLD)

    # 5. Pixel-Level Metrics Calculation
    pixel_metrics_v2 = compute_pixel_metrics(v2_targets, v2_preds)
    pixel_metrics_v1 = compute_pixel_metrics(v1_targets, v1_preds) if model_v1 else None

    # 6. Image-Level Metrics Calculation (Threshold: image positive if >= 10 oil pixels predicted)
    y_true_imgs = [item["is_oil_positive"] for item in items]
    y_pred_imgs_v2 = [bool(np.sum(v2_preds[i, 0]) >= 10) for i in range(len(items))]
    img_metrics_v2 = compute_image_level_metrics(y_true_imgs, y_pred_imgs_v2)

    y_pred_imgs_v1 = [bool(np.sum(v1_preds[i, 0]) >= 10) for i in range(len(items))] if model_v1 else None
    img_metrics_v1 = compute_image_level_metrics(y_true_imgs, y_pred_imgs_v1) if model_v1 else None

    # 7. Source Breakdown (MADOS vs KERF)
    sources = {}
    for idx, item in enumerate(items):
        src = item["source_dataset"]
        if src not in sources:
            sources[src] = []
        sources[src].append(idx)

    source_breakdown = {}
    for src, idxs in sources.items():
        src_true = v2_targets[idxs]
        src_pred = v2_preds[idxs]
        src_true_imgs = [y_true_imgs[i] for i in idxs]
        src_pred_imgs = [y_pred_imgs_v2[i] for i in idxs]

        px_m = compute_pixel_metrics(src_true, src_pred)
        im_m = compute_image_level_metrics(src_true_imgs, src_pred_imgs)
        source_breakdown[src] = {
            "total_samples": len(idxs),
            "oil_positive_samples": sum(1 for i in idxs if items[i]["is_oil_positive"]),
            "oil_negative_samples": sum(1 for i in idxs if not items[i]["is_oil_positive"]),
            "pixel_metrics": px_m,
            "image_level_metrics": im_m
        }

    # If a source has zero samples:
    for expected_src in ["MADOS_Sentinel2", "Kerf_Drone_Oil_Spill"]:
        if expected_src not in source_breakdown:
            source_breakdown[expected_src] = {
                "total_samples": 0,
                "status": "N/A — NO EXTERNAL SAMPLES"
            }

    # 8. Oil-Size Stratification Analysis
    categories = {
        "VERY_SMALL (<0.1%)": (0.0, 0.001),
        "SMALL (0.1%-1%)": (0.001, 0.01),
        "MEDIUM (1%-10%)": (0.01, 0.10),
        "LARGE (10%-50%)": (0.10, 0.50),
        "VERY_LARGE (>50%)": (0.50, 1.0)
    }
    size_breakdown = {}
    for cat_name, (low, high) in categories.items():
        idxs = [i for i, item in enumerate(items) if item["is_oil_positive"] and low <= item["oil_pixel_fraction"] < high]
        if len(idxs) == 0:
            size_breakdown[cat_name] = {
                "sample_count": 0,
                "status": "INSUFFICIENT_SAMPLE_SIZE"
            }
        else:
            cat_true = v2_targets[idxs]
            cat_pred = v2_preds[idxs]
            cat_px = compute_pixel_metrics(cat_true, cat_pred)
            size_breakdown[cat_name] = {
                "sample_count": len(idxs),
                "foreground_iou": cat_px["foreground_iou"],
                "dice": cat_px["dice"],
                "precision": cat_px["precision"],
                "recall": cat_px["recall"]
            }

    # 9. False Positive & False Negative Analysis
    fp_indices = [i for i in range(len(items)) if not y_true_imgs[i] and y_pred_imgs_v2[i]]
    fn_indices = [i for i in range(len(items)) if y_true_imgs[i] and not y_pred_imgs_v2[i]]
    tp_indices = [i for i in range(len(items)) if y_true_imgs[i] and y_pred_imgs_v2[i]]
    tn_indices = [i for i in range(len(items)) if not y_true_imgs[i] and not y_pred_imgs_v2[i]]

    error_analysis = {
        "false_positive_image_count": len(fp_indices),
        "false_negative_image_count": len(fn_indices),
        "true_positive_image_count": len(tp_indices),
        "true_negative_image_count": len(tn_indices),
        "false_positive_pixel_count": pixel_metrics_v2["fp_pixels"],
        "false_positive_rate": pixel_metrics_v2["fpr"],
        "inspected_error_cases": []
    }

    # 10. Generate Visual Diagnostic Panels: [RGB | GroundTruth | V2_Pred | Overlay]
    print(f"\nGenerating visual diagnostic panels in {EXT_VIS_DIR.relative_to(PROJECT_ROOT)}...", flush=True)
    all_predictions_record = []

    # Select representative samples: 10+ positives, 10+ negatives, FP, FN
    selected_vis_idxs = list(set(tp_indices[:12] + tn_indices[:12] + fp_indices + fn_indices))

    for i in range(len(items)):
        item = items[i]
        gt_mask = v2_targets[i, 0]
        prob_map = v2_probs[i, 0]
        pred_mask = v2_preds[i, 0]

        oil_px_pred = int(np.sum(pred_mask == 1))
        oil_px_gt = int(np.sum(gt_mask == 1))

        pred_record = {
            "image_id": item["image_id"],
            "source_dataset": item["source_dataset"],
            "ground_truth_oil_positive": item["is_oil_positive"],
            "ground_truth_oil_pixels": oil_px_gt,
            "predicted_oil_positive": bool(oil_px_pred >= 10),
            "predicted_oil_pixels": oil_px_pred,
            "mean_oil_confidence": float(np.mean(prob_map[pred_mask == 1])) if oil_px_pred > 0 else 0.0
        }
        all_predictions_record.append(pred_record)

        if i in selected_vis_idxs:
            im_p = item["image_path"]
            with Image.open(im_p) as im:
                im_rgb = im.convert("RGB").resize(IMAGE_SIZE, Image.Resampling.BILINEAR)

            gt_vis = Image.fromarray((gt_mask * 255).astype(np.uint8)).convert("RGB")
            pred_vis = Image.fromarray((pred_mask * 255).astype(np.uint8)).convert("RGB")

            overlay_arr = np.array(im_rgb)
            overlay_arr[pred_mask == 1, 0] = np.clip(overlay_arr[pred_mask == 1, 0] * 0.4 + 160, 0, 255).astype(np.uint8)
            overlay_arr[pred_mask == 1, 1] = (overlay_arr[pred_mask == 1, 1] * 0.4).astype(np.uint8)
            overlay_arr[pred_mask == 1, 2] = (overlay_arr[pred_mask == 1, 2] * 0.4).astype(np.uint8)
            overlay_vis = Image.fromarray(overlay_arr)

            w, h = IMAGE_SIZE
            panel = Image.new("RGB", (w * 4, h))
            panel.paste(im_rgb, (0, 0))
            panel.paste(gt_vis, (w, 0))
            panel.paste(pred_vis, (w * 2, 0))
            panel.paste(overlay_vis, (w * 3, 0))

            case_type = "TP" if (item["is_oil_positive"] and oil_px_pred >= 10) else \
                        "TN" if (not item["is_oil_positive"] and oil_px_pred < 10) else \
                        "FP" if (not item["is_oil_positive"] and oil_px_pred >= 10) else "FN"

            out_fname = f"ext_{case_type.lower()}_{item['source_dataset'][:4].lower()}_{item['image_id']}.jpg"
            panel.save(EXT_VIS_DIR / out_fname, quality=90)

    # 11. Save JSON Artifacts
    with open(OUTPUT_DIR / "external_predictions.json", "w") as f:
        json.dump(all_predictions_record, f, indent=2)

    with open(OUTPUT_DIR / "external_metrics.json", "w") as f:
        json.dump(pixel_metrics_v2, f, indent=2)

    with open(OUTPUT_DIR / "external_image_level_metrics.json", "w") as f:
        json.dump(img_metrics_v2, f, indent=2)

    with open(OUTPUT_DIR / "external_source_breakdown.json", "w") as f:
        json.dump(source_breakdown, f, indent=2)

    with open(OUTPUT_DIR / "external_size_breakdown.json", "w") as f:
        json.dump(size_breakdown, f, indent=2)

    with open(OUTPUT_DIR / "external_confusion_matrix.json", "w") as f:
        json.dump({
            "pixel_level": {
                "tp": pixel_metrics_v2["tp_pixels"],
                "fp": pixel_metrics_v2["fp_pixels"],
                "tn": pixel_metrics_v2["tn_pixels"],
                "fn": pixel_metrics_v2["fn_pixels"]
            },
            "image_level": {
                "tp": img_metrics_v2["tp_images"],
                "fp": img_metrics_v2["fp_images"],
                "tn": img_metrics_v2["tn_images"],
                "fn": img_metrics_v2["fn_images"]
            }
        }, f, indent=2)

    with open(OUTPUT_DIR / "external_error_analysis.json", "w") as f:
        json.dump(error_analysis, f, indent=2)

    with open(OUTPUT_DIR / "external_evaluation_manifest_hash.json", "w") as f:
        json.dump({
            "manifest": "segmentation_external_test_manifest.json",
            "sha256": manifest_hash,
            "evaluated_pairs": len(dataset),
            "v2_checkpoint_sha256": v2_sha,
            "v1_checkpoint_sha256": v1_sha,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }, f, indent=2)

    # Comparison summary table
    print("\n" + "=" * 80, flush=True)
    print("FINAL SEALED EXTERNAL SEGMENTATION EVALUATION RESULTS", flush=True)
    print("=" * 80, flush=True)
    print(f"Model ID:              optical-oil-seg-unet-resnet18-v2", flush=True)
    print(f"Checkpoint SHA-256:    {v2_sha}", flush=True)
    print(f"Operating Threshold:   {THRESHOLD:.2f}", flush=True)
    print(f"External Total Pairs:  {len(dataset)} (Oil+: {oil_pos_cnt}, Oil-: {oil_neg_cnt})", flush=True)
    print("-" * 80, flush=True)
    print("PIXEL-LEVEL SEGMENTATION RESULTS (EXTERNAL TEST):", flush=True)
    print(f"  Mean IoU:            {pixel_metrics_v2['mean_iou']:.4f}", flush=True)
    print(f"  Foreground IoU:      {pixel_metrics_v2['foreground_iou']:.4f}", flush=True)
    print(f"  Background IoU:      {pixel_metrics_v2['background_iou']:.4f}", flush=True)
    print(f"  Dice Score (F1):     {pixel_metrics_v2['dice']:.4f}", flush=True)
    print(f"  Precision:           {pixel_metrics_v2['precision']:.4f}", flush=True)
    print(f"  Recall:              {pixel_metrics_v2['recall']:.4f}", flush=True)
    print(f"  Specificity:         {pixel_metrics_v2['specificity']:.4f}", flush=True)
    print(f"  FPR:                 {pixel_metrics_v2['fpr']:.4f}", flush=True)
    print("-" * 80, flush=True)
    print("IMAGE-LEVEL DETECTION RESULTS (EXTERNAL TEST):", flush=True)
    print(f"  Accuracy:            {img_metrics_v2['accuracy']:.4f} ({img_metrics_v2['tp_images'] + img_metrics_v2['tn_images']}/{img_metrics_v2['total_images']})", flush=True)
    print(f"  Precision:           {img_metrics_v2['precision']:.4f}", flush=True)
    print(f"  Recall:              {img_metrics_v2['recall']:.4f} ({img_metrics_v2['tp_images']}/{img_metrics_v2['tp_images'] + img_metrics_v2['fn_images']})", flush=True)
    print(f"  F1-Score:            {img_metrics_v2['f1_score']:.4f}", flush=True)
    print(f"  Specificity:         {img_metrics_v2['specificity']:.4f} ({img_metrics_v2['tn_images']}/{img_metrics_v2['tn_images'] + img_metrics_v2['fp_images']})", flush=True)
    print(f"  FPR:                 {img_metrics_v2['fpr']:.4f}", flush=True)
    print("-" * 80, flush=True)
    print("SOURCE-SPECIFIC BREAKDOWN (EXTERNAL TEST):", flush=True)
    for src, s in source_breakdown.items():
        if s.get("status"):
            print(f"  [{src}]: {s['status']}", flush=True)
        else:
            px = s["pixel_metrics"]
            im = s["image_level_metrics"]
            print(f"  [{src}] (N={s['total_samples']}, Oil+={s['oil_positive_samples']}, Oil-={s['oil_negative_samples']}):", flush=True)
            print(f"    Pixel-Level -> Mean IoU: {px['mean_iou']:.4f}, Fg-IoU: {px['foreground_iou']:.4f}, Dice: {px['dice']:.4f}, Prec: {px['precision']:.4f}, Rec: {px['recall']:.4f}, FPR: {px['fpr']:.4f}", flush=True)
            print(f"    Image-Level -> Acc: {im['accuracy']:.4f}, Prec: {im['precision']:.4f}, Rec: {im['recall']:.4f}, F1: {im['f1_score']:.4f}, FPR: {im['fpr']:.4f}", flush=True)
    print("-" * 80, flush=True)
    print("OIL-SIZE STRATIFICATION (EXTERNAL TEST):", flush=True)
    for sz, s in size_breakdown.items():
        if s.get("status") == "INSUFFICIENT_SAMPLE_SIZE":
            print(f"  [{sz}]: N={s['sample_count']} -> INSUFFICIENT_SAMPLE_SIZE", flush=True)
        else:
            print(f"  [{sz}]: N={s['sample_count']} -> Fg-IoU: {s['foreground_iou']:.4f}, Dice: {s['dice']:.4f}, Prec: {s['precision']:.4f}, Rec: {s['recall']:.4f}", flush=True)
    print("-" * 80, flush=True)
    if model_v1 is not None:
        print("V1 vs V2 EXTERNAL COMPARISON:", flush=True)
        print(f"  Pixel Dice:      V1 = {pixel_metrics_v1['dice']:.4f}  vs  V2 = {pixel_metrics_v2['dice']:.4f} (Delta: {pixel_metrics_v2['dice'] - pixel_metrics_v1['dice']:+.4f})", flush=True)
        print(f"  Pixel Fg-IoU:    V1 = {pixel_metrics_v1['foreground_iou']:.4f}  vs  V2 = {pixel_metrics_v2['foreground_iou']:.4f} (Delta: {pixel_metrics_v2['foreground_iou'] - pixel_metrics_v1['foreground_iou']:+.4f})", flush=True)
        print(f"  Pixel Precision: V1 = {pixel_metrics_v1['precision']:.4f}  vs  V2 = {pixel_metrics_v2['precision']:.4f} (Delta: {pixel_metrics_v2['precision'] - pixel_metrics_v1['precision']:+.4f})", flush=True)
        print(f"  Pixel Recall:    V1 = {pixel_metrics_v1['recall']:.4f}  vs  V2 = {pixel_metrics_v2['recall']:.4f} (Delta: {pixel_metrics_v2['recall'] - pixel_metrics_v1['recall']:+.4f})", flush=True)
        print(f"  Image Accuracy:  V1 = {img_metrics_v1['accuracy']:.4f}  vs  V2 = {img_metrics_v2['accuracy']:.4f} (Delta: {img_metrics_v2['accuracy'] - img_metrics_v1['accuracy']:+.4f})", flush=True)
    print("=" * 80, flush=True)
    print("Final Sealed External Evaluation Complete.", flush=True)


if __name__ == "__main__":
    main()
