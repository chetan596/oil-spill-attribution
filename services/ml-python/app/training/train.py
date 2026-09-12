"""
Real Sentinel-1 SAR U-Net Model Training & Evaluation — Phase 3D-2
===================================================================

Trains a dual-polarization (VV+VH) U-Net segmentation model on the verified
real Sentinel-1 SAR dataset (20 scenes across Part I, Part II, Part III).

Key Features:
  - Reproducible random seeds
  - Scene-level splitting (no tile leakage)
  - Dual-polarization input: [2, 512, 512]
  - Combined loss: Weighted CrossEntropy + Soft Dice Loss
  - AdamW optimizer + Cosine Annealing learning rate schedule
  - Validation-based model checkpointing to ml/model_registry/versions/
  - Strict held-out evaluation on Part III Test set & Look-alikes
  - Visual output generation to ml/experiments/results/
  - Automated registry metadata update in ml/model_registry/registry.json
"""

import json
import os
import random
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple

from PIL import Image, ImageDraw
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader

# Add project root to path
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(BASE_DIR / "services" / "ml-python"))

from app.data.loaders.sar_dataset import SARSpillDataset
from app.models.unet.architecture import UNet
from app.training.losses import CombinedLoss, calculate_metrics

# ---------------------------------------------------------------------------
# Configuration & Hyperparameters
# ---------------------------------------------------------------------------
SEED = 42
MANIFEST_PATH = str(BASE_DIR / "data" / "raw" / "satellite" / "dataset_manifest.json")
CHECKPOINT_DIR = BASE_DIR / "ml" / "model_registry" / "versions"
RESULTS_DIR = BASE_DIR / "ml" / "experiments" / "results"
REGISTRY_PATH = BASE_DIR / "ml" / "model_registry" / "registry.json"

MODEL_ID = "unet-dual-pol-sar-v1"
CHECKPOINT_NAME = "unet_dual_pol_sar_v1.pth"
CHECKPOINT_PATH = CHECKPOINT_DIR / CHECKPOINT_NAME

# Hyperparameters
NUM_EPOCHS = 6
BATCH_SIZE = 8
LEARNING_RATE = 5e-4
WEIGHT_DECAY = 1e-4
TILE_SIZE = 512
STRIDE = 512
IN_CHANNELS = 2
NUM_CLASSES = 2
BASE_CHANNELS = 16
DEVICE = "cpu"  # CPU training for this environment


def set_seed(seed: int = SEED):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def create_dataloaders() -> Tuple[DataLoader, DataLoader, DataLoader, Dict[str, Any]]:
    """Build scene-separated DataLoaders for train, val, and test."""
    train_ds = SARSpillDataset(
        manifest_path=MANIFEST_PATH,
        split="train",
        mode="binary",
        tile_size=TILE_SIZE,
        stride=STRIDE,
        polarization="VV+VH",
        augment=True,
    )
    val_ds = SARSpillDataset(
        manifest_path=MANIFEST_PATH,
        split="val",
        mode="binary",
        tile_size=TILE_SIZE,
        stride=STRIDE,
        polarization="VV+VH",
        augment=False,
    )
    test_ds = SARSpillDataset(
        manifest_path=MANIFEST_PATH,
        split="test",
        mode="binary",
        tile_size=TILE_SIZE,
        stride=STRIDE,
        polarization="VV+VH",
        augment=False,
    )

    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=0)
    test_loader = DataLoader(test_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=0)

    dataset_stats = {
        "train_scenes": len(train_ds._scenes),
        "train_tiles": len(train_ds),
        "val_scenes": len(val_ds._scenes),
        "val_tiles": len(val_ds),
        "test_scenes": len(test_ds._scenes),
        "test_tiles": len(test_ds),
    }
    return train_loader, val_loader, test_loader, dataset_stats


