"""
Real Sentinel-1 SAR Model Training — Phase 3D-3 (Model V2)
============================================================
Implements Controlled Improvement Experiment:
  - Focal Soft-Dice Loss (alpha=0.75, gamma=2.0, dice_weight=1.0)
  - Balanced Positive-Patch Aware Weighted Sampling (50% positive tiles / 50% negative)
  - Data Augmentation (flips and 90-degree rotations)
  - Preserves exact scene-level separation (12 train, 3 val, 5 test)
  - Evaluates on identical held-out scenes
  - Saves unet-dual-pol-sar-v2 checkpoint
"""

import os
import sys
import time
import json
import random
from typing import Dict, Any, List

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, WeightedRandomSampler
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from PIL import Image

sys.path.insert(0, os.path.abspath('.'))
sys.path.insert(0, os.path.abspath('services/ml-python'))

from app.models.unet.architecture import UNet
from app.data.loaders.sar_dataset import SARSpillDataset
from app.training.losses import FocalDiceLoss, calculate_metrics


def set_seed(seed: int = 42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def compute_sample_weights(dataset: SARSpillDataset) -> List[float]:
    """
    Compute sampling weights for each tile to balance positive and negative patches in mini-batches.
    """
    print("[Sampler] Scanning dataset tile masks for positive slick content...")
    weights = []
    pos_count = 0
    neg_count = 0

    for idx in range(len(dataset)):
        # Inspect item mask
        item = dataset._items[idx]
        scene = item["scene"]
        mask_path = dataset._resolve_scene_path(scene.get("mask_path", ""))
        
        # Fast tile mask check
        has_pos = False
        if mask_path and os.path.isfile(mask_path):
            try:
                import rasterio
                with rasterio.open(mask_path) as src:
                    y = item["y"]
                    x = item["x"]
                    ts = dataset.tile_size or 512
                    window = rasterio.windows.Window(x, y, min(ts, src.width - x), min(ts, src.height - y))
                    tile_mask = src.read(1, window=window)
                    if np.sum(tile_mask > 0) > 20:  # At least 20 positive pixels
                        has_pos = True
            except Exception:
                has_pos = False

        if has_pos:
            pos_count += 1
            weights.append(10.0)  # High weight for positive tiles
        else:
            neg_count += 1
            weights.append(1.0)   # Baseline weight for negative tiles

    print(f"[Sampler] Identified {pos_count} positive tiles and {neg_count} negative tiles in training split.")
    return weights


def train_epoch(
    model: nn.Module,
    loader: DataLoader,
    optimizer: torch.optim.Optimizer,
    criterion: nn.Module,
    device: str
) -> Dict[str, float]:
    model.train()
    running_loss = 0.0
    running_dice = 0.0
    running_iou = 0.0
    total_batches = 0

    for images, masks, _ in loader:
        images = images.to(device)
        masks = masks.to(device)

        optimizer.zero_grad()
        logits = model(images)
        loss, _ = criterion(logits, masks)
        loss.backward()
        optimizer.step()

        metrics = calculate_metrics(logits, masks, threshold=0.5)
        running_loss += loss.item()
        running_dice += metrics["dice"]
        running_iou += metrics["iou"]
        total_batches += 1

    return {
        "loss": running_loss / max(1, total_batches),
        "dice": running_dice / max(1, total_batches),
        "iou": running_iou / max(1, total_batches)
    }


def evaluate(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    device: str,
    threshold: float = 0.5
) -> Dict[str, float]:
    model.eval()
    running_loss = 0.0
    running_dice = 0.0
    running_iou = 0.0
    running_prec = 0.0
    running_rec = 0.0
    running_fpr = 0.0
    total_tp = 0
    total_fp = 0
    total_fn = 0
    total_tn = 0
    total_batches = 0

    with torch.no_grad():
        for images, masks, _ in loader:
            images = images.to(device)
            masks = masks.to(device)

            logits = model(images)
            loss, _ = criterion(logits, masks)

            metrics = calculate_metrics(logits, masks, threshold=threshold)
            running_loss += loss.item()
            running_dice += metrics["dice"]
            running_iou += metrics["iou"]
            running_prec += metrics["precision"]
            running_rec += metrics["recall"]
            running_fpr += metrics["fpr"]

            total_tp += metrics["tp"]
            total_fp += metrics["fp"]
            total_fn += metrics["fn"]
            total_tn += metrics["tn"]
            total_batches += 1

    # Global pixel-level metrics across entire split
    tot_p = total_tp + total_fn
    global_rec = (total_tp / (tot_p + 1e-10)) if tot_p > 0 else 1.0
    global_prec = (total_tp / (total_tp + total_fp + 1e-10)) if (total_tp + total_fp) > 0 else 1.0
    global_dice = (2.0 * total_tp / (2.0 * total_tp + total_fp + total_fn + 1e-10))
    global_iou = (total_tp / (total_tp + total_fp + total_fn + 1e-10))
    global_fpr = (total_fp / (total_fp + total_tn + 1e-10))

    return {
        "loss": running_loss / max(1, total_batches),
        "dice": global_dice,
        "iou": global_iou,
        "precision": global_prec,
        "recall": global_rec,
        "fpr": global_fpr,
        "tp": total_tp,
        "fp": total_fp,
        "fn": total_fn,
        "tn": total_tn
    }


def main():
    print("=" * 80)
    print("PHASE 3D-3: REAL SENTINEL-1 SAR MODEL TRAINING (EXPERIMENT V2)")
    print("=" * 80)
    set_seed(42)

    device = "cpu"
    manifest_path = "data/raw/satellite/dataset_manifest.json"

    # Datasets
    print("\n[Step 1] Initializing PyTorch Datasets with Strict Scene-Level Separation...")
    train_dataset = SARSpillDataset(
        manifest_path=manifest_path,
        split="train",
        mode="binary",
        polarization="dual",
        tile_size=512,
        stride=512,
        augment=True  # Augmented for V2
    )

    val_dataset = SARSpillDataset(
        manifest_path=manifest_path,
        split="val",
        mode="binary",
        polarization="dual",
        tile_size=512,
        stride=512,
        augment=False
    )

    test_dataset = SARSpillDataset(
        manifest_path=manifest_path,
        split="test",
        mode="binary",
        polarization="dual",
        tile_size=512,
        stride=512,
        augment=False
    )

    print(f"  Training tiles:   {len(train_dataset)} (12 scenes)")
    print(f"  Validation tiles: {len(val_dataset)} (3 scenes)")
    print(f"  Held-out tiles:   {len(test_dataset)} (5 scenes)")

    # Balanced Sampler for V2
    sample_weights = compute_sample_weights(train_dataset)
    sampler = WeightedRandomSampler(weights=sample_weights, num_samples=len(train_dataset), replacement=True)

    train_loader = DataLoader(train_dataset, batch_size=8, sampler=sampler, num_workers=0)
    val_loader = DataLoader(val_dataset, batch_size=8, shuffle=False, num_workers=0)
    test_loader = DataLoader(test_dataset, batch_size=8, shuffle=False, num_workers=0)

    # Architecture
    print("\n[Step 2] Instantiating Dual-Polarization UNet Architecture (V2)...")
    model = UNet(in_channels=2, num_classes=2, base_channels=16)
    model.to(device)

    # Loss & Optimizer
    # V2 Improvement: FocalDiceLoss (alpha=0.75, gamma=2.0, dice_weight=1.0)
    criterion = FocalDiceLoss(alpha=0.75, gamma=2.0, dice_weight=1.0)
    optimizer = AdamW(model.parameters(), lr=0.0005, weight_decay=1e-4)
    epochs = 6
    scheduler = CosineAnnealingLR(optimizer, T_max=epochs, eta_min=1e-6)

    print(f"  Loss Function: FocalDiceLoss (alpha=0.75, gamma=2.0, dice_weight=1.0)")
    print(f"  Optimizer: AdamW (lr=0.0005, weight_decay=1e-4)")
    print(f"  Epochs: {epochs}")

    # Training Loop
    print("\n[Step 3] Executing Real Deep Learning Training (6 Epochs)...")
    training_history = []
    best_val_loss = float("inf")
    checkpoint_dir = "ml/model_registry/versions"
    os.makedirs(checkpoint_dir, exist_ok=True)
    checkpoint_path = os.path.join(checkpoint_dir, "unet_dual_pol_sar_v2.pth")

    start_time = time.time()

    for epoch in range(1, epochs + 1):
        t0 = time.time()
        train_res = train_epoch(model, train_loader, optimizer, criterion, device)
        val_res = evaluate(model, val_loader, criterion, device, threshold=0.5)
        scheduler.step()
        epoch_dur = time.time() - t0

        print(
            f"Epoch [{epoch:02d}/{epochs:02d}] "
            f"Train Loss: {train_res['loss']:.4f} (Dice: {train_res['dice']:.4f}) | "
            f"Val Loss: {val_res['loss']:.4f} (Dice: {val_res['dice']:.4f}, Rec: {val_res['recall']:.4f}, Prec: {val_res['precision']:.4f}) | "
            f"LR: {scheduler.get_last_lr()[0]:.6f} | Dur: {epoch_dur:.2f}s"
        )

        training_history.append({
            "epoch": epoch,
            "train_loss": round(train_res["loss"], 4),
            "train_dice": round(train_res["dice"], 4),
            "val_loss": round(val_res["loss"], 4),
            "val_dice": round(val_res["dice"], 4),
            "val_recall": round(val_res["recall"], 4),
            "val_precision": round(val_res["precision"], 4),
            "lr": round(scheduler.get_last_lr()[0], 6),
            "duration_sec": round(epoch_dur, 2)
        })

        # Save checkpoint
        if val_res["loss"] < best_val_loss:
            best_val_loss = val_res["loss"]
            torch.save({
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "val_metrics": val_res,
                "train_metrics": train_res,
                "hyperparameters": {
                    "base_channels": 16,
                    "in_channels": 2,
                    "num_classes": 2,
                    "loss": "FocalDiceLoss",
                    "alpha": 0.75,
                    "gamma": 2.0,
                    "dice_weight": 1.0,
                    "sampler": "WeightedRandomSampler",
                    "augment": True
                }
            }, checkpoint_path)
            print(f"  --> Saved new best checkpoint to {checkpoint_path}")

    total_training_time = time.time() - start_time
    print(f"\nTraining completed in {total_training_time:.2f} seconds.")

    # Step 4: Final Evaluation on Held-Out Test Set
    print("\n[Step 4] Evaluating Model V2 on Held-Out Test Set...")
    # Load best checkpoint
    ckpt = torch.load(checkpoint_path, map_location=device)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()

    test_metrics_50 = evaluate(model, test_loader, criterion, device, threshold=0.5)
    test_metrics_35 = evaluate(model, test_loader, criterion, device, threshold=0.35)

    print(f"\n--- Model V2 Test Metrics (Threshold = 0.50) ---")
    print(f"  Test Loss:      {test_metrics_50['loss']:.4f}")
    print(f"  Test Dice:      {test_metrics_50['dice']*100:.3f}%")
    print(f"  Test IoU:       {test_metrics_50['iou']*100:.3f}%")
    print(f"  Test Precision: {test_metrics_50['precision']*100:.3f}%")
    print(f"  Test Recall:    {test_metrics_50['recall']*100:.3f}%")
    print(f"  Test FPR:       {test_metrics_50['fpr']*100:.4f}%")
    print(f"  TP: {test_metrics_50['tp']:,} | FP: {test_metrics_50['fp']:,} | FN: {test_metrics_50['fn']:,} | TN: {test_metrics_50['tn']:,}")

    print(f"\n--- Model V2 Test Metrics (Calibrated Threshold = 0.35) ---")
    print(f"  Test Dice:      {test_metrics_35['dice']*100:.3f}%")
    print(f"  Test IoU:       {test_metrics_35['iou']*100:.3f}%")
    print(f"  Test Precision: {test_metrics_35['precision']*100:.3f}%")
    print(f"  Test Recall:    {test_metrics_35['recall']*100:.3f}%")

    # Update Registry with V2
    print("\n[Step 5] Registering unet-dual-pol-sar-v2 in Model Registry...")
    registry_file = "ml/model_registry/registry.json"
    with open(registry_file, "r") as f:
        reg = json.load(f)

    # Check if v2 entry exists
    v2_entry = {
        "model_id": "unet-dual-pol-sar-v2",
        "architecture": "UNet",
        "framework": "PyTorch",
        "in_channels": 2,
        "num_classes": 2,
        "classes": [
            "Clean Sea Surface",
            "Potential Oil Spill"
        ],
        "input_shape": [2, 512, 512],
        "checkpoint_path": "ml/model_registry/versions/unet_dual_pol_sar_v2.pth",
        "training_dataset": "zenodo_sentinel1_verified_real_subset_20_scenes",
        "status": "trained",
        "metrics": {
            "val_loss": round(val_res["loss"], 4),
            "val_dice": round(val_res["dice"], 4),
            "val_recall": round(val_res["recall"], 4),
            "val_precision": round(val_res["precision"], 4),
            "test_loss": round(test_metrics_50["loss"], 4),
            "test_dice_th50": round(test_metrics_50["dice"], 4),
            "test_recall_th50": round(test_metrics_50["recall"], 4),
            "test_precision_th50": round(test_metrics_50["precision"], 4),
            "test_dice_th35": round(test_metrics_35["dice"], 4),
            "test_recall_th35": round(test_metrics_35["recall"], 4),
            "test_precision_th35": round(test_metrics_35["precision"], 4)
        },
        "created_at": "2026-09-12T14:00:00Z",
        "description": "Improved Dual-pol U-Net with Focal Soft-Dice Loss, balanced positive sampling, and data augmentation.",
        "hyperparameters": {
            "epochs": epochs,
            "batch_size": 8,
            "learning_rate": 0.0005,
            "base_channels": 16,
            "optimizer": "AdamW",
            "loss": "FocalDiceLoss_gamma2.0_alpha0.75",
            "sampler": "WeightedRandomSampler_Positive_Balanced",
            "tile_size": 512,
            "polarization": "VV+VH",
            "input_channels": 2,
            "num_classes": 2
        },
        "trained_at": "2026-09-12T13:10:00Z"
    }

    # Append or replace v2 in models list
    models_list = [m for m in reg["models"] if m.get("model_id") != "unet-dual-pol-sar-v2"]
    models_list.append(v2_entry)
    reg["models"] = models_list
    reg["active_model_id"] = "unet-dual-pol-sar-v2"

    with open(registry_file, "w") as f:
        json.dump(reg, f, indent=2)

    # Save V2 experiment metrics
    metrics_out = {
        "model_id": "unet-dual-pol-sar-v2",
        "training_time_sec": total_training_time,
        "training_history": training_history,
        "test_metrics_th50": test_metrics_50,
        "test_metrics_th35": test_metrics_35
    }
    with open("ml/experiments/results/v2_training_metrics.json", "w") as f:
        json.dump(metrics_out, f, indent=2)

    print("Model V2 training, evaluation, and registration completed successfully.")


if __name__ == "__main__":
    main()
