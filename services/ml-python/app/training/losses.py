"""
Loss functions and evaluation metrics for SAR Semantic Segmentation.
=====================================================================

Implements:
  - CombinedLoss: Weighted CrossEntropyLoss + Soft Dice Loss
  - SoftDiceLoss: Multiclass/binary differentiable Dice loss
  - MetricCalculator: IoU (Jaccard), Dice (F1), Precision, Recall, Specificity, FPR
"""

from typing import Dict, Tuple
import torch
import torch.nn as nn
import torch.nn.functional as F


class SoftDiceLoss(nn.Module):
    """
    Soft Dice Loss for 2-class semantic segmentation.
    Computes smooth Dice coefficient on foreground probabilities (class 1).
    """

    def __init__(self, smooth: float = 1e-6, class_index: int = 1):
        super().__init__()
        self.smooth = smooth
        self.class_index = class_index

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        """
        Args:
            logits: (B, 2, H, W) raw model outputs
            targets: (B, H, W) integer ground-truth masks (0 or 1)
        """
        probs = F.softmax(logits, dim=1)
        pred_fg = probs[:, self.class_index, :, :].contiguous().view(-1)
        target_fg = (targets == self.class_index).float().contiguous().view(-1)

        intersection = (pred_fg * target_fg).sum()
        dice = (2.0 * intersection + self.smooth) / (pred_fg.sum() + target_fg.sum() + self.smooth)
        return 1.0 - dice


class FocalLoss(nn.Module):
    """
    Focal Loss for addressing extreme foreground/background class imbalance.
    FL(p_t) = -alpha_t * (1 - p_t)^gamma * log(p_t)
    """

    def __init__(self, alpha: float = 0.75, gamma: float = 2.0):
        super().__init__()
        self.alpha = alpha
        self.gamma = gamma

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        probs = F.softmax(logits, dim=1)
        # Gather predicted prob of the true class
        p_t = probs.gather(1, targets.unsqueeze(1)).squeeze(1)
        alpha_t = torch.where(targets == 1, self.alpha, 1.0 - self.alpha)
        focal_weight = alpha_t * ((1.0 - p_t).clamp(min=0.0) ** self.gamma)
        log_p_t = torch.log(p_t.clamp(min=1e-7))
        loss = -focal_weight * log_p_t
        return loss.mean()


class FocalDiceLoss(nn.Module):
    """
    Combined Focal Loss + Soft Dice Loss for robust marine oil spill segmentation.
    """

    def __init__(
        self,
        alpha: float = 0.75,
        gamma: float = 2.0,
        dice_weight: float = 1.0,
        smooth: float = 1e-6,
    ):
        super().__init__()
        self.focal = FocalLoss(alpha=alpha, gamma=gamma)
        self.dice = SoftDiceLoss(smooth=smooth, class_index=1)
        self.dice_weight = dice_weight

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> Tuple[torch.Tensor, Dict[str, float]]:
        focal = self.focal(logits, targets)
        dice = self.dice(logits, targets)
        total = focal + self.dice_weight * dice
        return total, {"loss_total": total.item(), "loss_focal": focal.item(), "loss_dice": dice.item()}


class CombinedLoss(nn.Module):
    """
    Combined Weighted CrossEntropy + Soft Dice Loss.
    """

    def __init__(
        self,
        weight: float = 1.0,
        dice_weight: float = 1.0,
        class_weights: torch.Tensor = None,
        smooth: float = 1e-6,
    ):
        super().__init__()
        self.ce_weight = weight
        self.dice_weight = dice_weight
        self.ce_loss = nn.CrossEntropyLoss(weight=class_weights)
        self.dice_loss = SoftDiceLoss(smooth=smooth, class_index=1)

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> Tuple[torch.Tensor, Dict[str, float]]:
        ce = self.ce_loss(logits, targets)
        dice = self.dice_loss(logits, targets)
        total = self.ce_weight * ce + self.dice_weight * dice
        return total, {"loss_total": total.item(), "loss_ce": ce.item(), "loss_dice": dice.item()}


def calculate_metrics(
    preds: torch.Tensor,
    targets: torch.Tensor,
    threshold: float = 0.5,
    class_index: int = 1,
    smooth: float = 1e-6,
) -> Dict[str, float]:
    """
    Calculate segmentation metrics (IoU, Dice/F1, Precision, Recall, FPR) on tensors.

    Args:
        preds: (B, 2, H, W) logits or probabilities
        targets: (B, H, W) integer ground-truth labels
    """
    with torch.no_grad():
        if preds.dim() == 4 and preds.size(1) == 2:
            probs = F.softmax(preds, dim=1)[:, class_index, :, :]
            bin_preds = (probs >= threshold).long()
        elif preds.dim() == 4 and preds.size(1) == 1:
            probs = torch.sigmoid(preds[:, 0, :, :])
            bin_preds = (probs >= threshold).long()
        else:
            bin_preds = (preds >= threshold).long()

        bin_targets = (targets == class_index).long()

        # Flatten
        p = bin_preds.contiguous().view(-1)
        t = bin_targets.contiguous().view(-1)

        tp = ((p == 1) & (t == 1)).sum().float().item()
        fp = ((p == 1) & (t == 0)).sum().float().item()
        fn = ((p == 0) & (t == 1)).sum().float().item()
        tn = ((p == 0) & (t == 0)).sum().float().item()

        precision = (tp + smooth) / (tp + fp + smooth)
        recall = (tp + smooth) / (tp + fn + smooth)
        dice = (2.0 * tp + smooth) / (2.0 * tp + fp + fn + smooth)
        iou = (tp + smooth) / (tp + fp + fn + smooth)
        fpr = (fp + smooth) / (fp + tn + smooth)

        return {
            "iou": float(iou),
            "dice": float(dice),
            "precision": float(precision),
            "recall": float(recall),
            "fpr": float(fpr),
            "tp": int(tp),
            "fp": int(fp),
            "fn": int(fn),
            "tn": int(tn),
        }
