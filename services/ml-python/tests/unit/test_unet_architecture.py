"""
Unit Tests for PyTorch U-Net Architecture.
Tests tensor dimensions, multi-channel inputs, and forward passes.
"""

import pytest
import torch
from app.models.unet.architecture import UNet


def test_unet_single_channel_forward():
    model = UNet(in_channels=1, num_classes=2, base_channels=16)
    x = torch.randn(1, 1, 256, 256)
    out = model(x)
    assert out.shape == (1, 2, 256, 256)


def test_unet_dual_channel_forward():
    model = UNet(in_channels=2, num_classes=2, base_channels=16)
    x = torch.randn(2, 2, 256, 256)
    out = model(x)
    assert out.shape == (2, 2, 256, 256)


def test_unet_predict_probabilities():
    model = UNet(in_channels=1, num_classes=2, base_channels=16)
    x = torch.randn(1, 1, 128, 128)
    probs = model.predict_probabilities(x)
    assert probs.shape == (1, 2, 128, 128)
    assert torch.all(probs >= 0.0) and torch.all(probs <= 1.0)
    # Check probabilities sum to 1 along channel dimension
    prob_sum = torch.sum(probs, dim=1)
    assert torch.allclose(prob_sum, torch.ones_like(prob_sum), atol=1e-5)
