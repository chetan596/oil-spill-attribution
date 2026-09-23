"""
Unit Tests for PART 0.5 — REPRODUCIBLE BASELINE EVALUATION AUDIT.
Tests baseline evaluation runner, split isolation, checkpoint integrity,
preprocessing contracts, full-scene reconstruction, threshold sweeps,
category-specific FPR isolation, and micro/macro metric aggregation.
"""

import os
import json
import pytest
import numpy as np
import torch

from ml.evaluation.baseline_runner import (
    BaselineEvaluationRunner,
    compute_file_sha256,
)
from app.models.unet.architecture import UNet
from app.preprocessing.tiling import generate_tiles, reconstruct_full_mask
from ml.evaluation.metrics import compute_iou, compute_fpr
from ml.evaluation.confusion_matrix import calculate_confusion_metrics


@pytest.fixture
def repo_root():
    # File is in services/ml-python/tests/unit/ -> 4 levels up to workspace root
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../"))


@pytest.fixture
def runner(repo_root):
    manifest_path = os.path.join(repo_root, "ml", "datasets", "manifest.json")
    return BaselineEvaluationRunner(
        repo_root=repo_root,
        manifest_path=manifest_path,
        device="cpu",  # Use CPU for fast unit test verification
    )


def test_split_selection_and_train_isolation(runner):
    """Verify exact split counts and ensure train scenes are never returned in val/test."""
    manifest_scenes = runner.manifest_data["scenes"]
    val_scenes = [s for s in manifest_scenes if s.get("split") == "val"]
    test_scenes = [s for s in manifest_scenes if s.get("split") == "test"]
    train_scenes = [s for s in manifest_scenes if s.get("split") == "train"]

    assert len(val_scenes) == 7, f"Expected 7 validation scenes, got {len(val_scenes)}"
    assert len(test_scenes) == 5, f"Expected 5 test scenes, got {len(test_scenes)}"
    assert len(train_scenes) == 28, f"Expected 28 train scenes, got {len(train_scenes)}"

    # Ensure zero overlap
    val_ids = set(s["scene_id"] for s in val_scenes)
    test_ids = set(s["scene_id"] for s in test_scenes)
    train_ids = set(s["scene_id"] for s in train_scenes)

    assert val_ids.isdisjoint(train_ids), "Validation split contains training scenes!"
    assert test_ids.isdisjoint(train_ids), "Test split contains training scenes!"
    assert val_ids.isdisjoint(test_ids), "Validation split overlaps with test split!"


def test_part3_held_out_isolation(runner):
    """Verify that Part III test scenes are strictly isolated to test split."""
    manifest_scenes = runner.manifest_data["scenes"]
    part3_scenes = [s for s in manifest_scenes if "part3_test" in s.get("folder", "")]

    assert len(part3_scenes) == 5
    for s in part3_scenes:
        assert s["split"] == "test", f"Part 3 scene {s['scene_id']} must be assigned to 'test' split only."


def test_checkpoint_hash_verification(runner):
    """Verify that V2 and V4 checkpoints match expected SHA-256 digests."""
    v2_model, v2_meta = runner.load_model("unet-dual-pol-sar-v2")
    assert v2_meta["sha256"] == "905ef8e47c1f4b12eb490b33f1726fb91714b3dfcdf5184d8dfd96ec312f0dbd"

    v4_model, v4_meta = runner.load_model("unet-dual-pol-sar-v4")
    assert v4_meta["sha256"] == "c1395f1deae819b222f9e1034472d18a84f502fd89d4076981d3291f4af4fd63"


def test_checkpoint_hash_mismatch_fails(runner, monkeypatch):
    """Verify that an altered checkpoint hash raises ValueError."""
    monkeypatch.setattr(
        runner,
        "EXPECTED_CHECKPOINT_HASHES",
        {"unet-dual-pol-sar-v2": "bad_hash_000000000000000000000000000000000000000000000000000000000"}
    )
    with pytest.raises(ValueError, match="CHECKPOINT_HASH_CHANGED"):
        runner.load_model("unet-dual-pol-sar-v2")


