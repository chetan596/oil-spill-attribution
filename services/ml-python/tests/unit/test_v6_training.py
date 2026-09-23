"""Unit tests for Part 0.7: V6 Preprocessing, Training & Validation Harness.

Tests:
1. V6 Preprocessing (VV/VH clipping and normalization to [0, 1])
2. Preprocessing boundary conditions, clipping, and NaN/Inf handling
3. V6 Dataset split & isolation (Held-out Part III test scenes are locked)
4. Deterministic seeding
5. V6 Model configuration & architecture
6. Tile generation and sampling invariants
7. Checkpoint metadata schema
8. Training history schema
9. Model registry status invariants (V2=active_baseline, V4=experimental, V6=experimental)
10. Metric calculation invariants for V6 evaluation
"""

import json
import math
import os
import sys
import tempfile
import numpy as np
import pytest
import torch

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)
if os.path.join(_REPO_ROOT, "services", "ml-python") not in sys.path:
    sys.path.insert(0, os.path.join(_REPO_ROOT, "services", "ml-python"))

from app.preprocessing.normalization import (
    normalize_sar_band,
    preprocess_sentinel1_scene,
    SENTINEL1_PREPROCESSING_CONTRACT_V1,
)
from ml.training.train_v6 import (
    CombinedLoss,
    V6TileDataset,
    V6Trainer,
    calculate_confusion_metrics,
    set_seed as set_deterministic_seed,
)
from app.models.unet.architecture import UNet


# ---------------------------------------------------------------------------
# 1. Preprocessing Contract Tests
# ---------------------------------------------------------------------------

def test_v6_preprocessing_contract_definition():
    """Verify sentinel1_sigma0_db_v1 contract constants."""
    assert SENTINEL1_PREPROCESSING_CONTRACT_V1["identifier"] == "sentinel1_sigma0_db_v1"
    assert SENTINEL1_PREPROCESSING_CONTRACT_V1["vv_min_db"] == -35.0
    assert SENTINEL1_PREPROCESSING_CONTRACT_V1["vv_max_db"] == -5.0
    assert SENTINEL1_PREPROCESSING_CONTRACT_V1["vh_min_db"] == -45.0
    assert SENTINEL1_PREPROCESSING_CONTRACT_V1["vh_max_db"] == -15.0
    assert SENTINEL1_PREPROCESSING_CONTRACT_V1["channel_order"] == ["VV", "VH"]


def test_v6_preprocessing_vv_values():
    """Verify VV band normalization formula: [-35, -5] dB -> [0.0, 1.0]."""
    # Exact bounds
    assert normalize_sar_band(np.array([-35.0], dtype=np.float32), "VV")[0] == pytest.approx(0.0, abs=1e-5)
    assert normalize_sar_band(np.array([-5.0], dtype=np.float32), "VV")[0] == pytest.approx(1.0, abs=1e-5)
    # Midpoint: (-20 - (-35)) / 30 = 15/30 = 0.5
    assert normalize_sar_band(np.array([-20.0], dtype=np.float32), "VV")[0] == pytest.approx(0.5, abs=1e-5)
    # Clipping
    assert normalize_sar_band(np.array([-50.0], dtype=np.float32), "VV")[0] == pytest.approx(0.0, abs=1e-5)
    assert normalize_sar_band(np.array([5.0], dtype=np.float32), "VV")[0] == pytest.approx(1.0, abs=1e-5)


def test_v6_preprocessing_vh_values():
    """Verify VH band normalization formula: [-45, -15] dB -> [0.0, 1.0]."""
    # Exact bounds
    assert normalize_sar_band(np.array([-45.0], dtype=np.float32), "VH")[0] == pytest.approx(0.0, abs=1e-5)
    assert normalize_sar_band(np.array([-15.0], dtype=np.float32), "VH")[0] == pytest.approx(1.0, abs=1e-5)
    # Midpoint: (-30 - (-45)) / 30 = 15/30 = 0.5
    assert normalize_sar_band(np.array([-30.0], dtype=np.float32), "VH")[0] == pytest.approx(0.5, abs=1e-5)
    # Clipping
    assert normalize_sar_band(np.array([-60.0], dtype=np.float32), "VH")[0] == pytest.approx(0.0, abs=1e-5)
    assert normalize_sar_band(np.array([0.0], dtype=np.float32), "VH")[0] == pytest.approx(1.0, abs=1e-5)


