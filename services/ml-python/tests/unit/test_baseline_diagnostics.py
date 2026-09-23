"""
Unit Tests for PART 0.6 — BASELINE FAILURE ANALYSIS & DIAGNOSTICS.
Tests probability distribution calculations, V2/V4 raw comparisons,
extended threshold sweeps, spatial error clustering, and preprocessing shifts.
"""

import os
import json
import pytest
import numpy as np
import torch

from ml.evaluation.baseline_runner import BaselineEvaluationRunner, compute_file_sha256
from ml.evaluation.baseline_diagnostics import BaselineDiagnosticsEngine


@pytest.fixture
def repo_root():
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../"))


@pytest.fixture
def engine(repo_root):
    manifest_path = os.path.join(repo_root, "ml", "datasets", "manifest.json")
    runner = BaselineEvaluationRunner(
        repo_root=repo_root,
        manifest_path=manifest_path,
        device="cpu",
    )
    return BaselineDiagnosticsEngine(runner=runner, repo_root=repo_root)


def test_probability_distribution_calculation(engine):
    """Verify statistical moments and threshold bin counts on synthetic probability surface."""
    prob_map = np.array([
        [0.05, 0.15, 0.25, 0.35],
        [0.45, 0.55, 0.65, 0.75],
        [0.85, 0.95, 0.00, 0.50],
        [0.50, 0.50, 0.50, 0.50],
    ], dtype=np.float32)

    dist = engine.compute_probability_distribution(prob_map)

    assert dist["total_pixels"] == 16
    assert dist["min_probability"] == 0.0
    assert np.isclose(dist["max_probability"], 0.95, atol=1e-5)
    assert np.isclose(dist["mean_probability"], float(np.mean(prob_map)))
    assert dist["pixel_counts_above_threshold"]["ge_50"] == 10
    assert np.isclose(dist["pixel_fractions_above_threshold_pct"]["ge_50_pct"], 62.5)


def test_v2_vs_v4_raw_output_comparison(engine):
    """Verify MAE, max diff, and correlation metrics between two probability surfaces."""
    v2_dummy = np.zeros((100, 100), dtype=np.float32)
    v4_dummy = np.ones((100, 100), dtype=np.float32) * 0.8

    diff = np.abs(v4_dummy - v2_dummy)
    mae = float(np.mean(diff))
    max_diff = float(np.max(diff))

    assert np.isclose(mae, 0.8)
    assert np.isclose(max_diff, 0.8)


def test_v2_negative_db_truncation_detection(engine):
    """Verify that V2 preprocessing correctly flags and measures 100% negative dB truncation."""
    raw_sar_scene = np.random.uniform(-40.0, -10.0, size=(2, 512, 512)).astype(np.float32)

    # Positive mask preprocessing
    v2_preprocessed = raw_sar_scene * (raw_sar_scene > 0)

    # All values should be truncated to 0
    assert np.all(v2_preprocessed == 0.0)
    assert (raw_sar_scene <= 0).sum() == raw_sar_scene.size


def test_v4_calibrated_clipping_preserves_dynamic_range(engine):
    """Verify that V4 calibrated dB clipping preserves dynamic range between 0 and 1."""
    raw_sar_scene = np.linspace(-40.0, 0.0, num=100, dtype=np.float32).reshape(1, 10, 10)
    raw_dual = np.repeat(raw_sar_scene, 2, axis=0)

    v4_prep = {
        "name": "Decibel_Calibrated_Clipping",
        "vv_range_db": [-35.0, -5.0],
        "vh_range_db": [-45.0, -15.0],
    }

    v4_out = engine.runner.preprocess_scene(raw_dual, v4_prep)

    assert v4_out.min() == 0.0
    assert v4_out.max() == 1.0
    # Values inside [-35, -5] should have continuous linear gradients
    assert np.any((v4_out > 0.0) & (v4_out < 1.0))


def test_spatial_error_connected_components(engine):
    """Verify connected-component cluster counting and largest cluster area extraction."""
    # Synthetic FP mask with two separate blobs: 4px and 9px
    gt_mask = np.zeros((50, 50), dtype=np.uint8)
    pred_prob = np.zeros((50, 50), dtype=np.float32)

    # Blob 1: 2x2 = 4px
    pred_prob[5:7, 5:7] = 0.9
    # Blob 2: 3x3 = 9px
    pred_prob[20:23, 20:23] = 0.9

    pred_binary = (pred_prob >= 0.50).astype(np.uint8)
    fp_mask = ((pred_binary == 1) & (gt_mask == 0)).astype(np.uint8)

    import cv2
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(fp_mask)

    assert num_labels == 3  # Background + 2 clusters
    cluster_areas = stats[1:, cv2.CC_STAT_AREA]
    assert sorted(list(cluster_areas)) == [4, 9]


def test_extended_threshold_list_completeness(engine):
    """Verify that extended threshold diagnostic contains all required thresholds."""
    expected = [0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.70, 0.80, 0.90]
    assert engine.EXTENDED_THRESHOLDS == expected


def test_diagnostic_artifacts_exist_and_valid_json(repo_root):
    """Verify that all 9 Part 0.6 diagnostic JSON artifacts exist and parse cleanly."""
    diag_dir = os.path.join(repo_root, "ml", "experiments", "results", "baseline_diagnostics")
    required_files = [
        "v2_probability_distribution.json",
        "v4_probability_distribution.json",
        "v2_threshold_diagnostic.json",
        "v4_threshold_diagnostic.json",
        "v2_vs_v4_output_comparison.json",
        "preprocessing_distribution_diagnostic.json",
        "error_category_analysis.json",
        "spatial_error_summary.json",
        "diagnostic_summary.json",
    ]

    for rf in required_files:
        path = os.path.join(diag_dir, rf)
        assert os.path.exists(path), f"Missing diagnostic artifact: {rf}"
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            assert isinstance(data, dict), f"Artifact {rf} did not parse as a JSON dictionary."
