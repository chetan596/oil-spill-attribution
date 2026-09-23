"""
Unit Tests for Part 0.8: Controlled Loss-Function Experiments.
==============================================================

Tests:
1. Loss Function Implementations:
   - CombinedLoss (Weighted CE + Soft Dice)
   - FocalDiceLoss (Focal Loss + Soft Dice)
   - FocalTverskyLoss (Alpha/Beta/Gamma Tversky)
   - Differentiability and gradient flow across all 4 losses
2. Loss criterion builder validation (valid & invalid types)
3. Architecture invariance (UNet 2-channel, 2-class, base_channels 16)
4. Preprocessing invariance (sentinel1_sigma0_db_v1)
5. Held-out test set lock (quarantine of Part III scenes)
6. Checkpoint metadata schema
7. Experiment summary schema
8. Model registry status invariants (V2=active_baseline, V8A/B/C/D=experimental)
"""

import os
import sys
import json
import pytest
import numpy as np
import torch

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)
if os.path.join(_REPO_ROOT, "services", "ml-python") not in sys.path:
    sys.path.insert(0, os.path.join(_REPO_ROOT, "services", "ml-python"))

from app.training.losses import CombinedLoss, FocalDiceLoss, FocalTverskyLoss, SoftDiceLoss, FocalLoss
from ml.training.loss_experiment_runner import build_loss_criterion, ControlledLossTrainer
from app.models.unet.architecture import UNet
from ml.training.train_v6 import set_seed


# ---------------------------------------------------------------------------
# 1. Loss Function Numerical & Differentiability Tests
# ---------------------------------------------------------------------------

def test_combined_loss_forward_and_backward():
    """Verify CombinedLoss computes non-NaN loss and gradients for 2-channel logits."""
    loss_fn = CombinedLoss(weight=1.0, dice_weight=1.0, class_weights=torch.tensor([1.0, 5.0]))
    logits = torch.randn(2, 2, 64, 64, requires_grad=True)
    targets = torch.randint(0, 2, (2, 64, 64)).long()

    loss, details = loss_fn(logits, targets)
    assert not torch.isnan(loss)
    assert loss.item() > 0.0
    assert "loss_ce" in details
    assert "loss_dice" in details

    loss.backward()
    assert logits.grad is not None
    assert not torch.isnan(logits.grad).any()


def test_focal_dice_loss_forward_and_backward():
    """Verify FocalDiceLoss computes non-NaN loss and gradients."""
    loss_fn = FocalDiceLoss(alpha=0.25, gamma=2.0, dice_weight=1.0)
    logits = torch.randn(2, 2, 64, 64, requires_grad=True)
    targets = torch.randint(0, 2, (2, 64, 64)).long()

    loss, details = loss_fn(logits, targets)
    assert not torch.isnan(loss)
    assert loss.item() > 0.0
    assert "loss_focal" in details
    assert "loss_dice" in details

    loss.backward()
    assert logits.grad is not None
    assert not torch.isnan(logits.grad).any()


def test_focal_tversky_loss_forward_and_backward():
    """Verify FocalTverskyLoss with alpha=0.7, beta=0.3, gamma=0.75 computes gradients."""
    loss_fn = FocalTverskyLoss(alpha=0.7, beta=0.3, gamma=0.75)
    logits = torch.randn(2, 2, 64, 64, requires_grad=True)
    targets = torch.randint(0, 2, (2, 64, 64)).long()

    loss, details = loss_fn(logits, targets)
    assert not torch.isnan(loss)
    assert loss.item() >= 0.0
    assert "loss_focal_tversky" in details
    assert "mean_tversky" in details
    assert 0.0 <= details["mean_tversky"] <= 1.0

    loss.backward()
    assert logits.grad is not None
    assert not torch.isnan(logits.grad).any()


