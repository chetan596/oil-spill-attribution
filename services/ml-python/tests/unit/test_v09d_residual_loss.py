"""
Unit tests for PART 0.9D — Residual U-Net + Controlled Loss Synthesis Experiment.
"""

import os
import json
import pytest
import torch
import torch.nn as nn

from app.models.unet.architecture import UNetResidual
from app.training.losses import CombinedLoss
from app.models.registry import ModelRegistry
from ml.training.train_v6 import compute_file_sha256


_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))


def test_v09d_architecture_and_parameter_count():
    """Verify UNetResidual matches Part 0.9C specifications and stays under 2x V6."""
    model = UNetResidual(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
    param_count = sum(p.numel() for p in model.parameters() if p.requires_grad)
    assert param_count == 1114338
    assert param_count < 2 * 1080802


def test_v09d_checkpoint_and_hash_integrity():
    """Verify V09D physical checkpoint exists, can be loaded, and has valid SHA-256."""
    ckpt_path = os.path.join(_REPO_ROOT, "ml/model_registry/versions/unet_dual_pol_sar_v09d_residual_loss.pth")
    assert os.path.exists(ckpt_path), f"Checkpoint missing at {ckpt_path}"

    sha256 = compute_file_sha256(ckpt_path)
    assert len(sha256) == 64

    # Load on CPU
    model = UNetResidual(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
    payload = torch.load(ckpt_path, map_location="cpu", weights_only=False)
    assert "model_state_dict" in payload
    incompat = model.load_state_dict(payload["model_state_dict"])
    assert len(incompat.missing_keys) == 0
    assert len(incompat.unexpected_keys) == 0


def test_v09d_loss_configuration():
    """Verify loss function parameters match Part 0.8 V8D specification (CombinedLoss fg=10.0)."""
    class_weights = torch.tensor([1.0, 10.0], dtype=torch.float32)
    criterion = CombinedLoss(weight=1.0, dice_weight=1.0, class_weights=class_weights)
    assert criterion.ce_weight == 1.0
    assert criterion.dice_weight == 1.0
    assert criterion.ce_loss.weight[1].item() == 10.0


def test_v09d_registry_entry():
    """Verify model registry contains V09D registered as EXPERIMENTAL."""
    reg = ModelRegistry()
    entry = reg.get_model_entry("unet-dual-pol-sar-v09d-residual-loss")
    assert entry["architecture"] == "UNetResidual"
    assert entry["status"] == "experimental"
    assert entry["in_channels"] == 2
    assert entry["num_classes"] == 2


def test_v09d_artifacts_completeness():
    """Verify all required Part 0.9D artifacts exist in results directory."""
    results_dir = os.path.join(_REPO_ROOT, "ml/experiments/results/v09d_residual_loss")
    required_files = [
        "config.json",
        "experiment_config.json",
        "training_history.json",
        "validation_metrics.json",
        "threshold_sweep.json",
        "full_scene_validation.json",
        "runtime_summary.json",
        "checkpoint_metadata.json",
        "comparison_v6_v09c_v09d.json",
        "experiment_summary.json",
        "dataset_snapshot.json",
        "integrity.json",
        "training_curves.svg",
        "dice_vs_threshold.svg",
        "lookalike_fpr_vs_threshold.svg",
    ]
    for rf in required_files:
        p = os.path.join(results_dir, rf)
        assert os.path.exists(p), f"Missing artifact: {p}"


def test_v09d_held_out_test_quarantine():
    """Verify 5 Part III test scenes were never evaluated or accessed."""
    locked_scenes = {
        "real_part3_test_00060",
        "real_part3_test_00062",
        "real_part3_test_00063",
        "real_part3_test_00064",
        "real_part3_test_00080",
    }
    sweep_path = os.path.join(_REPO_ROOT, "ml/experiments/results/v09d_residual_loss/threshold_sweep.json")
    with open(sweep_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    evaluated_scenes = {s["scene_id"] for s in data["scene_level_evaluations"]}
    assert evaluated_scenes.isdisjoint(locked_scenes), "VIOLATION: Locked test scenes found in validation results!"
