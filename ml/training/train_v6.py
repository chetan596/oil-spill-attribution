"""
Controlled Retraining Pipeline for Model V6 (unet-dual-pol-sar-v6).
Part 0.7 Controlled Retraining Experiment.

Strict scientific controls:
1. Model: UNet(in_channels=2, num_classes=2, base_channels=16, bilinear=True).
2. Preprocessing: sentinel1_sigma0_db_v1 (VV: [-35, -5] dB -> [0, 1], VH: [-45, -15] dB -> [0, 1]).
3. Split: 28 train scenes only. 7 validation scenes only.
4. Part III Held-Out Test: STRICTLY LOCKED AND QUARANTINED.
5. Deterministic seed: 42.
6. AMP FP16 with GradScaler.
7. Loss: Combined Weighted CrossEntropy + Soft Dice Loss.
8. Evaluation: Genuine Part 0.1 metrics with category FPR isolation.
"""

import os
import sys
import time
import json
import random
import yaml
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset
import rasterio

# Project paths
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)
if os.path.join(_REPO_ROOT, "services", "ml-python") not in sys.path:
    sys.path.insert(0, os.path.join(_REPO_ROOT, "services", "ml-python"))

# Architecture and Metrics
from app.models.unet.architecture import UNet
from app.training.losses import CombinedLoss, SoftDiceLoss
from app.preprocessing.tiling import generate_tiles, reconstruct_full_mask
from app.preprocessing.normalization import normalize_sar_band
from ml.evaluation.baseline_runner import compute_file_sha256
from ml.evaluation.metrics import (
    compute_iou,
    compute_precision,
    compute_recall,
    compute_fpr,
    compute_f1,
)
from ml.evaluation.confusion_matrix import (
    generate_confusion_matrix,
    calculate_confusion_metrics,
)


