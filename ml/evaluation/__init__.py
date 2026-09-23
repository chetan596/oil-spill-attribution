"""
ML Evaluation Package for Oil Spill Detection.

Exposes genuine segmentation metrics, confusion matrix calculations,
and derived statistical measures.
"""

from ml.evaluation.metrics import (
    compute_iou,
    compute_f1,
    compute_precision,
    compute_recall,
    compute_fpr,
)
from ml.evaluation.segmentation_metrics import (
    dice_coefficient,
    compute_dice,
)
from ml.evaluation.confusion_matrix import (
    generate_confusion_matrix,
    calculate_confusion_metrics,
)
from ml.evaluation.real_evaluator import (
    RealEvaluator,
    RealCheckpointRequiredError,
    DatasetNotFoundError,
    EvaluationError,
)

__all__ = [
    "compute_iou",
    "compute_f1",
    "compute_precision",
    "compute_recall",
    "compute_fpr",
    "dice_coefficient",
    "compute_dice",
    "generate_confusion_matrix",
    "calculate_confusion_metrics",
    "RealEvaluator",
    "RealCheckpointRequiredError",
    "DatasetNotFoundError",
    "EvaluationError",
]
