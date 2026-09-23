"""
Loss Experiment Runner for Part 0.8: Controlled Loss-Function Experiments.
=========================================================================

Isolates the training loss objective while strictly keeping identical:
- Dataset (28 train / 7 val / 5 locked test)
- Preprocessing (sentinel1_sigma0_db_v1)
- Model Architecture (UNet 2-channel, 2-class, base_channels 16, bilinear)
- Hardware & AMP configuration (cuda:0, FP16 GradScaler, batch size 2)
- Optimizer (AdamW lr=1e-4, wd=1e-4)
- Deterministic Seed (42)
- Early stopping policy (patience=7 on validation Dice)
"""

import os
import sys
import json
import time
import yaml
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)
if os.path.join(_REPO_ROOT, "services", "ml-python") not in sys.path:
    sys.path.insert(0, os.path.join(_REPO_ROOT, "services", "ml-python"))

from app.models.unet.architecture import UNet
from app.training.losses import CombinedLoss, FocalDiceLoss, FocalTverskyLoss
from ml.training.train_v6 import V6TileDataset, set_seed, compute_file_sha256, calculate_confusion_metrics


def build_loss_criterion(loss_type: str, loss_params: Dict[str, Any], device: torch.device) -> nn.Module:
    """Build standardized loss criterion instance."""
    l_type = loss_type.lower().strip()
    if l_type in ("combinedloss", "weighted_ce_dice", "baseline_loss", "high_fg_weight"):
        ce_w = loss_params.get("ce_weight", 1.0)
        dice_w = loss_params.get("dice_weight", 1.0)
        fg_w = loss_params.get("foreground_weight", 5.0)
        class_weights = torch.tensor([1.0, fg_w], dtype=torch.float32).to(device)
        return CombinedLoss(
            weight=ce_w,
            dice_weight=dice_w,
            class_weights=class_weights,
        )
    elif l_type in ("focaldiceloss", "focal_dice"):
        alpha = loss_params.get("alpha", 0.25)
        gamma = loss_params.get("gamma", 2.0)
        dice_w = loss_params.get("dice_weight", 1.0)
        return FocalDiceLoss(
            alpha=alpha,
            gamma=gamma,
            dice_weight=dice_w,
        )
    elif l_type in ("focaltverskyloss", "focal_tversky"):
        alpha = loss_params.get("alpha", 0.7)
        beta = loss_params.get("beta", 0.3)
        gamma = loss_params.get("gamma", 0.75)
        return FocalTverskyLoss(
            alpha=alpha,
            beta=beta,
            gamma=gamma,
        )
    else:
        raise ValueError(f"Unsupported loss_type: {loss_type}")


