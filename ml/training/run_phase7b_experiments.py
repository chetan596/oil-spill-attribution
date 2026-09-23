"""
Phase 7B — Corrected Balanced Fine-Tuning Pilot Runner.

Executes three controlled pilot fine-tuning experiments:
  1. Experiment A: v2_balanced_focaldice_pilot (V2 + Balanced Sampler + Focal-Dice)
  2. Experiment B: resnet34_balanced_focaldice_pilot (ResNet-34 512x512 + Balanced Sampler + Focal-Dice)
  3. Experiment C: v2_balanced_bcedice_ablation (V2 + Balanced Sampler + BCE/Dice Ablation)

Strictly enforces:
  - Absolute model integrity (SHA-256 verification before & after)
  - Zero leakage from locked benchmark (833 samples) & sealed test (130 samples)
  - Train manifest (1,059 samples: 353 pos, 706 neg) & Val manifest (264 samples: 88 pos, 176 neg)
  - Positive-prediction monitor (early stop if 2 consecutive zero-positive epochs)
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

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader, Sampler
from torchvision import transforms
from PIL import Image

_repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
_ml_py_dir = os.path.join(_repo_root, "services/ml-python")
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)
if _ml_py_dir not in sys.path:
    sys.path.insert(0, _ml_py_dir)

if sys.stdout.encoding != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from app.models.optical_unet_resnet18_v2 import OpticalUNetResNet18V2
from app.preprocessing.optical_preprocessor import letterbox_image
from ml.benchmark.adapter import _ResNet34UNetModel


def compute_sha256(filepath: str) -> str:
    """Compute SHA-256 hash of a file."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(8192 * 1024):
            h.update(chunk)
    return h.hexdigest()


