"""
Unit tests for PART 0.10 — Comprehensive Architectural Synthesis & Ablation Audit.
"""

import os
import json
import pytest
import torch

from app.models.registry import ModelRegistry
from ml.training.train_v6 import compute_file_sha256

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))


def test_v010_artifacts_completeness():
    """Verify all required Part 0.10 audit artifacts exist on disk."""
    audit_dir = os.path.join(_REPO_ROOT, "ml/experiments/results/v010_synthesis_audit")
    required_files = [
        "experiment_matrix.json",
        "normalized_metrics.json",
        "threshold_analysis.json",
        "comparability_audit.json",
        "error_profile.json",
        "reproducibility_audit.json",
        "test_lock_audit.json",
        "synthesis_summary.json",
        "architecture_comparison.svg",
        "loss_comparison.svg",
        "threshold_tradeoff.svg",
        "lookalike_fpr_comparison.svg",
    ]
    for rf in required_files:
        p = os.path.join(audit_dir, rf)
        assert os.path.exists(p), f"Missing Part 0.10 artifact: {p}"


def test_v010_experiment_matrix_schema_and_classification():
    """Verify experiment matrix classifications for controlled vs historical models."""
    p = os.path.join(_REPO_ROOT, "ml/experiments/results/v010_synthesis_audit/experiment_matrix.json")
    with open(p, "r", encoding="utf-8") as f:
        matrix = json.load(f)

    assert len(matrix) >= 13

    controlled_ids = {
        "V6_BASELINE",
        "V8_A_BASELINE_LOSS",
        "V8_B_FOCAL_DICE",
        "V8_C_FOCAL_TVERSKY",
        "V8_D_HIGH_FG_WEIGHT",
        "PART_0_9A_MULTISCALE",
        "PART_0_9B_ATTENTION",
        "PART_0_9C_RESIDUAL",
        "PART_0_9D_RESIDUAL_LOSS"
    }

    for exp in matrix:
        eid = exp["experiment_id"]
        if eid in controlled_ids:
            assert exp["comparability_status"] == "CONTROLLED"
        elif eid in ("V1_HISTORICAL", "V2_HISTORICAL", "V3_HISTORICAL"):
            assert exp["comparability_status"] == "HISTORICAL / NON-COMPARABLE"
        elif eid == "V4_HISTORICAL":
            assert exp["comparability_status"] == "PARTIALLY_CONTROLLED"


def test_v010_checkpoint_hash_validation():
    """Verify all verified checkpoints have matching SHA-256 hashes in reproducibility audit."""
    p = os.path.join(_REPO_ROOT, "ml/experiments/results/v010_synthesis_audit/reproducibility_audit.json")
    with open(p, "r", encoding="utf-8") as f:
        rep_data = json.load(f)

    manifest_path = os.path.join(_REPO_ROOT, "ml/datasets/manifest.json")
    assert rep_data["dataset_manifest_sha256"] == compute_file_sha256(manifest_path)

    ckpt_dir = os.path.join(_REPO_ROOT, "ml/model_registry/versions")
    for mid, cinfo in rep_data["checkpoints"].items():
        if cinfo.get("status") == "VERIFIED_ON_DISK":
            cp = os.path.join(ckpt_dir, cinfo["checkpoint_file"])
            assert os.path.exists(cp), f"Checkpoint missing: {cp}"
            calculated_sha = compute_file_sha256(cp)
            assert calculated_sha == cinfo["sha256"], f"SHA mismatch for {mid}"


def test_v010_test_lock_enforcement():
    """Verify test-lock audit confirms strict quarantine of Part III held-out test scenes."""
    p = os.path.join(_REPO_ROOT, "ml/experiments/results/v010_synthesis_audit/test_lock_audit.json")
    with open(p, "r", encoding="utf-8") as f:
        lock_data = json.load(f)

    assert lock_data["held_out_test_status"] == "LOCKED"
    assert lock_data["violation_detected"] is False
    assert len(lock_data["quarantined_scenes"]) == 5
    assert "real_part3_test_00060" in lock_data["quarantined_scenes"]


def test_v010_registry_immutability():
    """Verify V2 remains ACTIVE_BASELINE and experimental models remain EXPERIMENTAL."""
    reg = ModelRegistry()
    assert reg.get_model_entry()["model_id"] == "unet-dual-pol-sar-v2"
    assert reg.get_model_entry("unet-dual-pol-sar-v6")["status"] == "experimental"
    assert reg.get_model_entry("unet-dual-pol-sar-v09d-residual-loss")["status"] == "experimental"


def test_v010_threshold_schema_and_sweep():
    """Verify threshold sweep metrics contain valid ranges for all controlled models."""
    p = os.path.join(_REPO_ROOT, "ml/experiments/results/v010_synthesis_audit/normalized_metrics.json")
    with open(p, "r", encoding="utf-8") as f:
        metrics_data = json.load(f)

    expected_models = [
        "V6_BASELINE",
        "V8_A_BASELINE_LOSS",
        "V8_B_FOCAL_DICE",
        "V8_C_FOCAL_TVERSKY",
        "V8_D_HIGH_FG_WEIGHT",
        "V09A_MULTISCALE",
        "V09B_ATTENTION",
        "V09C_RESIDUAL",
        "V09D_RESIDUAL_LOSS"
    ]

    for m_id in expected_models:
        assert m_id in metrics_data["models"], f"Missing {m_id} from normalized metrics"
        th_list = metrics_data["models"][m_id]
        assert len(th_list) == 6  # 6 thresholds: 0.30, 0.35, 0.40, 0.45, 0.50, 0.60
        for item in th_list:
            assert 0.0 <= item["threshold"] <= 1.0
            if "micro_pixel_aggregate" in item:
                assert 0.0 <= item["micro_pixel_aggregate"]["dice"] <= 1.0
                assert 0.0 <= item["micro_pixel_aggregate"]["iou"] <= 1.0
