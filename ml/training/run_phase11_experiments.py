"""
Phase 11 — MADOS Multispectral Model Experiments.

Executes three controlled experiments:
  1. Experiment A: phase11_rgb_control (ResNet-34 UNet 512x512, 3-channel RGB B4-B3-B2)
  2. Experiment B: mados_rgbnir_resnet34 (ResNet-34 UNet 512x512, 4-channel RGB+NIR B4-B3-B2-B8)
  3. Experiment C: mados_rgbnir_swir_resnet34 (ResNet-34 UNet 512x512, 6-channel RGB+NIR+SWIR B4-B3-B2-B8-B11-B12)

Strictly adheres to:
  - Training set only spectral normalization statistics
  - Bilinear continuous resampling of 20m SWIR bands to 10m grid (120x120 -> 240x240)
  - Pretrained weight transfer for modified input convolutions
  - Anti-collapse validation monitoring on every epoch
  - Maximum 15 epochs, early stopping patience 4, seed 26143
"""

import os
import sys
import time
import json
import csv
import hashlib
import random
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple
from collections import defaultdict

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader, Sampler
from torchvision import transforms
from PIL import Image
import rasterio

_repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
_ml_py_dir = os.path.join(_repo_root, "services/ml-python")
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)
if _ml_py_dir not in sys.path:
    sys.path.insert(0, _ml_py_dir)

from app.preprocessing.optical_preprocessor import letterbox_image
from ml.benchmark.adapter import _ResNet34UNetModel


def compute_sha256(filepath: str) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(8192 * 1024):
            h.update(chunk)
    return h.hexdigest()


def set_seed(seed: int = 26143):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


class MultispectralResNet34UNet(_ResNet34UNetModel):
    """ResNet-34 UNet modified to accept arbitrary number of input channels."""

    def __init__(self, in_channels: int = 3, num_classes: int = 4):
        super().__init__(num_classes=num_classes)
        self.in_channels = in_channels
        if in_channels != 3:
            old_conv = self.encoder.conv1
            self.encoder.conv1 = nn.Conv2d(
                in_channels,
                old_conv.out_channels,
                kernel_size=old_conv.kernel_size,
                stride=old_conv.stride,
                padding=old_conv.padding,
                bias=old_conv.bias is not None,
            )


def load_multispectral_weights(model: MultispectralResNet34UNet, base_ckpt_path: str, in_channels: int):
    """Carefully transfer pretrained RGB weights and initialize additional channels."""
    ckpt_data = torch.load(base_ckpt_path, map_location="cpu", weights_only=False)
    state_dict = ckpt_data["model_state_dict"] if isinstance(ckpt_data, dict) and "model_state_dict" in ckpt_data else ckpt_data

    if in_channels == 3:
        model.load_state_dict(state_dict, strict=True)
        return

    old_conv_w = state_dict["encoder.conv1.weight"]  # (64, 3, 7, 7)
    new_conv_w = torch.zeros((64, in_channels, 7, 7), dtype=old_conv_w.dtype)

    # 1. Copy RGB channels
    new_conv_w[:, 0:3, :, :] = old_conv_w[:, 0:3, :, :]

    # 2. Initialize NIR channel (channel 3) with mean of RGB channels
    mean_rgb_w = old_conv_w.mean(dim=1, keepdim=True)
    new_conv_w[:, 3:4, :, :] = mean_rgb_w

    # 3. Initialize SWIR channels (channels 4 & 5) if present
    if in_channels >= 6:
        new_conv_w[:, 4:5, :, :] = mean_rgb_w
        new_conv_w[:, 5:6, :, :] = mean_rgb_w

    state_dict["encoder.conv1.weight"] = new_conv_w
    model.load_state_dict(state_dict, strict=True)