def train_one_epoch(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    optimizer: torch.optim.Optimizer,
    device: str,
    epoch: int = 1,
) -> Tuple[float, Dict[str, float]]:
    model.train()
    total_loss = 0.0
    all_preds = []
    all_targets = []

    for b_idx, (images, masks, _) in enumerate(loader):
        images = images.to(device)
        masks = masks.to(device)

        optimizer.zero_grad()
        logits = model(images)
        loss, loss_dict = criterion(logits, masks)
        loss.backward()
        optimizer.step()

        total_loss += loss.item() * images.size(0)
        all_preds.append(logits.detach().cpu())
        all_targets.append(masks.detach().cpu())
        print(f"  [Epoch {epoch:02d}] Batch {b_idx+1:02d}/{len(loader):02d} | Batch Loss: {loss.item():.4f}", flush=True)

    avg_loss = total_loss / len(loader.dataset)
    cat_preds = torch.cat(all_preds, dim=0)
    cat_targets = torch.cat(all_targets, dim=0)
    metrics = calculate_metrics(cat_preds, cat_targets)
    metrics["loss"] = avg_loss
    return avg_loss, metrics


def evaluate(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    device: str,
) -> Tuple[float, Dict[str, float]]:
    model.eval()
    total_loss = 0.0
    all_preds = []
    all_targets = []

    with torch.no_grad():
        for images, masks, _ in loader:
            images = images.to(device)
            masks = masks.to(device)

            logits = model(images)
            loss, _ = criterion(logits, masks)

            total_loss += loss.item() * images.size(0)
            all_preds.append(logits.cpu())
            all_targets.append(masks.cpu())

    avg_loss = total_loss / max(len(loader.dataset), 1)
    cat_preds = torch.cat(all_preds, dim=0)
    cat_targets = torch.cat(all_targets, dim=0)
    metrics = calculate_metrics(cat_preds, cat_targets)
    metrics["loss"] = avg_loss
    return avg_loss, metrics


def evaluate_lookalikes(model: nn.Module, manifest_path: str, device: str) -> Dict[str, Any]:
    """Specifically evaluate false positive behavior on look-alike scenes."""
    lookalike_ds = SARSpillDataset(
        manifest_path=manifest_path,
        split=None,
        mode="binary",
        tile_size=TILE_SIZE,
        stride=STRIDE,
        polarization="VV+VH",
        augment=False,
    )
    # Filter to lookalike scenes
    lookalike_indices = [
        i for i, item in enumerate(lookalike_ds._items)
        if "lookalike" in item["scene"]["scene_id"] or "lookalike" in item["scene"].get("category", "")
    ]

    model.eval()
    total_lookalike_pixels = 0
    false_positive_pixels = 0

    with torch.no_grad():
        for idx in lookalike_indices:
            img, mask, _ = lookalike_ds[idx]
            img = img.unsqueeze(0).to(device)
            probs = model.predict_probabilities(img)
            pred_mask = (probs[0, 1, :, :] >= 0.5).long().cpu().numpy()

            total_lookalike_pixels += pred_mask.size
            false_positive_pixels += int(np.sum(pred_mask == 1))

    lookalike_fpr = false_positive_pixels / max(total_lookalike_pixels, 1)
    return {
        "lookalike_total_pixels": total_lookalike_pixels,
        "lookalike_fp_pixels": false_positive_pixels,
        "lookalike_fpr": float(lookalike_fpr),
        "lookalike_specificity": float(1.0 - lookalike_fpr),
    }


