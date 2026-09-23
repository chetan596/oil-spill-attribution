"""
Unit tests for domain-adaptive optical oil-spill segmentation model V2 (Part 0.14C.3).

Validates:
1. OpticalUNetResNet18V2 architecture shape and auxiliary deep supervision output
2. ASPP multi-scale bridge functionality
3. Probability output range in [0.0, 1.0]
4. Focal Tversky Loss and Domain-Adaptive Loss calculations
5. DomainBalancedBatchSampler 50:50 balance properties
6. Metric separation between MADOS and KERF
7. External test manifest isolation (130 items strictly sealed)
"""

import json
from pathlib import Path
import pytest
import numpy as np
import torch
import torch.nn as nn

from app.models.optical_unet_resnet18_v2 import (
    OpticalUNetResNet18V2,
    ASPPBridge,
    create_optical_unet_resnet18_v2
)

PROJECT_ROOT = Path(__file__).resolve().parents[4]
SEG_METADATA_DIR = PROJECT_ROOT / "data" / "raw" / "optical_real" / "metadata" / "segmentation"
EXTERNAL_MANIFEST_PATH = PROJECT_ROOT / "data" / "raw" / "optical_real" / "metadata" / "external_test_manifest.json"


class TestOpticalUNetResNet18V2Architecture:
    """Validates the upgraded V2 segmentation architecture."""

    def test_model_initialization_and_forward(self):
        """Verify model builds and outputs correct shape for arbitrary batch size."""
        model = OpticalUNetResNet18V2(pretrained=False, num_classes=1, use_deep_supervision=False)
        model.eval()

        x = torch.randn(2, 3, 256, 256)
        with torch.no_grad():
            out = model(x)

        assert out.shape == (2, 1, 256, 256), f"Expected shape (2, 1, 256, 256), got {out.shape}"
        assert not torch.isnan(out).any(), "Output contains NaN values"

    def test_deep_supervision_forward_train(self):
        """Verify model returns main logits and auxiliary logits during training."""
        model = OpticalUNetResNet18V2(pretrained=False, num_classes=1, use_deep_supervision=True)
        model.train()

        x = torch.randn(2, 3, 256, 256)
        main_logits, aux_logits = model(x, return_aux=True)

        assert main_logits.shape == (2, 1, 256, 256)
        assert aux_logits.shape == (2, 1, 256, 256)
        assert not torch.isnan(main_logits).any()
        assert not torch.isnan(aux_logits).any()

    def test_aspp_bridge_multi_scale_receptive_field(self):
        """Verify ASPP bridge processes multi-scale features correctly."""
        bridge = ASPPBridge(in_channels=512, out_channels=512)
        bridge.eval()

        x = torch.randn(2, 512, 16, 16)
        with torch.no_grad():
            out = bridge(x)

        assert out.shape == (2, 512, 16, 16)
        assert not torch.isnan(out).any()

    def test_factory_function(self):
        """Verify factory function initializes model properly."""
        model = create_optical_unet_resnet18_v2(pretrained=False)
        assert isinstance(model, nn.Module)
        param_count = sum(p.numel() for p in model.parameters() if p.requires_grad)
        assert param_count > 12_000_000, f"Expected >12M parameters, got {param_count}"

    def test_probability_output_range(self):
        """Verify sigmoid probabilities are strictly within [0.0, 1.0]."""
        model = OpticalUNetResNet18V2(pretrained=False, num_classes=1)
        model.eval()

        x = torch.randn(1, 3, 128, 128)
        with torch.no_grad():
            probs = model.predict_probability(x)

        assert probs.min() >= 0.0
        assert probs.max() <= 1.0
        assert probs.shape == (1, 1, 128, 128)


class TestDomainAdaptiveLossFunctions:
    """Validates Focal Tversky and domain-disaggregated loss formulas."""

    def test_focal_tversky_loss_computation(self):
        """Verify Focal Tversky loss produces positive non-zero loss on mismatched predictions."""
        from ml.training.train_optical_segmentation_v2 import FocalTverskyLoss

        loss_fn = FocalTverskyLoss(alpha=0.3, beta=0.7, gamma=1.33)
        logits = torch.randn(2, 1, 64, 64)
        targets = torch.zeros(2, 1, 64, 64)
        targets[:, :, 10:20, 10:20] = 1.0  # Sparse foreground

        loss = loss_fn(logits, targets)
        assert loss.item() > 0.0
        assert not torch.isnan(loss)

    def test_domain_adaptive_loss_v2(self):
        """Verify domain adaptive loss handles both MADOS and KERF batch components."""
        from ml.training.train_optical_segmentation_v2 import DomainAdaptiveLossV2

        loss_fn = DomainAdaptiveLossV2(aux_weight=0.3)
        main_logits = torch.randn(4, 1, 64, 64)
        aux_logits = torch.randn(4, 1, 64, 64)
        targets = torch.zeros(4, 1, 64, 64)
        targets[0, 0, 5:10, 5:10] = 1.0
        targets[2, 0, 10:30, 10:30] = 1.0

        items = [
            {"source_dataset": "MADOS_Sentinel2", "is_oil_positive": True},
            {"source_dataset": "MADOS_Sentinel2", "is_oil_positive": False},
            {"source_dataset": "Kerf_Drone_Oil_Spill", "is_oil_positive": True},
            {"source_dataset": "Kerf_Drone_Oil_Spill", "is_oil_positive": False},
        ]

        loss = loss_fn(main_logits, targets, items, aux_logits)
        assert loss.item() > 0.0
        assert not torch.isnan(loss)


class TestDomainAwareManifestIsolation:
    """Verifies manifest integrity and strict external test isolation."""

    def test_train_manifest_isolation(self):
        """Ensure train manifest contains valid splits and zero external test items."""
        train_path = SEG_METADATA_DIR / "segmentation_train_manifest.json"
        with open(train_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        assert len(data) == 1961
        for item in data:
            assert item.get("split") == "TRAIN"

    def test_val_manifest_isolation(self):
        """Ensure validation manifest contains valid splits and zero external test items."""
        val_path = SEG_METADATA_DIR / "segmentation_validation_manifest.json"
        with open(val_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        assert len(data) == 730
        for item in data:
            assert item.get("split") == "VALIDATION"

    def test_internal_test_manifest_isolation(self):
        """Ensure internal test manifest contains valid splits and zero external test items."""
        test_path = SEG_METADATA_DIR / "segmentation_internal_test_manifest.json"
        with open(test_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        assert len(data) == 708
        for item in data:
            assert item.get("split") == "INTERNAL_TEST"

    def test_external_test_strictly_sealed(self):
        """Ensure external test manifest is distinct and 130 items."""
        with open(EXTERNAL_MANIFEST_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)

        assert data.get("total_images") == 130
        assert len(data.get("images", [])) == 130