def set_seed(seed: int = 42):
    """Ensure deterministic execution across Python, NumPy, PyTorch, and CUDA."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed(seed)
        torch.cuda.manual_seed_all(seed)
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False


class V6TileDataset(Dataset):
    """
    Deterministic tile dataset for V6 training using sentinel1_sigma0_db_v1 preprocessing.
    Extracts 512x512 non-overlapping tiles from 2048x2048 scenes.
    """

    def __init__(
        self,
        manifest_path: str,
        split: str = "train",
        tile_size: int = 512,
        augment: bool = False,
        repo_root: Optional[str] = None,
    ):
        self.repo_root = repo_root or _REPO_ROOT
        self.manifest_path = manifest_path
        self.split = split
        self.tile_size = tile_size
        self.augment = augment

        with open(self.manifest_path, "r", encoding="utf-8") as f:
            manifest_data = json.load(f)

        scenes = [s for s in manifest_data["scenes"] if s.get("split") == split]
        self.scenes = sorted(scenes, key=lambda s: s["scene_id"])

        # Preload and tile all scenes in memory (small 28-scene dataset fits in ~500MB RAM)
        self.samples: List[Dict[str, Any]] = []
        self._prepare_tiles()

    def _prepare_tiles(self):
        for s in self.scenes:
            img_path = os.path.join(self.repo_root, s["image_path"])
            msk_path = s.get("mask_path")

            with rasterio.open(img_path) as src:
                vv_raw = src.read(1).astype(np.float32)
                vh_raw = src.read(2).astype(np.float32) if src.count >= 2 else vv_raw.copy()

            # Preprocessing: sentinel1_sigma0_db_v1
            vv_norm = normalize_sar_band(vv_raw, polarization="VV")
            vh_norm = normalize_sar_band(vh_raw, polarization="VH")
            image_norm = np.stack([vv_norm, vh_norm], axis=0)  # (2, 2048, 2048)

            if msk_path:
                full_msk_path = os.path.join(self.repo_root, msk_path)
                with rasterio.open(full_msk_path) as src_m:
                    mask = (src_m.read(1) > 0).astype(np.int64)
            else:
                mask = np.zeros((2048, 2048), dtype=np.int64)

            # Tiling with stride = tile_size (16 tiles per 2048x2048 scene)
            h, w = image_norm.shape[1], image_norm.shape[2]
            for y in range(0, h, self.tile_size):
                for x in range(0, w, self.tile_size):
                    img_tile = image_norm[:, y:y+self.tile_size, x:x+self.tile_size]
                    msk_tile = mask[y:y+self.tile_size, x:x+self.tile_size]
                    has_oil = bool(msk_tile.sum() > 0)

                    self.samples.append({
                        "scene_id": s["scene_id"],
                        "category": s.get("category", "unknown"),
                        "image": img_tile,
                        "mask": msk_tile,
                        "has_oil": has_oil,
                        "offset": (y, x),
                    })

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor, Dict[str, Any]]:
        sample = self.samples[idx]
        image = sample["image"].copy()
        mask = sample["mask"].copy()

        if self.augment:
            # Deterministic/controlled geometric augmentations
            if random.random() > 0.5:
                image = np.flip(image, axis=2).copy()
                mask = np.flip(mask, axis=1).copy()
            if random.random() > 0.5:
                image = np.flip(image, axis=1).copy()
                mask = np.flip(mask, axis=0).copy()
            rot_k = random.choice([0, 1, 2, 3])
            if rot_k > 0:
                image = np.rot90(image, k=rot_k, axes=(1, 2)).copy()
                mask = np.rot90(mask, k=rot_k, axes=(0, 1)).copy()

        return (
            torch.from_numpy(image).float(),
            torch.from_numpy(mask).long(),
            {
                "scene_id": sample["scene_id"],
                "category": sample["category"],
                "has_oil": sample["has_oil"],
            }
        )


class V6Trainer:
    """
    Executes controlled training of Model V6.
    """

    def __init__(
        self,
        config: Dict[str, Any],
        repo_root: Optional[str] = None,
    ):
        self.config = config
        self.repo_root = repo_root or _REPO_ROOT
        self.manifest_path = os.path.join(self.repo_root, config.get("manifest_path", "ml/datasets/manifest.json"))
        self.device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
        set_seed(self.config.get("seed", 42))

        # Model instantiation
        self.model = UNet(
            in_channels=config.get("in_channels", 2),
            num_classes=config.get("num_classes", 2),
            base_channels=config.get("base_channels", 16),
            bilinear=config.get("bilinear", True),
        ).to(self.device)

        # Loss function
        ce_w = config.get("ce_weight", 1.0)
        dice_w = config.get("dice_weight", 1.0)
        # Foreground class weight 5.0 to handle standard background imbalance
        class_weights = torch.tensor([1.0, config.get("foreground_weight", 5.0)]).to(self.device)
        self.criterion = CombinedLoss(
            weight=ce_w,
            dice_weight=dice_w,
            class_weights=class_weights,
        )

        # Optimizer
        lr = config.get("learning_rate", 1e-4)
        wd = config.get("weight_decay", 1e-4)
        self.optimizer = optim.AdamW(self.model.parameters(), lr=lr, weight_decay=wd)

        # AMP GradScaler
        self.use_amp = config.get("use_amp", True) and (self.device.type == "cuda")
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
        best_ckpt_path = os.path.join(ckpt_dir, "unet_dual_pol_sar_v6.pth")
        last_ckpt_path = os.path.join(ckpt_dir, "unet_dual_pol_sar_v6_last.pth")

        start_time = time.time()
        print(f"Training V6 on {len(train_ds)} tiles ({len(train_ds.scenes)} scenes) for max {epochs} epochs...")

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
                f"Epoch {epoch:02d}/{epochs:02d} | "
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
                    "model_version": "V6",
                    "model_id": "unet-dual-pol-sar-v6",
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
                    print(f"Early stopping triggered at epoch {epoch} (best epoch: {best_epoch}, best Dice: {best_val_dice:.4f})")
                    break

        # Save last checkpoint
        torch.save({
            "model_version": "V6",
            "model_id": "unet-dual-pol-sar-v6",
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
            "model_id": "unet-dual-pol-sar-v6",
            "model_version": "V6",
            "status": "EXPERIMENTAL",
            "best_epoch": best_epoch,
            "best_validation_dice": best_val_dice,
            "total_epochs_trained": len(history),
            "total_training_duration_seconds": round(total_training_time, 2),
            "best_checkpoint": {
                "path": "ml/model_registry/versions/unet_dual_pol_sar_v6.pth",
                "sha256": best_sha256,
                "size_bytes": os.path.getsize(best_ckpt_path),
            },
            "last_checkpoint": {
                "path": "ml/model_registry/versions/unet_dual_pol_sar_v6_last.pth",
                "sha256": last_sha256,
                "size_bytes": os.path.getsize(last_ckpt_path),
            },
            "history": history,
        }