class MADOSMultispectralDataset(Dataset):
    """
    Loads multi-spectral Sentinel-2 bands for MADOS crops:
      - in_channels = 3: B4 (Red), B3 (Green), B2 (Blue)
      - in_channels = 4: B4, B3, B2, B8 (NIR)
      - in_channels = 6: B4, B3, B2, B8, B11 (SWIR-1), B12 (SWIR-2)
    """

    def __init__(
        self,
        manifest_path: str,
        norm_config_path: str,
        in_channels: int = 3,
        target_size: Tuple[int, int] = (512, 512),
        is_train: bool = True,
    ):
        self.manifest_path = manifest_path
        self.in_channels = in_channels
        self.target_size = target_size
        self.is_train = is_train

        with open(manifest_path, "r", encoding="utf-8") as f:
            self.samples = json.load(f)

        with open(norm_config_path, "r", encoding="utf-8") as f:
            norm_doc = json.load(f)
            bands = norm_doc["bands"]

        # Means and stds in channel order: B4, B3, B2, B8, B11, B12
        self.means = [bands["b4"]["mean"], bands["b3"]["mean"], bands["b2"]["mean"]]
        self.stds = [bands["b4"]["std"], bands["b3"]["std"], bands["b2"]["std"]]

        if in_channels >= 4:
            self.means.append(bands["b8"]["mean"])
            self.stds.append(bands["b8"]["std"])
        if in_channels >= 6:
            self.means.append(bands["b11"]["mean"])
            self.stds.append(bands["b11"]["std"])
            self.means.append(bands["b12"]["mean"])
            self.stds.append(bands["b12"]["std"])

        self.means_t = torch.tensor(self.means, dtype=torch.float32).view(-1, 1, 1)
        self.stds_t = torch.tensor(self.stds, dtype=torch.float32).view(-1, 1, 1)

    def __len__(self) -> int:
        return len(self.samples)

    def _read_band(self, rel_path: str, target_shape=(240, 240)) -> np.ndarray:
        full_p = os.path.join(_repo_root, rel_path)
        with rasterio.open(full_p) as src:
            arr = src.read(1).astype(np.float32)
        arr = np.nan_to_num(arr, nan=0.0, posinf=0.25, neginf=0.0)

        # Resample SWIR from (120, 120) to (240, 240) using bilinear continuous interpolation
        if arr.shape != target_shape:
            pil_img = Image.fromarray(arr)
            resampled = pil_img.resize((target_shape[1], target_shape[0]), Image.Resampling.BILINEAR)
            arr = np.array(resampled, dtype=np.float32)
        return arr

    def _load_mask(self, mask_path: Optional[str], is_pos: bool, orig_shape: Tuple[int, int] = (240, 240)) -> np.ndarray:
        h, w = orig_shape
        if not is_pos or not mask_path:
            return np.zeros((h, w), dtype=np.uint8)

        full_mask_p = os.path.join(_repo_root, mask_path) if not os.path.isabs(mask_path) else mask_path
        if not os.path.exists(full_mask_p):
            return np.zeros((h, w), dtype=np.uint8)

        if full_mask_p.lower().endswith((".tif", ".tiff")):
            try:
                with rasterio.open(full_mask_p) as src:
                    arr = src.read(1)
                    return (arr == 6).astype(np.uint8)
            except Exception:
                pass
        return np.zeros((h, w), dtype=np.uint8)

    def __getitem__(self, idx: int) -> Dict[str, Any]:
        item = self.samples[idx]
        is_pos = item.get("is_oil_positive", False)

        # 1. Load bands in order [B4, B3, B2, B8, B11, B12]
        b4 = self._read_band(item["b4_path"])
        b3 = self._read_band(item["b3_path"])
        b2 = self._read_band(item["b2_path"])
        channels = [b4, b3, b2]

        if self.in_channels >= 4:
            b8 = self._read_band(item["b8_path"])
            channels.append(b8)
        if self.in_channels >= 6:
            b11 = self._read_band(item["b11_path"])
            b12 = self._read_band(item["b12_path"])
            channels.append(b11)
            channels.append(b12)

        stacked = np.stack(channels, axis=0)  # (C, 240, 240)
        gt_mask = self._load_mask(item.get("mask_path"), is_pos, (240, 240))  # (240, 240)

        # 2. Aspect-preserving resize/pad to target_size (512, 512)
        target_h, target_w = self.target_size
        tensor_stack = torch.from_numpy(stacked).float()  # (C, 240, 240)
        mask_t = torch.from_numpy(gt_mask).float().unsqueeze(0)  # (1, 240, 240)

        # Bilinear resize for continuous bands, nearest for mask
        resized_tensor = F.interpolate(tensor_stack.unsqueeze(0), size=(target_h, target_w), mode="bilinear", align_corners=False)[0]
        resized_mask = F.interpolate(mask_t.unsqueeze(0), size=(target_h, target_w), mode="nearest")[0]

        # 3. Augmentations (consistently applied across all spectral channels)
        if self.is_train:
            if random.random() > 0.5:
                resized_tensor = torch.flip(resized_tensor, dims=[2])
                resized_mask = torch.flip(resized_mask, dims=[2])
            if random.random() > 0.5:
                resized_tensor = torch.flip(resized_tensor, dims=[1])
                resized_mask = torch.flip(resized_mask, dims=[1])
            if random.random() > 0.5:
                k = random.choice([1, 2, 3])
                resized_tensor = torch.rot90(resized_tensor, k, dims=[1, 2])
                resized_mask = torch.rot90(resized_mask, k, dims=[1, 2])

        # 4. Normalize per-band using training statistics
        norm_tensor = (resized_tensor - self.means_t) / (self.stds_t + 1e-7)

        return {
            "image": norm_tensor,
            "mask": resized_mask,
            "sample_id": item.get("sample_id", f"sample_{idx}"),
            "scene_id": item.get("scene_id", "UNKNOWN"),
            "dataset": "MADOS_Sentinel2",
            "is_oil_positive": is_pos,
            "oil_percentage": item.get("oil_percentage", 0.0),
            "area_category": item.get("area_category", "negative"),
        }


