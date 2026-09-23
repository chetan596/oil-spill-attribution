"""
Unit & Regression Tests for Model V4 (Corrected SAR Normalization Pipeline,
V4 Model Loading, Determinism, Preprocessing, and Baseline Invariants).
"""

import os
import json
import pytest
import torch
import numpy as np

from app.models.registry import model_registry
from app.models.unet.architecture import UNet
from app.preprocessing.normalization import normalize_sar_band, DB_NORMALIZATION_RANGES


def test_v4_model_loading():
    """Verify unet-dual-pol-sar-v4 loads successfully from model registry."""
    model, entry = model_registry.load_model("unet-dual-pol-sar-v4", device="cpu", allow_untrained=False)
    assert model is not None
    assert isinstance(model, UNet)
    assert entry["model_id"] == "unet-dual-pol-sar-v4"
    assert entry["in_channels"] == 2
    assert entry["num_classes"] == 2
    assert entry["status"] == "experimental"
    assert "decibel" in entry["normalization"]["type"].lower() or "db" in entry["normalization"]["type"].lower()


def test_v2_and_v3_checkpoints_preserved():
    """Verify V2 and V3 models remain preserved and loadable without change."""
    model_v2, entry_v2 = model_registry.load_model("unet-dual-pol-sar-v2", device="cpu", allow_untrained=False)
    assert model_v2 is not None
    assert entry_v2["model_id"] == "unet-dual-pol-sar-v2"

    model_v3, entry_v3 = model_registry.load_model("unet-dual-pol-sar-v3", device="cpu", allow_untrained=False)
    assert model_v3 is not None
    assert entry_v3["model_id"] == "unet-dual-pol-sar-v3"


def test_v4_deterministic_inference():
    """Verify unet-dual-pol-sar-v4 produces deterministic predictions on fixed input."""
    model, _ = model_registry.load_model("unet-dual-pol-sar-v4", device="cpu", allow_untrained=False)
    model.eval()

    torch.manual_seed(42)
    sample_tensor = torch.randn(1, 2, 512, 512)

    with torch.no_grad():
        prob1 = model.predict_probabilities(sample_tensor)
        prob2 = model.predict_probabilities(sample_tensor)

    np.testing.assert_allclose(prob1.numpy(), prob2.numpy(), rtol=1e-5, atol=1e-5)
    assert prob1.shape == (1, 2, 512, 512)
    prob_sum = prob1.sum(dim=1).numpy()
    np.testing.assert_allclose(prob_sum, np.ones((1, 512, 512)), rtol=1e-4, atol=1e-4)


def test_negative_db_normalization_validity():
    """Verify that negative Sentinel-1 dB values are NOT rejected or wiped to zero."""
    # Typical ocean backscatter: VV ~ -20 dB, VH ~ -30 dB
    vv_raw = np.array([[-20.0, -15.0], [-25.0, -5.0]], dtype=np.float32)
    vh_raw = np.array([[-30.0, -25.0], [-35.0, -15.0]], dtype=np.float32)

    vv_norm = normalize_sar_band(vv_raw, polarization="VV")
    vh_norm = normalize_sar_band(vh_raw, polarization="VH")

    # Formula: (dB - min) / (max - min)
    # VV range [-35, -5]: -20 dB -> (-20 - -35) / 30 = 15/30 = 0.50
    # VH range [-45, -15]: -30 dB -> (-30 - -45) / 30 = 15/30 = 0.50
    assert abs(vv_norm[0, 0] - 0.50) < 1e-4
    assert abs(vh_norm[0, 0] - 0.50) < 1e-4
    assert not np.all(vv_norm == 0.0), "Negative dB values must NOT result in all-zero tensors!"
    assert not np.all(vh_norm == 0.0)


def test_normalization_non_flat_tensor_assertion():
    """Critical Assertion: Normalized tensors for valid SAR scenes must NOT be >99% zeros."""
    # Create realistic negative dB array (mean -18 dB, std 4 dB)
    np.random.seed(42)
    realistic_vv = np.random.normal(-18.0, 4.0, size=(512, 512)).astype(np.float32)
    norm = normalize_sar_band(realistic_vv, polarization="VV")

    zero_pct = float(np.mean(norm == 0.0)) * 100.0
    assert zero_pct < 5.0, f"Valid SAR scene had excessive zero percentage: {zero_pct:.2f}% (must be < 99%)"
    assert norm.min() >= 0.0 and norm.max() <= 1.0
    assert norm.mean() > 0.20 and norm.mean() < 0.80, f"Normalized mean {norm.mean()} indicates flat tensor"