def generate_visual_results(model: nn.Module, test_loader: DataLoader, device: str):
    """Generate visual prediction comparison panels using PIL."""
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    model.eval()

    saved_count = 0
    with torch.no_grad():
        for batch_idx, (images, masks, metas) in enumerate(test_loader):
            images_dev = images.to(device)
            probs = model.predict_probabilities(images_dev).cpu().numpy()

            for i in range(images.size(0)):
                vv_band = images[i, 0].numpy()
                vh_band = images[i, 1].numpy()
                gt_mask = masks[i].numpy()
                pred_prob = probs[i, 1]
                pred_mask = (pred_prob >= 0.5).astype(np.uint8)

                # Only save tiles with oil in GT or prediction, plus up to 2 negative samples
                has_oil = (np.sum(gt_mask) > 0) or (np.sum(pred_mask) > 0)
                if not has_oil and saved_count >= 2:
                    continue

                # Prepare 5 panels (512x512 RGB)
                # 1. VV Grayscale
                vv_rgb = np.stack([np.clip(vv_band * 255, 0, 255).astype(np.uint8)] * 3, axis=-1)

                # 2. VH Grayscale
                vh_rgb = np.stack([np.clip(vh_band * 255, 0, 255).astype(np.uint8)] * 3, axis=-1)

                # 3. Ground Truth (Black with Red slick)
                gt_rgb = np.zeros((512, 512, 3), dtype=np.uint8)
                gt_rgb[gt_mask == 1] = [230, 40, 40]

                # 4. Model Prediction (Black with Cyan slick)
                pred_rgb = np.zeros((512, 512, 3), dtype=np.uint8)
                pred_rgb[pred_mask == 1] = [30, 200, 240]

                # 5. Overlay
                overlay_rgb = vv_rgb.copy()
                tp = (gt_mask == 1) & (pred_mask == 1)
                fp = (gt_mask == 0) & (pred_mask == 1)
                fn = (gt_mask == 1) & (pred_mask == 0)
                overlay_rgb[fn] = [230, 40, 40]      # Red = False Negative
                overlay_rgb[fp] = [30, 200, 240]     # Cyan = False Positive
                overlay_rgb[tp] = [255, 230, 0]      # Yellow = True Positive

                # Combine horizontally into canvas: (512+60, 512*5 + 4*10) = (572, 2600)
                spacing = 10
                header_h = 50
                canvas_w = 512 * 5 + spacing * 4
                canvas_h = 512 + header_h
                canvas = Image.new("RGB", (canvas_w, canvas_h), color=(20, 24, 30))
                draw = ImageDraw.Draw(canvas)

                # Header text
                scene_name = metas["scene_id"][i]
                offset_str = f"({metas['tile_offset'][0][i]},{metas['tile_offset'][1][i]})"
                header_text = f"REAL MODEL PREDICTION — Scene: {scene_name} Offset: {offset_str} — GT Oil: {int(np.sum(gt_mask))}px | Pred Oil: {int(np.sum(pred_mask))}px"
                draw.text((15, 15), header_text, fill=(255, 255, 255))

                # Paste panels
                panels = [
                    (vv_rgb, "1. SAR VV (Norm)"),
                    (vh_rgb, "2. SAR VH (Norm)"),
                    (gt_rgb, f"3. Ground Truth ({int(np.sum(gt_mask))} px)"),
                    (pred_rgb, f"4. Real Model Prediction ({int(np.sum(pred_mask))} px)"),
                    (overlay_rgb, "5. Overlay (Yellow=TP, Cyan=FP, Red=FN)"),
                ]

                for p_idx, (p_arr, p_title) in enumerate(panels):
                    x_pos = p_idx * (512 + spacing)
                    y_pos = header_h
                    p_img = Image.fromarray(p_arr)
                    canvas.paste(p_img, (x_pos, y_pos))
                    draw.text((x_pos + 10, y_pos + 10), p_title, fill=(255, 255, 255))

                out_path = RESULTS_DIR / f"prediction_sample_{saved_count+1}_{scene_name}.png"
                canvas.save(out_path)
                print(f"  [VISUAL] Saved real prediction panel to: {out_path.name}")
                saved_count += 1

                if saved_count >= 5:
                    return


