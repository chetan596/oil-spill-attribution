"""
Optical Oil-Spill Segmentation Model Training & Internal Validation Pipeline
Part 0.14C.2 — Real Optical Oil-Spill Segmentation Model (High Performance)

Trains ResNet-18 U-Net on verified optical ground-truth dataset (MADOS & KERF).
Evaluates threshold optimization on Validation only, followed by single-pass locked Internal Test evaluation.
"""

import os
import sys
import json
import time
import random
import hashlib
from pathlib import Path
from typing import Dict, Any, Tuple, List

import numpy as np
from PIL import Image
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms

# Project paths
PROJECT_ROOT = Path("d:/PROJECTS/Collge Project/oil-spill-attribution")
sys.path.insert(0, str(PROJECT_ROOT / "services" / "ml-python"))

from app.models.optical_unet_resnet18 import OpticalUNetResNet18

METADATA_DIR = PROJECT_ROOT / "data" / "raw" / "optical_real" / "metadata" / "segmentation"
MODEL_SAVE_DIR = PROJECT_ROOT / "services" / "ml-python" / "app" / "models" / "optical_oil_segmentation_v1"
RESULTS_DIR = PROJECT_ROOT / "ml" / "experiments" / "results" / "optical_oil_segmentation_v1"
REGISTRY_PATH = PROJECT_ROOT / "ml" / "experiments" / "results" / "model_registry_audit.json"

MODEL_SAVE_DIR.mkdir(parents=True, exist_ok=True)
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

SEED = 42
random.seed(SEED)
np.random.seed(SEED)
torch.manual_seed(SEED)
if torch.cuda.is_available():
    torch.cuda.manual_seed_all(SEED)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False

IMAGE_SIZE = (256, 256)
NORMALIZE_MEAN = [0.485, 0.456, 0.406]
NORMALIZE_STD = [0.229, 0.224, 0.225]


class FastOpticalSegmentationDataset(Dataset):
    def __init__(self, manifest_path: Path, is_train: bool = False, expected_split: str = "TRAIN"):
        assert manifest_path.exists(), f"Manifest not found: {manifest_path}"
        with open(manifest_path, "r", encoding="utf-8") as f:
            self.records = json.load(f)

        self.is_train = is_train
        self.expected_split = expected_split
        self.items = []

        for r in self.records:
            assert r.get("split") == expected_split, f"Split mismatch: expected {expected_split}, got {r.get('split')}"
            img_p = PROJECT_ROOT / r["image_path"]
            mask_p = PROJECT_ROOT / r["mask_path"]
            assert img_p.exists(), f"Image missing: {img_p}"
            assert mask_p.exists(), f"Mask missing: {mask_p}"

            self.items.append({
                "image_id": r["image_id"],
                "image_path": str(img_p),
                "mask_path": str(mask_p),
                "source_dataset": r["source_dataset"],
                "source_type": r.get("source_type", "OPTICAL"),
                "scene_id": r.get("scene_id", "UNKNOWN"),
                "event_id": r.get("event_id", "UNKNOWN"),
                "is_oil_positive": r["is_oil_positive"],
                "oil_pixel_fraction": r["oil_pixel_fraction"],
                "width": r["width"],
                "height": r["height"]
            })

    def __len__(self):
        return len(self.items)

    def __getitem__(self, idx):
        item = self.items[idx]
        
        # 1. Load image
        with Image.open(item["image_path"]) as im:
            im_rgb = im.convert("RGB")
            
        # 2. Fast load mask with PIL
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

        # 3. Resize
        im_resized = im_rgb.resize(IMAGE_SIZE, Image.Resampling.BILINEAR)
        mask_resized = mask_pil.resize(IMAGE_SIZE, Image.Resampling.NEAREST)

        # 4. Augmentation (train only)
        if self.is_train:
            if random.random() > 0.5:
                im_resized = im_resized.transpose(Image.FLIP_LEFT_RIGHT)
                mask_resized = mask_resized.transpose(Image.FLIP_LEFT_RIGHT)
            if random.random() > 0.5:
                im_resized = im_resized.transpose(Image.FLIP_TOP_BOTTOM)
                mask_resized = mask_resized.transpose(Image.FLIP_TOP_BOTTOM)
            if random.random() > 0.5:
                angle = random.choice([90, 180, 270])
                im_resized = im_resized.rotate(angle, resample=Image.Resampling.BILINEAR)
                mask_resized = mask_resized.rotate(angle, resample=Image.Resampling.NEAREST)

        # Convert to tensors
        img_tensor = transforms.ToTensor()(im_resized)
        img_tensor = transforms.Normalize(mean=NORMALIZE_MEAN, std=NORMALIZE_STD)(img_tensor)
        
        mask_arr = np.array(mask_resized, dtype=np.float32)
        mask_tensor = torch.from_numpy(mask_arr).unsqueeze(0) # (1, H, W)

        return img_tensor, mask_tensor, item


