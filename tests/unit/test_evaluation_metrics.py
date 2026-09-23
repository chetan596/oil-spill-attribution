"""
Comprehensive unit tests for ml.evaluation metrics:
- Intersection over Union (compute_iou)
- Dice coefficient (dice_coefficient)
- Confusion matrix (generate_confusion_matrix)
- Derived metrics (precision, recall, f1, fpr)
"""
import pytest
import numpy as np
import torch

from ml.evaluation.metrics import (
    compute_iou,
    compute_f1,
    compute_precision,
    compute_recall,
    compute_fpr,
)
from ml.evaluation.segmentation_metrics import dice_coefficient, compute_dice
from ml.evaluation.confusion_matrix import (
    generate_confusion_matrix,
    calculate_confusion_metrics,
)


class TestIoU:
    def test_perfect_prediction_numpy(self):
        target = np.array([[1, 1], [0, 0]])
        pred = np.array([[1, 1], [0, 0]])
        iou = compute_iou(pred, target)
        assert iou == 1.0

    def test_perfect_prediction_torch(self):
        target = torch.tensor([[1, 1], [0, 0]])
        pred = torch.tensor([[1, 1], [0, 0]])
        iou = compute_iou(pred, target)
        assert iou == 1.0

    def test_completely_disjoint_masks(self):
        target = np.array([[1, 1], [0, 0]])
        pred = np.array([[0, 0], [1, 1]])
        iou = compute_iou(pred, target)
        assert iou == 0.0

    def test_partial_overlap(self):
        # target has 2 ones, pred has 1 one overlapping
        # intersection = 1, union = 2 -> IoU = 0.5
        target = np.array([[1, 1], [0, 0]])
        pred = np.array([[1, 0], [0, 0]])
        iou = compute_iou(pred, target)
        assert iou == 0.5

    def test_both_empty_default_convention(self):
        # Both empty: union == 0 -> convention is 1.0 (clean ocean accurate detection)
        target = np.zeros((4, 4), dtype=int)
        pred = np.zeros((4, 4), dtype=int)
        iou = compute_iou(pred, target)
        assert iou == 1.0

    def test_both_empty_custom_zero_division(self):
        target = np.zeros((4, 4), dtype=int)
        pred = np.zeros((4, 4), dtype=int)
        iou = compute_iou(pred, target, zero_division=0.0)
        assert iou == 0.0

    def test_empty_pred_non_empty_target(self):
        target = np.array([[1, 0], [0, 0]])
        pred = np.zeros((2, 2), dtype=int)
        iou = compute_iou(pred, target)
        assert iou == 0.0

    def test_non_empty_pred_empty_target(self):
        target = np.zeros((2, 2), dtype=int)
        pred = np.array([[1, 0], [0, 0]])
        iou = compute_iou(pred, target)
        assert iou == 0.0

    def test_shape_mismatch_raises_value_error(self):
        target = np.zeros((2, 2))
        pred = np.zeros((2, 3))
        with pytest.raises(ValueError, match="Shape mismatch"):
            compute_iou(pred, target)

    def test_continuous_probabilities_with_threshold(self):
        probs = np.array([[0.8, 0.2], [0.4, 0.9]])
        target = np.array([[1, 0], [0, 1]])
        # With threshold 0.5:
        # pred becomes [[1, 0], [0, 1]] == target -> IoU 1.0
        iou = compute_iou(probs, target, threshold=0.5)
        assert iou == 1.0

        # With threshold 0.85:
        # pred becomes [[0, 0], [0, 1]], target has 2 ones -> intersection 1, union 2 -> 0.5
        iou_high = compute_iou(probs, target, threshold=0.85)
        assert iou_high == 0.5


