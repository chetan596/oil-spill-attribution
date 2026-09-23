"""
Confusion matrix computation for oil spill binary segmentation.

Calculates True Positives (TP), False Positives (FP),
False Negatives (FN), and True Negatives (TN) from predicted
and ground-truth binary masks or probability maps.
"""
from typing import Optional, Dict, Any
import numpy as np

from ml.evaluation.metrics import _binarize_inputs, compute_precision, compute_recall, compute_f1, compute_fpr


def generate_confusion_matrix(
    y_true: Any,
    y_pred: Any,
    threshold: Optional[float] = None,
) -> Dict[str, int]:
    """
    Generate pixel-level confusion matrix for binary segmentation.

    Pixel classifications:
        - TP (True Positive):  y_pred == 1 and y_true == 1
        - FP (False Positive): y_pred == 1 and y_true == 0
        - FN (False Negative): y_pred == 0 and y_true == 1
        - TN (True Negative):  y_pred == 0 and y_true == 0

    Args:
        y_true: Ground-truth binary mask (NumPy array, PyTorch Tensor, or sequence).
        y_pred: Predicted mask or probability map (NumPy array, PyTorch Tensor, or sequence).
        threshold: Optional binarization threshold for continuous probabilities.

    Returns:
        Dict[str, int]: Dictionary containing integer counts {"tp": ..., "fp": ..., "fn": ..., "tn": ...}.
    """
    # Note: _binarize_inputs takes (pred, target)
    p_bin, t_bin = _binarize_inputs(y_pred, y_true, threshold=threshold)

    tp = int(np.logical_and(p_bin, t_bin).sum())
    fp = int(np.logical_and(p_bin, ~t_bin).sum())
    fn = int(np.logical_and(~p_bin, t_bin).sum())
    tn = int(np.logical_and(~p_bin, ~t_bin).sum())

    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
    }


def calculate_confusion_metrics(
    cm: Dict[str, int],
    zero_division: float = 0.0,
) -> Dict[str, float]:
    """
    Compute derived evaluation metrics from a confusion matrix dictionary.

    Args:
        cm: Dictionary with keys 'tp', 'fp', 'fn', 'tn'.
        zero_division: Fallback value for zero-division cases.

    Returns:
        Dict[str, float]: Derived metrics including precision, recall, f1, iou, dice, fpr, accuracy.
    """
    tp = cm["tp"]
    fp = cm["fp"]
    fn = cm["fn"]
    tn = cm["tn"]

    total = tp + fp + fn + tn
    accuracy = (tp + tn) / total if total > 0 else float(zero_division)

    precision = compute_precision(tp, fp, zero_division=zero_division)
    recall = compute_recall(tp, fn, zero_division=zero_division)
    f1 = compute_f1(precision, recall, zero_division=zero_division)
    fpr = compute_fpr(fp, tn, zero_division=zero_division)

    union = tp + fp + fn
    iou = float(tp / union) if union > 0 else (1.0 if (tp == 0 and fp == 0 and fn == 0) else float(zero_division))
    dice = float((2.0 * tp) / (2.0 * tp + fp + fn)) if (2.0 * tp + fp + fn) > 0 else (1.0 if (tp == 0 and fp == 0 and fn == 0) else float(zero_division))

    return {
        "accuracy": float(accuracy),
        "precision": float(precision),
        "recall": float(recall),
        "f1": float(f1),
        "iou": float(iou),
        "dice": float(dice),
        "fpr": float(fpr),
    }