def test_nodata_and_nan_handling():
    """Verify NaNs and explicit nodata values are properly masked to 0.0 without corrupting valid pixels."""
    arr = np.array([[-20.0, np.nan], [-9999.0, -10.0]], dtype=np.float32)
    norm = normalize_sar_band(arr, polarization="VV", nodata=-9999.0)

    assert norm[0, 1] == 0.0, "NaN should be masked to 0.0"
    assert norm[1, 0] == 0.0, "nodata should be masked to 0.0"
    assert norm[0, 0] > 0.0, "Valid negative dB pixel must be non-zero"
    assert norm[1, 1] > 0.0, "Valid negative dB pixel must be non-zero"


def test_vv_vh_channel_order_and_bounds():
    """Verify distinct normalization bounds for VV and VH."""
    assert DB_NORMALIZATION_RANGES["VV"] == (-35.0, -5.0)
    assert DB_NORMALIZATION_RANGES["VH"] == (-45.0, -15.0)

    # -25 dB in VV: (-25 - -35)/30 = 10/30 = 0.3333
    # -25 dB in VH: (-25 - -45)/30 = 20/30 = 0.6667
    sample = np.array([[-25.0]], dtype=np.float32)
    vv_val = normalize_sar_band(sample, polarization="VV")[0, 0]
    vh_val = normalize_sar_band(sample, polarization="VH")[0, 0]

    assert abs(vv_val - 1.0/3.0) < 1e-4
    assert abs(vh_val - 2.0/3.0) < 1e-4
    assert vv_val != vh_val, "VV and VH must have different normalization scaling"


def test_scene_level_splits_integrity():
    """Verify 28 train, 7 val, 5 test scene-level split with Scene 00000 strictly in TRAIN."""
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
    manifest_path = os.path.join(repo_root, "data/raw/satellite/dataset_manifest.json")
    if not os.path.exists(manifest_path):
        pytest.skip("Dataset manifest not found.")

    with open(manifest_path, "r") as f:
        manifest = json.load(f)

    scenes = manifest["scenes"]
    train_scenes = [s["scene_id"] for s in scenes if s.get("split") == "train"]
    val_scenes = [s["scene_id"] for s in scenes if s.get("split") == "val"]
    test_scenes = [s["scene_id"] for s in scenes if s.get("split") == "test"]

    assert len(train_scenes) == 28, f"Expected 28 train scenes, got {len(train_scenes)}"
    assert len(val_scenes) == 7, f"Expected 7 val scenes, got {len(val_scenes)}"
    assert len(test_scenes) == 5, f"Expected 5 test scenes, got {len(test_scenes)}"

    # Crucial benchmark invariant: scene 00000 is in train split
    assert "real_part1_oil_00000" in train_scenes or any("00000" in s for s in train_scenes), "Scene 00000 must be in train split"
    assert not any("00000" in s for s in val_scenes), "Scene 00000 must NOT be in val split"
    assert not any("00000" in s for s in test_scenes), "Scene 00000 must NOT be in test split"


def test_v4_artifacts_exist():
    """Verify all required documentation and artifact JSONs exist and have expected structure."""
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
    artifacts = [
        "docs/artifacts/v4-metrics.json",
        "docs/artifacts/v4-threshold-sweep.json",
        "docs/artifacts/v4-preprocessing-validation.json",
        "docs/artifacts/v4-probability-distributions.json",
        "docs/artifacts/v4-model-card.json",
        "docs/artifacts/v4-forensic-comparison.png",
        "docs/artifacts/final-benchmark-metrics.json",
        "docs/artifacts/v4-lookalike-analysis.json",
        "docs/artifacts/v4-validation-threshold-audit.json",
        "docs/artifacts/final-model-card.json",
        "docs/artifacts/v4-validation-forensic.png",
        "docs/model/v4-training-report.md",
        "docs/model/v4-vs-v2-v3-comparison.md",
        "docs/model/benchmark-split-freeze.md",
        "docs/model/v2-v3-v4-final-comparison.md",
    ]

    for art in artifacts:
        full_path = os.path.join(repo_root, art)
        assert os.path.exists(full_path), f"Required artifact {full_path} is missing!"

    with open(os.path.join(repo_root, "docs/artifacts/v4-metrics.json"), "r") as f:
        metrics = json.load(f)
    assert "models" in metrics
    assert "v4_corrected_baseline_stride512" in metrics["models"]
    assert metrics["selected_validation_threshold"] == 0.50

    with open(os.path.join(repo_root, "docs/artifacts/v4-threshold-sweep.json"), "r") as f:
        sweep = json.load(f)
    assert "threshold_sweep" in sweep
    assert len(sweep["threshold_sweep"]) >= 40

    with open(os.path.join(repo_root, "docs/artifacts/final-benchmark-metrics.json"), "r") as f:
        final_metrics = json.load(f)
    assert "v2_baseline" in final_metrics["models"]
    assert "v3_experimental" in final_metrics["models"]
    assert "v4_corrected_stride512_mode_a" in final_metrics["models"]
    assert "v4_corrected_stride256_mode_b" in final_metrics["models"]
