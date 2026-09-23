"""
Real Sentinel-1 SAR Model Training — Phase V4
============================================
Corrected SAR Normalization Pipeline & Model V4 Training:
  - 40 Verified Real Sentinel-1 Scenes (640 total 512x512 tiles)
  - 28 Training Scenes (448 tiles) with 12 Oil Spill Scenes
  - 7 Validation Scenes (112 tiles) with 3 Oil Spill Scenes
  - 5 Held-Out Test Scenes (80 tiles) - identical to V1, V2, V3 test suite
  - Corrected Decibel-Aware Normalization (VV [-35, -5] dB, VH [-45, -15] dB)
  - Focal-Tversky Loss (alpha=0.3, beta=0.7, gamma=1.33)
  - Balanced 2.5x Positive Patch Sampling (conservative weighting)
  - Saves unet-dual-pol-sar-v4 checkpoint
"""

import os
import sys
import time
import json
import random
from typing import Dict, Any, List, Tuple

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, WeightedRandomSampler
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR

sys.path.insert(0, os.path.abspath('.'))
sys.path.insert(0, os.path.abspath('services/ml-python'))

from app.models.unet.architecture import UNet
from app.data.loaders.sar_dataset import SARSpillDataset
from app.models.registry import model_registry


def set_seed(seed: int = 42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


class FocalTverskyLoss(nn.Module):
    """
    Focal-Tversky Loss for class-imbalanced marine segmentation.
    Penalizes false positives and false negatives according to alpha and beta weights.
    """
    def __init__(self, alpha: float = 0.3, beta: float = 0.7, gamma: float = 1.33, smooth: float = 1e-6):
        super().__init__()
        self.alpha = alpha
        self.beta = beta
        self.gamma = gamma
        self.smooth = smooth

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        probs = torch.softmax(logits, dim=1)[:, 1] # Probability of oil slick class
        targets_f = targets.float()

        dims = (1, 2)
        tp = torch.sum(probs * targets_f, dim=dims)
        fp = torch.sum(probs * (1.0 - targets_f), dim=dims)
        fn = torch.sum((1.0 - probs) * targets_f, dim=dims)

        tversky = (tp + self.smooth) / (tp + self.alpha * fp + self.beta * fn + self.smooth)
        focal_tversky = torch.pow(1.0 - tversky, self.gamma)
        return torch.mean(focal_tversky)


def compute_sample_weights(dataset: SARSpillDataset, pos_weight: float = 2.5) -> List[float]:
    """Compute balanced patch weights (2.5x for positive patches)."""
    print(f"[Sampler] Scanning dataset tile masks (pos_weight={pos_weight})...")
    weights = []
    pos_count = 0
    neg_count = 0

    import rasterio
    ts = dataset.tile_size or 512

    for idx in range(len(dataset)):
        item = dataset._items[idx]
        scene = item["scene"]
        mask_path = dataset._resolve_scene_path(scene.get("mask_path", ""))

        has_pos = False
        if mask_path and os.path.isfile(mask_path):
            try:
                with rasterio.open(mask_path) as src:
                    y = item["y"]
                    x = item["x"]
                    window = rasterio.windows.Window(x, y, min(ts, src.width - x), min(ts, src.height - y))
                    tile_mask = src.read(1, window=window)
                    if np.sum(tile_mask > 0) > 20: # At least 20 positive pixels
                        has_pos = True
            except Exception:
                has_pos = False

        if has_pos:
            pos_count += 1
            weights.append(pos_weight)
        else:
            neg_count += 1
            weights.append(1.0)

    print(f"[Sampler] Identified {pos_count} positive slick tiles and {neg_count} negative tiles.")
    return weights


def train_epoch(model, loader, optimizer, criterion, device):
    model.train()
    running_loss = 0.0
    total_batches = 0

    for images, masks, _ in loader:
        images = images.to(device)
        masks = masks.to(device)

        optimizer.zero_grad()
        logits = model(images)
        loss = criterion(logits, masks)
        loss.backward()
        optimizer.step()

        running_loss += loss.item()
        total_batches += 1

    return {"loss": running_loss / max(1, total_batches)}


def evaluate_val_split(model, loader, criterion, device):
    model.eval()
    running_loss = 0.0
    total_batches = 0
    tp_tot, fp_tot, fn_tot, tn_tot = 0, 0, 0, 0

    with torch.no_grad():
        for images, masks, _ in loader:
            images = images.to(device)
            masks = masks.to(device)

            logits = model(images)
            loss = criterion(logits, masks)
            running_loss += loss.item()
            total_batches += 1

            probs = torch.softmax(logits, dim=1)[:, 1].cpu().numpy()
            targets = masks.cpu().numpy()

            preds = (probs >= 0.35).astype(np.uint8)
            tp_tot += int(np.sum((preds == 1) & (targets == 1)))
            fp_tot += int(np.sum((preds == 1) & (targets == 0)))
            fn_tot += int(np.sum((preds == 0) & (targets == 1)))
            tn_tot += int(np.sum((preds == 0) & (targets == 0)))

    iou = tp_tot / (tp_tot + fp_tot + fn_tot + 1e-10) * 100
    dice = 2 * tp_tot / (2 * tp_tot + fp_tot + fn_tot + 1e-10) * 100
    prec = tp_tot / (tp_tot + fp_tot + 1e-10) * 100
    rec = tp_tot / (tp_tot + fn_tot + 1e-10) * 100

    return {
        "loss": running_loss / max(1, total_batches),
        "iou": float(iou),
        "dice": float(dice),
        "precision": float(prec),
        "recall": float(rec),
        "tp": tp_tot, "fp": fp_tot, "fn": fn_tot, "tn": tn_tot
    }


def main():
    print("=" * 80)
    print("PHASE: V4 MODEL TRAINING (CORRECTED DECIBEL NORMALIZATION)")
    print("=" * 80)

    set_seed(42)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Using device: {device}")

    manifest_path = "data/raw/satellite/dataset_manifest.json"

    # Datasets
    train_dataset = SARSpillDataset(
        manifest_path=manifest_path,
        split="train",
        mode="binary",
        tile_size=512,
        polarization="dual",
        augment=True
    )
    val_dataset = SARSpillDataset(
        manifest_path=manifest_path,
        split="val",
        mode="binary",
        tile_size=512,
        polarization="dual",
        augment=False
    )

    print(f"Training dataset: {len(train_dataset)} tiles from 28 scenes")
    print(f"Validation dataset: {len(val_dataset)} tiles from 7 scenes")

    sample_weights = compute_sample_weights(train_dataset, pos_weight=2.5)
    sampler = WeightedRandomSampler(
        weights=sample_weights,
        num_samples=len(sample_weights),
        replacement=True
    )

    train_loader = DataLoader(train_dataset, batch_size=8, sampler=sampler, num_workers=0)
    val_loader = DataLoader(val_dataset, batch_size=8, shuffle=False, num_workers=0)

    # Initialize U-Net
    model = UNet(in_channels=2, num_classes=2, base_channels=16)
    model = model.to(device)

    criterion = FocalTverskyLoss(alpha=0.3, beta=0.7, gamma=1.33)
    optimizer = AdamW(model.parameters(), lr=5e-4, weight_decay=1e-4)
    num_epochs = 15
    scheduler = CosineAnnealingLR(optimizer, T_max=num_epochs, eta_min=1e-5)

    best_val_loss = float("inf")
    best_weights = None
    epoch_logs = []

    print(f"\nStarting training for {num_epochs} epochs...")
    for epoch in range(1, num_epochs + 1):
        t0 = time.time()
        train_res = train_epoch(model, train_loader, optimizer, criterion, device)
        val_res = evaluate_val_split(model, val_loader, criterion, device)
        scheduler.step()
        dt = time.time() - t0

        print(
            f"Epoch {epoch:02d}/{num_epochs:02d} [{dt:.1f}s] | "
            f"Train Loss: {train_res['loss']:.4f} | "
            f"Val Loss: {val_res['loss']:.4f} | "
            f"Val Dice (@0.35): {val_res['dice']:.2f}% (TP={val_res['tp']}, FP={val_res['fp']}, FN={val_res['fn']})"
        )

        log_entry = {
            "epoch": epoch,
            "train_loss": float(train_res["loss"]),
            "val_loss": float(val_res["loss"]),
            "val_dice": float(val_res["dice"]),
            "val_iou": float(val_res["iou"]),
            "lr": float(optimizer.param_groups[0]["lr"])
        }
        epoch_logs.append(log_entry)

        if val_res["loss"] < best_val_loss:
            best_val_loss = val_res["loss"]
            best_weights = {k: v.cpu().clone() for k, v in model.state_dict().items()}

    # Save V4 Checkpoint
    os.makedirs("ml/model_registry/versions", exist_ok=True)
    os.makedirs("docs/artifacts", exist_ok=True)
    os.makedirs("docs/model", exist_ok=True)

    v4_checkpoint_path = "ml/model_registry/versions/unet_dual_pol_sar_v4.pth"
    torch.save(best_weights if best_weights is not None else model.state_dict(), v4_checkpoint_path)
    print(f"\nSaved Model V4 checkpoint to: {v4_checkpoint_path}")

    # Register V4 in Model Registry
    reg_path = "ml/model_registry/registry.json"
    with open(reg_path, "r") as f:
        registry_data = json.load(f)

    # Filter out existing v4 entry if present
    registry_data["models"] = [m for m in registry_data["models"] if m.get("model_id") != "unet-dual-pol-sar-v4"]

    v4_entry = {
        "model_id": "unet-dual-pol-sar-v4",
        "architecture": "UNet",
        "framework": "PyTorch",
        "in_channels": 2,
        "num_classes": 2,
        "classes": ["Clean Sea Surface", "Potential Oil Spill"],
        "input_shape": [2, 512, 512],
        "checkpoint_path": "ml/model_registry/versions/unet_dual_pol_sar_v4.pth",
        "training_dataset": "zenodo_sentinel1_verified_real_expanded_40_scenes_corrected_db",
        "status": "experimental",
        "normalization": {
            "type": "Decibel_Calibrated_Clipping",
            "vv_range_db": [-35.0, -5.0],
            "vh_range_db": [-45.0, -15.0],
            "formula": "clip((value_db - min_db) / (max_db - min_db), 0, 1)"
        },
        "hyperparameters": {
            "epochs": num_epochs,
            "batch_size": 8,
            "learning_rate": 0.0005,
            "base_channels": 16,
            "optimizer": "AdamW",
            "loss": "FocalTverskyLoss_alpha0.3_beta0.7_gamma1.33",
            "sampler": "WeightedRandomSampler_Positive_2.5x",
            "tile_size": 512,
            "polarization": "VV+VH",
            "total_scenes": 40,
            "train_scenes": 28,
            "val_scenes": 7,
            "test_scenes": 5,
            "seed": 42
        },
        "created_at": "2026-09-14T00:00:00Z",
        "description": "Dual-pol U-Net trained on corrected decibel-normalized Sentinel-1 SAR imagery with Focal-Tversky loss."
    }
    registry_data["models"].append(v4_entry)

    with open(reg_path, "w") as f:
        json.dump(registry_data, f, indent=2)
    print("Registered unet-dual-pol-sar-v4 in ml/model_registry/registry.json")

    with open("docs/artifacts/v4-training-logs.json", "w") as f:
        json.dump(epoch_logs, f, indent=2)


if __name__ == "__main__":
    main()