class SoftDiceLoss(nn.Module):
    def __init__(self, smooth: float = 1.0):
        super().__init__()
        self.smooth = smooth

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        probs = torch.sigmoid(logits)
        probs_flat = probs.view(-1)
        targets_flat = targets.view(-1)

        intersection = (probs_flat * targets_flat).sum()
        dice = (2.0 * intersection + self.smooth) / (probs_flat.sum() + targets_flat.sum() + self.smooth)
        return 1.0 - dice


class CombinedBCEDiceLoss(nn.Module):
    def __init__(self, bce_weight: float = 0.5, dice_weight: float = 0.5, pos_weight: float = 2.0):
        super().__init__()
        self.bce_weight = bce_weight
        self.dice_weight = dice_weight
        self.bce = nn.BCEWithLogitsLoss(pos_weight=torch.tensor([pos_weight]))
        self.dice = SoftDiceLoss()

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        bce_loss = self.bce(logits, targets)
        dice_loss = self.dice(logits, targets)
        return self.bce_weight * bce_loss + self.dice_weight * dice_loss


def compute_segmentation_metrics(y_true_binary: np.ndarray, y_pred_binary: np.ndarray) -> Dict[str, float]:
    """Compute standard pixel-level segmentation metrics."""
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
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn
    }


def evaluate_dataset(model, loader, device, threshold: float = 0.50):
    model.eval()
    all_true = []
    all_probs = []
    all_items = []

    with torch.no_grad():
        for imgs, masks, items in loader:
            imgs = imgs.to(device)
            logits = model(imgs)
            probs = torch.sigmoid(logits).cpu().numpy()
            masks_np = masks.numpy()

            all_probs.append(probs)
            all_true.append(masks_np)
            batch_len = len(masks)
            for i in range(batch_len):
                all_items.append({k: items[k][i] for k in items})

    y_probs = np.concatenate(all_probs, axis=0) # (N, 1, H, W)
    y_true = np.concatenate(all_true, axis=0)   # (N, 1, H, W)
    y_pred = (y_probs >= threshold).astype(np.uint8)

    global_metrics = compute_segmentation_metrics(y_true, y_pred)
    return global_metrics, y_true, y_probs, all_items


def optimize_threshold_on_val(model, val_loader, device) -> Tuple[float, List[Dict[str, Any]]]:
    """Evaluates candidate thresholds on VALIDATION only to select operating threshold."""
    print("\n--- Optimizing Operating Threshold on VALIDATION ONLY ---", flush=True)
    candidate_thresholds = [0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80]
    
    model.eval()
    all_true, all_probs = [], []
    with torch.no_grad():
        for imgs, masks, _ in val_loader:
            imgs = imgs.to(device)
            logits = model(imgs)
            probs = torch.sigmoid(logits).cpu().numpy()
            all_probs.append(probs)
            all_true.append(masks.numpy())

    y_probs = np.concatenate(all_probs, axis=0)
    y_true = np.concatenate(all_true, axis=0)

    results = []
    for t in candidate_thresholds:
        y_pred_t = (y_probs >= t).astype(np.uint8)
        m = compute_segmentation_metrics(y_true, y_pred_t)
        criterion = m["dice"] * 0.6 + m["foreground_iou"] * 0.4
        results.append({
            "threshold": t,
            "mean_iou": m["mean_iou"],
            "foreground_iou": m["foreground_iou"],
            "dice": m["dice"],
            "precision": m["precision"],
            "recall": m["recall"],
            "fpr": m["fpr"],
            "criterion_score": criterion
        })
        print(f"  Threshold {t:.2f} -> Dice: {m['dice']:.4f}, Fg-IoU: {m['foreground_iou']:.4f}, Prec: {m['precision']:.4f}, Rec: {m['recall']:.4f}, FPR: {m['fpr']:.4f}", flush=True)

    best = max(results, key=lambda x: x["criterion_score"])
    print(f"\nOptimal Threshold Selected: {best['threshold']:.2f} (Dice={best['dice']:.4f}, IoU={best['foreground_iou']:.4f})\n", flush=True)
    return float(best["threshold"]), results


