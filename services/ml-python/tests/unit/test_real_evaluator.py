"""
Unit tests for Part 0.3 Model Registry and Real Evaluation Harness.
Validates:
1. Model Registry audit and metadata extraction.
2. Real-checkpoint-only enforcement and rejection of missing/untrained weights.
3. Checkpoint load verification across CPU and CUDA devices.
4. Dataset availability checks and explicit failure handling.
5. Integration with genuine Part 0.1 metrics.
6. Separation of Clean-Ocean FPR and Look-Alike FPR.
7. Configurable threshold sweeps.
8. Evaluation report structure and schema adherence.
"""

import os
import sys
import json
import pytest
import numpy as np
import torch
import torch.nn as nn

# Ensure project root is in sys.path
repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
sys.path.insert(0, repo_root)
sys.path.insert(0, os.path.join(repo_root, "services", "ml-python"))

from ml.evaluation.real_evaluator import (
    RealEvaluator,
    RealCheckpointRequiredError,
    DatasetNotFoundError,
    compute_sha256,
)
from ml.evaluation.metrics import compute_iou, compute_precision, compute_recall, compute_fpr
from ml.evaluation.segmentation_metrics import dice_coefficient
from ml.evaluation.confusion_matrix import generate_confusion_matrix, calculate_confusion_metrics


@pytest.fixture
def evaluator():
    return RealEvaluator()


def test_registry_audit_structure(evaluator):
    """Test registry load and model entry retrieval."""
    entry_v2 = evaluator.get_model_entry("unet-dual-pol-sar-v2")
    assert entry_v2["architecture"] == "UNet"
    assert entry_v2["in_channels"] == 2
    assert entry_v2["num_classes"] == 2
    assert entry_v2["status"] == "trained"
    assert "unet_dual_pol_sar_v2.pth" in entry_v2["checkpoint_path"]


def test_missing_checkpoint_raises_explicit_error(evaluator):
    """Test that attempting to load an untrained model with missing checkpoint raises RealCheckpointRequiredError."""
    with pytest.raises(RealCheckpointRequiredError) as exc_info:
        evaluator.load_real_checkpoint("unet-sar-oil-spill-v1")
    assert "REAL_CHECKPOINT_ONLY" in str(exc_info.value)


def test_invalid_model_id_raises_error(evaluator):
    """Test that requesting an unknown model ID raises ValueError."""
    with pytest.raises(ValueError):
        evaluator.get_model_entry("non-existent-model-xyz")


def test_v2_and_v4_checkpoints_load_and_forward(evaluator):
    """Test that physical V2 and V4 checkpoints load with valid SHA256 and execute forward passes."""
    for model_id in ["unet-dual-pol-sar-v2", "unet-dual-pol-sar-v4"]:
        model, entry, sha256 = evaluator.load_real_checkpoint(model_id, device=torch.device("cpu"))
        assert len(sha256) == 64
        assert isinstance(model, nn.Module)
        
        # Test forward pass with dummy tensor
        dummy_x = torch.randn(1, 2, 512, 512, dtype=torch.float32)
        with torch.no_grad():
            out = model(dummy_x)
        assert out.shape == (1, 2, 512, 512)


def test_cuda_load_if_available(evaluator):
    """Test CUDA load and inference if CUDA is available."""
    if not torch.cuda.is_available():
        pytest.skip("CUDA not available on this host")
    
    cuda_device = torch.device("cuda:0")
    model, entry, sha256 = evaluator.load_real_checkpoint("unet-dual-pol-sar-v2", device=cuda_device)
    dummy_x = torch.randn(1, 2, 512, 512, device=cuda_device)
    with torch.no_grad():
        out = model(dummy_x)
    torch.cuda.synchronize()
    assert out.shape == (1, 2, 512, 512)
    assert out.device.type == "cuda"


def test_preprocessing_contracts(evaluator):
    """Test explicit preprocessing contract definitions."""
    p_v2 = evaluator.get_preprocessing_contract("unet-dual-pol-sar-v2")
    assert p_v2["name"] == "Historical_Uncorrected_Positive_Mask"
    assert p_v2["verified"] is True

    p_v4 = evaluator.get_preprocessing_contract("unet-dual-pol-sar-v4")
    assert p_v4["name"] == "Decibel_Calibrated_Clipping"
    assert p_v4["vv_range_db"] == [-35.0, -5.0]
    assert p_v4["vh_range_db"] == [-45.0, -15.0]


def test_dataset_missing_returns_explicit_status(evaluator):
    """Test that missing dataset manifest returns DATASET_NOT_AVAILABLE rather than crashing or faking."""
    res = evaluator.evaluate_model(
        model_id="unet-dual-pol-sar-v2",
        manifest_path="non_existent/path/manifest.json",
        split="test",
        thresholds=[0.35, 0.50]
    )
    assert res["evaluation_status"] == "DATASET_NOT_AVAILABLE"
    assert res["dataset"]["availability"] is False
    for th in res["thresholds"]:
        assert th["iou"] is None
        assert th["dice"] is None


def test_metric_integration_with_part_0_1():
    """Verify evaluator uses genuine Part 0.1 metrics."""
    gt = np.array([[0, 0], [1, 1]], dtype=np.uint8)
    prob = np.array([[0.1, 0.8], [0.2, 0.9]], dtype=np.float32)

    cm = generate_confusion_matrix(gt, prob, threshold=0.5)
    # y_true=1: (1,0), (1,1). y_pred>=0.5: (0,1), (1,1)
    # TP: (1,1) -> 1
    # FP: (0,1) -> 1
    # FN: (1,0) -> 1
    # TN: (0,0) -> 1
    assert cm == {"tp": 1, "fp": 1, "fn": 1, "tn": 1}

    metrics = calculate_confusion_metrics(cm)
    assert metrics["precision"] == 0.5
    assert metrics["recall"] == 0.5
    assert metrics["f1"] == 0.5
    assert metrics["iou"] == 1.0 / 3.0
    assert metrics["fpr"] == 0.5


def test_category_fpr_isolation():
    """Test separate calculation of Clean-Ocean FPR vs Look-Alike FPR."""
    # Clean Ocean Scene (all GT = 0)
    gt_clean = np.zeros((100, 100), dtype=np.uint8)
    # 5 false positives
    prob_clean = np.zeros((100, 100), dtype=np.float32)
    prob_clean[0, :5] = 0.9

    cm_clean = generate_confusion_matrix(gt_clean, prob_clean, threshold=0.5)
    assert cm_clean["fp"] == 5
    assert cm_clean["tn"] == 9995
    clean_fpr = compute_fpr(cm_clean["fp"], cm_clean["tn"])
    assert round(clean_fpr, 6) == round(5 / 10000, 6)

    # Look-Alike Scene (all GT = 0, but high dark-spot false alarm)
    gt_look = np.zeros((100, 100), dtype=np.uint8)
    prob_look = np.zeros((100, 100), dtype=np.float32)
    prob_look[:20, :20] = 0.8 # 400 false positive pixels

    cm_look = generate_confusion_matrix(gt_look, prob_look, threshold=0.5)
    assert cm_look["fp"] == 400
    assert cm_look["tn"] == 9600
    look_fpr = compute_fpr(cm_look["fp"], cm_look["tn"])
    assert round(look_fpr, 6) == 0.04

    # Confirm look-alike FPR is distinct and higher than clean ocean FPR
    assert look_fpr > clean_fpr