class TestDiceCoefficient:
    def test_perfect_prediction_numpy(self):
        target = np.array([[1, 1], [0, 0]])
        pred = np.array([[1, 1], [0, 0]])
        dice = dice_coefficient(pred, target)
        assert dice == 1.0

    def test_perfect_prediction_torch(self):
        target = torch.tensor([[1, 1], [0, 0]])
        pred = torch.tensor([[1, 1], [0, 0]])
        dice = dice_coefficient(pred, target)
        assert dice == 1.0

    def test_completely_disjoint(self):
        target = np.array([[1, 1], [0, 0]])
        pred = np.array([[0, 0], [1, 1]])
        dice = dice_coefficient(pred, target)
        assert dice == 0.0

    def test_partial_overlap(self):
        # target has 2 ones, pred has 1 one overlapping
        # intersection = 1, pred_sum = 1, target_sum = 2 -> 2 * 1 / (1 + 2) = 2/3
        target = np.array([[1, 1], [0, 0]])
        pred = np.array([[1, 0], [0, 0]])
        dice = dice_coefficient(pred, target)
        assert abs(dice - (2.0 / 3.0)) < 1e-6

    def test_both_empty_convention(self):
        target = np.zeros((4, 4))
        pred = np.zeros((4, 4))
        dice = dice_coefficient(pred, target)
        assert dice == 1.0

    def test_shape_mismatch_raises(self):
        with pytest.raises(ValueError):
            dice_coefficient(np.zeros((2, 2)), np.zeros((3, 3)))

    def test_alias_equivalence(self):
        target = np.array([[1, 0], [0, 1]])
        pred = np.array([[1, 0], [0, 0]])
        assert dice_coefficient(pred, target) == compute_dice(pred, target)


class TestConfusionMatrix:
    def test_confusion_matrix_values(self):
        # 4 pixels:
        # (0, 0): target=1, pred=1 -> TP
        # (0, 1): target=0, pred=1 -> FP
        # (1, 0): target=1, pred=0 -> FN
        # (1, 1): target=0, pred=0 -> TN
        target = np.array([[1, 0], [1, 0]])
        pred = np.array([[1, 1], [0, 0]])
        cm = generate_confusion_matrix(target, pred)

        assert cm["tp"] == 1
        assert cm["fp"] == 1
        assert cm["fn"] == 1
        assert cm["tn"] == 1

    def test_no_hardcoded_dummy_values(self):
        # Specifically verify output is dynamic and NOT static 100, 10, 12, 500
        target = np.array([[1, 1, 1], [0, 0, 0]])
        pred = np.array([[1, 1, 0], [1, 0, 0]])
        cm = generate_confusion_matrix(target, pred)
        assert cm != {"tp": 100, "fp": 10, "fn": 12, "tn": 500}
        assert cm["tp"] == 2
        assert cm["fp"] == 1
        assert cm["fn"] == 1
        assert cm["tn"] == 2

    def test_confusion_matrix_torch(self):
        target = torch.tensor([[1, 0], [1, 0]])
        pred = torch.tensor([[1, 1], [0, 0]])
        cm = generate_confusion_matrix(target, pred)
        assert cm == {"tp": 1, "fp": 1, "fn": 1, "tn": 1}

    def test_shape_mismatch_raises(self):
        with pytest.raises(ValueError):
            generate_confusion_matrix(np.zeros((2, 2)), np.zeros((2, 4)))


class TestDerivedMetrics:
    def test_precision(self):
        assert compute_precision(tp=80, fp=20) == 0.8
        assert compute_precision(tp=0, fp=0) == 0.0
        assert compute_precision(tp=0, fp=0, zero_division=1.0) == 1.0

    def test_recall(self):
        assert compute_recall(tp=80, fn=20) == 0.8
        assert compute_recall(tp=0, fn=0) == 0.0

    def test_f1(self):
        assert compute_f1(precision=0.8, recall=0.8) == pytest.approx(0.8)
        p = 0.8
        r = 0.5
        expected_f1 = (2 * p * r) / (p + r)
        assert compute_f1(p, r) == pytest.approx(expected_f1)
        assert compute_f1(0.0, 0.0) == 0.0

    def test_fpr(self):
        assert compute_fpr(fp=10, tn=90) == pytest.approx(0.1)
        assert compute_fpr(fp=0, tn=0) == 0.0

    def test_calculate_confusion_metrics(self):
        cm = {"tp": 40, "fp": 10, "fn": 10, "tn": 40}
        metrics = calculate_confusion_metrics(cm)
        assert metrics["accuracy"] == pytest.approx(0.8)
        assert metrics["precision"] == pytest.approx(0.8)
        assert metrics["recall"] == pytest.approx(0.8)
        assert metrics["f1"] == pytest.approx(0.8)
        assert metrics["fpr"] == pytest.approx(0.2)
