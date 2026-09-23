"""
Training & Evaluation Pipeline for Domain-Adaptive Multi-Scale Optical Oil-Spill Segmentation V2
Part 0.14C.3 — Real Optical Oil-Spill Segmentation Model V2

Features:
1. Domain-Aware Balanced Batch Sampler (50% MADOS Sentinel-2, 50% KERF Drone RGB per batch).
2. Domain-Disaggregated Hybrid Loss (Focal Tversky for sparse satellite slicks + BCE-Dice for dense drone slicks).
3. Deep supervision auxiliary loss during training.
4. Validation threshold search using Domain-Balanced Macro Dice (0.5 * Dice_MADOS + 0.5 * Dice_KERF).
5. Single-pass locked internal test evaluation (708 pairs).
6. Side-by-side visual comparison generation: Original, Ground Truth, V1 Prediction, V2 Prediction.
7. External test set (130 pairs) strictly SEALED and isolated.
"""

import sys
import os
import json
import time
import hashlib
import random
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader, Sampler
from torchvision import transforms
from PIL import Image

# Add path for model imports
PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "services" / "ml-python"))

from app.models.optical_unet_resnet18 import OpticalUNetResNet18
from app.models.optical_unet_resnet18_v2 import OpticalUNetResNet18V2

# Constants & Paths
METADATA_DIR = PROJECT_ROOT / "data" / "raw" / "optical_real" / "metadata" / "segmentation"
MODEL_SAVE_DIR = PROJECT_ROOT / "services" / "ml-python" / "app" / "models" / "optical_oil_segmentation_v2"
MODEL_V1_DIR = PROJECT_ROOT / "services" / "ml-python" / "app" / "models" / "optical_oil_segmentation_v1"
RESULTS_DIR = PROJECT_ROOT / "ml" / "experiments" / "results" / "optical_oil_segmentation_v2"
REGISTRY_PATH = PROJECT_ROOT / "ml" / "model_registry" / "registry.json"

IMAGE_SIZE = (256, 256)
NORMALIZE_MEAN = [0.485, 0.456, 0.406]
NORMALIZE_STD = [0.229, 0.224, 0.225]

# Reproducibility seed
SEED = 42
random.seed(SEED)
np.random.seed(SEED)
torch.manual_seed(SEED)
if torch.cuda.is_available():
    torch.cuda.manual_seed_all(SEED)


class DomainAwareOpticalSegmentationDataset(Dataset):
    """Dataset loading real optical image-mask pairs with domain tags."""
    def __init__(self, manifest_path: Path, is_train: bool = False, expected_split: str = "TRAIN"):
        self.manifest_path = manifest_path
        self.is_train = is_train
        self.expected_split = expected_split

        with open(manifest_path, "r", encoding="utf-8") as f:
            records = json.load(f)

        self.items = []
        for r in records:
            # Strict safety assertions
            assert r.get("is_external_test", False) is False, f"SEALED external test sample in {manifest_path}: {r['image_id']}"
            assert r["split"] == expected_split, f"Split mismatch: expected {expected_split}, got {r['split']}"

            img_p = PROJECT_ROOT / r["image_path"]
            mask_p = PROJECT_ROOT / r["mask_path"]
            assert img_p.exists(), f"Missing image: {img_p}"
            assert mask_p.exists(), f"Missing mask: {mask_p}"

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
                "height": int(r["height"])
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

        # 3. Spatial resizing
        im_resized = im_rgb.resize(IMAGE_SIZE, Image.Resampling.BILINEAR)
        mask_resized = mask_pil.resize(IMAGE_SIZE, Image.Resampling.NEAREST)

        # 4. Data augmentation (Train only)
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

        # Convert to tensor
        img_tensor = transforms.ToTensor()(im_resized)
        img_tensor = transforms.Normalize(mean=NORMALIZE_MEAN, std=NORMALIZE_STD)(img_tensor)

        mask_arr = np.array(mask_resized, dtype=np.float32)
        mask_tensor = torch.from_numpy(mask_arr).unsqueeze(0)  # (1, H, W)

        return img_tensor, mask_tensor, item


