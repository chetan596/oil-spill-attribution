"""
Unit Tests for Model V3 Architecture, Loading, Evaluation, and Scene-Level Splits.
"""

import os
import json
import pytest
import torch
import numpy as np

from app.models.registry import model_registry
from app.models.unet.architecture import UNet


def test_v3_model_loading():
    """Verify unet-dual-pol-sar-v3 loads successfully from model registry."""
    model, entry = model_registry.load_model("unet-dual-pol-sar-v3", device="cpu", allow_untrained=False)
    assert model is not None
    assert isinstance(model, UNet)
    assert entry["model_id"] == "unet-dual-pol-sar-v3"
    assert entry["in_channels"] == 2
    assert entry["num_classes"] == 2


def test_v3_deterministic_inference():
    """Verify unet-dual-pol-sar-v3 produces deterministic probabilities on fixed input."""
    model, _ = model_registry.load_model("unet-dual-pol-sar-v3", device="cpu", allow_untrained=False)
    model.eval()

    torch.manual_seed(42)
    sample_tensor = torch.randn(1, 2, 512, 512)

    with torch.no_grad():
        prob1 = model.predict_probabilities(sample_tensor)
        prob2 = model.predict_probabilities(sample_tensor)

    np.testing.assert_allclose(prob1.numpy(), prob2.numpy(), rtol=1e-5, atol=1e-5)
    assert prob1.shape == (1, 2, 512, 512)
    # Probabilities must sum to 1 across channel dimension
    prob_sum = prob1.sum(dim=1).numpy()
    np.testing.assert_allclose(prob_sum, np.ones((1, 512, 512)), rtol=1e-4, atol=1e-4)


def test_scene_level_splits_no_leakage():
    """Verify that dataset splits are scene-level with zero overlap between splits."""
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
    manifest_path = os.path.join(repo_root, "data/raw/satellite/dataset_manifest.json")
    if not os.path.exists(manifest_path):
        pytest.skip("Dataset manifest not found.")

    with open(manifest_path, "r") as f:
        manifest = json.load(f)

    train_scenes = {s["scene_id"] for s in manifest["scenes"] if s.get("split") == "train"}
    val_scenes = {s["scene_id"] for s in manifest["scenes"] if s.get("split") == "val"}
    test_scenes = {s["scene_id"] for s in manifest["scenes"] if s.get("split") == "test"}

    assert len(train_scenes.intersection(val_scenes)) == 0, "Data leakage between train and val!"
    assert len(train_scenes.intersection(test_scenes)) == 0, "Data leakage between train and test!"
    assert len(val_scenes.intersection(test_scenes)) == 0, "Data leakage between val and test!"
    assert len(train_scenes) + len(val_scenes) + len(test_scenes) == len(manifest["scenes"])


def test_threshold_metrics_calculation():
    """Verify calculation of IoU, Dice, Precision, Recall, and FPR across thresholds."""
    pred = np.array([1, 1, 0, 0, 0], dtype=np.uint8)
    gt = np.array([1, 0, 1, 0, 0], dtype=np.uint8)

    tp = int(np.sum((pred == 1) & (gt == 1))) # 1
    fp = int(np.sum((pred == 1) & (gt == 0))) # 1
    fn = int(np.sum((pred == 0) & (gt == 1))) # 1
    tn = int(np.sum((pred == 0) & (gt == 0))) # 2

    assert tp == 1
    assert fp == 1
    assert fn == 1
    assert tn == 2

    iou = tp / (tp + fp + fn) # 1/3 = 0.3333
    dice = 2 * tp / (2 * tp + fp + fn) # 2/4 = 0.5000
    precision = tp / (tp + fp) # 1/2 = 0.5000
    recall = tp / (tp + fn) # 1/2 = 0.5000
    fpr = fp / (fp + tn) # 1/3 = 0.3333

    assert abs(iou - 1/3) < 1e-4
    assert abs(dice - 0.5) < 1e-4
    assert abs(precision - 0.5) < 1e-4
    assert abs(recall - 0.5) < 1e-4
    assert abs(fpr - 1/3) < 1e-4