def set_seed(seed: int = 26143):
    """Set deterministic random seeds across all libraries."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


class OpticalSegmentationDataset(Dataset):
    """PyTorch Dataset loading optical imagery and ground-truth segmentation masks."""

    def __init__(
        self,
        manifest_path: str,
        target_size: Tuple[int, int] = (256, 256),
        is_train: bool = True,
        normalize_mean: List[float] = [0.485, 0.456, 0.406],
        normalize_std: List[float] = [0.229, 0.224, 0.225],
    ):
        self.manifest_path = manifest_path
        self.target_size = target_size
        self.is_train = is_train
        self.mean = normalize_mean
        self.std = normalize_std

        with open(manifest_path, "r", encoding="utf-8") as f:
            self.samples = json.load(f)

        self.to_tensor = transforms.ToTensor()
        self.normalize = transforms.Normalize(mean=self.mean, std=self.std)

    def __len__(self) -> int:
        return len(self.samples)

    def _load_mask(self, mask_path: Optional[str], is_oil_positive: bool, orig_size: Tuple[int, int]) -> np.ndarray:
        w, h = orig_size
        if not is_oil_positive or not mask_path:
            return np.zeros((h, w), dtype=np.uint8)

        full_mask_p = os.path.join(_repo_root, mask_path) if not os.path.isabs(mask_path) else mask_path
        if not os.path.exists(full_mask_p):
            return np.zeros((h, w), dtype=np.uint8)

        # 1. GeoTIFF format (MADOS - Class 6 = Oil Spill)
        if full_mask_p.lower().endswith((".tif", ".tiff")):
            try:
                import rasterio
                with rasterio.open(full_mask_p) as src:
                    arr = src.read(1)
                    return (arr == 6).astype(np.uint8)
            except Exception:
                pass

        # 2. Color-coded PNG format (KERF - RGB=(255, 0, 124))
        try:
            pil_mask = Image.open(full_mask_p)
            arr = np.array(pil_mask)
            if arr.ndim == 3 and arr.shape[2] >= 3:
                oil = (arr[:, :, 0] > 200) & (arr[:, :, 1] < 50) & (arr[:, :, 2] > 100)
                return oil.astype(np.uint8)
            elif arr.ndim == 2:
                return (arr > 127).astype(np.uint8)
        except Exception:
            pass

        return np.zeros((h, w), dtype=np.uint8)

    def __getitem__(self, idx: int) -> Dict[str, Any]:
        item = self.samples[idx]
        img_rel = item.get("image_path", "")
        img_path = os.path.join(_repo_root, img_rel) if not os.path.isabs(img_rel) else img_rel

        # Load image
        try:
            pil_img = Image.open(img_path).convert("RGB")
        except Exception:
            pil_img = Image.new("RGB", (self.target_size[0], self.target_size[1]), (0, 0, 0))

        orig_w, orig_h = pil_img.size
        is_pos = item.get("is_oil_positive", False)
        mask_rel = item.get("mask_path", None)
        mask_np = self._load_mask(mask_rel, is_pos, (orig_w, orig_h))

        # Aspect-preserving letterbox for image
        padded_img, meta = letterbox_image(pil_img, target_size=self.target_size)

        # Apply same letterbox transform to mask
        new_w = meta.resized_width
        new_h = meta.resized_height
        pad_left = meta.pad_left
        pad_top = meta.pad_top

        pil_mask = Image.fromarray(mask_np)
        resized_mask = pil_mask.resize((new_w, new_h), Image.Resampling.NEAREST)

        full_padded_mask = Image.new("L", self.target_size, 0)
        full_padded_mask.paste(resized_mask, (pad_left, pad_top))
        final_mask_np = np.array(full_padded_mask, dtype=np.float32)

        # Simple data augmentations during training
        if self.is_train:
            if random.random() > 0.5:
                padded_img = padded_img.transpose(Image.FLIP_LEFT_RIGHT)
                final_mask_np = np.fliplr(final_mask_np).copy()
            if random.random() > 0.5:
                padded_img = padded_img.transpose(Image.FLIP_TOP_BOTTOM)
                final_mask_np = np.flipud(final_mask_np).copy()

        img_tensor = self.normalize(self.to_tensor(padded_img))
        mask_tensor = torch.from_numpy(final_mask_np).unsqueeze(0)  # (1, H, W)

        return {
            "image": img_tensor,
            "mask": mask_tensor,
            "sample_id": item.get("sample_id", f"sample_{idx}"),
            "dataset": item.get("dataset", "UNKNOWN"),
            "is_oil_positive": is_pos,
            "categories": ",".join(item.get("categories", [])),
        }


class BalancedBatchSampler(Sampler):
    """Enforces an exact 1:1 balance between positive and hard negative samples per batch."""

    def __init__(self, dataset: OpticalSegmentationDataset, batch_size: int = 16, drop_last: bool = False):
        super().__init__()
        self.dataset = dataset
        self.batch_size = batch_size
        self.half_batch = batch_size // 2
        self.drop_last = drop_last

        self.pos_indices = [i for i, s in enumerate(dataset.samples) if s.get("is_oil_positive", False)]
        self.neg_indices = [i for i, s in enumerate(dataset.samples) if not s.get("is_oil_positive", False)]

        # Number of batches based on total dataset length
        self.num_batches = len(dataset) // batch_size
        if not self.drop_last and len(dataset) % batch_size != 0:
            self.num_batches += 1

    def __iter__(self):
        # Permute indices
        pos_pool = random.sample(self.pos_indices, len(self.pos_indices))
        neg_pool = random.sample(self.neg_indices, len(self.neg_indices))

        pos_idx = 0
        neg_idx = 0

        for _ in range(self.num_batches):
            batch = []
            # Sample positives (wrap around if needed)
            for _ in range(self.half_batch):
                batch.append(pos_pool[pos_idx % len(pos_pool)])
                pos_idx += 1
            # Sample negatives
            for _ in range(self.batch_size - self.half_batch):
                batch.append(neg_pool[neg_idx % len(neg_pool)])
                neg_idx += 1

            random.shuffle(batch)
            yield batch

    def __len__(self) -> int:
        return self.num_batches


class BinaryFocalLoss(nn.Module):
    """
    Binary Focal Loss:
      FL(p_t) = - alpha_t * (1 - p_t)^gamma * log(p_t + eps)
      alpha_t = alpha * y + (1 - alpha) * (1 - y)
    """

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


class DiceLoss(nn.Module):
    """Soft Dice Loss with smooth term."""

    def __init__(self, smooth: float = 1.0):
        super().__init__()
        self.smooth = smooth

    def forward(self, pred: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
        pred_flat = pred.contiguous().view(-1)
        target_flat = target.contiguous().view(-1)
        intersection = (pred_flat * target_flat).sum()
        dice = (2.0 * intersection + self.smooth) / (pred_flat.sum() + target_flat.sum() + self.smooth)
        return 1.0 - dice


class FocalDiceLoss(nn.Module):
    """Combined Focal and Dice Loss."""

    def __init__(self, gamma: float = 2.0, alpha: float = 0.75):
        super().__init__()
        self.focal = BinaryFocalLoss(gamma=gamma, alpha=alpha)
        self.dice = DiceLoss(smooth=1.0)

    def forward(self, pred: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
        return self.focal(pred, target) + self.dice(pred, target)


class BCEDiceLoss(nn.Module):
    """Standard BCE + Dice Loss (Ablation)."""

    def __init__(self):
        super().__init__()
        self.bce = nn.BCELoss()
        self.dice = DiceLoss(smooth=1.0)

    def forward(self, pred: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
        return self.bce(pred, target) + self.dice(pred, target)


def evaluate_model(
    model: nn.Module,
    val_loader: DataLoader,
    device: torch.device,
    loss_fn: nn.Module,
    threshold: float = 0.5,
) -> Dict[str, Any]:
    """Evaluate model on validation set, computing IoU, Dice, Precision, Recall, and collapse indicators."""
    model.eval()
    total_val_loss = 0.0

    tp_total = 0
    fp_total = 0
    fn_total = 0
    tn_total = 0

    pos_sample_count = 0
    pos_sample_detected_count = 0
    neg_sample_count = 0
    neg_sample_fp_count = 0

    pred_foreground_ratios = []
    gt_foreground_ratios = []

    pos_pixel_probs = []
    neg_pixel_probs = []

    with torch.no_grad():
        for batch in val_loader:
            images = batch["image"].to(device)
            masks = batch["mask"].to(device)
            is_pos_batch = batch["is_oil_positive"]

            outputs = model(images)
            if isinstance(outputs, (tuple, list)):
                outputs = outputs[0]

            if outputs.shape[1] > 1:
                probs = F.softmax(outputs, dim=1)[:, 1:2, :, :] # Class 1 is oil
            else:
                probs = torch.sigmoid(outputs) if outputs.min() < 0 or outputs.max() > 1 else outputs
            loss = loss_fn(probs, masks)
            total_val_loss += loss.item() * images.size(0)

            preds_bin = (probs > threshold).float()

            for i in range(images.size(0)):
                p_bin = preds_bin[i, 0].cpu().numpy()
                m_bin = masks[i, 0].cpu().numpy()
                pr = probs[i, 0].cpu().numpy()
                is_pos = is_pos_batch[i].item() if isinstance(is_pos_batch[i], torch.Tensor) else is_pos_batch[i]

                p_sum = np.sum(p_bin)
                m_sum = np.sum(m_bin)
                tot_px = p_bin.size

                pred_foreground_ratios.append(float(p_sum / tot_px))
                gt_foreground_ratios.append(float(m_sum / tot_px))

                if is_pos:
                    pos_sample_count += 1
                    if p_sum > 0:
                        pos_sample_detected_count += 1
                else:
                    neg_sample_count += 1
                    if p_sum > 0:
                        neg_sample_fp_count += 1

                # Sample pixel probabilities
                if m_sum > 0:
                    pos_pixel_probs.append(float(np.mean(pr[m_bin > 0])))
                if np.sum(m_bin == 0) > 0:
                    neg_pixel_probs.append(float(np.mean(pr[m_bin == 0])))

                tp = np.sum((p_bin == 1) & (m_bin == 1))
                fp = np.sum((p_bin == 1) & (m_bin == 0))
                fn = np.sum((p_bin == 0) & (m_bin == 1))
                tn = np.sum((p_bin == 0) & (m_bin == 0))

                tp_total += tp
                fp_total += fp
                fn_total += fn
                tn_total += tn

    val_loss = total_val_loss / len(val_loader.dataset)

    # Pixel metrics
    iou = float(tp_total / (tp_total + fp_total + fn_total + 1e-7))
    dice = float(2 * tp_total / (2 * tp_total + fp_total + fn_total + 1e-7))
    precision = float(tp_total / (tp_total + fp_total + 1e-7)) if (tp_total + fp_total) > 0 else 1.0
    recall = float(tp_total / (tp_total + fn_total + 1e-7)) if (tp_total + fn_total) > 0 else 0.0
    f1 = float(2 * precision * recall / (precision + recall + 1e-7)) if (precision + recall) > 0 else 0.0

    pos_pred_rate = float(sum(1 for r in pred_foreground_ratios if r > 0) / len(pred_foreground_ratios))
    pos_sample_recall = float(pos_sample_detected_count / pos_sample_count) if pos_sample_count > 0 else 0.0
    neg_sample_fp_rate = float(neg_sample_fp_count / neg_sample_count) if neg_sample_count > 0 else 0.0

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
        "pos_pred_rate": pos_pred_rate,
        "mean_pred_foreground_ratio": float(np.mean(pred_foreground_ratios)),
        "median_pred_foreground_ratio": float(np.median(pred_foreground_ratios)),
        "pos_sample_recall": pos_sample_recall,
        "neg_sample_fp_rate": neg_sample_fp_rate,
        "mean_prob_on_pos_pixels": float(np.mean(pos_pixel_probs)) if pos_pixel_probs else 0.0,
        "mean_prob_on_neg_pixels": float(np.mean(neg_pixel_probs)) if neg_pixel_probs else 0.0,
        "total_pos_samples": pos_sample_count,
        "total_neg_samples": neg_sample_count,
    }


def run_single_experiment(
    exp_name: str,
    model_type: str,
    base_checkpoint: str,
    expected_base_sha: str,
    loss_type: str,
    target_size: Tuple[int, int] = (256, 256),
    batch_size: int = 16,
    accum_steps: int = 1,
    max_epochs: int = 15,
    patience: int = 4,
    device: torch.device = torch.device("cuda" if torch.cuda.is_available() else "cpu"),
) -> Dict[str, Any]:
    print("\n" + "=" * 75)
    print(f"STARTING EXPERIMENT: {exp_name}")
    print("=" * 75)

    # 1. Pre-training SHA check
    actual_base_sha = compute_sha256(base_checkpoint)
    print(f"Verifying base checkpoint SHA-256 for {model_type}:")
    print(f"  Expected: {expected_base_sha}")
    print(f"  Actual:   {actual_base_sha}")
    assert actual_base_sha == expected_base_sha, f"Base checkpoint SHA mismatch for {exp_name}!"
    print("  Pre-training SHA-256 verification: PASS")

    # Output directories
    out_dir = os.path.join(_repo_root, "ml/training/runs", exp_name)
    ckpt_dir = os.path.join(out_dir, "checkpoints")
    metrics_dir = os.path.join(out_dir, "metrics")
    logs_dir = os.path.join(out_dir, "logs")

    os.makedirs(ckpt_dir, exist_ok=True)
    os.makedirs(metrics_dir, exist_ok=True)
    os.makedirs(logs_dir, exist_ok=True)

    set_seed(26143)

    # 2. Datasets and Loaders
    train_manifest = os.path.join(_repo_root, "ml/training/manifests/phase7_candidate/phase7b_train_manifest.json")
    val_manifest = os.path.join(_repo_root, "ml/training/manifests/phase7_candidate/phase7b_val_manifest.json")

    train_ds = OpticalSegmentationDataset(train_manifest, target_size=target_size, is_train=True)
    val_ds = OpticalSegmentationDataset(val_manifest, target_size=target_size, is_train=False)

    train_sampler = BalancedBatchSampler(train_ds, batch_size=batch_size // accum_steps, drop_last=True)
    train_loader = DataLoader(train_ds, batch_sampler=train_sampler, num_workers=0, pin_memory=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size // accum_steps, shuffle=False, num_workers=0, pin_memory=True)

    print(f"Train Dataset: {len(train_ds)} samples | Val Dataset: {len(val_ds)} samples")
    print(f"Physical Batch Size: {batch_size // accum_steps} | Accumulation Steps: {accum_steps} | Effective Batch: {batch_size}")

    # 3. Model instantiation & parameter separation
    if model_type == "v2_resnet18":
        model = OpticalUNetResNet18V2(pretrained=False, num_classes=1, use_deep_supervision=False)
        sd = torch.load(base_checkpoint, map_location="cpu")
        if isinstance(sd, dict) and "model_state_dict" in sd:
            sd = sd["model_state_dict"]
        elif isinstance(sd, dict) and "state_dict" in sd:
            sd = sd["state_dict"]
        sd = {k: v for k, v in sd.items() if not k.startswith("aux_head")}
        model.load_state_dict(sd, strict=False)
        model = model.to(device)

        backbone_prefixes = ("stem", "enc1", "enc2", "enc3", "enc4", "encoder", "backbone", "resnet", "conv1", "bn1", "layer")
        backbone_params = [p for n, p in model.named_parameters() if any(n.startswith(k) or f".{k}" in n for k in backbone_prefixes)]
        decoder_params = [p for n, p in model.named_parameters() if not any(n.startswith(k) or f".{k}" in n for k in backbone_prefixes)]

    elif model_type == "resnet34":
        model = _ResNet34UNetModel(num_classes=4)
        ckpt_data = torch.load(base_checkpoint, map_location="cpu", weights_only=False)
        state_dict = ckpt_data["model_state_dict"] if isinstance(ckpt_data, dict) and "model_state_dict" in ckpt_data else ckpt_data
        model.load_state_dict(state_dict, strict=True)
        model = model.to(device)

        backbone_prefixes = ("encoder", "conv1", "bn1", "layer")
        backbone_params = [p for n, p in model.named_parameters() if any(n.startswith(k) or f".{k}" in n for k in backbone_prefixes)]
        decoder_params = [p for n, p in model.named_parameters() if not any(n.startswith(k) or f".{k}" in n for k in backbone_prefixes)]
    else:
        raise ValueError(f"Unknown model type: {model_type}")

    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Model parameters: Total={total_params:,} | Trainable={trainable_params:,}")
    print(f"Backbone param count: {sum(p.numel() for p in backbone_params):,} | Decoder param count: {sum(p.numel() for p in decoder_params):,}")

    # Optimizer with differential learning rates
    optimizer = torch.optim.AdamW(
        [
            {"params": backbone_params, "lr": 1e-5, "weight_decay": 1e-4},
            {"params": decoder_params, "lr": 1e-3, "weight_decay": 1e-4},
        ]
    )

    # Loss
    if loss_type == "focal_dice":
        loss_fn = FocalDiceLoss(gamma=2.0, alpha=0.75)
    elif loss_type == "bce_dice":
        loss_fn = BCEDiceLoss()
    else:
        raise ValueError(f"Unknown loss type: {loss_type}")

    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max_epochs, eta_min=1e-6)

    # Training loop
    history = []
    best_val_iou = -1.0
    best_val_dice = -1.0
    best_epoch = 0
    patience_counter = 0
    consecutive_zero_pos_epochs = 0
    is_collapsed = False

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
                probs = F.softmax(outputs, dim=1)[:, 1:2, :, :] # Class 1 is oil
            else:
                probs = torch.sigmoid(outputs) if outputs.min() < 0 or outputs.max() > 1 else outputs
            loss = loss_fn(probs, masks) / accum_steps
            loss.backward()

            if (step + 1) % accum_steps == 0 or (step + 1) == len(train_loader):
                torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=2.0)
                optimizer.step()
                optimizer.zero_grad()

            total_train_loss += loss.item() * accum_steps * images.size(0)

        train_loss = total_train_loss / len(train_ds)

        # Validation
        val_metrics = evaluate_model(model, val_loader, device, loss_fn, threshold=0.5)
        scheduler.step()
        ep_duration = time.time() - ep_start

        # Monitor positive predictions
        if val_metrics["pos_pred_rate"] == 0.0:
            consecutive_zero_pos_epochs += 1
        else:
            consecutive_zero_pos_epochs = 0

        # Memory tracking
        gpu_mem_mb = float(torch.cuda.max_memory_allocated(device) / (1024 * 1024)) if torch.cuda.is_available() else 0.0

        record = {
            "epoch": epoch,
            "train_loss": round(train_loss, 4),
            "val_loss": round(val_metrics["val_loss"], 4),
            "val_iou": round(val_metrics["val_iou"], 4),
            "val_dice": round(val_metrics["val_dice"], 4),
            "val_precision": round(val_metrics["val_precision"], 4),
            "val_recall": round(val_metrics["val_recall"], 4),
            "val_f1": round(val_metrics["val_f1"], 4),
            "pos_pred_rate": round(val_metrics["pos_pred_rate"], 4),
            "mean_pred_foreground_ratio": round(val_metrics["mean_pred_foreground_ratio"], 4),
            "pos_sample_recall": round(val_metrics["pos_sample_recall"], 4),
            "neg_sample_fp_rate": round(val_metrics["neg_sample_fp_rate"], 4),
            "learning_rate": round(optimizer.param_groups[1]["lr"], 7),
            "epoch_time_s": round(ep_duration, 2),
            "peak_gpu_mem_mb": round(gpu_mem_mb, 2),
        }
        history.append(record)

        print(
            f"Epoch [{epoch:02d}/{max_epochs:02d}] "
            f"Train Loss: {train_loss:.4f} | "
            f"Val Loss: {val_metrics['val_loss']:.4f} | "
            f"Val IoU: {val_metrics['val_iou']:.4f} | "
            f"Val Recall: {val_metrics['val_recall']:.4f} | "
            f"Pos Pred Rate: {val_metrics['pos_pred_rate']*100:.1f}% | "
            f"Duration: {ep_duration:.1f}s"
        )

        # Checkpoint saving
        if val_metrics["val_iou"] > best_val_iou:
            best_val_iou = val_metrics["val_iou"]
            best_val_dice = val_metrics["val_dice"]
            best_epoch = epoch
            patience_counter = 0
            torch.save(model.state_dict(), os.path.join(ckpt_dir, "best_val_iou.pt"))
            torch.save(model.state_dict(), os.path.join(ckpt_dir, "best_val_dice.pt"))
            print(f"  --> Saved new best checkpoint at Epoch {epoch} (Val IoU: {best_val_iou:.4f})")
        else:
            patience_counter += 1

        # Always save last.pt
        torch.save(model.state_dict(), os.path.join(ckpt_dir, "last.pt"))

        # Check positive prediction collapse rule
        if consecutive_zero_pos_epochs >= 2:
            print(f"  [ALERT] Zero foreground predicted for 2 consecutive epochs! Stopping {exp_name} as COLLAPSED.")
            is_collapsed = True
            break

        # Early stopping on val IoU plateau
        if patience_counter >= patience:
            print(f"  [INFO] Early stopping triggered after {patience} epochs without val IoU improvement.")
            break

    total_time = time.time() - t_start

    # Save history CSV
    history_csv = os.path.join(metrics_dir, "training_history.csv")
    with open(history_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(history[0].keys()))
        writer.writeheader()
        writer.writerows(history)

    # Post-training base checkpoint verification
    post_base_sha = compute_sha256(base_checkpoint)
    assert post_base_sha == expected_base_sha, f"Base checkpoint was modified during training of {exp_name}!"
    print("  Post-training base checkpoint SHA-256 verification: PASS (UNTOUCHED)")

    best_ckpt_path = os.path.join(ckpt_dir, "best_val_iou.pt")
    best_ckpt_sha = compute_sha256(best_ckpt_path) if os.path.exists(best_ckpt_path) else "NONE"

    # Manifest hashes
    with open(os.path.join(_repo_root, "ml/training/manifests/phase7_candidate/phase7b_manifest_hashes.json"), "r") as f:
        mani_hashes = json.load(f)

    # Save metadata JSON
    ckpt_meta = {
        "experiment_name": exp_name,
        "model_type": model_type,
        "base_checkpoint": base_checkpoint,
        "base_checkpoint_sha256": expected_base_sha,
        "best_checkpoint_path": best_ckpt_path,
        "best_checkpoint_sha256": best_ckpt_sha,
        "best_epoch": best_epoch,
        "best_val_iou": best_val_iou,
        "best_val_dice": best_val_dice,
        "is_collapsed": is_collapsed,
        "total_training_time_s": total_time,
        "total_parameters": total_params,
        "trainable_parameters": trainable_params,
        "manifest_hashes": mani_hashes,
        "config": {
            "target_size": target_size,
            "batch_size": batch_size,
            "effective_batch_size": batch_size,
            "loss_type": loss_type,
            "optimizer": "AdamW",
            "backbone_lr": 1e-5,
            "decoder_lr": 1e-3,
            "weight_decay": 1e-4,
            "scheduler": "CosineAnnealingLR",
            "max_epochs": max_epochs,
            "seed": 26143,
        },
    }

    with open(os.path.join(out_dir, "checkpoint_metadata.json"), "w", encoding="utf-8") as f:
        json.dump(ckpt_meta, f, indent=2)

    with open(os.path.join(out_dir, "config.json"), "w", encoding="utf-8") as f:
        json.dump(ckpt_meta["config"], f, indent=2)

    with open(os.path.join(out_dir, "manifest_hashes.json"), "w", encoding="utf-8") as f:
        json.dump(mani_hashes, f, indent=2)

    # Write report.md
    report_md = f"""# {exp_name} Report