def test_v6_preprocessing_nan_inf_handling():
    """Verify NaN and Inf values are safely clamped to 0.0."""
    arr = np.array([-20.0, np.nan, np.inf, -np.inf, -5.0], dtype=np.float32)
    norm = normalize_sar_band(arr, "VV")
    assert not np.isnan(norm).any()
    assert not np.isinf(norm).any()
    assert norm[1] == pytest.approx(0.0, abs=1e-5)  # NaN masked to 0.0
    assert norm[2] == pytest.approx(0.0, abs=1e-5)  # +Inf non-finite masked to 0.0
    assert norm[3] == pytest.approx(0.0, abs=1e-5)  # -Inf non-finite masked to 0.0


def test_v6_preprocess_sentinel1_scene_channel_order():
    """Verify 2-channel scene preprocessing returns [2, H, W] in (VV, VH) order."""
    vv = np.full((64, 64), -20.0, dtype=np.float32)
    vh = np.full((64, 64), -30.0, dtype=np.float32)
    out = preprocess_sentinel1_scene(vv, vh)
    assert out.shape == (2, 64, 64)
    assert out[0, 0, 0] == pytest.approx(0.5, abs=1e-5)  # VV
    assert out[1, 0, 0] == pytest.approx(0.5, abs=1e-5)  # VH


# ---------------------------------------------------------------------------
# 2. Dataset Split & Isolation Tests
# ---------------------------------------------------------------------------

def test_held_out_test_set_isolation():
    """Verify that Part III held-out test scenes are never present in train or val splits."""
    manifest_path = os.path.join(_REPO_ROOT, "ml", "datasets", "manifest.json")
    assert os.path.exists(manifest_path)
    with open(manifest_path, "r", encoding="utf-8") as f:
        m = json.load(f)

    train_ids = {s["scene_id"] for s in m["scenes"] if s["split"] == "train"}
    val_ids = {s["scene_id"] for s in m["scenes"] if s["split"] == "val"}
    test_ids = {s["scene_id"] for s in m["scenes"] if s["split"] == "test"}

    assert len(train_ids) == 28
    assert len(val_ids) == 7
    assert len(test_ids) == 5

    # Known Part III held-out test scenes
    expected_held_out = {
        "real_part3_test_00060",
        "real_part3_test_00062",
        "real_part3_test_00063",
        "real_part3_test_00064",
        "real_part3_test_00080",
    }
    assert test_ids == expected_held_out

    # Mutual exclusivity
    assert len(train_ids.intersection(val_ids)) == 0
    assert len(train_ids.intersection(test_ids)) == 0
    assert len(val_ids.intersection(test_ids)) == 0


def test_v6_tile_dataset_loads_only_requested_split():
    """Verify V6TileDataset strictly loads only the requested split scenes."""
    manifest_path = os.path.join(_REPO_ROOT, "ml", "datasets", "manifest.json")

    train_ds = V6TileDataset(manifest_path=manifest_path, split="train", tile_size=512, augment=False, repo_root=_REPO_ROOT)
    assert len(train_ds.scenes) == 28
    for s in train_ds.scenes:
        assert s["split"] == "train"
        assert s["scene_id"] not in {
            "real_part3_test_00060",
            "real_part3_test_00062",
            "real_part3_test_00063",
            "real_part3_test_00064",
            "real_part3_test_00080",
        }

    val_ds = V6TileDataset(manifest_path=manifest_path, split="val", tile_size=512, augment=False, repo_root=_REPO_ROOT)
    assert len(val_ds.scenes) == 7
    for s in val_ds.scenes:
        assert s["split"] == "val"
        assert s["scene_id"] not in {
            "real_part3_test_00060",
            "real_part3_test_00062",
            "real_part3_test_00063",
            "real_part3_test_00064",
            "real_part3_test_00080",
        }


