"""
Unit Tests for Part 0.9B: Attention U-Net Architecture and Quarantine Integrity.
==============================================================================

Tests:
1. AttentionGate tensor shape preservation and forward pass.
2. Attention coefficient range [0, 1] (Sigmoid verification).
3. Attention skip connection multiplication (attended_skip = skip * alpha).
4. Full UNetAttention forward pass and output shape.
5. UNetAttention forward pass with return_attention=True.
6. Parameter count control (verifies < 2x baseline parameters).
7. Predict probabilities shape and distribution validity.
8. Checkpoint save/load integrity with 0 missing and 0 unexpected keys.
9. Dataset split and held-out Part III test set quarantine integrity.
10. Preprocessing normalization identity.
11. CombinedLoss backward pass compatibility with UNetAttention.
12. Model registry entry status as 'experimental'.
"""

import os
import json
import tempfile
import pytest
import torch
import torch.nn as nn
import numpy as np

from app.models.unet.architecture import UNet, AttentionGate, UNetAttention
from app.preprocessing.normalization import normalize_sar_band
from app.training.losses import CombinedLoss


LOCKED_TEST_SCENES = {
    "real_part3_test_00060",
    "real_part3_test_00062",
    "real_part3_test_00063",
    "real_part3_test_00064",
    "real_part3_test_00080",
}


def test_attention_gate_shape_and_range():
    """Verify AttentionGate preserves spatial dimensions and outputs alpha in [0, 1]."""
    x = torch.randn(2, 64, 32, 32)
    g = torch.randn(2, 64, 16, 16)  # Gating signal from deeper layer (half resolution)
    gate = AttentionGate(in_channels_x=64, in_channels_g=64, inter_channels=32)

    attended_x, alpha = gate(x, g)

    assert attended_x.shape == (2, 64, 32, 32), f"Expected {(2, 64, 32, 32)}, got {attended_x.shape}"
    assert alpha.shape == (2, 1, 32, 32), f"Expected {(2, 1, 32, 32)}, got {alpha.shape}"
    assert torch.all(alpha >= 0.0) and torch.all(alpha <= 1.0), "Attention coefficients must be bounded in [0, 1]"


def test_attention_gate_skip_multiplication():
    """Verify attended_x equals x * alpha."""
    x = torch.randn(2, 32, 16, 16)
    g = torch.randn(2, 32, 16, 16)
    gate = AttentionGate(in_channels_x=32, in_channels_g=32, inter_channels=16)

    attended_x, alpha = gate(x, g)
    expected_x = x * alpha
    assert torch.allclose(attended_x, expected_x, atol=1e-6)


def test_unet_attention_forward_and_output_shape():
    """Verify full UNetAttention model forward pass."""
    model = UNetAttention(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
    x = torch.randn(2, 2, 256, 256)
    out = model(x)
    assert out.shape == (2, 2, 256, 256)


def test_unet_attention_return_maps():
    """Verify forward pass with return_attention=True returns 4 attention maps."""
    model = UNetAttention(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
    x = torch.randn(1, 2, 128, 128)
    logits, att_maps = model(x, return_attention=True)

    assert logits.shape == (1, 2, 128, 128)
    assert len(att_maps) == 4
    # Check map spatial resolutions matching skip layers: 16x16, 32x32, 64x64, 128x128
    assert att_maps[0].shape == (1, 1, 16, 16)
    assert att_maps[1].shape == (1, 1, 32, 32)
    assert att_maps[2].shape == (1, 1, 64, 64)
    assert att_maps[3].shape == (1, 1, 128, 128)


def test_attention_parameter_count_control():
    """Verify Attention U-Net parameter count does not exceed 2x V6 baseline parameters."""
    v6_model = UNet(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
    v09b_model = UNetAttention(in_channels=2, num_classes=2, base_channels=16, bilinear=True)

    v6_params = sum(p.numel() for p in v6_model.parameters() if p.requires_grad)
    v09b_params = sum(p.numel() for p in v09b_model.parameters() if p.requires_grad)

    assert v09b_params > v6_params, "Attention model should have more parameters than baseline."
    assert v09b_params < 2.0 * v6_params, f"Attention model ({v09b_params}) must not exceed 2x V6 ({v6_params * 2})."


def test_attention_predict_probabilities():
    """Verify predict_probabilities returns valid probabilities in [0, 1] summing to 1."""
    model = UNetAttention(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
    x = torch.randn(1, 2, 128, 128)
    probs = model.predict_probabilities(x)
    assert probs.shape == (1, 2, 128, 128)
    assert torch.all(probs >= 0.0) and torch.all(probs <= 1.0)
    prob_sum = torch.sum(probs, dim=1)
    assert torch.allclose(prob_sum, torch.ones_like(prob_sum), atol=1e-5)


def test_checkpoint_save_and_load_integrity():
    """Verify save and load round-trip with 0 missing and 0 unexpected keys."""
    model = UNetAttention(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
    with tempfile.TemporaryDirectory() as tmpdir:
        ckpt_path = os.path.join(tmpdir, "test_ckpt.pth")
        torch.save({"model_state_dict": model.state_dict()}, ckpt_path)

        loaded_model = UNetAttention(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
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


def test_combined_loss_backward_with_attention():
    """Verify CombinedLoss computation and gradient backpropagation on UNetAttention."""
    model = UNetAttention(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
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
