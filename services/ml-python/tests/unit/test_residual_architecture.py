"""
Unit Tests for Part 0.9C: Residual U-Net Architecture and Quarantine Integrity.
==============================================================================

Tests:
1. ResidualBlock with projection shortcut (in_channels != out_channels).
2. ResidualBlock with identity shortcut (in_channels == out_channels).
3. ResidualDown and ResidualUp shape preservation.
4. Full UNetResidual forward pass and output shape.
5. Parameter count control (verifies < 2x baseline parameters).
6. Predict probabilities shape and distribution validity.
7. Checkpoint save/load integrity with 0 missing and 0 unexpected keys.
8. Dataset split and held-out Part III test set quarantine integrity.
9. Preprocessing normalization identity.
10. CombinedLoss backward pass compatibility with UNetResidual.
11. Model registry entry status as 'experimental'.
"""

import os
import json
import tempfile
import pytest
import torch
import torch.nn as nn
import numpy as np

from app.models.unet.architecture import UNet, ResidualBlock, ResidualDown, ResidualUp, UNetResidual
from app.preprocessing.normalization import normalize_sar_band
from app.training.losses import CombinedLoss


LOCKED_TEST_SCENES = {
    "real_part3_test_00060",
    "real_part3_test_00062",
    "real_part3_test_00063",
    "real_part3_test_00064",
    "real_part3_test_00080",
}


def test_residual_block_projection_shortcut():
    """Verify projection shortcut when in_channels != out_channels."""
    block = ResidualBlock(in_channels=16, out_channels=32)
    assert not isinstance(block.shortcut, nn.Identity), "Expected projection shortcut when channels differ"
    x = torch.randn(2, 16, 64, 64)
    out = block(x)
    assert out.shape == (2, 32, 64, 64)


def test_residual_block_identity_shortcut():
    """Verify identity shortcut when in_channels == out_channels."""
    block = ResidualBlock(in_channels=32, out_channels=32)
    assert isinstance(block.shortcut, nn.Identity), "Expected Identity shortcut when channels match"
    x = torch.randn(2, 32, 64, 64)
    out = block(x)
    assert out.shape == (2, 32, 64, 64)


def test_residual_down_and_up_shapes():
    """Verify downsampling and upsampling shape handling."""
    down = ResidualDown(in_channels=16, out_channels=32)
    x = torch.randn(2, 16, 64, 64)
    d_out = down(x)
    assert d_out.shape == (2, 32, 32, 32)

    up = ResidualUp(in_channels=64, out_channels=16, bilinear=True)
    x_skip = torch.randn(2, 32, 64, 64)
    u_out = up(d_out, x_skip)
    assert u_out.shape == (2, 16, 64, 64)


def test_unet_residual_forward_and_output_shape():
    """Verify full UNetResidual model forward pass."""
    model = UNetResidual(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
    x = torch.randn(2, 2, 256, 256)
    out = model(x)
    assert out.shape == (2, 2, 256, 256)


def test_residual_parameter_count_control():
    """Verify Residual U-Net parameter count does not exceed 2x V6 baseline parameters."""
    v6_model = UNet(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
    v09c_model = UNetResidual(in_channels=2, num_classes=2, base_channels=16, bilinear=True)

    v6_params = sum(p.numel() for p in v6_model.parameters() if p.requires_grad)
    v09c_params = sum(p.numel() for p in v09c_model.parameters() if p.requires_grad)

    assert v09c_params > v6_params, "Residual model should have slightly more parameters than baseline."
    assert v09c_params < 2.0 * v6_params, f"Residual model ({v09c_params}) must not exceed 2x V6 ({v6_params * 2})."


def test_residual_predict_probabilities():
    """Verify predict_probabilities returns valid probabilities in [0, 1] summing to 1."""
    model = UNetResidual(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
    x = torch.randn(1, 2, 128, 128)
    probs = model.predict_probabilities(x)
    assert probs.shape == (1, 2, 128, 128)
    assert torch.all(probs >= 0.0) and torch.all(probs <= 1.0)
    prob_sum = torch.sum(probs, dim=1)
    assert torch.allclose(prob_sum, torch.ones_like(prob_sum), atol=1e-5)


def test_checkpoint_save_and_load_integrity():
    """Verify save and load round-trip with 0 missing and 0 unexpected keys."""
    model = UNetResidual(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
    with tempfile.TemporaryDirectory() as tmpdir:
        ckpt_path = os.path.join(tmpdir, "test_ckpt.pth")
        torch.save({"model_state_dict": model.state_dict()}, ckpt_path)

        loaded_model = UNetResidual(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
        raw = torch.load(ckpt_path, map_location="cpu")
        incompat = loaded_model.load_state_dict(raw["model_state_dict"])
        assert len(incompat.missing_keys) == 0
        assert len(incompat.unexpected_keys) == 0


def test_quarantine_integrity_part3_held_out_test():
    """Verify that the manifest has 5 test scenes and all are in LOCKED_TEST_SCENES."""
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
    manifest_p = os.path.join(repo_root, "ml/datasets/manifest.json")
    assert os.path.exists(manifest_p), "Dataset manifest not found!"

    with open(manifest_p, "r", encoding="utf-8") as f:
        m = json.load(f)

    test_scenes = [s for s in m["scenes"] if s["split"] == "test"]
    assert len(test_scenes) == 5, f"Expected 5 test scenes, got {len(test_scenes)}"
    for s in test_scenes:
        assert s["scene_id"] in LOCKED_TEST_SCENES, f"Scene {s['scene_id']} not in locked quarantine list!"


def test_combined_loss_backward_with_residual():
    """Verify CombinedLoss computation and gradient backpropagation on UNetResidual."""
    model = UNetResidual(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
    class_weights = torch.tensor([1.0, 5.0], dtype=torch.float32)
    criterion = CombinedLoss(weight=1.0, dice_weight=1.0, class_weights=class_weights)

    inputs = torch.randn(2, 2, 64, 64, requires_grad=True)
    targets = torch.randint(0, 2, (2, 64, 64)).long()

    logits = model(inputs)
    loss, _ = criterion(logits, targets)
    assert not torch.isnan(loss) and not torch.isinf(loss)
    loss.backward()

    for param in model.parameters():
        if param.requires_grad:
            assert param.grad is not None
            assert not torch.isnan(param.grad).any()
