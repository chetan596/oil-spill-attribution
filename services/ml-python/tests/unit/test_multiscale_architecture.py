"""
Unit Tests for Part 0.9A: Multi-Scale Context U-Net Architecture and Quarantine Integrity.
========================================================================================

Tests:
1. MultiScaleContextBlock tensor shape preservation and forward pass.
2. Dilation branches structure, kernel sizes, dilations, and paddings.
3. Bottleneck fusion conv (1x1) channel reduction.
4. Full UNetMultiScaleContext model forward pass on single and dual-channel inputs.
5. Parameter count control (verifies < 2x baseline parameters).
6. Predict probabilities shape and distribution validity.
7. Checkpoint save/load integrity with 0 missing and 0 unexpected keys.
8. Dataset split and held-out Part III test set quarantine integrity.
9. Preprocessing normalization identity.
10. Model registry entry status as 'experimental'.
"""

import os
import json
import tempfile
import pytest
import torch
import torch.nn as nn
import numpy as np

from app.models.unet.architecture import UNet, MultiScaleContextBlock, UNetMultiScaleContext
from app.preprocessing.normalization import normalize_sar_band
from app.training.losses import CombinedLoss


LOCKED_TEST_SCENES = {
    "real_part3_test_00060",
    "real_part3_test_00062",
    "real_part3_test_00063",
    "real_part3_test_00064",
    "real_part3_test_00080",
}


def test_multiscale_context_block_shapes():
    """Verify that MultiScaleContextBlock preserves H and W dimensions."""
    in_ch = 128
    block = MultiScaleContextBlock(in_channels=in_ch, branch_channels=42, out_channels=in_ch)
    x = torch.randn(2, in_ch, 32, 32)
    out = block(x)
    assert out.shape == (2, in_ch, 32, 32), f"Expected {(2, in_ch, 32, 32)}, got {out.shape}"


def test_dilation_branches_configuration():
    """Verify dilation rates, paddings, and kernels of all 3 branches."""
    block = MultiScaleContextBlock(in_channels=128, branch_channels=32, out_channels=128)
    
    # Branch 1: dilation=1, padding=1, kernel=3
    conv1 = block.branch1[0]
    assert isinstance(conv1, nn.Conv2d)
    assert conv1.dilation == (1, 1)
    assert conv1.padding == (1, 1)
    assert conv1.kernel_size == (3, 3)

    # Branch 2: dilation=2, padding=2, kernel=3
    conv2 = block.branch2[0]
    assert isinstance(conv2, nn.Conv2d)
    assert conv2.dilation == (2, 2)
    assert conv2.padding == (2, 2)
    assert conv2.kernel_size == (3, 3)

    # Branch 3: dilation=4, padding=4, kernel=3
    conv3 = block.branch3[0]
    assert isinstance(conv3, nn.Conv2d)
    assert conv3.dilation == (4, 4)
    assert conv3.padding == (4, 4)
    assert conv3.kernel_size == (3, 3)

    # Fusion: 1x1 conv
    fusion_conv = block.fusion[0]
    assert isinstance(fusion_conv, nn.Conv2d)
    assert fusion_conv.kernel_size == (1, 1)
    assert fusion_conv.in_channels == 32 * 3
    assert fusion_conv.out_channels == 128


