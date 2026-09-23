"""
Segmentation metrics for oil spill detection models.

Provides genuine, mathematically rigorous Dice / F1 segmentation evaluation
supporting both NumPy ndarrays and PyTorch Tensors.
"""
from typing import Optional, Any
import numpy as np

from ml.evaluation.metrics import _binarize_inputs


def dice_coefficient(
    pred: Any,
    target: Any,
    threshold: Optional[float] = None,
    smooth: float = 0.0,
    zero_division: float = 1.0,
) -> float:
    """
    Compute genuine Sørensen-Dice coefficient for binary segmentation.

    Mathematical definition:
        Dice = 2 * |pred ∩ target| / (|pred| + |target|)
             = 2 * intersection / (pred_sum + target_sum)

    Edge-Case Conventions:
    - Both masks empty (no ground-truth spill, no predicted spill):
      When pred_sum + target_sum == 0, there are zero positive pixels in either mask.
      In satellite SAR ocean monitoring and medical segmentation, correctly predicting
      the complete absence of oil on clean water is 100% accurate (Dice = 1.0).
      This behavior is controlled by `zero_division` (default 1.0).
    - No overlap (completely disjoint non-empty masks):
      intersection is 0, pred_sum + target_sum > 0 -> Dice = 0.0.
    - Partial overlap:
      returns exact mathematical Dice coefficient.
    - Perfect agreement:
      returns 1.0.
    - Shape mismatch:
      Raises ValueError.

    Args:
        pred: Predicted mask or probability map (NumPy array, PyTorch Tensor, or sequence).
        target: Ground-truth binary mask (NumPy array, PyTorch Tensor, or sequence).
        threshold: Optional binarization threshold for continuous probabilities.
        smooth: Smoothing epsilon added to numerator and denominator (default 0.0).
        zero_division: Return value when both masks are empty (sum == 0, default 1.0).

    Returns:
        float: Computed Dice coefficient in range [0.0, 1.0].
    """
    p_bin, t_bin = _binarize_inputs(pred, target, threshold=threshold)

    intersection = float(np.logical_and(p_bin, t_bin).sum())
    pred_sum = float(p_bin.sum())
    target_sum = float(t_bin.sum())
    total_sum = pred_sum + target_sum

    if total_sum == 0.0:
        return float(zero_division)

    if smooth > 0.0:
        return float((2.0 * intersection + smooth) / (total_sum + smooth))

    return float((2.0 * intersection) / total_sum)


# Alias for naming consistency across segmentation literature
compute_dice = dice_coefficient
