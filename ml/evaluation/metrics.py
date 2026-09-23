"""
Evaluation metrics for oil spill detection models.

Provides genuine, mathematically rigorous metrics for binary segmentation
and classification evaluation supporting both NumPy ndarrays and PyTorch Tensors.
"""
from typing import Optional, Union, Tuple, Any
import numpy as np

try:
    import torch
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False


def _binarize_inputs(
    pred: Any,
    target: Any,
    threshold: Optional[float] = None,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Validate shapes and convert inputs into boolean NumPy masks.
    Supports NumPy arrays, PyTorch Tensors, and nested sequences.
    """
    if HAS_TORCH and isinstance(pred, torch.Tensor):
        pred_arr = pred.detach().cpu().numpy()
    else:
        pred_arr = np.asarray(pred)

    if HAS_TORCH and isinstance(target, torch.Tensor):
        target_arr = target.detach().cpu().numpy()
    else:
        target_arr = np.asarray(target)

    if pred_arr.shape != target_arr.shape:
        raise ValueError(
            f"Shape mismatch: prediction shape {pred_arr.shape} does not match "
            f"target shape {target_arr.shape}"
        )

    # Binarize prediction
    if threshold is not None:
        pred_bin = pred_arr >= threshold
    elif np.issubdtype(pred_arr.dtype, np.floating) and ((pred_arr > 0) & (pred_arr < 1)).any():
        # Float probabilities without explicit threshold: default to standard 0.5 threshold
        pred_bin = pred_arr >= 0.5
    else:
        pred_bin = pred_arr != 0

    # Binarize target
    if threshold is not None and np.issubdtype(target_arr.dtype, np.floating) and ((target_arr > 0) & (target_arr < 1)).any():
        target_bin = target_arr >= threshold
    else:
        target_bin = target_arr != 0

    return pred_bin.astype(bool), target_bin.astype(bool)


def compute_iou(
    pred: Any,
    target: Any,
    threshold: Optional[float] = None,
    smooth: float = 0.0,
    zero_division: float = 1.0,
) -> float:
    """
    Compute genuine Intersection over Union (Jaccard Index) for binary segmentation.

    Mathematical definition:
        IoU = |pred ∩ target| / |pred ∪ target|
            = intersection / union

    Edge-Case Conventions:
    - Both masks empty (no ground-truth spill, no predicted spill):
      When union == 0, there are zero positive pixels in either mask.
      In satellite SAR ocean monitoring and medical segmentation, correctly predicting
      the complete absence of oil on clean water is 100% accurate (IoU = 1.0).
      This behavior is controlled by `zero_division` (default 1.0).
    - Empty prediction with non-empty target (missed spill):
      intersection is 0, union > 0 -> IoU = 0.0.
    - Non-empty prediction with empty target (false alarm):
      intersection is 0, union > 0 -> IoU = 0.0.
    - Completely disjoint non-empty masks:
      intersection is 0, union > 0 -> IoU = 0.0.
    - Shape mismatch:
      Raises ValueError.

    Args:
        pred: Predicted mask or probability map (NumPy array, PyTorch Tensor, or sequence).
        target: Ground-truth binary mask (NumPy array, PyTorch Tensor, or sequence).
        threshold: Optional binarization threshold for continuous probabilities.
        smooth: Smoothing epsilon added to numerator and denominator (default 0.0).
        zero_division: Return value when both masks are empty (union == 0, default 1.0).

    Returns:
        float: Computed IoU value in range [0.0, 1.0].
    """
    p_bin, t_bin = _binarize_inputs(pred, target, threshold=threshold)

    intersection = float(np.logical_and(p_bin, t_bin).sum())
    union = float(np.logical_or(p_bin, t_bin).sum())

    if union == 0.0:
        return float(zero_division)

    if smooth > 0.0:
        return float((intersection + smooth) / (union + smooth))

    return float(intersection / union)


def compute_f1(
    precision: float,
    recall: float,
    zero_division: float = 0.0,
) -> float:
    """
    Compute harmonic mean of precision and recall (F1 score).

    Mathematical definition:
        F1 = 2 * (precision * recall) / (precision + recall)

    Args:
        precision: Precision value in [0.0, 1.0].
        recall: Recall value in [0.0, 1.0].
        zero_division: Return value when precision + recall == 0 (default 0.0).

    Returns:
        float: F1 score in range [0.0, 1.0].
    """
    denom = precision + recall
    if denom <= 0.0:
        return float(zero_division)
    return float((2.0 * precision * recall) / denom)


def compute_precision(
    tp: Union[int, float],
    fp: Union[int, float],
    zero_division: float = 0.0,
) -> float:
    """
    Compute precision (positive predictive value).

    Precision = TP / (TP + FP)
    """
    denom = tp + fp
    if denom <= 0:
        return float(zero_division)
    return float(tp / denom)


def compute_recall(
    tp: Union[int, float],
    fn: Union[int, float],
    zero_division: float = 0.0,
) -> float:
    """
    Compute recall / sensitivity / true positive rate.

    Recall = TP / (TP + FN)
    """
    denom = tp + fn
    if denom <= 0:
        return float(zero_division)
    return float(tp / denom)


def compute_fpr(
    fp: Union[int, float],
    tn: Union[int, float],
    zero_division: float = 0.0,
) -> float:
    """
    Compute false positive rate (fall-out).

    FPR = FP / (FP + TN)
    """
    denom = fp + tn
    if denom <= 0:
        return float(zero_division)
    return float(fp / denom)