def update_model_registry(val_metrics: Dict[str, float], test_metrics: Dict[str, float], lookalike_metrics: Dict[str, Any]):
    """Update registry.json with actual trained status, metrics, and parameters."""
    if not REGISTRY_PATH.exists():
        return

    with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
        registry = json.load(f)

    for entry in registry.get("models", []):
        if entry.get("model_id") == MODEL_ID:
            entry["status"] = "trained"
            entry["training_dataset"] = "zenodo_sentinel1_verified_real_subset_20_scenes"
            entry["checkpoint_path"] = f"ml/model_registry/versions/{CHECKPOINT_NAME}"
            entry["metrics"] = {
                "val_loss": round(val_metrics.get("loss", 0.0), 4),
                "val_iou": round(val_metrics.get("iou", 0.0), 4),
                "val_dice": round(val_metrics.get("dice", 0.0), 4),
                "val_precision": round(val_metrics.get("precision", 0.0), 4),
                "val_recall": round(val_metrics.get("recall", 0.0), 4),
                "test_loss": round(test_metrics.get("loss", 0.0), 4),
                "test_iou": round(test_metrics.get("iou", 0.0), 4),
                "test_dice": round(test_metrics.get("dice", 0.0), 4),
                "test_precision": round(test_metrics.get("precision", 0.0), 4),
                "test_recall": round(test_metrics.get("recall", 0.0), 4),
                "lookalike_fpr": round(lookalike_metrics.get("lookalike_fpr", 0.0), 4),
                "lookalike_specificity": round(lookalike_metrics.get("lookalike_specificity", 0.0), 4),
            }
            entry["hyperparameters"] = {
                "epochs": NUM_EPOCHS,
                "batch_size": BATCH_SIZE,
                "learning_rate": LEARNING_RATE,
                "optimizer": "AdamW",
                "loss": "Weighted_CrossEntropy_SoftDice",
                "tile_size": TILE_SIZE,
                "polarization": "VV+VH",
                "input_channels": IN_CHANNELS,
                "num_classes": NUM_CLASSES,
            }
            entry["trained_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    # Set as active model in registry
    registry["active_model_id"] = MODEL_ID

    with open(REGISTRY_PATH, "w", encoding="utf-8") as f:
        json.dump(registry, f, indent=2)
    print(f"  [REGISTRY] Updated {REGISTRY_PATH}")


def run_training():
    set_seed(SEED)
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 80)
    print(f"PHASE 3D-2: REAL SENTINEL-1 SAR U-NET TRAINING (MODEL: {MODEL_ID})")
    print("=" * 80)
    print(f"Device: {DEVICE}")
    print(f"Seed: {SEED}")
    print(f"Manifest: {MANIFEST_PATH}")
    print(f"Epochs: {NUM_EPOCHS} | Batch Size: {BATCH_SIZE} | LR: {LEARNING_RATE}")

    # 1. Dataloaders
    print("\n[STEP 1] Loading Dataset and Creating Splits...")
    train_loader, val_loader, test_loader, ds_stats = create_dataloaders()
    print(f"  Train: {ds_stats['train_scenes']} scenes ({ds_stats['train_tiles']} tiles)")
    print(f"  Val:   {ds_stats['val_scenes']} scenes ({ds_stats['val_tiles']} tiles)")
    print(f"  Test:  {ds_stats['test_scenes']} scenes ({ds_stats['test_tiles']} tiles)")

    # 2. Model Architecture
    print("\n[STEP 2] Initializing U-Net Architecture...")
    model = UNet(
        in_channels=IN_CHANNELS,
        num_classes=NUM_CLASSES,
        base_channels=BASE_CHANNELS,
        bilinear=True,
    ).to(DEVICE)
    total_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"  U-Net Initialized with {total_params:,} trainable parameters.")

    # 3. Loss & Optimizer
    # Severe class imbalance compensation: oil pixels represent ~1% of area
    class_weights = torch.tensor([1.0, 10.0], dtype=torch.float32, device=DEVICE)
    criterion = CombinedLoss(weight=1.0, dice_weight=1.5, class_weights=class_weights)
    optimizer = torch.optim.AdamW(model.parameters(), lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=NUM_EPOCHS, eta_min=1e-6)

    # 4. Training Loop
    print("\n[STEP 3] Executing Training Loop...")
    best_val_dice = -1.0
    best_epoch = 0
    training_history = []

    start_time = time.time()

    for epoch in range(1, NUM_EPOCHS + 1):
        epoch_start = time.time()
        print(f"\n--- Epoch {epoch:02d}/{NUM_EPOCHS:02d} ---", flush=True)
        train_loss, train_metrics = train_one_epoch(model, train_loader, criterion, optimizer, DEVICE, epoch=epoch)
        val_loss, val_metrics = evaluate(model, val_loader, criterion, DEVICE)
        scheduler.step()
        epoch_dur = time.time() - epoch_start

        # Track history
        epoch_log = {
            "epoch": epoch,
            "train_loss": round(train_loss, 4),
            "train_dice": round(train_metrics["dice"], 4),
            "train_iou": round(train_metrics["iou"], 4),
            "val_loss": round(val_loss, 4),
            "val_dice": round(val_metrics["dice"], 4),
            "val_iou": round(val_metrics["iou"], 4),
            "val_precision": round(val_metrics["precision"], 4),
            "val_recall": round(val_metrics["recall"], 4),
            "lr": round(scheduler.get_last_lr()[0], 6),
            "duration_sec": round(epoch_dur, 2),
        }
        training_history.append(epoch_log)

        # Checkpoint if best validation dice (or initial improvement)
        is_best = val_metrics["dice"] > best_val_dice
        if is_best:
            best_val_dice = val_metrics["dice"]
            best_epoch = epoch
            torch.save(
                {
                    "epoch": epoch,
                    "model_state_dict": model.state_dict(),
                    "optimizer_state_dict": optimizer.state_dict(),
                    "val_metrics": val_metrics,
                    "train_metrics": train_metrics,
                    "hyperparameters": {
                        "in_channels": IN_CHANNELS,
                        "num_classes": NUM_CLASSES,
                        "base_channels": BASE_CHANNELS,
                        "tile_size": TILE_SIZE,
                    },
                },
                CHECKPOINT_PATH,
            )

        best_marker = " *BEST*" if is_best else ""
        print(
            f"Epoch {epoch:02d}/{NUM_EPOCHS:02d} | "
            f"Train Loss: {train_loss:.4f} (Dice: {train_metrics['dice']:.4f}) | "
            f"Val Loss: {val_loss:.4f} (Dice: {val_metrics['dice']:.4f}, IoU: {val_metrics['iou']:.4f}, Rec: {val_metrics['recall']:.4f}) | "
            f"Time: {epoch_dur:.1f}s{best_marker}",
            flush=True,
        )

    total_training_time = time.time() - start_time
    print(f"\nTraining completed in {total_training_time:.1f}s. Best Epoch: {best_epoch} (Val Dice: {best_val_dice:.4f})")
    print(f"Saved best checkpoint to: {CHECKPOINT_PATH}")

    # 5. Load Best Checkpoint for Final Evaluation
    print("\n[STEP 4] Loading Best Model Checkpoint for Final Evaluation...")
    checkpoint = torch.load(CHECKPOINT_PATH, map_location=DEVICE)
    model.load_state_dict(checkpoint["model_state_dict"])
    val_loss, final_val_metrics = evaluate(model, val_loader, criterion, DEVICE)

    # 6. Evaluation on Held-Out Test Set
    print("\n[STEP 5] Evaluating on Held-Out Test Set (Part III)...")
    test_loss, test_metrics = evaluate(model, test_loader, criterion, DEVICE)
    print(f"  Test Loss:      {test_loss:.4f}")
    print(f"  Test IoU:       {test_metrics['iou']:.4f}")
    print(f"  Test Dice / F1: {test_metrics['dice']:.4f}")
    print(f"  Test Precision: {test_metrics['precision']:.4f}")
    print(f"  Test Recall:    {test_metrics['recall']:.4f}")
    print(f"  Test FPR:       {test_metrics['fpr']:.4f}")

    # 7. Evaluation on Look-Alikes
    print("\n[STEP 6] Evaluating Look-Alike False Positive Rate...")
    lookalike_metrics = evaluate_lookalikes(model, MANIFEST_PATH, DEVICE)
    print(f"  Look-alike False Positive Rate: {lookalike_metrics['lookalike_fpr']:.4%}")
    print(f"  Look-alike Specificity:         {lookalike_metrics['lookalike_specificity']:.4%}")

    # 8. Generate Visual Prediction Results
    print("\n[STEP 7] Generating Visual Prediction Comparison Panels...")
    generate_visual_results(model, test_loader, DEVICE)

    # 9. Update Model Registry
    print("\n[STEP 8] Updating Model Registry...")
    update_model_registry(final_val_metrics, test_metrics, lookalike_metrics)

    # 10. Save Experiment Metrics Log
    log_path = RESULTS_DIR / "training_metrics.json"
    with open(log_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "model_id": MODEL_ID,
                "dataset": "zenodo_sentinel1_verified_real_subset",
                "training_time_seconds": total_training_time,
                "best_epoch": best_epoch,
                "final_val_metrics": final_val_metrics,
                "test_metrics": test_metrics,
                "lookalike_metrics": lookalike_metrics,
                "training_history": training_history,
            },
            f,
            indent=2,
        )
    print(f"  Saved training log to: {log_path}")

    print("\n" + "=" * 80)
    print("TRAINING & EVALUATION COMPLETE")
    print("=" * 80)
    return {
        "val_metrics": final_val_metrics,
        "test_metrics": test_metrics,
        "lookalike_metrics": lookalike_metrics,
        "best_epoch": best_epoch,
        "checkpoint_path": str(CHECKPOINT_PATH),
    }


if __name__ == "__main__":
    run_training()
