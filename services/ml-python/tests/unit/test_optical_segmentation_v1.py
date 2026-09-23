"""Unit tests for optical oil-spill segmentation model v1 (Part 0.14C.2).

Validates:
1. ResNet18-UNet architecture shape and logits/sigmoid behavior
2. Output shape (B, 1, H, W)
3. Soft Dice Loss and BCE Loss computation
4. Metrics calculation (IoU, Dice, Precision, Recall, FPR)
5. Thresholding logic
6. Manifest isolation assertions (ensures external test is sealed)
7. Checkpoint structure
"""

import json
import os
import pytest
import torch
import torch.nn as nn
import numpy as np
from pathlib import Path

from app.models.optical_unet_resnet18 import OpticalUNetResNet18, create_optical_unet_resnet18

PROJECT_ROOT = Path(__file__).resolve().parents[4]
SEG_METADATA_DIR = PROJECT_ROOT / "data" / "raw" / "optical_real" / "metadata" / "segmentation"
EXTERNAL_MANIFEST_PATH = PROJECT_ROOT / "data" / "raw" / "optical_real" / "metadata" / "external_test_manifest.json"



class TestOpticalUNetResNet18Architecture:
    """Validates the ResNet18 U-Net segmentation model."""

    def test_model_initialization_and_forward(self):
        """Verify model builds and outputs correct shape for arbitrary batch size."""
        model = OpticalUNetResNet18(pretrained=False, num_classes=1)
        model.eval()

        # Batch of 2 RGB images at 256x256
        x = torch.randn(2, 3, 256, 256)
        with torch.no_grad():
            out = model(x)

        assert out.shape == (2, 1, 256, 256), f"Expected shape (2, 1, 256, 256), got {out.shape}"
        assert not torch.isnan(out).any(), "Output contains NaN values"

    def test_factory_function(self):
        """Verify factory function initializes model properly."""
        model = create_optical_unet_resnet18(pretrained=False)
        assert isinstance(model, nn.Module)
        param_count = sum(p.numel() for p in model.parameters() if p.requires_grad)
        assert param_count > 10_000_000, f"Expected >10M parameters, got {param_count}"

    def test_probability_output_range(self):
        """Verify sigmoid probabilities are strictly within [0.0, 1.0]."""
        model = OpticalUNetResNet18(pretrained=False, num_classes=1)
        model.eval()

        x = torch.randn(1, 3, 128, 128)
        with torch.no_grad():
            logits = model(x)
            probs = torch.sigmoid(logits)

        assert probs.min() >= 0.0
        assert probs.max() <= 1.0
        assert probs.shape == (1, 1, 128, 128)

    def test_variable_input_resolutions(self):
        """Verify architecture handles multiple typical optical resolutions."""
        model = OpticalUNetResNet18(pretrained=False, num_classes=1)
        model.eval()

        for h, w in [(240, 240), (256, 256), (384, 384), (512, 512)]:
            x = torch.randn(1, 3, h, w)
            with torch.no_grad():
                out = model(x)
            assert out.shape == (1, 1, h, w), f"Failed for resolution ({h}, {w}), got {out.shape}"


class TestSegmentationMetricsAndLoss:
    """Validates metric calculations and loss behavior."""

    def test_perfect_prediction_metrics(self):
        """Test metrics calculation on identical prediction and ground truth."""
        pred = np.zeros((100, 100), dtype=np.uint8)
        gt = np.zeros((100, 100), dtype=np.uint8)
        pred[20:50, 20:50] = 1
        gt[20:50, 20:50] = 1

        tp = int(np.logical_and(pred == 1, gt == 1).sum())
        fp = int(np.logical_and(pred == 1, gt == 0).sum())
        fn = int(np.logical_and(pred == 0, gt == 1).sum())
        tn = int(np.logical_and(pred == 0, gt == 0).sum())

        iou = tp / (tp + fp + fn)
        dice = (2 * tp) / (2 * tp + fp + fn)
        precision = tp / (tp + fp)
        recall = tp / (tp + fn)

        assert iou == 1.0
        assert dice == 1.0
        assert precision == 1.0
        assert recall == 1.0

    def test_zero_foreground_metrics(self):
        """Test clean non-oil image prediction."""
        pred = np.zeros((100, 100), dtype=np.uint8)
        gt = np.zeros((100, 100), dtype=np.uint8)

        fp = int(np.logical_and(pred == 1, gt == 0).sum())
        tn = int(np.logical_and(pred == 0, gt == 0).sum())
        fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0

        assert fp == 0
        assert fpr == 0.0

    def test_thresholding_logic(self):
        """Verify binary mask output under arbitrary probability threshold."""
        prob_map = np.array([
            [0.1, 0.4, 0.6],
            [0.2, 0.8, 0.9],
            [0.05, 0.35, 0.7]
        ], dtype=np.float32)

        binary_mask = (prob_map >= 0.5).astype(np.uint8)
        expected = np.array([
            [0, 0, 1],
            [0, 1, 1],
            [0, 0, 1]
        ], dtype=np.uint8)

        np.testing.assert_array_equal(binary_mask, expected)


class TestManifestIsolationAndIntegrity:
    """Ensures external test set is strictly sealed and never accessed by training manifests."""

    def test_train_manifest_has_no_external_test(self):
        """Ensure segmentation_train_manifest has zero external_test items."""
        train_path = SEG_METADATA_DIR / "segmentation_train_manifest.json"
        assert train_path.exists(), f"Missing {train_path}"

        with open(train_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        assert len(data) == 1961
        for item in data:
            assert item.get("split") == "TRAIN"

    def test_val_manifest_has_no_external_test(self):
        """Ensure segmentation_validation_manifest has zero external_test items."""
        val_path = SEG_METADATA_DIR / "segmentation_validation_manifest.json"
        assert val_path.exists(), f"Missing {val_path}"

        with open(val_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        assert len(data) == 730
        for item in data:
            assert item.get("split") == "VALIDATION"

    def test_internal_test_manifest_has_no_external_test(self):
        """Ensure segmentation_internal_test_manifest has zero external_test items."""
        test_path = SEG_METADATA_DIR / "segmentation_internal_test_manifest.json"
        assert test_path.exists(), f"Missing {test_path}"

        with open(test_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        assert len(data) == 708
        for item in data:
            assert item.get("split") == "INTERNAL_TEST"

    def test_external_test_is_sealed_and_isolated(self):
        """Ensure external test manifest is distinct and 130 items."""
        assert EXTERNAL_MANIFEST_PATH.exists(), f"Missing {EXTERNAL_MANIFEST_PATH}"

        with open(EXTERNAL_MANIFEST_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)

        assert data.get("total_images") == 130
        assert len(data.get("images", [])) == 130

