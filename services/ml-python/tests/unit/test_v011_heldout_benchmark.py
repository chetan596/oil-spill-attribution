"""
Unit tests for PART 0.11 — Formal Held-Out Benchmark Evaluation.
"""

import os
import json
import pytest
import torch

from app.models.registry import ModelRegistry
from ml.training.train_v6 import compute_file_sha256

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))


def test_v011_artifacts_completeness():
    """Verify all required Part 0.11 benchmark artifacts exist on disk."""
    bench_dir = os.path.join(_REPO_ROOT, "ml/experiments/results/v011_heldout_benchmark")
    required_json_files = [
        "benchmark_config.json",
        "model_manifest.json",
        "dataset_manifest.json",
        "test_lock_release.json",
        "per_scene_metrics.json",
        "aggregate_metrics.json",
        "threshold_sweep.json",
        "validation_vs_test.json",
        "error_analysis.json",
        "reproducibility.json",
        "benchmark_summary.json",
    ]
    for rf in required_json_files:
        p = os.path.join(bench_dir, rf)
        assert os.path.exists(p), f"Missing Part 0.11 JSON artifact: {p}"

    # Visual artifacts check
    vis_dir = os.path.join(bench_dir, "visual_artifacts")
    assert os.path.isdir(vis_dir), f"Missing visual artifacts directory: {vis_dir}"

    test_scenes = [
        "real_part3_test_00060",
        "real_part3_test_00062",
        "real_part3_test_00063",
        "real_part3_test_00064",
        "real_part3_test_00080",
    ]
    for s_id in test_scenes:
        for suffix in ["ground_truth.png", "v09d_prediction.png", "v09d_overlay.png", "v6_prediction.png", "v6_overlay.png"]:
            img_path = os.path.join(vis_dir, f"{s_id}_{suffix}")
            assert os.path.exists(img_path), f"Missing visual artifact: {img_path}"

    # Report markdown check
    report_path = os.path.join(_REPO_ROOT, "docs/model/PART_0_11_FORMAL_HELDOUT_BENCHMARK_REPORT.md")
    assert os.path.exists(report_path), f"Missing report markdown: {report_path}"


def test_v011_test_lock_release_event_schema():
    """Verify the formal test lock release audit event schema and data."""
    p = os.path.join(_REPO_ROOT, "ml/experiments/results/v011_heldout_benchmark/test_lock_release.json")
    with open(p, "r", encoding="utf-8") as f:
        event = json.load(f)

    assert event["event"] == "PART_0_11_TEST_LOCK_RELEASED_FOR_SEALED_BENCHMARK"
    assert "timestamp" in event
    assert len(event["held_out_test_scenes"]) == 5
    assert set(event["held_out_test_scenes"]) == {
        "real_part3_test_00060",
        "real_part3_test_00062",
        "real_part3_test_00063",
        "real_part3_test_00064",
        "real_part3_test_00080",
    }
    assert "dataset_manifest_sha256" in event
    assert "model_checkpoints" in event
    assert "v09d_residual_loss" in event["model_checkpoints"]
    assert "v6_baseline" in event["model_checkpoints"]
    assert "v2_historical" in event["model_checkpoints"]


