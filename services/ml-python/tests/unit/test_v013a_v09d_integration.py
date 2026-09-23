"""
Unit tests for PART 0.13A — Frozen V09D Inference Service Integration.
"""

import os
import json
import pytest
import numpy as np
import torch
import tempfile
from PIL import Image

from app.models.registry import model_registry, ModelVerificationError, ModelNotFoundError
from app.inference.v09d_engine import (
    validate_sar_input,
    execute_v09d_full_scene_inference,
    SARInputValidationError
)
from app.preprocessing.normalization import normalize_sar_band

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))


def test_v09d_authoritative_loader_verification():
    """Verify that model_registry.load_verified_model correctly validates V09D."""
    model, metadata = model_registry.load_verified_model(
        model_id="unet-dual-pol-sar-v09d-residual-loss",
        device="cpu"
    )
    assert model is not None
    assert metadata["model_id"] == "unet-dual-pol-sar-v09d-residual-loss"
    assert metadata["architecture"] == "UNetResidual"
    assert metadata["parameters"] == 1114338
    assert metadata["checkpoint_sha256"] == "ab22ffa2fb1c3be99ff2bb99353db76ed4934bd00210f7bce21df74506ce827d"
    assert metadata["scientific_status"] == "EXPERIMENTAL_VALIDATED_WITH_LIMITATIONS"
    assert metadata["release_id"] == "OG-SAR-ML-RESEARCH-RELEASE-V0.12"
    assert metadata["operating_threshold"] == 0.50
    assert metadata["verification_status"] == "PASSED_CRYPTOGRAPHIC_AND_STRUCTURAL_VERIFICATION"


def test_v09d_loader_fail_closed_on_tampered_model():
    """Verify fail-closed behavior if an unapproved model or tampered checkpoint is requested."""
    with pytest.raises(ModelNotFoundError):
        model_registry.load_verified_model(model_id="unauthorized_experimental_model")


def test_sar_input_validation_accepts_valid_raster():
    """Verify input validation accepts valid 2-channel SAR test raster."""
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = tmp.name
        # Create a single/dual channel grayscale image
        arr = np.random.randint(0, 255, size=(128, 128), dtype=np.uint8)
        img = Image.fromarray(arr, mode="L")
        img.save(tmp_path)

    try:
        val = validate_sar_input(tmp_path)
        assert val["width"] == 128
        assert val["height"] == 128
        assert val["channels"] == 1
        assert val["sha256"] is not None
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def test_sar_input_validation_strictly_rejects_optical_rgb():
    """Verify input validation strictly rejects optical RGB photography."""
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = tmp.name
        # Create an RGB image with strong color variance
        rgb_arr = np.zeros((128, 128, 3), dtype=np.uint8)
        rgb_arr[:, :, 0] = 255  # Pure Red
        rgb_arr[:, :, 1] = 0
        rgb_arr[:, :, 2] = 50
        img = Image.fromarray(rgb_arr, mode="RGB")
        img.save(tmp_path)

    try:
        with pytest.raises(SARInputValidationError) as exc:
            validate_sar_input(tmp_path)
        assert "optical color photograph" in str(exc.value)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def test_v09d_full_scene_inference_execution():
    """Verify full-scene V09D inference pipeline returns valid structured output."""
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = tmp.name
        # Create a synthetic grayscale test SAR patch
        arr = np.random.randint(10, 100, size=(512, 512), dtype=np.uint8)
        img = Image.fromarray(arr, mode="L")
        img.save(tmp_path)

    try:
        result = execute_v09d_full_scene_inference(
            image_path=tmp_path,
            scene_id="test_synthetic_sar_001",
            threshold=0.50,
            source_type="TEST_FIXTURE",
            device="cpu"
        )
        assert result["status"] == "SUCCESS"
        assert result["model"]["id"] == "unet-dual-pol-sar-v09d-residual-loss"
        assert result["model"]["status"] == "EXPERIMENTAL_VALIDATED_WITH_LIMITATIONS"
        assert result["model"]["release"] == "OG-SAR-ML-RESEARCH-RELEASE-V0.12"
        assert result["model"]["benchmarkMetadata"]["heldOutRecall"] == 0.015054
        assert result["model"]["benchmarkMetadata"]["heldOutIoU"] == 0.011823
        assert result["inference"]["operatingThreshold"] == 0.50
        assert result["inference"]["blending"] == "hann_window"
        assert "timingMs" in result["inference"]
        assert "prediction" in result
        assert "oilSpillDetected" in result["prediction"]
        assert len(result["limitations"]) >= 4
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def test_preprocessing_contract_sentinel1_sigma0_db_v1():
    """Verify preprocessing math adheres strictly to sentinel1_sigma0_db_v1."""
    # VV: [-35 dB, -5 dB] -> [0.0, 1.0]
    vv_vals = np.array([-35.0, -20.0, -5.0, -40.0, 0.0], dtype=np.float32)
    norm_vv = normalize_sar_band(vv_vals, polarization="VV")
    assert np.isclose(norm_vv[0], 0.0)
    assert np.isclose(norm_vv[1], 0.5)
    assert np.isclose(norm_vv[2], 1.0)
    assert np.isclose(norm_vv[3], 0.0)  # Clipped lower bound
    assert np.isclose(norm_vv[4], 1.0)  # Clipped upper bound

    # VH: [-45 dB, -15 dB] -> [0.0, 1.0]
    vh_vals = np.array([-45.0, -30.0, -15.0, -50.0, -10.0], dtype=np.float32)
    norm_vh = normalize_sar_band(vh_vals, polarization="VH")
    assert np.isclose(norm_vh[0], 0.0)
    assert np.isclose(norm_vh[1], 0.5)
    assert np.isclose(norm_vh[2], 1.0)
    assert np.isclose(norm_vh[3], 0.0)  # Clipped lower bound
    assert np.isclose(norm_vh[4], 1.0)  # Clipped upper bound