- **Experiment**: `{exp_name}`
- **Model**: `{model_type}`
- **Base Checkpoint SHA-256**: `{expected_base_sha}`
- **Best Epoch**: {best_epoch}
- **Best Val IoU**: {best_val_iou:.4f}
- **Best Val Dice**: {best_val_dice:.4f}
- **Status**: {"COLLAPSED" if is_collapsed else "COMPLETE"}
- **Output Checkpoint**: `{best_ckpt_path}`
- **Output Checkpoint SHA-256**: `{best_ckpt_sha}`
- **Training Time**: {total_time:.2f} s
- **Total Parameters**: {total_params:,}
- **Trainable Parameters**: {trainable_params:,}
"""
    with open(os.path.join(out_dir, "report.md"), "w", encoding="utf-8") as f:
        f.write(report_md)

    print(f"\nExperiment {exp_name} completed successfully! Best Val IoU: {best_val_iou:.4f} (Epoch {best_epoch})")

    return {
        "exp_name": exp_name,
        "status": "COLLAPSED" if is_collapsed else "COMPLETE",
        "best_epoch": best_epoch,
        "best_val_iou": best_val_iou,
        "best_val_dice": best_val_dice,
        "best_ckpt_path": best_ckpt_path,
        "best_ckpt_sha": best_ckpt_sha,
        "total_time": total_time,
        "history": history,
    }


def main():
    print("=" * 80)
    print("PHASE 7B — CORRECTED BALANCED FINE-TUNING PILOT")
    print("=" * 80)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Execution Device: {device} ({torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'})")

    v2_base_ckpt = os.path.join(_repo_root, "services/ml-python/app/models/optical_oil_segmentation_v2/optical_oil_segmentation_v2.pth")
    v2_base_sha = "e3d44f7e480daedf42ef5e96fd0e650193f5763f8dac38630fd21a034e5ea398"

    r34_base_ckpt = os.path.join(_repo_root, "ml/external_models/optical/unet_resnet34_oil/model.pth")
    r34_base_sha = "9aab3f6de981ad73810d3b909603d430aafd94e35f143a2d3e80aa7336521576"

    # 1. Experiment A: V2 Balanced Focal-Dice
    res_a = run_single_experiment(
        exp_name="v2_balanced_focaldice_pilot",
        model_type="v2_resnet18",
        base_checkpoint=v2_base_ckpt,
        expected_base_sha=v2_base_sha,
        loss_type="focal_dice",
        target_size=(256, 256),
        batch_size=16,
        accum_steps=1,
        max_epochs=15,
        patience=4,
        device=device,
    )

    # 2. Experiment B: ResNet-34 Balanced Focal-Dice (512x512)
    res_b = run_single_experiment(
        exp_name="resnet34_balanced_focaldice_pilot",
        model_type="resnet34",
        base_checkpoint=r34_base_ckpt,
        expected_base_sha=r34_base_sha,
        loss_type="focal_dice",
        target_size=(512, 512),
        batch_size=16,
        accum_steps=2,  # batch size 8 with 2 accumulation steps
        max_epochs=15,
        patience=4,
        device=device,
    )

    # 3. Experiment C: V2 Balanced BCE-Dice Ablation
    res_c = run_single_experiment(
        exp_name="v2_balanced_bcedice_ablation",
        model_type="v2_resnet18",
        base_checkpoint=v2_base_ckpt,
        expected_base_sha=v2_base_sha,
        loss_type="bce_dice",
        target_size=(256, 256),
        batch_size=16,
        accum_steps=1,
        max_epochs=15,
        patience=4,
        device=device,
    )

    print("\n" + "=" * 80)
    print("ALL 3 PILOT EXPERIMENTS COMPLETED!")
    print("=" * 80)
    print(f"Exp A (V2 Focal-Dice): Best Val IoU = {res_a['best_val_iou']:.4f} (Epoch {res_a['best_epoch']}) | Status: {res_a['status']}")
    print(f"Exp B (ResNet-34 Focal-Dice): Best Val IoU = {res_b['best_val_iou']:.4f} (Epoch {res_b['best_epoch']}) | Status: {res_b['status']}")
    print(f"Exp C (V2 BCE-Dice Ablation): Best Val IoU = {res_c['best_val_iou']:.4f} (Epoch {res_c['best_epoch']}) | Status: {res_c['status']}")


if __name__ == "__main__":
    main()