class MADOS1to3BatchSampler(Sampler):
    def __init__(self, dataset: MADOSMultispectralDataset, batch_size: int = 8, pos_per_batch: int = 2):
        super().__init__()
        self.dataset = dataset
        self.batch_size = batch_size
        self.pos_per_batch = pos_per_batch
        self.neg_per_batch = batch_size - pos_per_batch

        self.pos_indices = [i for i, s in enumerate(dataset.samples) if s.get("is_oil_positive", False)]
        self.neg_indices = [i for i, s in enumerate(dataset.samples) if not s.get("is_oil_positive", False)]
        self.num_batches = max(len(dataset.samples) // batch_size, len(self.pos_indices) * 2 // pos_per_batch)

    def __iter__(self):
        pos_pool = random.sample(self.pos_indices, len(self.pos_indices))
        neg_pool = random.sample(self.neg_indices, len(self.neg_indices))

        pos_idx = 0
        neg_idx = 0

        for _ in range(self.num_batches):
            batch = []
            for _ in range(self.pos_per_batch):
                batch.append(pos_pool[pos_idx % len(pos_pool)])
                pos_idx += 1
                if pos_idx % len(pos_pool) == 0:
                    random.shuffle(pos_pool)

            for _ in range(self.neg_per_batch):
                batch.append(neg_pool[neg_idx % len(neg_pool)])
                neg_idx += 1
                if neg_idx % len(neg_pool) == 0:
                    random.shuffle(neg_pool)

            random.shuffle(batch)
            yield batch

    def __len__(self) -> int:
        return self.num_batches


class BinaryFocalLoss(nn.Module):
    def __init__(self, gamma: float = 2.0, alpha: float = 0.75, eps: float = 1e-7):
        super().__init__()
        self.gamma = gamma
        self.alpha = alpha
        self.eps = eps

    def forward(self, pred: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
        pred = torch.clamp(pred, self.eps, 1.0 - self.eps)
        p_t = pred * target + (1.0 - pred) * (1.0 - target)
        alpha_t = self.alpha * target + (1.0 - self.alpha) * (1.0 - target)
        focal_weight = alpha_t * torch.pow(1.0 - p_t, self.gamma)
        bce = -torch.log(p_t)
        return torch.mean(focal_weight * bce)


class SoftDiceLoss(nn.Module):
    def __init__(self, smooth: float = 1.0, eps: float = 1e-7):
        super().__init__()
        self.smooth = smooth
        self.eps = eps

    def forward(self, pred: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
        pred_flat = pred.contiguous().view(-1)
        target_flat = target.contiguous().view(-1)
        intersection = (pred_flat * target_flat).sum()
        dice = (2.0 * intersection + self.smooth) / (pred_flat.sum() + target_flat.sum() + self.smooth + self.eps)
        return 1.0 - dice


class FocalDiceLoss(nn.Module):
    def __init__(self, gamma: float = 2.0, alpha: float = 0.75):
        super().__init__()
        self.focal = BinaryFocalLoss(gamma=gamma, alpha=alpha)
        self.dice = SoftDiceLoss()

    def forward(self, pred: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
        return self.focal(pred, target) + self.dice(pred, target)


@torch.no_grad()
def evaluate_multispectral_val(
    model: nn.Module,
    val_loader: DataLoader,
    loss_fn: nn.Module,
    device: torch.device,
    threshold: float = 0.5,
) -> Dict[str, Any]:
    model.eval()
    total_val_loss = 0.0
    tp_total = 0
    fp_total = 0
    fn_total = 0
    tn_total = 0

    pred_foreground_ratios = []
    pos_sample_count = 0
    pos_sample_detected_count = 0
    neg_sample_count = 0
    neg_sample_fp_count = 0

    cat_metrics = {
        "tiny": {"tp": 0, "fp": 0, "fn": 0, "total": 0, "detected": 0},
        "small": {"tp": 0, "fp": 0, "fn": 0, "total": 0, "detected": 0},
        "medium": {"tp": 0, "fp": 0, "fn": 0, "total": 0, "detected": 0},
        "large": {"tp": 0, "fp": 0, "fn": 0, "total": 0, "detected": 0},
    }

    for batch in val_loader:
        images = batch["image"].to(device)
        masks = batch["mask"].to(device)
        is_pos_list = batch["is_oil_positive"]
        area_cats = batch["area_category"]

        outputs = model(images)
        if isinstance(outputs, (tuple, list)):
            outputs = outputs[0]

        if outputs.shape[1] > 1:
            probs = F.softmax(outputs, dim=1)[:, 1:2, :, :]
        else:
            probs = torch.sigmoid(outputs) if outputs.min() < 0 or outputs.max() > 1 else outputs

        loss = loss_fn(probs, masks)
        total_val_loss += loss.item() * images.size(0)

        preds_bin = (probs >= threshold).float()

        preds_np = preds_bin.cpu().numpy()
        masks_np = masks.cpu().numpy()

        for i in range(images.size(0)):
            p_bin = preds_np[i, 0]
            m_bin = masks_np[i, 0]
            is_pos = bool(is_pos_list[i])
            cat = str(area_cats[i])

            p_sum = int(np.sum(p_bin))
            m_sum = int(np.sum(m_bin))
            pred_ratio = float(p_sum / p_bin.size)
            pred_foreground_ratios.append(pred_ratio)

            if is_pos:
                pos_sample_count += 1
                if p_sum > 0:
                    pos_sample_detected_count += 1
                if cat in cat_metrics:
                    cat_metrics[cat]["total"] += 1
                    if p_sum > 0:
                        cat_metrics[cat]["detected"] += 1
            else:
                neg_sample_count += 1
                if p_sum > 0:
                    neg_sample_fp_count += 1

            tp = int(np.sum((p_bin == 1) & (m_bin == 1)))
            fp = int(np.sum((p_bin == 1) & (m_bin == 0)))
            fn = int(np.sum((p_bin == 0) & (m_bin == 1)))
            tn = int(np.sum((p_bin == 0) & (m_bin == 0)))

            tp_total += tp
            fp_total += fp
            fn_total += fn
            tn_total += tn

            if is_pos and cat in cat_metrics:
                cat_metrics[cat]["tp"] += tp
                cat_metrics[cat]["fp"] += fp
                cat_metrics[cat]["fn"] += fn

    val_loss = total_val_loss / len(val_loader.dataset)
    iou = float(tp_total / (tp_total + fp_total + fn_total + 1e-7))
    dice = float(2 * tp_total / (2 * tp_total + fp_total + fn_total + 1e-7))
    precision = float(tp_total / (tp_total + fp_total + 1e-7)) if (tp_total + fp_total) > 0 else 0.0
    recall = float(tp_total / (tp_total + fn_total + 1e-7)) if (tp_total + fn_total) > 0 else 0.0
    f1 = float(2 * precision * recall / (precision + recall + 1e-7)) if (precision + recall) > 0 else 0.0

    pos_sample_recall = float(pos_sample_detected_count / pos_sample_count) if pos_sample_count > 0 else 0.0
    neg_sample_fp_rate = float(neg_sample_fp_count / neg_sample_count) if neg_sample_count > 0 else 0.0

    category_summary = {}
    for cat, d in cat_metrics.items():
        c_tp = d["tp"]
        c_fp = d["fp"]
        c_fn = d["fn"]
        c_iou = float(c_tp / (c_tp + c_fp + c_fn + 1e-7)) if (c_tp + c_fp + c_fn) > 0 else 0.0
        c_prec = float(c_tp / (c_tp + c_fp + 1e-7)) if (c_tp + c_fp) > 0 else 0.0
        c_rec = float(c_tp / (c_tp + c_fn + 1e-7)) if (c_tp + c_fn) > 0 else 0.0
        c_f1 = float(2 * c_prec * c_rec / (c_prec + c_rec + 1e-7)) if (c_prec + c_rec) > 0 else 0.0
        c_s_rec = float(d["detected"] / d["total"]) if d["total"] > 0 else 0.0
        category_summary[cat] = {
            "total_samples": d["total"],
            "detected_samples": d["detected"],
            "sample_recall": c_s_rec,
            "iou": c_iou,
            "f1": c_f1,
            "precision": c_prec,
            "recall": c_rec,
        }

    return {
        "val_loss": val_loss,
        "val_iou": iou,
        "val_dice": dice,
        "val_precision": precision,
        "val_recall": recall,
        "val_f1": f1,
        "tp": int(tp_total),
        "fp": int(fp_total),
        "fn": int(fn_total),
        "tn": int(tn_total),
        "mean_pred_oil_area_pct": float(np.mean(pred_foreground_ratios) * 100.0),
        "pos_sample_recall": pos_sample_recall,
        "neg_sample_fp_rate": neg_sample_fp_rate,
        "category_summary": category_summary,
    }


def run_single_phase11_experiment(
    exp_name: str,
    in_channels: int,
    base_checkpoint: str,
    target_size: Tuple[int, int] = (512, 512),
    batch_size: int = 8,
    accum_steps: int = 2,
    max_epochs: int = 15,
    patience: int = 4,
    device: torch.device = torch.device("cuda" if torch.cuda.is_available() else "cpu"),
) -> Dict[str, Any]:
    print("\n" + "=" * 75)
    print(f"STARTING PHASE 11 EXPERIMENT: {exp_name} ({in_channels} channels)")
    print("=" * 75)

    out_dir = os.path.join(_repo_root, "ml/training/runs", exp_name)
    ckpt_dir = os.path.join(out_dir, "checkpoints")
    metrics_dir = os.path.join(out_dir, "metrics")
    logs_dir = os.path.join(out_dir, "logs")

    os.makedirs(ckpt_dir, exist_ok=True)
    os.makedirs(metrics_dir, exist_ok=True)
    os.makedirs(logs_dir, exist_ok=True)

    set_seed(26143)

    train_manifest = os.path.join(_repo_root, "ml/training/manifests/phase11_multispectral/train.json")
    val_manifest = os.path.join(_repo_root, "ml/training/manifests/phase11_multispectral/validation.json")
    norm_config = os.path.join(_repo_root, "ml/training/manifests/phase11_multispectral/spectral_normalization.json")

    train_ds = MADOSMultispectralDataset(train_manifest, norm_config, in_channels=in_channels, target_size=target_size, is_train=True)
    val_ds = MADOSMultispectralDataset(val_manifest, norm_config, in_channels=in_channels, target_size=target_size, is_train=False)

    train_sampler = MADOS1to3BatchSampler(train_ds, batch_size=batch_size // accum_steps, pos_per_batch=2)
    train_loader = DataLoader(train_ds, batch_sampler=train_sampler, num_workers=0, pin_memory=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size // accum_steps, shuffle=False, num_workers=0, pin_memory=True)

    print(f"Train Dataset: {len(train_ds)} samples | Val Dataset: {len(val_ds)} samples | Channels: {in_channels}")
    print(f"Physical Batch: {batch_size // accum_steps} | Accumulation: {accum_steps} | Effective Batch: {batch_size}")

    # Model instantiation & weight loading
    model = MultispectralResNet34UNet(in_channels=in_channels, num_classes=4)
    load_multispectral_weights(model, base_checkpoint, in_channels=in_channels)
    model.to(device)

    backbone_prefixes = ("encoder", "conv1", "bn1", "layer")
    backbone_params = [p for n, p in model.named_parameters() if any(n.startswith(k) or f".{k}" in n for k in backbone_prefixes)]
    decoder_params = [p for n, p in model.named_parameters() if not any(n.startswith(k) or f".{k}" in n for k in backbone_prefixes)]

    optimizer = torch.optim.AdamW(
        [
            {"params": backbone_params, "lr": 5e-5, "weight_decay": 1e-4},
            {"params": decoder_params, "lr": 2e-4, "weight_decay": 1e-4},
        ]
    )

    loss_fn = FocalDiceLoss(gamma=2.0, alpha=0.75)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max_epochs, eta_min=1e-6)

    history = []
    best_val_iou = -1.0
    best_val_f1 = -1.0
    best_epoch = 0
    patience_counter = 0

    t_start = time.time()

    for epoch in range(1, max_epochs + 1):
        ep_start = time.time()
        model.train()
        total_train_loss = 0.0
        optimizer.zero_grad()

        for step, batch in enumerate(train_loader):
            images = batch["image"].to(device)
            masks = batch["mask"].to(device)

            outputs = model(images)
            if isinstance(outputs, (tuple, list)):
                outputs = outputs[0]

            if outputs.shape[1] > 1:
                probs = F.softmax(outputs, dim=1)[:, 1:2, :, :]
            else:
                probs = torch.sigmoid(outputs) if outputs.min() < 0 or outputs.max() > 1 else outputs

            loss = loss_fn(probs, masks) / accum_steps
            loss.backward()

            if (step + 1) % accum_steps == 0 or (step + 1) == len(train_loader):
                torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=2.0)
                optimizer.step()
                optimizer.zero_grad()

            total_train_loss += loss.item() * accum_steps

        scheduler.step()
        train_loss = total_train_loss / len(train_loader)

        # Validation evaluation
        val_metrics = evaluate_multispectral_val(model, val_loader, loss_fn, device)
        ep_duration = time.time() - ep_start

        epoch_record = {
            "epoch": epoch,
            "train_loss": float(train_loss),
            "val_loss": float(val_metrics["val_loss"]),
            "val_iou": float(val_metrics["val_iou"]),
            "val_f1": float(val_metrics["val_f1"]),
            "val_precision": float(val_metrics["val_precision"]),
            "val_recall": float(val_metrics["val_recall"]),
            "pos_sample_recall": float(val_metrics["pos_sample_recall"]),
            "neg_sample_fp_rate": float(val_metrics["neg_sample_fp_rate"]),
            "mean_pred_oil_area_pct": float(val_metrics["mean_pred_oil_area_pct"]),
            "category_summary": val_metrics["category_summary"],
            "epoch_duration_sec": float(ep_duration),
        }
        history.append(epoch_record)

        print(
            f"Epoch [{epoch:02d}/{max_epochs:02d}] "
            f"Train Loss: {train_loss:.4f} | "
            f"Val Loss: {val_metrics['val_loss']:.4f} | "
            f"Val IoU: {val_metrics['val_iou']:.4f} | "
            f"Val F1: {val_metrics['val_f1']:.4f} | "
            f"Val Recall: {val_metrics['val_recall']:.4f} | "
            f"Pos Sample Recall: {val_metrics['pos_sample_recall']*100:.1f}% | "
            f"Mean Pred Area: {val_metrics['mean_pred_oil_area_pct']:.2f}% | "
            f"Time: {ep_duration:.1f}s"
        )

        # Checkpoint saving
        if val_metrics["val_iou"] > best_val_iou:
            best_val_iou = val_metrics["val_iou"]
            best_epoch = epoch
            patience_counter = 0
            best_iou_path = os.path.join(ckpt_dir, "best_val_iou.pt")
            torch.save(
                {
                    "epoch": epoch,
                    "model_state_dict": model.state_dict(),
                    "in_channels": in_channels,
                    "val_iou": val_metrics["val_iou"],
                    "val_f1": val_metrics["val_f1"],
                    "val_precision": val_metrics["val_precision"],
                    "val_recall": val_metrics["val_recall"],
                    "config": {"in_channels": in_channels, "target_size": target_size, "loss": "focal_dice"},
                },
                best_iou_path,
            )
            print(f"  --> Saved new BEST IoU checkpoint: {val_metrics['val_iou']:.4f} at epoch {epoch}")
        else:
            patience_counter += 1

        if val_metrics["val_f1"] > best_val_f1:
            best_val_f1 = val_metrics["val_f1"]
            best_f1_path = os.path.join(ckpt_dir, "best_val_f1.pt")
            torch.save(
                {
                    "epoch": epoch,
                    "model_state_dict": model.state_dict(),
                    "in_channels": in_channels,
                    "val_iou": val_metrics["val_iou"],
                    "val_f1": val_metrics["val_f1"],
                },
                best_f1_path,
            )

        if patience_counter >= patience:
            print(f"Early stopping triggered at epoch {epoch} (patience={patience})")
            break

    # Save last checkpoint
    last_path = os.path.join(ckpt_dir, "last.pt")
    torch.save(
        {
            "epoch": len(history),
            "model_state_dict": model.state_dict(),
            "in_channels": in_channels,
            "history": history,
        },
        last_path,
    )

    total_training_time = time.time() - t_start
    best_iou_sha = compute_sha256(os.path.join(ckpt_dir, "best_val_iou.pt"))

    config_doc = {
        "experiment_name": exp_name,
        "in_channels": in_channels,
        "base_checkpoint": base_checkpoint,
        "best_checkpoint_sha256": best_iou_sha,
        "train_manifest": train_manifest,
        "val_manifest": val_manifest,
        "target_size": target_size,
        "batch_size": batch_size,
        "loss_type": "focal_dice",
        "best_epoch": best_epoch,
        "total_training_time_sec": total_training_time,
        "hardware": {
            "device": str(device),
            "device_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU",
            "torch_version": torch.__version__,
        },
    }

    with open(os.path.join(out_dir, "training_config.json"), "w", encoding="utf-8") as f:
        json.dump(config_doc, f, indent=2)

    with open(os.path.join(metrics_dir, "training_metrics.json"), "w", encoding="utf-8") as f:
        json.dump(
            {
                "best_val_iou": best_val_iou,
                "best_val_f1": best_val_f1,
                "best_epoch": best_epoch,
                "total_epochs": len(history),
                "history": history,
            },
            f,
            indent=2,
        )

    # Save CSV history
    csv_path = os.path.join(metrics_dir, "training_history.csv")
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "epoch",
                "train_loss",
                "val_loss",
                "val_iou",
                "val_f1",
                "val_precision",
                "val_recall",
                "pos_sample_recall",
                "neg_sample_fp_rate",
                "mean_pred_oil_area_pct",
                "epoch_duration_sec",
            ],
            extrasaction="ignore",
        )
        writer.writeheader()
        for row in history:
            writer.writerow(row)

    print(f"EXPERIMENT {exp_name} COMPLETE:")
    print(f"  Best Val IoU: {best_val_iou:.4f} (Epoch {best_epoch}) | Best Val F1: {best_val_f1:.4f}")
    print(f"  Best checkpoint SHA256: {best_iou_sha}")

    return {
        "exp_name": exp_name,
        "in_channels": in_channels,
        "best_val_iou": best_val_iou,
        "best_val_f1": best_val_f1,
        "best_epoch": best_epoch,
        "best_checkpoint_path": os.path.join(ckpt_dir, "best_val_iou.pt"),
        "best_checkpoint_sha256": best_iou_sha,
        "history": history,
    }


if __name__ == "__main__":
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"PyTorch Device: {device} ({torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'})")

    base_r34 = os.path.join(_repo_root, "ml/external_models/optical/unet_resnet34_oil/model.pth")
    base_sha = "9aab3f6de981ad73810d3b909603d430aafd94e35f143a2d3e80aa7336521576"

    # Verify base checkpoint
    actual_sha = compute_sha256(base_r34)
    assert actual_sha == base_sha, f"Base checkpoint mismatch: {actual_sha}"

    # 1. Experiment A: phase11_rgb_control (3 channels: B4, B3, B2)
    res_rgb = run_single_phase11_experiment(
        exp_name="phase11_rgb_control",
        in_channels=3,
        base_checkpoint=base_r34,
        target_size=(512, 512),
        batch_size=8,
        accum_steps=2,
        max_epochs=15,
        patience=4,
        device=device,
    )

    # 2. Experiment B: mados_rgbnir_resnet34 (4 channels: B4, B3, B2, B8)
    res_nir = run_single_phase11_experiment(
        exp_name="mados_rgbnir_resnet34",
        in_channels=4,
        base_checkpoint=base_r34,
        target_size=(512, 512),
        batch_size=8,
        accum_steps=2,
        max_epochs=15,
        patience=4,
        device=device,
    )

    # 3. Experiment C: mados_rgbnir_swir_resnet34 (6 channels: B4, B3, B2, B8, B11, B12)
    res_swir = run_single_phase11_experiment(
        exp_name="mados_rgbnir_swir_resnet34",
        in_channels=6,
        base_checkpoint=base_r34,
        target_size=(512, 512),
        batch_size=8,
        accum_steps=2,
        max_epochs=15,
        patience=4,
        device=device,
    )

    print("\n" + "=" * 75)
    print("ALL PHASE 11 MULTISPECTRAL TRAINING RUNS COMPLETED.")
    print("=" * 75)