class DomainBalancedBatchSampler(Sampler):
    """
    Constructs training batches containing an exact 50:50 ratio of MADOS and KERF samples.
    Within each domain, positive-aware stratification prioritizes oil-positive tiles alongside hard negatives.
    """
    def __init__(self, dataset: DomainAwareOpticalSegmentationDataset, batch_size: int = 16):
        self.dataset = dataset
        self.batch_size = batch_size
        self.half_batch = batch_size // 2

        self.mados_pos = [i for i, item in enumerate(dataset.items) if item["source_dataset"] == "MADOS_Sentinel2" and item["is_oil_positive"]]
        self.mados_neg = [i for i, item in enumerate(dataset.items) if item["source_dataset"] == "MADOS_Sentinel2" and not item["is_oil_positive"]]

        self.kerf_pos = [i for i, item in enumerate(dataset.items) if item["source_dataset"] == "Kerf_Drone_Oil_Spill" and item["is_oil_positive"]]
        self.kerf_neg = [i for i, item in enumerate(dataset.items) if item["source_dataset"] == "Kerf_Drone_Oil_Spill" and not item["is_oil_positive"]]

        # Calculate number of batches per epoch based on dataset size
        self.num_batches = len(dataset) // batch_size

    def __iter__(self):
        for _ in range(self.num_batches):
            batch = []
            # 1. Sample 8 MADOS (4 positive + 4 negative)
            for _ in range(self.half_batch // 2):
                batch.append(random.choice(self.mados_pos))
                batch.append(random.choice(self.mados_neg))

            # 2. Sample 8 KERF (4 positive + 4 negative)
            for _ in range(self.half_batch // 2):
                batch.append(random.choice(self.kerf_pos))
                batch.append(random.choice(self.kerf_neg))

            random.shuffle(batch)
            yield batch

    def __len__(self):
        return self.num_batches


class FocalTverskyLoss(nn.Module):
    """
    Focal Tversky Loss designed to address severe class imbalance and thin boundary detection.
    High beta (0.7) heavily penalizes False Negatives (missing small satellite ribbons).
    """
    def __init__(self, alpha: float = 0.3, beta: float = 0.7, gamma: float = 1.33, smooth: float = 1.0):
        super().__init__()
        self.alpha = alpha
        self.beta = beta
        self.gamma = gamma
        self.smooth = smooth

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        probs = torch.sigmoid(logits)
        probs_flat = probs.view(-1)
        targets_flat = targets.view(-1)

        tp = (probs_flat * targets_flat).sum()
        fp = (probs_flat * (1.0 - targets_flat)).sum()
        fn = ((1.0 - probs_flat) * targets_flat).sum()

        tversky = (tp + self.smooth) / (tp + self.alpha * fp + self.beta * fn + self.smooth)
        focal_tversky = torch.pow((1.0 - tversky), self.gamma)
        return focal_tversky


class DomainAdaptiveLossV2(nn.Module):
    """
    Domain-disaggregated loss:
    1. Focal Tversky Loss on MADOS satellite samples to boost small-object recall.
    2. BCE + Soft Dice on KERF drone samples for smooth boundary convergence.
    3. Deep supervision auxiliary loss contribution.
    """
    def __init__(self, aux_weight: float = 0.3):
        super().__init__()
        self.aux_weight = aux_weight
        self.mados_loss = FocalTverskyLoss(alpha=0.3, beta=0.7, gamma=1.33)
        self.bce = nn.BCEWithLogitsLoss(pos_weight=torch.tensor([2.0]))
        self.smooth = 1.0

    def soft_dice(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        probs = torch.sigmoid(logits).view(-1)
        targets = targets.view(-1)
        intersection = (probs * targets).sum()
        dice = (2.0 * intersection + self.smooth) / (probs.sum() + targets.sum() + self.smooth)
        return 1.0 - dice

    def forward(self, main_logits: torch.Tensor, targets: torch.Tensor, items: List[Dict[str, Any]], aux_logits: Optional[torch.Tensor] = None) -> torch.Tensor:
        mados_idxs = [i for i, item in enumerate(items) if item["source_dataset"] == "MADOS_Sentinel2"]
        kerf_idxs = [i for i, item in enumerate(items) if item["source_dataset"] == "Kerf_Drone_Oil_Spill"]

        loss_mados = torch.tensor(0.0, device=main_logits.device)
        if mados_idxs:
            m_logits = main_logits[mados_idxs]
            m_targets = targets[mados_idxs]
            loss_mados = self.mados_loss(m_logits, m_targets)

        loss_kerf = torch.tensor(0.0, device=main_logits.device)
        if kerf_idxs:
            k_logits = main_logits[kerf_idxs]
            k_targets = targets[kerf_idxs]
            loss_kerf = 0.5 * self.bce(k_logits, k_targets) + 0.5 * self.soft_dice(k_logits, k_targets)

        total_loss = 0.5 * loss_mados + 0.5 * loss_kerf

        if aux_logits is not None:
            aux_loss = self.bce(aux_logits, targets) + self.soft_dice(aux_logits, targets)
            total_loss += self.aux_weight * aux_loss

        return total_loss


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


def evaluate_dataset(model: nn.Module, loader: DataLoader, device: torch.device, threshold: float = 0.50) -> Tuple[Dict[str, float], np.ndarray, np.ndarray, List[Dict[str, Any]]]:
    """Runs inference across a dataset and returns aggregate metrics and prediction arrays."""
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

    all_probs_np = np.concatenate(all_probs, axis=0)      # (N, 1, H, W)
    all_targets_np = np.concatenate(all_targets, axis=0)  # (N, 1, H, W)

    binary_preds = (all_probs_np >= threshold).astype(np.uint8)
    metrics = compute_segmentation_metrics(all_targets_np, binary_preds)

    return metrics, all_targets_np, all_probs_np, all_items


def stratify_by_source(y_true: np.ndarray, y_pred: np.ndarray, all_items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Computes metrics separately for MADOS and KERF."""
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


def stratify_by_oil_size(y_true: np.ndarray, y_pred: np.ndarray, all_items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Computes metrics stratified by oil mask size fraction."""
    categories = {
        "VERY_SMALL (<0.1%)": (0.0, 0.001),
        "SMALL (0.1%-1%)": (0.001, 0.01),
        "MEDIUM (1%-10%)": (0.01, 0.10),
        "LARGE (10%-50%)": (0.10, 0.50),
        "VERY_LARGE (>50%)": (0.50, 1.0)
    }

    strat_results = {}
    for cat_name, (low, high) in categories.items():
        idxs = [i for i, item in enumerate(all_items) if item["is_oil_positive"] and low <= item["oil_pixel_fraction"] < high]
        if len(idxs) == 0:
            strat_results[cat_name] = {
                "sample_count": 0,
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


def optimize_threshold_on_val(model: nn.Module, val_loader: DataLoader, device: torch.device) -> Tuple[float, List[Dict[str, Any]]]:
    """
    Sweeps thresholds on VALIDATION ONLY.
    Uses Domain-Balanced Macro Criterion: 0.5 * Dice_MADOS + 0.5 * Dice_KERF.
    """
    print("\n--- Optimizing Operating Threshold on VALIDATION ONLY (Domain-Balanced Objective) ---", flush=True)
    _, val_true, val_probs, val_items = evaluate_dataset(model, val_loader, device, threshold=0.50)

    candidate_thresholds = [0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80]
    results = []
    best_threshold = 0.50
    best_score = -1.0

    mados_idxs = [i for i, item in enumerate(val_items) if item["source_dataset"] == "MADOS_Sentinel2"]
    kerf_idxs = [i for i, item in enumerate(val_items) if item["source_dataset"] == "Kerf_Drone_Oil_Spill"]

    for t in candidate_thresholds:
        bin_pred = (val_probs >= t).astype(np.uint8)
        global_m = compute_segmentation_metrics(val_true, bin_pred)
        mados_m = compute_segmentation_metrics(val_true[mados_idxs], bin_pred[mados_idxs])
        kerf_m = compute_segmentation_metrics(val_true[kerf_idxs], bin_pred[kerf_idxs])

        # Domain-balanced macro score: 50% MADOS Dice + 50% KERF Dice
        macro_dice = 0.5 * mados_m["dice"] + 0.5 * kerf_m["dice"]
        macro_iou = 0.5 * mados_m["foreground_iou"] + 0.5 * kerf_m["foreground_iou"]
        score = 0.6 * macro_dice + 0.4 * macro_iou

        results.append({
            "threshold": t,
            "global_dice": global_m["dice"],
            "global_iou": global_m["foreground_iou"],
            "mados_dice": mados_m["dice"],
            "mados_iou": mados_m["foreground_iou"],
            "mados_recall": mados_m["recall"],
            "mados_precision": mados_m["precision"],
            "kerf_dice": kerf_m["dice"],
            "kerf_iou": kerf_m["foreground_iou"],
            "kerf_recall": kerf_m["recall"],
            "kerf_precision": kerf_m["precision"],
            "macro_dice": macro_dice,
            "score": score
        })

        print(f"  Threshold {t:.2f} -> MADOS Dice: {mados_m['dice']:.4f} (Rec: {mados_m['recall']:.4f}) | KERF Dice: {kerf_m['dice']:.4f} | Macro Dice: {macro_dice:.4f}", flush=True)

        if score > best_score:
            best_score = score
            best_threshold = t

    print(f"\nOptimal Domain-Balanced Threshold Selected: {best_threshold:.2f} (Macro Dice={max(r['macro_dice'] for r in results if r['threshold'] == best_threshold):.4f})", flush=True)
    return best_threshold, results


def train_and_validate():
    print("=" * 80, flush=True)
    print("PART 0.14C.3: DOMAIN-ADAPTIVE MULTI-SCALE OPTICAL OIL SEGMENTATION (V2)", flush=True)
    print("=" * 80, flush=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using Compute Device: {device} ({torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'})\n", flush=True)

    MODEL_SAVE_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    # Load datasets
    train_ds = DomainAwareOpticalSegmentationDataset(METADATA_DIR / "segmentation_train_manifest.json", is_train=True, expected_split="TRAIN")
    val_ds = DomainAwareOpticalSegmentationDataset(METADATA_DIR / "segmentation_validation_manifest.json", is_train=False, expected_split="VALIDATION")
    test_ds = DomainAwareOpticalSegmentationDataset(METADATA_DIR / "segmentation_internal_test_manifest.json", is_train=False, expected_split="INTERNAL_TEST")

    print(f"Dataset Counts -> TRAIN: {len(train_ds)}, VALIDATION: {len(val_ds)}, INTERNAL_TEST: {len(test_ds)}", flush=True)

    # Data Loaders
    batch_sampler = DomainBalancedBatchSampler(train_ds, batch_size=16)
    train_loader = DataLoader(train_ds, batch_sampler=batch_sampler, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=16, shuffle=False, num_workers=0)
    test_loader = DataLoader(test_ds, batch_size=16, shuffle=False, num_workers=0)

    # Initialize model
    model = OpticalUNetResNet18V2(pretrained=True, num_classes=1, use_deep_supervision=True).to(device)
    param_count = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Model Architecture: OpticalUNetResNet18V2 | Trainable Parameters: {param_count:,}", flush=True)

    # Loss & Optimizer
    criterion = DomainAdaptiveLossV2(aux_weight=0.3).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="max", factor=0.5, patience=3)

    epochs = 18
    early_stopping_patience = 6
    best_macro_score = -1.0
    patience_counter = 0
    checkpoint_path = MODEL_SAVE_DIR / "optical_oil_segmentation_v2.pth"
    history = []

    if "--eval-only" in sys.argv and checkpoint_path.exists():
        print("\n--- Skipping Training Loop (--eval-only passed) ---", flush=True)
    else:
        print("\n--- Starting Training Loop with Domain-Balanced Batch Sampling ---", flush=True)
        for epoch in range(1, epochs + 1):
            model.train()
            train_loss = 0.0
            start_t = time.time()

            for imgs, masks, items in train_loader:
                imgs = imgs.to(device)
                masks = masks.to(device)

                # Construct items list of dicts from batch
                batch_items = []
                for i in range(len(imgs)):
                    batch_items.append({
                        "source_dataset": items["source_dataset"][i],
                        "is_oil_positive": bool(items["is_oil_positive"][i])
                    })

                optimizer.zero_grad()
                main_logits, aux_logits = model(imgs, return_aux=True)
                loss = criterion(main_logits, masks, batch_items, aux_logits)
                loss.backward()
                optimizer.step()

                train_loss += loss.item() * len(imgs)

            train_loss /= (len(batch_sampler) * 16)
            epoch_time = time.time() - start_t

            # Validation evaluation
            val_metrics, val_true, val_probs, val_items = evaluate_dataset(model, val_loader, device, threshold=0.30)
            val_source = stratify_by_source(val_true, (val_probs >= 0.30).astype(np.uint8), val_items)

            mados_dice = val_source.get("MADOS_Sentinel2", {}).get("dice", 0.0)
            mados_rec = val_source.get("MADOS_Sentinel2", {}).get("recall", 0.0)
            kerf_dice = val_source.get("Kerf_Drone_Oil_Spill", {}).get("dice", 0.0)
            kerf_rec = val_source.get("Kerf_Drone_Oil_Spill", {}).get("recall", 0.0)

            macro_dice = 0.5 * mados_dice + 0.5 * kerf_dice
            scheduler.step(macro_dice)

            history.append({
                "epoch": epoch,
                "train_loss": float(train_loss),
                "val_mados_dice": float(mados_dice),
                "val_mados_recall": float(mados_rec),
                "val_kerf_dice": float(kerf_dice),
                "val_kerf_recall": float(kerf_rec),
                "macro_dice": float(macro_dice),
                "learning_rate": float(optimizer.param_groups[0]["lr"]),
                "epoch_duration_sec": float(epoch_time)
            })

            print(f"Epoch [{epoch:02d}/{epochs:02d}] ({epoch_time:.1f}s) | Loss: {train_loss:.4f} | MADOS Dice: {mados_dice:.4f} (Rec: {mados_rec:.4f}) | KERF Dice: {kerf_dice:.4f} | Macro Dice: {macro_dice:.4f}", flush=True)

            if macro_dice > best_macro_score:
                best_macro_score = macro_dice
                patience_counter = 0
                torch.save({
                    "model_state_dict": model.state_dict(),
                    "architecture": "OpticalUNetResNet18V2",
                    "encoder": "ResNet-18 ImageNet (ASPP + Multi-Scale Fusion)",
                    "epoch": epoch,
                    "macro_dice": float(macro_dice),
                    "mados_dice": float(mados_dice),
                    "kerf_dice": float(kerf_dice)
                }, checkpoint_path)
                print(f"  --> Saved new best checkpoint at Epoch {epoch:02d} (Macro Dice: {macro_dice:.4f})", flush=True)
            else:
                patience_counter += 1
                if patience_counter >= early_stopping_patience:
                    print(f"\nEarly stopping triggered at Epoch {epoch} (patience={early_stopping_patience})", flush=True)
                    break

        if history:
            with open(MODEL_SAVE_DIR / "training_history.json", "w") as f:
                json.dump(history, f, indent=2)

    # 1. Load best checkpoint
    print(f"\nLoading best checkpoint: {checkpoint_path}", flush=True)
    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=False)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    # SHA-256
    with open(checkpoint_path, "rb") as f:
        model_sha256 = hashlib.sha256(f.read()).hexdigest()
    with open(MODEL_SAVE_DIR / "model_sha256.txt", "w") as f:
        f.write(model_sha256 + "\n")
    with open(RESULTS_DIR / "model_sha256.txt", "w") as f:
        f.write(model_sha256 + "\n")

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
        "global_metrics": val_metrics_opt,
        "source_breakdown": val_source_stats,
        "oil_size_stratification": val_size_stats,
        "threshold_sweep_results": threshold_results
    }
    with open(MODEL_SAVE_DIR / "validation_metrics.json", "w") as f:
        json.dump(val_report, f, indent=2)
    with open(RESULTS_DIR / "validation_metrics.json", "w") as f:
        json.dump(val_report, f, indent=2)
    with open(RESULTS_DIR / "threshold_sweep.json", "w") as f:
        json.dump(threshold_results, f, indent=2)

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
        "global_metrics": test_metrics,
        "source_breakdown": test_source_stats,
        "oil_size_stratification": test_size_stats
    }
    with open(MODEL_SAVE_DIR / "internal_test_metrics.json", "w") as f:
        json.dump(test_report, f, indent=2)
    with open(RESULTS_DIR / "internal_test_metrics.json", "w") as f:
        json.dump(test_report, f, indent=2)
    with open(RESULTS_DIR / "source_breakdown.json", "w") as f:
        json.dump({"validation": val_source_stats, "internal_test": test_source_stats}, f, indent=2)
    with open(RESULTS_DIR / "size_stratification.json", "w") as f:
        json.dump({"validation": val_size_stats, "internal_test": test_size_stats}, f, indent=2)

    # 5. Load V1 Baseline Model for Comparison & Visual Side-by-Side
    v1_checkpoint_path = MODEL_V1_DIR / "optical_oil_seg_unet_resnet18_v1.pth"
    model_v1 = None
    if v1_checkpoint_path.exists():
        model_v1 = OpticalUNetResNet18(pretrained=False, num_classes=1).to(device)
        v1_ckpt = torch.load(v1_checkpoint_path, map_location=device, weights_only=False)
        model_v1.load_state_dict(v1_ckpt["model_state_dict"])
        model_v1.eval()

    # Generate V1 predictions on validation and test for comparison
    v1_val_metrics = None
    v1_test_metrics = None
    if model_v1 is not None:
        v1_val_metrics, _, v1_val_probs, _ = evaluate_dataset(model_v1, val_loader, device, threshold=0.80)
        v1_test_metrics, _, v1_test_probs, _ = evaluate_dataset(model_v1, test_loader, device, threshold=0.80)
        v1_val_source = stratify_by_source(val_true, (v1_val_probs >= 0.80).astype(np.uint8), val_items)
        v1_test_source = stratify_by_source(test_true, (v1_test_probs >= 0.80).astype(np.uint8), test_items)

        comparison = {
            "validation": {
                "v1_mados_dice": v1_val_source.get("MADOS_Sentinel2", {}).get("dice", 0.0),
                "v2_mados_dice": val_source_stats.get("MADOS_Sentinel2", {}).get("dice", 0.0),
                "mados_dice_delta": val_source_stats.get("MADOS_Sentinel2", {}).get("dice", 0.0) - v1_val_source.get("MADOS_Sentinel2", {}).get("dice", 0.0),
                "v1_kerf_dice": v1_val_source.get("Kerf_Drone_Oil_Spill", {}).get("dice", 0.0),
                "v2_kerf_dice": val_source_stats.get("Kerf_Drone_Oil_Spill", {}).get("dice", 0.0),
                "kerf_dice_delta": val_source_stats.get("Kerf_Drone_Oil_Spill", {}).get("dice", 0.0) - v1_val_source.get("Kerf_Drone_Oil_Spill", {}).get("dice", 0.0),
            },
            "internal_test": {
                "v1_mados_dice": v1_test_source.get("MADOS_Sentinel2", {}).get("dice", 0.0),
                "v2_mados_dice": test_source_stats.get("MADOS_Sentinel2", {}).get("dice", 0.0),
                "mados_dice_delta": test_source_stats.get("MADOS_Sentinel2", {}).get("dice", 0.0) - v1_test_source.get("MADOS_Sentinel2", {}).get("dice", 0.0)
            }
        }
        with open(RESULTS_DIR / "comparison_v1_vs_v2.json", "w") as f:
            json.dump(comparison, f, indent=2)

    # 6. Generate 4-Panel Side-by-Side Visualizations: [RGB, GroundTruth, V1_Pred, V2_Pred]
    print(f"\nGenerating side-by-side diagnostic visual panels in {RESULTS_DIR.relative_to(PROJECT_ROOT)}...", flush=True)
    all_eval_sets = [
        ("val", val_items, val_true, v1_val_probs if model_v1 else val_probs, val_probs, (val_probs >= best_threshold).astype(np.uint8)),
        ("test", test_items, test_true, v1_test_probs if model_v1 else test_probs, test_probs, test_pred)
    ]

    for split_name, items_list, y_true_arr, v1_prob_arr, v2_prob_arr, v2_pred_arr in all_eval_sets:
        v1_pred_arr = (v1_prob_arr >= 0.80).astype(np.uint8)
        selected_samples = []

        for i, item in enumerate(items_list):
            if item["is_oil_positive"]:
                t_arr = y_true_arr[i, 0]
                p2_arr = v2_pred_arr[i, 0]
                m2 = compute_segmentation_metrics(t_arr, p2_arr)
                if len([s for s in selected_samples if s["dataset"] == item["source_dataset"] and s["type"] == "OIL_POSITIVE"]) < 4:
                    selected_samples.append({"idx": i, "type": "OIL_POSITIVE", "iou": m2["foreground_iou"], "item": item, "dataset": item["source_dataset"]})
            else:
                if len([s for s in selected_samples if s["dataset"] == item["source_dataset"] and s["type"] == "CLEAN_NEGATIVE"]) < 2:
                    selected_samples.append({"idx": i, "type": "CLEAN_NEGATIVE", "item": item, "dataset": item["source_dataset"]})

        for s in selected_samples:
            i = s["idx"]
            item = s["item"]
            im_p = item["image_path"]
            with Image.open(im_p) as im:
                im_rgb = im.convert("RGB").resize(IMAGE_SIZE, Image.Resampling.BILINEAR)

            gt_vis = Image.fromarray((y_true_arr[i, 0] * 255).astype(np.uint8)).convert("RGB")
            v1_vis = Image.fromarray((v1_pred_arr[i, 0] * 255).astype(np.uint8)).convert("RGB")
            v2_vis = Image.fromarray((v2_pred_arr[i, 0] * 255).astype(np.uint8)).convert("RGB")

            # 4-Panel composite: [RGB | GT | V1 | V2]
            w, h = IMAGE_SIZE
            panel = Image.new("RGB", (w * 4, h))
            panel.paste(im_rgb, (0, 0))
            panel.paste(gt_vis, (w, 0))
            panel.paste(v1_vis, (w * 2, 0))
            panel.paste(v2_vis, (w * 3, 0))

            out_fname = f"panel_{split_name}_{s['type'].lower()}_{item['source_dataset'][:4].lower()}_{item['image_id']}.jpg"
            panel.save(RESULTS_DIR / out_fname, quality=90)

    # 7. Update Model Registry
    if REGISTRY_PATH.exists():
        with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
            reg_data = json.load(f)
    else:
        reg_data = {"models": []}

    seg_entry = {
        "model_id": "optical-oil-seg-unet-resnet18-v2",
        "version": "2.0.0",
        "modality": "OPTICAL_RGB",
        "status": "EXPERIMENTAL",
        "task": "OPTICAL_OIL_SPILL_SEGMENTATION",
        "architecture": "OpticalUNetResNet18V2",
        "encoder": "ResNet-18 ImageNet (ASPP + Multi-Scale Feature Fusion)",
        "checkpoint_path": str(checkpoint_path.relative_to(PROJECT_ROOT)),
        "sha256": model_sha256,
        "operating_threshold": best_threshold,
        "validation_metrics": val_report,
        "internal_test_metrics": test_report,
        "external_test_status": "SEALED — NOT EVALUATED",
        "registered_at": "2026-09-20T10:15:00Z"
    }

    if isinstance(reg_data.get("models"), dict):
        reg_data["models"]["optical-oil-seg-unet-resnet18-v2"] = seg_entry
    else:
        reg_data["models"] = reg_data.get("models", [])
        existing_idx = next((i for i, m in enumerate(reg_data["models"]) if m.get("model_id") == "optical-oil-seg-unet-resnet18-v2"), None)
        if existing_idx is not None:
            reg_data["models"][existing_idx] = seg_entry
        else:
            reg_data["models"].append(seg_entry)

    with open(REGISTRY_PATH, "w", encoding="utf-8") as f:
        json.dump(reg_data, f, indent=2)

    # Print Final Summary
    print("\n" + "=" * 80, flush=True)
    print("OPTICAL OIL SPILL SEGMENTATION V2 EVALUATION RESULTS", flush=True)
    print("=" * 80, flush=True)
    print(f"Model Checkpoint:     optical_oil_segmentation_v2.pth", flush=True)
    print(f"Operating Threshold:  {best_threshold:.2f}", flush=True)
    print("-" * 80, flush=True)
    print("VALIDATION PERFORMANCE (N=730):", flush=True)
    print(f"  MADOS Dice:         {val_source_stats.get('MADOS_Sentinel2', {}).get('dice', 0.0):.4f} (IoU: {val_source_stats.get('MADOS_Sentinel2', {}).get('foreground_iou', 0.0):.4f}, Rec: {val_source_stats.get('MADOS_Sentinel2', {}).get('recall', 0.0):.4f})", flush=True)
    print(f"  KERF Dice:          {val_source_stats.get('Kerf_Drone_Oil_Spill', {}).get('dice', 0.0):.4f} (IoU: {val_source_stats.get('Kerf_Drone_Oil_Spill', {}).get('foreground_iou', 0.0):.4f}, Rec: {val_source_stats.get('Kerf_Drone_Oil_Spill', {}).get('recall', 0.0):.4f})", flush=True)
    print(f"  Global Mean IoU:    {val_metrics_opt['mean_iou']:.4f}", flush=True)
    print(f"  Global Dice:        {val_metrics_opt['dice']:.4f}", flush=True)
    print(f"  Global Precision:   {val_metrics_opt['precision']:.4f}", flush=True)
    print(f"  Global Recall:      {val_metrics_opt['recall']:.4f}", flush=True)
    print(f"  Global FPR:         {val_metrics_opt['fpr']:.4f}", flush=True)
    print("-" * 80, flush=True)
    print("INTERNAL TEST PERFORMANCE (N=708, Locked Threshold):", flush=True)
    for src, s in test_source_stats.items():
        print(f"  [{src}] (N={s['total_samples']}, Oil+={s['oil_positive_samples']}):", flush=True)
        print(f"    Mean IoU: {s['mean_iou']:.4f}, Fg-IoU: {s['foreground_iou']:.4f}, Dice: {s['dice']:.4f}, Prec: {s['precision']:.4f}, Rec: {s['recall']:.4f}, FPR: {s['fpr']:.4f}", flush=True)
    print("-" * 80, flush=True)
    print("Oil-Size Stratification (Internal Test):", flush=True)
    for sz, s in test_size_stats.items():
        if s.get("status") == "INSUFFICIENT_SAMPLE_SIZE":
            print(f"  [{sz}]: N={s['sample_count']} -> INSUFFICIENT_SAMPLE_SIZE", flush=True)
        else:
            print(f"  [{sz}]: N={s['sample_count']} -> Fg-IoU: {s['foreground_iou']:.4f}, Dice: {s['dice']:.4f}, Prec: {s['precision']:.4f}, Rec: {s['recall']:.4f}", flush=True)
    print("=" * 80, flush=True)
    print("V2 Training & Independent Evaluation COMPLETE.", flush=True)


if __name__ == "__main__":
    train_and_validate()