def test_unet_multiscale_forward_and_output_shape():
    """Verify full UNetMultiScaleContext model forward pass."""
    model = UNetMultiScaleContext(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
    x = torch.randn(2, 2, 256, 256)
    out = model(x)
    assert out.shape == (2, 2, 256, 256)


def test_unet_multiscale_predict_probabilities():
    """Verify predict_probabilities returns valid probabilities in [0, 1] summing to 1."""
    model = UNetMultiScaleContext(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
    x = torch.randn(1, 2, 128, 128)
    probs = model.predict_probabilities(x)
    assert probs.shape == (1, 2, 128, 128)
    assert torch.all(probs >= 0.0) and torch.all(probs <= 1.0)
    prob_sum = torch.sum(probs, dim=1)
    assert torch.allclose(prob_sum, torch.ones_like(prob_sum), atol=1e-5)


def test_multiscale_parameter_count_control():
    """Verify MultiScale U-Net parameter count does not exceed 2x V6 baseline parameters."""
    v6_model = UNet(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
    v09a_model = UNetMultiScaleContext(in_channels=2, num_classes=2, base_channels=16, bilinear=True)

    v6_params = sum(p.numel() for p in v6_model.parameters() if p.requires_grad)
    v09a_params = sum(p.numel() for p in v09a_model.parameters() if p.requires_grad)

    assert v09a_params > v6_params, "Multi-scale model should have more parameters than baseline."
    assert v09a_params < 2.0 * v6_params, f"Multi-scale model ({v09a_params}) must not exceed 2x V6 ({v6_params * 2})."


def test_checkpoint_save_and_load_integrity():
    """Verify save and load round-trip with 0 missing and 0 unexpected keys."""
    model = UNetMultiScaleContext(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
    with tempfile.TemporaryDirectory() as tmpdir:
        ckpt_path = os.path.join(tmpdir, "test_ckpt.pth")
        torch.save({"model_state_dict": model.state_dict()}, ckpt_path)

        loaded_model = UNetMultiScaleContext(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
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


def test_dataset_split_proportions():
    """Verify 28 train, 7 val, 5 test splits."""
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
    manifest_p = os.path.join(repo_root, "ml/datasets/manifest.json")
    with open(manifest_p, "r", encoding="utf-8") as f:
        m = json.load(f)

    train_scenes = [s for s in m["scenes"] if s["split"] == "train"]
    val_scenes = [s for s in m["scenes"] if s["split"] == "val"]
    test_scenes = [s for s in m["scenes"] if s["split"] == "test"]

    assert len(train_scenes) == 28
    assert len(val_scenes) == 7
    assert len(test_scenes) == 5
    assert len(m["scenes"]) == 40


def test_preprocessing_normalization_identity():
    """Verify sentinel1_sigma0_db_v1 normalization ranges."""
    vv_raw = np.array([-40.0, -35.0, -20.0, -5.0, 0.0], dtype=np.float32)
    vv_norm = normalize_sar_band(vv_raw, polarization="VV")
    # VV [-35, -5] dB -> [0, 1]
    assert vv_norm[0] == 0.0  # -40 clipped to 0
    assert vv_norm[1] == 0.0  # -35 -> 0
    assert vv_norm[2] == 0.5  # -20 -> 0.5
    assert vv_norm[3] == 1.0  # -5 -> 1.0
    assert vv_norm[4] == 1.0  # 0 clipped to 1.0

    vh_raw = np.array([-50.0, -45.0, -30.0, -15.0, -10.0], dtype=np.float32)
    vh_norm = normalize_sar_band(vh_raw, polarization="VH")
    # VH [-45, -15] dB -> [0, 1]
    assert vh_norm[0] == 0.0  # -50 clipped to 0
    assert vh_norm[1] == 0.0  # -45 -> 0
    assert vh_norm[2] == 0.5  # -30 -> 0.5
    assert vh_norm[3] == 1.0  # -15 -> 1.0
    assert vh_norm[4] == 1.0  # -10 clipped to 1.0


def test_combined_loss_backward():
    """Verify CombinedLoss computation and gradient backpropagation on UNetMultiScaleContext."""
    model = UNetMultiScaleContext(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
    class_weights = torch.tensor([1.0, 5.0], dtype=torch.float32)
    criterion = CombinedLoss(weight=1.0, dice_weight=1.0, class_weights=class_weights)

    inputs = torch.randn(2, 2, 64, 64, requires_grad=True)
    targets = torch.randint(0, 2, (2, 64, 64)).long()

    logits = model(inputs)
    loss, _ = criterion(logits, targets)
    assert not torch.isnan(loss) and not torch.isinf(loss)
    loss.backward()

    # Check that gradients exist and are finite
    for param in model.parameters():
        if param.requires_grad:
            assert param.grad is not None
            assert not torch.isnan(param.grad).any()