class ControlledLossTrainer:
    """Trainer for controlled loss-function experiments."""

    def __init__(
        self,
        experiment_id: str,
        loss_type: str,
        loss_params: Dict[str, Any],
        model_id: str,
        checkpoint_filename: str,
        config: Optional[Dict[str, Any]] = None,
        repo_root: Optional[str] = None,
    ):
        self.experiment_id = experiment_id
        self.loss_type = loss_type
        self.loss_params = loss_params
        self.model_id = model_id
        self.checkpoint_filename = checkpoint_filename
        self.config = config or {}
        self.repo_root = repo_root or _REPO_ROOT

        self.manifest_path = os.path.join(self.repo_root, self.config.get("manifest_path", "ml/datasets/manifest.json"))
        self.device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
        set_seed(self.config.get("seed", 42))

        # Model instantiation (STRICT UNET 2-CH, 2-CLASS)
        self.model = UNet(
            in_channels=self.config.get("in_channels", 2),
            num_classes=self.config.get("num_classes", 2),
            base_channels=self.config.get("base_channels", 16),
            bilinear=self.config.get("bilinear", True),
        ).to(self.device)

        # Build loss criterion
        self.criterion = build_loss_criterion(self.loss_type, self.loss_params, self.device)

        # Optimizer
        lr = self.config.get("learning_rate", 1e-4)
        wd = self.config.get("weight_decay", 1e-4)
        self.optimizer = optim.AdamW(self.model.parameters(), lr=lr, weight_decay=wd)

        # AMP GradScaler
        self.use_amp = self.config.get("use_amp", True) and (self.device.type == "cuda")
        if self.use_amp:
            try:
                self.scaler = torch.amp.GradScaler("cuda")
            except Exception:
                self.scaler = torch.cuda.amp.GradScaler(enabled=True)
        else:
            try:
                self.scaler = torch.amp.GradScaler("cuda", enabled=False)
            except Exception:
                self.scaler = torch.cuda.amp.GradScaler(enabled=False)

    def preflight_check(self) -> Dict[str, Any]:
        """Perform strict preflight safety check before training begins."""
        with open(self.manifest_path, "r", encoding="utf-8") as f:
            m_data = json.load(f)

        scenes = m_data["scenes"]
        train_scenes = [s for s in scenes if s["split"] == "train"]
        val_scenes = [s for s in scenes if s["split"] == "val"]
        test_scenes = [s for s in scenes if s["split"] == "test"]

        assert len(train_scenes) == 28, f"Expected 28 train scenes, got {len(train_scenes)}"
        assert len(val_scenes) == 7, f"Expected 7 val scenes, got {len(val_scenes)}"
        assert len(test_scenes) == 5, f"Expected 5 test scenes, got {len(test_scenes)}"

        manifest_sha = compute_file_sha256(self.manifest_path)

        check_report = {
            "experiment_id": self.experiment_id,
            "loss_type": self.loss_type,
            "loss_params": self.loss_params,
            "dataset_scenes": len(scenes),
            "train_scenes": len(train_scenes),
            "val_scenes": len(val_scenes),
            "held_out_test_scenes": len(test_scenes),
            "held_out_status": "STRICTLY_LOCKED",
            "model_architecture": "UNet(in_channels=2, num_classes=2, base_channels=16)",
            "preprocessing": "sentinel1_sigma0_db_v1",
            "device": str(self.device),
            "seed": self.config.get("seed", 42),
            "batch_size": self.config.get("batch_size", 2),
            "amp_fp16": self.use_amp,
            "max_epochs": self.config.get("epochs", 30),
            "early_stopping_patience": self.config.get("early_stopping_patience", 7),
            "manifest_sha256": manifest_sha,
            "preflight_passed": True,
        }
        return check_report

    def evaluate_validation_epoch(
        self,
        val_dataset: V6TileDataset,
    ) -> Dict[str, float]:
        """Compute pixel-level validation metrics across validation tiles."""
        val_loader = DataLoader(
            val_dataset,
            batch_size=self.config.get("batch_size", 2),
            shuffle=False,
            num_workers=0,
        )

        self.model.eval()
        total_val_loss = 0.0
        cm_total = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}

        with torch.no_grad():
            for images, targets, _ in val_loader:
                images = images.to(self.device)
                targets = targets.to(self.device)

                with torch.amp.autocast("cuda", enabled=self.use_amp):
                    logits = self.model(images)
                    loss, _ = self.criterion(logits, targets)

                total_val_loss += loss.item() * images.size(0)

                probs = torch.softmax(logits, dim=1)[:, 1, :, :]
                bin_preds = (probs >= 0.50).cpu().numpy()
                bin_targets = targets.cpu().numpy()

                tp = int(((bin_preds == 1) & (bin_targets == 1)).sum())
                fp = int(((bin_preds == 1) & (bin_targets == 0)).sum())
                fn = int(((bin_preds == 0) & (bin_targets == 1)).sum())
                tn = int(((bin_preds == 0) & (bin_targets == 0)).sum())

                cm_total["tp"] += tp
                cm_total["fp"] += fp
                cm_total["fn"] += fn
                cm_total["tn"] += tn

        avg_loss = total_val_loss / len(val_dataset)
        m = calculate_confusion_metrics(cm_total)

        return {
            "val_loss": round(avg_loss, 6),
            "val_dice": round(float(m["dice"]), 6),
            "val_iou": round(float(m["iou"]), 6),
            "val_precision": round(float(m["precision"]), 6),
            "val_recall": round(float(m["recall"]), 6),
            "val_fpr": round(float(m["fpr"]), 6),
            "confusion_matrix": cm_total,
        }

    def train(self) -> Dict[str, Any]:
        """Execute full training loop with early stopping and checkpointing."""
        train_ds = V6TileDataset(
            manifest_path=self.manifest_path,
            split="train",
            tile_size=self.config.get("tile_size", 512),
            augment=self.config.get("augment", True),
            repo_root=self.repo_root,
        )
        val_ds = V6TileDataset(
            manifest_path=self.manifest_path,
            split="val",
            tile_size=self.config.get("tile_size", 512),
            augment=False,
            repo_root=self.repo_root,
        )

        train_loader = DataLoader(
            train_ds,
            batch_size=self.config.get("batch_size", 2),
            shuffle=True,
            num_workers=0,
            pin_memory=(self.device.type == "cuda"),
        )

        epochs = self.config.get("epochs", 30)
        patience = self.config.get("early_stopping_patience", 7)

        history: List[Dict[str, Any]] = []
        best_val_dice = -1.0
        best_epoch = -1
        patience_counter = 0

        ckpt_dir = os.path.join(self.repo_root, "ml", "model_registry", "versions")
        os.makedirs(ckpt_dir, exist_ok=True)
        best_ckpt_path = os.path.join(ckpt_dir, self.checkpoint_filename)
        last_ckpt_filename = self.checkpoint_filename.replace(".pth", "_last.pth")
        last_ckpt_path = os.path.join(ckpt_dir, last_ckpt_filename)

        start_time = time.time()
        print(f"[{self.experiment_id}] Training {self.model_id} on {len(train_ds)} tiles ({len(train_ds.scenes)} scenes) with {self.loss_type} for max {epochs} epochs...")

        for epoch in range(1, epochs + 1):
            epoch_start = time.time()
            self.model.train()
            total_train_loss = 0.0

            for images, targets, _ in train_loader:
                images = images.to(self.device)
                targets = targets.to(self.device)

                self.optimizer.zero_grad()

                with torch.amp.autocast("cuda", enabled=self.use_amp):
                    logits = self.model(images)
                    loss, _ = self.criterion(logits, targets)

                self.scaler.scale(loss).backward()
                self.scaler.step(self.optimizer)
                self.scaler.update()

                total_train_loss += loss.item() * images.size(0)

            avg_train_loss = total_train_loss / len(train_ds)

            # Evaluate validation
            val_metrics = self.evaluate_validation_epoch(val_ds)
            epoch_time = time.time() - epoch_start

            mem_mb = (
                torch.cuda.max_memory_allocated(self.device) / (1024 * 1024)
                if self.device.type == "cuda"
                else 0.0
            )

            epoch_record = {
                "epoch": epoch,
                "train_loss": round(avg_train_loss, 6),
                "val_loss": val_metrics["val_loss"],
                "val_dice": val_metrics["val_dice"],
                "val_iou": val_metrics["val_iou"],
                "val_precision": val_metrics["val_precision"],
                "val_recall": val_metrics["val_recall"],
                "val_fpr": val_metrics["val_fpr"],
                "learning_rate": self.optimizer.param_groups[0]["lr"],
                "epoch_duration_seconds": round(epoch_time, 2),
                "peak_cuda_vram_mb": round(mem_mb, 2),
            }
            history.append(epoch_record)

            print(
                f"[{self.experiment_id}] Epoch {epoch:02d}/{epochs:02d} | "
                f"Train Loss: {avg_train_loss:.4f} | "
                f"Val Loss: {val_metrics['val_loss']:.4f} | "
                f"Val Dice: {val_metrics['val_dice']:.4f} | "
                f"Val IoU: {val_metrics['val_iou']:.4f} | "
                f"Val Recall: {val_metrics['val_recall']:.4f} | "
                f"Val FPR: {val_metrics['val_fpr']:.6f} | "
                f"Time: {epoch_time:.1f}s"
            )

            # Save best checkpoint based on validation Dice
            if val_metrics["val_dice"] > best_val_dice:
                best_val_dice = val_metrics["val_dice"]
                best_epoch = epoch
                patience_counter = 0

                torch.save({
                    "model_version": self.model_id.split("-")[-1].upper(),
                    "model_id": self.model_id,
                    "experiment_id": self.experiment_id,
                    "loss_type": self.loss_type,
                    "loss_params": self.loss_params,
                    "architecture": "UNet",
                    "in_channels": 2,
                    "num_classes": 2,
                    "base_channels": 16,
                    "preprocessing": "sentinel1_sigma0_db_v1",
                    "seed": self.config.get("seed", 42),
                    "epoch": epoch,
                    "validation_metrics": val_metrics,
                    "model_state_dict": self.model.state_dict(),
                    "optimizer_state_dict": self.optimizer.state_dict(),
                    "torch_version": str(torch.__version__),
                    "cuda_version": str(torch.version.cuda) if torch.cuda.is_available() else None,
                    "trained_at": datetime.now(timezone.utc).isoformat(),
                }, best_ckpt_path)
            else:
                patience_counter += 1
                if patience_counter >= patience:
                    print(f"[{self.experiment_id}] Early stopping triggered at epoch {epoch} (best epoch: {best_epoch}, best Dice: {best_val_dice:.4f})")
                    break

        # Save last checkpoint
        torch.save({
            "model_version": self.model_id.split("-")[-1].upper(),
            "model_id": self.model_id,
            "experiment_id": self.experiment_id,
            "loss_type": self.loss_type,
            "loss_params": self.loss_params,
            "architecture": "UNet",
            "in_channels": 2,
            "num_classes": 2,
            "base_channels": 16,
            "preprocessing": "sentinel1_sigma0_db_v1",
            "seed": self.config.get("seed", 42),
            "epoch": len(history),
            "model_state_dict": self.model.state_dict(),
            "optimizer_state_dict": self.optimizer.state_dict(),
            "torch_version": str(torch.__version__),
            "cuda_version": str(torch.version.cuda) if torch.cuda.is_available() else None,
            "trained_at": datetime.now(timezone.utc).isoformat(),
        }, last_ckpt_path)

        total_training_time = time.time() - start_time
        best_sha256 = compute_file_sha256(best_ckpt_path)
        last_sha256 = compute_file_sha256(last_ckpt_path)

        return {
            "experiment_id": self.experiment_id,
            "model_id": self.model_id,
            "status": "EXPERIMENTAL",
            "loss_type": self.loss_type,
            "loss_params": self.loss_params,
            "best_epoch": best_epoch,
            "best_validation_dice": best_val_dice,
            "total_epochs_trained": len(history),
            "total_training_duration_seconds": round(total_training_time, 2),
            "best_checkpoint": {
                "path": f"ml/model_registry/versions/{self.checkpoint_filename}",
                "sha256": best_sha256,
                "size_bytes": os.path.getsize(best_ckpt_path),
            },
            "last_checkpoint": {
                "path": f"ml/model_registry/versions/{last_ckpt_filename}",
                "sha256": last_sha256,
                "size_bytes": os.path.getsize(last_ckpt_path),
            },
            "history": history,
        }