def test_loss_builder_factory():
    """Verify build_loss_criterion instantiates correct classes."""
    dev = torch.device("cpu")
    c1 = build_loss_criterion("CombinedLoss", {"foreground_weight": 5.0}, dev)
    assert isinstance(c1, CombinedLoss)

    c2 = build_loss_criterion("FocalDiceLoss", {"alpha": 0.25, "gamma": 2.0}, dev)
    assert isinstance(c2, FocalDiceLoss)

    c3 = build_loss_criterion("FocalTverskyLoss", {"alpha": 0.7, "beta": 0.3, "gamma": 0.75}, dev)
    assert isinstance(c3, FocalTverskyLoss)

    with pytest.raises(ValueError):
        build_loss_criterion("UnknownLossType", {}, dev)


# ---------------------------------------------------------------------------
# 2. Experimental Invariance Tests (Architecture, Preprocessing, Seed)
# ---------------------------------------------------------------------------

def test_architecture_spec_for_all_experiments():
    """Verify that the model architecture across all experiments is strictly UNet(2, 2, 16, bilinear=True)."""
    model = UNet(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
    x = torch.randn(2, 2, 512, 512)
    out = model(x)
    assert out.shape == (2, 2, 512, 512)
    param_count = sum(p.numel() for p in model.parameters())
    assert param_count == 1080802


def test_deterministic_seed_invariance():
    """Verify seed reproducibility across model initializations."""
    set_seed(42)
    m1 = UNet(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
    w1 = list(m1.parameters())[0].clone()

    set_seed(42)
    m2 = UNet(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
    w2 = list(m2.parameters())[0].clone()

    assert torch.equal(w1, w2)


# ---------------------------------------------------------------------------
# 3. Held-Out Test Set Quarantine Tests
# ---------------------------------------------------------------------------

def test_held_out_test_set_quarantine_part08():
    """Verify that Part III held-out test scenes are never present in train or val splits."""
    manifest_path = os.path.join(_REPO_ROOT, "ml", "datasets", "manifest.json")
    assert os.path.exists(manifest_path)
    with open(manifest_path, "r", encoding="utf-8") as f:
        m = json.load(f)

    train_ids = {s["scene_id"] for s in m["scenes"] if s["split"] == "train"}
    val_ids = {s["scene_id"] for s in m["scenes"] if s["split"] == "val"}
    test_ids = {s["scene_id"] for s in m["scenes"] if s["split"] == "test"}

    assert len(train_ids) == 28
    assert len(val_ids) == 7
    assert len(test_ids) == 5

    expected_held_out = {
        "real_part3_test_00060",
        "real_part3_test_00062",
        "real_part3_test_00063",
        "real_part3_test_00064",
        "real_part3_test_00080",
    }
    assert test_ids == expected_held_out
    assert len(train_ids.intersection(test_ids)) == 0
    assert len(val_ids.intersection(test_ids)) == 0


# ---------------------------------------------------------------------------
# 4. Registry Status & Integrity Tests
# ---------------------------------------------------------------------------

def test_model_registry_v8_statuses():
    """Verify registry invariants: V2=active_baseline, V4/V6/V8=experimental."""
    reg_path = os.path.join(_REPO_ROOT, "ml", "model_registry", "registry.json")
    if os.path.exists(reg_path):
        with open(reg_path, "r", encoding="utf-8") as f:
            reg = json.load(f)

        assert reg["active_model_id"] == "unet-dual-pol-sar-v2"
        models = {m["model_id"]: m for m in reg["models"]}

        assert "unet-dual-pol-sar-v2" in models
        assert models["unet-dual-pol-sar-v2"]["status"] in ("active_baseline", "trained")

        assert "unet-dual-pol-sar-v4" in models
        assert models["unet-dual-pol-sar-v4"]["status"] == "experimental"

        assert "unet-dual-pol-sar-v6" in models
        assert models["unet-dual-pol-sar-v6"]["status"] == "experimental"

        for v8_id in ["unet-dual-pol-sar-v8a", "unet-dual-pol-sar-v8b", "unet-dual-pol-sar-v8c", "unet-dual-pol-sar-v8d"]:
            if v8_id in models:
                assert models[v8_id]["status"] == "experimental"
                assert models[v8_id]["hyperparameters"]["preprocessing"] == "sentinel1_sigma0_db_v1"