def stratify_by_oil_size(y_true: np.ndarray, y_pred: np.ndarray, all_items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Computes segmentation performance stratified by oil mask size/fraction."""
    categories = {
        "VERY_SMALL (<0.1%)": {"indices": [], "min_f": 0.0, "max_f": 0.001},
        "SMALL (0.1%-1%)": {"indices": [], "min_f": 0.001, "max_f": 0.01},
        "MEDIUM (1%-10%)": {"indices": [], "min_f": 0.01, "max_f": 0.10},
        "LARGE (10%-50%)": {"indices": [], "min_f": 0.10, "max_f": 0.50},
        "VERY_LARGE (>50%)": {"indices": [], "min_f": 0.50, "max_f": 1.01}
    }

    for idx, item in enumerate(all_items):
        if not item["is_oil_positive"]:
            continue
        frac = float(item["oil_pixel_fraction"])
        for cat_name, bounds in categories.items():
            if bounds["min_f"] <= frac < bounds["max_f"]:
                bounds["indices"].append(idx)
                break

    strat_results = {}
    for cat_name, data in categories.items():
        idxs = data["indices"]
        if len(idxs) < 3:
            strat_results[cat_name] = {
                "sample_count": len(idxs),
                "status": "INSUFFICIENT_SAMPLE_SIZE"
            }
        else:
            cat_true = y_true[idxs]
            cat_pred = y_pred[idxs]
            m = compute_segmentation_metrics(cat_true, cat_pred)
            strat_results[cat_name] = {
                "sample_count": len(idxs),
                "foreground_iou": m["foreground_iou"],
                "dice": m["dice"],
                "precision": m["precision"],
                "recall": m["recall"]
            }

    return strat_results


def stratify_by_source(y_true: np.ndarray, y_pred: np.ndarray, all_items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Computes segmentation performance separately for MADOS and KERF."""
    sources = {}
    for idx, item in enumerate(all_items):
        src = item["source_dataset"]
        if src not in sources:
            sources[src] = []
        sources[src].append(idx)

    source_results = {}
    for src, idxs in sources.items():
        src_true = y_true[idxs]
        src_pred = y_pred[idxs]
        oil_pos_cnt = sum(1 for i in idxs if all_items[i]["is_oil_positive"])
        m = compute_segmentation_metrics(src_true, src_pred)
        source_results[src] = {
            "total_samples": len(idxs),
            "oil_positive_samples": oil_pos_cnt,
            "mean_iou": m["mean_iou"],
            "foreground_iou": m["foreground_iou"],
            "background_iou": m["background_iou"],
            "dice": m["dice"],
            "precision": m["precision"],
            "recall": m["recall"],
            "specificity": m["specificity"],
            "fpr": m["fpr"]
        }
    return source_results


def train_and_validate():
    print("=" * 80, flush=True)
    print("PART 0.14C.2: REAL OPTICAL OIL-SPILL SEGMENTATION MODEL TRAINING", flush=True)
    print("=" * 80, flush=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using Compute Device: {device} ({torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'})\n", flush=True)

    # Load datasets
    train_ds = FastOpticalSegmentationDataset(METADATA_DIR / "segmentation_train_manifest.json", is_train=True, expected_split="TRAIN")
    val_ds = FastOpticalSegmentationDataset(METADATA_DIR / "segmentation_validation_manifest.json", is_train=False, expected_split="VALIDATION")
    test_ds = FastOpticalSegmentationDataset(METADATA_DIR / "segmentation_internal_test_manifest.json", is_train=False, expected_split="INTERNAL_TEST")

    print(f"Dataset Counts -> TRAIN: {len(train_ds)}, VALIDATION: {len(val_ds)}, INTERNAL_TEST: {len(test_ds)}", flush=True)

    train_loader = DataLoader(train_ds, batch_size=16, shuffle=True, num_workers=0, pin_memory=torch.cuda.is_available())
    val_loader = DataLoader(val_ds, batch_size=16, shuffle=False, num_workers=0)
    test_loader = DataLoader(test_ds, batch_size=16, shuffle=False, num_workers=0)

    # Initialize model
    model = OpticalUNetResNet18(pretrained=True, num_classes=1).to(device)
    param_count = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Model Architecture: OpticalUNetResNet18 | Trainable Parameters: {param_count:,}", flush=True)

    # Loss & Optimizer
    criterion = CombinedBCEDiceLoss(bce_weight=0.5, dice_weight=0.5, pos_weight=3.0).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="max", factor=0.5, patience=3)

    epochs = 18
    early_stopping_patience = 6
    best_val_dice = -1.0
    patience_counter = 0
    checkpoint_path = MODEL_SAVE_DIR / "optical_oil_seg_unet_resnet18_v1.pth"
    history = []

    if "--eval-only" in sys.argv:
        print("\n--- Skipping Training Loop (--eval-only passed) ---", flush=True)
    else:
        print("\n--- Starting Training Loop ---", flush=True)
        for epoch in range(1, epochs + 1):
            model.train()
            train_loss = 0.0
            start_t = time.time()

            for imgs, masks, _ in train_loader:
                imgs = imgs.to(device)
                masks = masks.to(device)

                optimizer.zero_grad()
                logits = model(imgs)
                loss = criterion(logits, masks)
                loss.backward()
                optimizer.step()

                train_loss += loss.item() * len(imgs)

            train_loss /= len(train_ds)

            # Validation evaluation at default threshold 0.50 during training epochs
            val_metrics, _, _, _ = evaluate_dataset(model, val_loader, device, threshold=0.50)
            val_dice = val_metrics["dice"]
            val_fg_iou = val_metrics["foreground_iou"]
            val_prec = val_metrics["precision"]
            val_rec = val_metrics["recall"]
            epoch_time = time.time() - start_t

            scheduler.step(val_dice)

            history.append({
                "epoch": epoch,
                "train_loss": float(train_loss),
                "val_dice": float(val_dice),
                "val_foreground_iou": float(val_fg_iou),
                "val_precision": float(val_prec),
                "val_recall": float(val_rec),
                "learning_rate": float(optimizer.param_groups[0]["lr"]),
                "epoch_duration_sec": float(epoch_time)
            })

            print(f"Epoch [{epoch:02d}/{epochs:02d}] ({epoch_time:.1f}s) | Loss: {train_loss:.4f} | Val Dice: {val_dice:.4f} | Fg-IoU: {val_fg_iou:.4f} | Prec: {val_prec:.4f} | Rec: {val_rec:.4f}", flush=True)

            if val_dice > best_val_dice:
                best_val_dice = val_dice
                patience_counter = 0
                torch.save({
                    "model_state_dict": model.state_dict(),
                    "architecture": "OpticalUNetResNet18",
                    "encoder": "ResNet-18 (ImageNet Pretrained)",
                    "epoch": epoch,
                    "val_dice": float(val_dice),
                    "val_foreground_iou": float(val_fg_iou)
                }, checkpoint_path)
                print(f"  --> Saved new best checkpoint at Epoch {epoch:02d} (Val Dice: {val_dice:.4f})", flush=True)
            else:
                patience_counter += 1
                if patience_counter >= early_stopping_patience:
                    print(f"\nEarly stopping triggered at Epoch {epoch} (patience={early_stopping_patience})", flush=True)
                    break


    # Save training history
    if history:
        with open(MODEL_SAVE_DIR / "training_history.json", "w") as f:
            json.dump(history, f, indent=2)


    # 1. Load best checkpoint
    print(f"\nLoading best checkpoint: {checkpoint_path}", flush=True)
    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=False)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    # Compute Checkpoint SHA-256
    with open(checkpoint_path, "rb") as f:
        model_sha256 = hashlib.sha256(f.read()).hexdigest()
    with open(MODEL_SAVE_DIR / "model_sha256.txt", "w") as f:
        f.write(model_sha256 + "\n")
    print(f"Model Checkpoint SHA-256: {model_sha256}", flush=True)

    # 2. Optimize threshold on VALIDATION ONLY
    best_threshold, threshold_results = optimize_threshold_on_val(model, val_loader, device)

    # 3. Validation Full Evaluation at selected threshold
    val_metrics_opt, val_true, val_probs, val_items = evaluate_dataset(model, val_loader, device, threshold=best_threshold)
    val_pred = (val_probs >= best_threshold).astype(np.uint8)
    val_source_stats = stratify_by_source(val_true, val_pred, val_items)
    val_size_stats = stratify_by_oil_size(val_true, val_pred, val_items)

    val_report = {
        "dataset": "VALIDATION",
        "total_pairs": len(val_ds),
        "selected_threshold": best_threshold,
        "metrics": val_metrics_opt,
        "source_breakdown": val_source_stats,
        "oil_size_stratification": val_size_stats,
        "threshold_sweep_results": threshold_results
    }
    with open(MODEL_SAVE_DIR / "metrics_validation.json", "w") as f:
        json.dump(val_report, f, indent=2)

    with open(MODEL_SAVE_DIR / "threshold.json", "w") as f:
        json.dump({
            "selected_pixel_threshold": best_threshold,
            "selection_criterion": "0.6 * Dice + 0.4 * Foreground_IoU",
            "validation_dice_at_threshold": val_metrics_opt["dice"],
            "validation_iou_at_threshold": val_metrics_opt["foreground_iou"]
        }, f, indent=2)

    # 4. SINGLE-PASS INTERNAL TEST EVALUATION (Locked threshold)
    print("=" * 80, flush=True)
    print(f"RUNNING SINGLE-PASS EVALUATION ON INTERNAL TEST (Threshold = {best_threshold:.2f})", flush=True)
    print("=" * 80, flush=True)
    test_metrics, test_true, test_probs, test_items = evaluate_dataset(model, test_loader, device, threshold=best_threshold)
    test_pred = (test_probs >= best_threshold).astype(np.uint8)
    test_source_stats = stratify_by_source(test_true, test_pred, test_items)
    test_size_stats = stratify_by_oil_size(test_true, test_pred, test_items)

    test_report = {
        "dataset": "INTERNAL_TEST",
        "total_pairs": len(test_ds),
        "operating_threshold": best_threshold,
        "metrics": test_metrics,
        "source_breakdown": test_source_stats,
        "oil_size_stratification": test_size_stats
    }
    with open(MODEL_SAVE_DIR / "metrics_internal_test.json", "w") as f:
        json.dump(test_report, f, indent=2)
    with open(RESULTS_DIR / "metrics_internal_test.json", "w") as f:
        json.dump(test_report, f, indent=2)

    # 5. Save Configurations
    training_config = {
        "model_name": "optical-oil-seg-unet-resnet18-v1",
        "architecture": "OpticalUNetResNet18",
        "encoder": "ResNet-18 (ImageNet Pretrained)",
        "parameter_count": param_count,
        "input_resolution": [256, 256],
        "optimizer": "AdamW",
        "learning_rate": 1e-4,
        "weight_decay": 1e-4,
        "loss_function": "0.5 * BCEWithLogits (pos_weight=3.0) + 0.5 * SoftDiceLoss",
        "epochs_trained": len(history),
        "batch_size": 16,
        "best_epoch": checkpoint["epoch"],
        "operating_threshold": best_threshold,
        "checkpoint_sha256": model_sha256
    }
    with open(MODEL_SAVE_DIR / "training_config.json", "w") as f:
        json.dump(training_config, f, indent=2)

    preprocessing_config = {
        "input_size": [256, 256],
        "normalization_mean": NORMALIZE_MEAN,
        "normalization_std": NORMALIZE_STD,
        "image_interpolation": "BILINEAR",
        "mask_interpolation": "NEAREST",
        "oil_class_definitions": {
            "MADOS_Sentinel2": "pixel_value == 6",
            "Kerf_Drone_Oil_Spill": "R > 200 and G < 50 and B > 100"
        }
    }
    with open(MODEL_SAVE_DIR / "preprocessing.json", "w") as f:
        json.dump(preprocessing_config, f, indent=2)

    # 6. Save Representative Visual Samples (from both Val and Internal Test)
    print(f"\nGenerating visual evaluation examples in {RESULTS_DIR.relative_to(PROJECT_ROOT)}...", flush=True)
    all_eval_sets = [
        ("val", val_items, val_true, val_probs, val_pred),
        ("test", test_items, test_true, test_probs, test_pred)
    ]

    for split_name, items_list, y_true_arr, y_prob_arr, y_pred_arr in all_eval_sets:
        vis_samples = []
        for i, item in enumerate(items_list):
            if item["is_oil_positive"]:
                t_arr = y_true_arr[i, 0]
                p_arr = y_pred_arr[i, 0]
                m = compute_segmentation_metrics(t_arr, p_arr)
                if m["foreground_iou"] > 0.50 and len([s for s in vis_samples if s["type"] == "TRUE_POSITIVE" and s["dataset"] == item["source_dataset"]]) < 3:
                    vis_samples.append({"idx": i, "type": "TRUE_POSITIVE", "iou": m["foreground_iou"], "item": item, "dataset": item["source_dataset"]})
                elif m["foreground_iou"] < 0.25 and len([s for s in vis_samples if s["type"] == "FALSE_NEGATIVE" and s["dataset"] == item["source_dataset"]]) < 3:
                    vis_samples.append({"idx": i, "type": "FALSE_NEGATIVE", "iou": m["foreground_iou"], "item": item, "dataset": item["source_dataset"]})
            else:
                p_arr = y_pred_arr[i, 0]
                fp_px = int(np.sum(p_arr))
                if fp_px > 50 and len([s for s in vis_samples if s["type"] == "FALSE_POSITIVE" and s["dataset"] == item["source_dataset"]]) < 3:
                    vis_samples.append({"idx": i, "type": "FALSE_POSITIVE", "fp_px": fp_px, "item": item, "dataset": item["source_dataset"]})
                elif fp_px == 0 and len([s for s in vis_samples if s["type"] == "TRUE_NEGATIVE" and s["dataset"] == item["source_dataset"]]) < 3:
                    vis_samples.append({"idx": i, "type": "TRUE_NEGATIVE", "item": item, "dataset": item["source_dataset"]})

        for s in vis_samples:
            i = s["idx"]
            item = s["item"]
            im_p = item["image_path"]
            with Image.open(im_p) as im:
                im_rgb = im.convert("RGB").resize(IMAGE_SIZE, Image.Resampling.BILINEAR)

            gt_mask = y_true_arr[i, 0]
            prob_map = y_prob_arr[i, 0]
            bin_pred = y_pred_arr[i, 0]

            gt_vis = Image.fromarray((gt_mask * 255).astype(np.uint8)).convert("RGB")
            prob_vis = Image.fromarray((prob_map * 255).astype(np.uint8)).convert("RGB")
            pred_vis = Image.fromarray((bin_pred * 255).astype(np.uint8)).convert("RGB")

            overlay_arr = np.array(im_rgb)
            overlay_arr[bin_pred == 1, 0] = np.clip(overlay_arr[bin_pred == 1, 0] * 0.4 + 150, 0, 255).astype(np.uint8)
            overlay_arr[bin_pred == 1, 1] = (overlay_arr[bin_pred == 1, 1] * 0.4).astype(np.uint8)
            overlay_arr[bin_pred == 1, 2] = (overlay_arr[bin_pred == 1, 2] * 0.4).astype(np.uint8)
            overlay_vis = Image.fromarray(overlay_arr)

            w, h = IMAGE_SIZE
            panel = Image.new("RGB", (w * 5, h))
            panel.paste(im_rgb, (0, 0))
            panel.paste(gt_vis, (w, 0))
            panel.paste(prob_vis, (w * 2, 0))
            panel.paste(pred_vis, (w * 3, 0))
            panel.paste(overlay_vis, (w * 4, 0))

            out_fname = f"{split_name}_{s['type'].lower()}_{item['source_dataset'][:4].lower()}_{item['image_id']}.jpg"
            panel.save(RESULTS_DIR / out_fname, quality=90)

    # 7. Update Model Registry Audit
    if REGISTRY_PATH.exists():
        with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
            reg_data = json.load(f)
    else:
        reg_data = {"models": []}

    seg_entry = {
        "model_id": "optical-oil-seg-unet-resnet18-v1",
        "version": "1.0.0",
        "modality": "OPTICAL_RGB",
        "status": "EXPERIMENTAL",
        "task": "OPTICAL_OIL_SPILL_SEGMENTATION",
        "architecture": "OpticalUNetResNet18",
        "encoder": "ResNet-18 (ImageNet Pretrained)",
        "checkpoint_path": str(checkpoint_path.relative_to(PROJECT_ROOT)),
        "sha256": model_sha256,
        "operating_threshold": best_threshold,
        "validation_metrics": val_metrics_opt,
        "internal_test_metrics": test_metrics,
        "external_test_status": "SEALED — NOT EVALUATED",
        "registered_at": "2026-09-20T09:30:00Z"
    }

    if isinstance(reg_data.get("models"), dict):
        reg_data["models"]["optical-oil-seg-unet-resnet18-v1"] = seg_entry
    else:
        reg_data["models"] = reg_data.get("models", [])
        existing_idx = next((i for i, m in enumerate(reg_data["models"]) if m.get("model_id") == "optical-oil-seg-unet-resnet18-v1"), None)
        if existing_idx is not None:
            reg_data["models"][existing_idx] = seg_entry
        else:
            reg_data["models"].append(seg_entry)

    with open(REGISTRY_PATH, "w", encoding="utf-8") as f:
        json.dump(reg_data, f, indent=2)


    # Print Final Summary
    print("\n" + "=" * 80, flush=True)
    print("OPTICAL OIL SPILL SEGMENTATION EVALUATION RESULTS", flush=True)
    print("=" * 80, flush=True)
    print(f"Model Checkpoint:     optical_oil_seg_unet_resnet18_v1.pth", flush=True)
    print(f"Operating Threshold:  {best_threshold:.2f}", flush=True)
    print("-" * 80, flush=True)
    print("VALIDATION PERFORMANCE (N=730):", flush=True)
    print(f"  Mean IoU:           {val_metrics_opt['mean_iou']:.4f}", flush=True)
    print(f"  Foreground IoU:     {val_metrics_opt['foreground_iou']:.4f}", flush=True)
    print(f"  Dice Score (F1):    {val_metrics_opt['dice']:.4f}", flush=True)
    print(f"  Precision:          {val_metrics_opt['precision']:.4f}", flush=True)
    print(f"  Recall:             {val_metrics_opt['recall']:.4f}", flush=True)
    print(f"  FPR:                {val_metrics_opt['fpr']:.4f}", flush=True)
    print("-" * 80, flush=True)
    print("INTERNAL TEST PERFORMANCE (N=708, Locked Threshold):", flush=True)
    print(f"  Mean IoU:           {test_metrics['mean_iou']:.4f}", flush=True)
    print(f"  Foreground IoU:     {test_metrics['foreground_iou']:.4f}", flush=True)
    print(f"  Dice Score (F1):    {test_metrics['dice']:.4f}", flush=True)
    print(f"  Precision:          {test_metrics['precision']:.4f}", flush=True)
    print(f"  Recall:             {test_metrics['recall']:.4f}", flush=True)
    print(f"  FPR:                {test_metrics['fpr']:.4f}", flush=True)
    print("-" * 80, flush=True)
    print("Source-Specific Breakdown (Internal Test):", flush=True)
    for src, s in test_source_stats.items():
        print(f"  [{src}] (N={s['total_samples']}, Oil+={s['oil_positive_samples']}):", flush=True)
        print(f"    Mean IoU: {s['mean_iou']:.4f}, Fg-IoU: {s['foreground_iou']:.4f}, Dice: {s['dice']:.4f}, Prec: {s['precision']:.4f}, Rec: {s['recall']:.4f}", flush=True)
    print("-" * 80, flush=True)
    print("Oil-Size Stratification (Internal Test):", flush=True)
    for sz, s in test_size_stats.items():
        if s.get("status") == "INSUFFICIENT_SAMPLE_SIZE":
            print(f"  [{sz}]: N={s['sample_count']} -> INSUFFICIENT_SAMPLE_SIZE", flush=True)
        else:
            print(f"  [{sz}]: N={s['sample_count']} -> Fg-IoU: {s['foreground_iou']:.4f}, Dice: {s['dice']:.4f}, Prec: {s['precision']:.4f}, Rec: {s['recall']:.4f}", flush=True)
    print("=" * 80, flush=True)
    print("Segmentation Model Training & Validation COMPLETE.", flush=True)


if __name__ == "__main__":
    train_and_validate()