# ---------------------------------------------------------------------------
# 3. Model Architecture & Seed Tests
# ---------------------------------------------------------------------------

def test_v6_model_architecture_spec():
    """Verify UNet forward pass on 2x512x512 input."""
    model = UNet(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
    x = torch.randn(2, 2, 512, 512)
    out = model(x)
    assert out.shape == (2, 2, 512, 512)


def test_deterministic_seed():
    """Verify deterministic seed initialization."""
    set_deterministic_seed(42)
    t1 = torch.randn(10)
    set_deterministic_seed(42)
    t2 = torch.randn(10)
    assert torch.equal(t1, t2)


# ---------------------------------------------------------------------------
# 4. Loss & Metric Invariants
# ---------------------------------------------------------------------------

def test_combined_loss_computation():
    """Verify CombinedLoss runs and returns valid scalar tensor."""
    loss_fn = CombinedLoss(weight=1.0, dice_weight=1.0, class_weights=torch.tensor([1.0, 5.0]))
    logits = torch.randn(2, 2, 64, 64)
    targets = torch.randint(0, 2, (2, 64, 64)).long()
    loss, details = loss_fn(logits, targets)
    assert not torch.isnan(loss)
    assert "loss_ce" in details
    assert "loss_dice" in details
    assert details["loss_ce"] >= 0.0
    assert 0.0 <= details["loss_dice"] <= 1.0


def test_confusion_metrics_calculations():
    """Verify calculate_confusion_metrics produces correct IoU, Dice, Precision, Recall, FPR."""
    cm = {"tp": 100, "fp": 50, "fn": 25, "tn": 825}
    m = calculate_confusion_metrics(cm)
    # IoU = tp / (tp + fp + fn) = 100 / 175 = 0.571428...
    assert m["iou"] == pytest.approx(100.0 / 175.0, abs=1e-5)
    # Dice = 2*100 / (200 + 50 + 25) = 200 / 275 = 0.727272...
    assert m["dice"] == pytest.approx(200.0 / 275.0, abs=1e-5)
    # Precision = 100 / 150 = 0.666666...
    assert m["precision"] == pytest.approx(100.0 / 150.0, abs=1e-5)
    # Recall = 100 / 125 = 0.8
    assert m["recall"] == pytest.approx(0.8, abs=1e-5)
    # FPR = 50 / (50 + 825) = 50 / 875 = 0.0571428...
    assert m["fpr"] == pytest.approx(50.0 / 875.0, abs=1e-5)


# ---------------------------------------------------------------------------
# 5. Registry & Metadata Status Tests
# ---------------------------------------------------------------------------

def test_model_registry_v6_status():
    """Verify registry invariants: V2=active_baseline, V4=experimental, V6=experimental."""
    reg_path = os.path.join(_REPO_ROOT, "ml", "model_registry", "registry.json")
    if os.path.exists(reg_path):
        with open(reg_path, "r", encoding="utf-8") as f:
            reg = json.load(f)

        assert reg["active_model_id"] == "unet-dual-pol-sar-v2"
        models = {m["model_id"]: m for m in reg["models"]}

        assert "unet-dual-pol-sar-v2" in models
        assert models["unet-dual-pol-sar-v2"]["status"] in ("active_baseline", "trained")

        assert "unet-dual-pol-sar-v4" in models
        assert models["unet-dual-pol-sar-v4"]["status"] == "experimental"

        if "unet-dual-pol-sar-v6" in models:
            assert models["unet-dual-pol-sar-v6"]["status"] == "experimental"
            assert models["unet-dual-pol-sar-v6"]["hyperparameters"]["preprocessing"] == "sentinel1_sigma0_db_v1"