def test_preprocessing_lineage_contracts(runner):
    """Verify that V2 and V4 apply distinct preprocessing lineage contracts."""
    raw_dummy = np.array([
        [[-10.0, 5.0], [-40.0, 0.0]],   # VV
        [[-25.0, 10.0], [-50.0, -10.0]] # VH
    ], dtype=np.float32)

    v2_prep = {
        "name": "Historical_Uncorrected_Positive_Mask",
    }
    v4_prep = {
        "name": "Decibel_Calibrated_Clipping",
        "vv_range_db": [-35.0, -5.0],
        "vh_range_db": [-45.0, -15.0],
    }

    v2_out = runner.preprocess_scene(raw_dummy, v2_prep)
    v4_out = runner.preprocess_scene(raw_dummy, v4_prep)

    # V2 uncorrected truncates negative numbers to 0
    assert v2_out[0, 0, 0] == 0.0  # -10 -> 0
    assert v2_out[0, 0, 1] == 5.0  # 5 -> 5

    # V4 calibrated maps dB to [0, 1]
    # -10 dB in [-35, -5] -> (-10 - -35) / 30 = 25/30 = 0.833333
    assert np.isclose(v4_out[0, 0, 0], 25.0 / 30.0, atol=1e-5)
    # 5 dB in [-35, -5] -> clipped to 1.0
    assert v4_out[0, 0, 1] == 1.0


def test_model_output_interpretation():
    """Verify that UNet outputs 2 channels (background, oil) and softmax channel 1 represents oil."""
    model = UNet(in_channels=2, num_classes=2, base_channels=16)
    model.eval()

    dummy_input = torch.randn(1, 2, 512, 512)
    with torch.no_grad():
        logits = model(dummy_input)
        assert logits.shape == (1, 2, 512, 512)
        probs = torch.softmax(logits, dim=1)[:, 1, :, :]
        assert probs.shape == (1, 512, 512)
        assert (probs >= 0.0).all() and (probs <= 1.0).all()


def test_tile_reconstruction_fidelity():
    """Verify full-scene tile generation and weighted reconstruction geometry."""
    raster = np.ones((2, 2048, 2048), dtype=np.float32) * 0.75
    tiles, coords = generate_tiles(raster, tile_size=512, stride=448)

    assert len(tiles) == 25  # 5x5 grid for 2048 with stride 448
    predictions = [np.ones((512, 512), dtype=np.float32) * 0.75 for _ in tiles]

    reconstructed = reconstruct_full_mask(
        tile_predictions=predictions,
        tile_coords=coords,
        full_height=2048,
        full_width=2048,
        tile_size=512,
    )

    assert reconstructed.shape == (2048, 2048)
    assert np.allclose(reconstructed, 0.75, atol=1e-4)


def test_threshold_sweep_coverage(runner):
    """Verify exact threshold sweep list matches requirement."""
    assert runner.SWEEP_THRESHOLDS == [0.30, 0.35, 0.40, 0.45, 0.50, 0.60]


def test_empty_mask_handling_and_zero_division():
    """Verify correct zero-division handling for empty ground truth and empty prediction."""
    gt_empty = np.zeros((100, 100), dtype=np.uint8)
    pred_empty = np.zeros((100, 100), dtype=np.float32)

    cm = calculate_confusion_metrics({"tp": 0, "fp": 0, "fn": 0, "tn": 10000})
    assert cm["iou"] == 1.0
    assert cm["dice"] == 1.0
    assert cm["precision"] == 0.0  # Part 0.1 zero_division default
    assert cm["recall"] == 0.0     # Part 0.1 zero_division default
    assert cm["fpr"] == 0.0

    # Non-empty prediction with empty GT (pure false positives)
    cm_fp = calculate_confusion_metrics({"tp": 0, "fp": 50, "fn": 0, "tn": 9950})
    assert cm_fp["iou"] == 0.0
    assert cm_fp["dice"] == 0.0
    assert cm_fp["precision"] == 0.0
    assert cm_fp["recall"] == 0.0  # Zero ground truth positives returns zero_division default (0.0)
    assert np.isclose(cm_fp["fpr"], 50 / 10000)