def test_v011_model_manifest_and_checkpoint_sha():
    """Verify model checkpoint integrity and historical / non-comparable labeling."""
    p = os.path.join(_REPO_ROOT, "ml/experiments/results/v011_heldout_benchmark/model_manifest.json")
    with open(p, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    models = {m["model_id"]: m for m in manifest["models_evaluated"]}
    assert "unet-dual-pol-sar-v09d-residual-loss" in models
    assert "unet-dual-pol-sar-v6" in models
    assert "unet-dual-pol-sar-v2" in models

    v09d = models["unet-dual-pol-sar-v09d-residual-loss"]
    v6 = models["unet-dual-pol-sar-v6"]
    v2 = models["unet-dual-pol-sar-v2"]

    assert v09d["role"] == "PRIMARY_EXPERIMENTAL_CANDIDATE"
    assert v6["role"] == "CONTROLLED_BASELINE_REFERENCE"
    assert v2["role"] == "HISTORICAL_REFERENCE_NON_COMPARABLE"

    ckpt_dir = os.path.join(_REPO_ROOT, "ml/model_registry/versions")

    # Check V09D
    v09d_path = os.path.join(ckpt_dir, "unet_dual_pol_sar_v09d_residual_loss.pth")
    assert os.path.exists(v09d_path)
    assert compute_file_sha256(v09d_path) == v09d["sha256"]
    assert v09d["sha256"] == "ab22ffa2fb1c3be99ff2bb99353db76ed4934bd00210f7bce21df74506ce827d"

    # Check V6
    v6_path = os.path.join(ckpt_dir, "unet_dual_pol_sar_v6.pth")
    assert os.path.exists(v6_path)
    assert compute_file_sha256(v6_path) == v6["sha256"]
    assert v6["sha256"] == "bcf3d6bc988b910fa67c0c31c89cb2c861da73f0b02159c579cb28e5039920e3"

    # Check V2
    v2_path = os.path.join(ckpt_dir, "unet_dual_pol_sar_v2.pth")
    assert os.path.exists(v2_path)
    assert compute_file_sha256(v2_path) == v2["sha256"]
    assert v2["sha256"] == "905ef8e47c1f4b12eb490b33f1726fb91714b3dfcdf5184d8dfd96ec312f0dbd"


def test_v011_dataset_completeness_and_scene_identities():
    """Verify test dataset scene completeness and metadata."""
    p = os.path.join(_REPO_ROOT, "ml/experiments/results/v011_heldout_benchmark/dataset_manifest.json")
    with open(p, "r", encoding="utf-8") as f:
        data_manifest = json.load(f)

    scenes = data_manifest["test_scenes"]
    assert len(scenes) == 5

    scene_ids = [s["scene_id"] for s in scenes]
    assert "real_part3_test_00060" in scene_ids
    assert "real_part3_test_00062" in scene_ids
    assert "real_part3_test_00063" in scene_ids
    assert "real_part3_test_00064" in scene_ids
    assert "real_part3_test_00080" in scene_ids

    total_pixels = sum(s["width"] * s["height"] for s in scenes)
    assert total_pixels == 5 * 2048 * 2048  # 20,971,520 pixels total


def test_v011_threshold_policy_and_aggregate_metrics():
    """Verify pre-registered operating threshold (0.50) vs descriptive threshold sweep."""
    p_agg = os.path.join(_REPO_ROOT, "ml/experiments/results/v011_heldout_benchmark/aggregate_metrics.json")
    with open(p_agg, "r", encoding="utf-8") as f:
        agg = json.load(f)

    assert agg["preregistered_operating_threshold"] == 0.50

    models_at_50 = agg["models_at_threshold_0_50"]
    assert "V09D_RESIDUAL_LOSS" in models_at_50
    assert "V6_BASELINE" in models_at_50
    assert "V2_HISTORICAL" in models_at_50

    v09d_metrics = models_at_50["V09D_RESIDUAL_LOSS"]["metrics"]
    v6_metrics = models_at_50["V6_BASELINE"]["metrics"]
    v2_metrics = models_at_50["V2_HISTORICAL"]["metrics"]

    # Check metric bounds
    for res in [v09d_metrics, v6_metrics, v2_metrics]:
        assert 0.0 <= res["iou"] <= 1.0
        assert 0.0 <= res["dice"] <= 1.0
        assert 0.0 <= res["precision"] <= 1.0
        assert 0.0 <= res["recall"] <= 1.0
        assert 0.0 <= res["fpr"] <= 1.0

    # Check descriptive threshold sweep
    sweeps = agg["descriptive_threshold_sweeps"]
    for m_key in ["V09D_RESIDUAL_LOSS", "V6_BASELINE", "V2_HISTORICAL"]:
        assert m_key in sweeps
        assert len(sweeps[m_key]) == 6
        thresholds = [item["threshold"] for item in sweeps[m_key]]
        assert thresholds == [0.30, 0.35, 0.40, 0.45, 0.50, 0.60]


def test_v011_per_scene_metrics_integrity():
    """Verify per-scene metrics schema, clean ocean FPR, and lookalike FPR handling."""
    p_scene = os.path.join(_REPO_ROOT, "ml/experiments/results/v011_heldout_benchmark/per_scene_metrics.json")
    with open(p_scene, "r", encoding="utf-8") as f:
        scene_metrics = json.load(f)

    assert len(scene_metrics) == 5

    test_scenes = {
        "real_part3_test_00060",
        "real_part3_test_00062",
        "real_part3_test_00063",
        "real_part3_test_00064",
        "real_part3_test_00080",
    }

    for item in scene_metrics:
        assert item["scene_id"] in test_scenes
        assert "models" in item
        for m_key in ["V09D_RESIDUAL_LOSS", "V6_BASELINE", "V2_HISTORICAL"]:
            assert m_key in item["models"]
            m_data = item["models"][m_key]
            m50 = m_data["metrics_at_preregistered_threshold_0_50"]
            assert m50["threshold"] == 0.50
            assert "iou" in m50
            assert "dice" in m50
            assert "precision" in m50
            assert "recall" in m50
            assert "fpr" in m50
            assert "predicted_positive_pixels" in m50
            assert len(m_data["threshold_sweep"]) == 6