def test_category_fpr_isolation(runner):
    """Verify clean-ocean FPR and look-alike FPR are calculated separately without cross-contamination."""
    mock_split_result = {
        "model_id": "unet-dual-pol-sar-v4",
        "model_version": "V4",
        "checkpoint": {"path": "dummy.pth", "sha256": "dummy", "size_bytes": 100},
        "preprocessing": {"name": "dummy"},
        "environment": {"device": "cpu"},
        "dataset": {"split": "val"},
        "scenes": [
            {
                "scene_id": "scene_clean_1",
                "category": "clean_ocean",
                "metrics_by_threshold": {
                    "0.5": {"tp": 0, "fp": 10, "fn": 0, "tn": 990, "iou": 0.0, "dice": 0.0, "precision": 0.0, "recall": 1.0, "fpr": 0.01}
                }
            },
            {
                "scene_id": "scene_lookalike_1",
                "category": "lookalike",
                "metrics_by_threshold": {
                    "0.5": {"tp": 0, "fp": 50, "fn": 0, "tn": 950, "iou": 0.0, "dice": 0.0, "precision": 0.0, "recall": 1.0, "fpr": 0.05}
                }
            },
            {
                "scene_id": "scene_oil_1",
                "category": "oil",
                "metrics_by_threshold": {
                    "0.5": {"tp": 100, "fp": 20, "fn": 10, "tn": 870, "iou": 0.769, "dice": 0.869, "precision": 0.833, "recall": 0.909, "fpr": 0.022}
                }
            }
        ]
    }

    agg = runner.compute_aggregate(mock_split_result, thresholds=[0.5])
    th_agg = agg["threshold_aggregates"][0]

    # Clean Ocean FPR should be 10 / (10 + 990) = 0.01
    assert np.isclose(th_agg["category_breakdown"]["clean_ocean"]["fpr"], 0.01)

    # Look-Alike FPR should be 50 / (50 + 950) = 0.05
    assert np.isclose(th_agg["category_breakdown"]["look_alike"]["fpr"], 0.05)


def test_micro_and_macro_metric_calculations(runner):
    """Verify micro pixel confusion sum vs macro scene-level mean."""
    mock_split_result = {
        "model_id": "unet-dual-pol-sar-v4",
        "model_version": "V4",
        "checkpoint": {"path": "dummy.pth", "sha256": "dummy", "size_bytes": 100},
        "preprocessing": {"name": "dummy"},
        "environment": {"device": "cpu"},
        "dataset": {"split": "val"},
        "scenes": [
            {
                "scene_id": "s1",
                "category": "oil",
                "metrics_by_threshold": {
                    "0.5": {"tp": 10, "fp": 10, "fn": 10, "tn": 70, "iou": 10/30, "dice": 20/40, "precision": 0.5, "recall": 0.5, "fpr": 10/80}
                }
            },
            {
                "scene_id": "s2",
                "category": "oil",
                "metrics_by_threshold": {
                    "0.5": {"tp": 50, "fp": 10, "fn": 10, "tn": 30, "iou": 50/70, "dice": 100/120, "precision": 50/60, "recall": 50/60, "fpr": 10/40}
                }
            }
        ]
    }

    agg = runner.compute_aggregate(mock_split_result, thresholds=[0.5])
    th_agg = agg["threshold_aggregates"][0]

    # Micro Aggregate: TP=60, FP=20, FN=20, TN=100 -> IoU = 60 / (60+20+20) = 0.60
    assert np.isclose(th_agg["micro_pixel_aggregate"]["iou"], 0.60)
    assert th_agg["micro_pixel_aggregate"]["tp"] == 60

    # Macro Scene Average: (10/30 + 50/70) / 2 = (0.333333 + 0.714286) / 2 = 0.523810
    assert np.isclose(th_agg["macro_scene_average"]["mean_iou"], (10/30 + 50/70) / 2, atol=1e-5)


def test_reproducibility_artifacts_exist(repo_root):
    """Verify that all required baseline evaluation artifacts physically exist."""
    base_dir = os.path.join(repo_root, "ml", "experiments", "results", "baseline_evaluation")
    required_files = [
        "v2_validation.json",
        "v2_held_out_test.json",
        "v4_validation.json",
        "v4_held_out_test.json",
        "v2_aggregate.json",
        "v4_aggregate.json",
        "threshold_sweep.json",
        "runtime_summary.json",
        "summary.json",
    ]
    for rf in required_files:
        full_path = os.path.join(base_dir, rf)
        assert os.path.exists(full_path), f"Required artifact {rf} is missing from {base_dir}"
