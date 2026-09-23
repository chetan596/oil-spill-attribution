"""
Phase 12 — Unit Tests for Optical Model Registry and Domain-Specific Router.
Covers the 10 mandatory router unit test scenarios:
  1. Valid Sentinel-2 six-band input -> mados-resnet34-rgbnir-swir-v1
  2. Sentinel-2 RGB-only -> mados-resnet34-rgb-v1
  3. Drone RGB -> kerf-resnet34-focaldice-v1
  4. Aerial RGB -> kerf-resnet34-focaldice-v1
  5. Unknown source -> rejected with AmbiguousModalityError
  6. Missing B11 -> RGB satellite fallback
  7. Missing B8 but B11/B12 available -> fallback / documented behavior
  8. Misaligned SWIR -> alignment preprocessing executed
  9. Wrong checkpoint SHA -> FAIL-CLOSED (ModelVerificationError)
  10. Preprocessing validation & channel integrity
"""

import os
import tempfile
import pytest
import numpy as np
import torch
from PIL import Image

from app.models.optical_model_registry import (
    OpticalInputDescriptor,
    SourceType,
    OpticalModelSpec,
    optical_registry,
    MODEL_A_SENTINEL2_MS,
    MODEL_B_DRONE_RGB,
    MODEL_C_SATELLITE_RGB,
    ModelVerificationError,
    AmbiguousModalityError,
    UnsupportedInputError,
)
from app.inference.optical_router import OpticalRouter, OperationalOpticalEngine


@pytest.fixture
def router():
    return OpticalRouter()


@pytest.fixture
def operational_engine():
    return OperationalOpticalEngine()


@pytest.fixture
def mock_temp_dir():
    with tempfile.TemporaryDirectory() as tmp:
        yield tmp


# -----------------------------------------------------------------------------
# TEST 1: Valid Sentinel-2 Six-Band Input -> Multi-Spectral Model
# -----------------------------------------------------------------------------
def test_router_sentinel2_six_band(router):
    desc = OpticalInputDescriptor(
        source_type=SourceType.SENTINEL_2,
        sensor="MSI",
        platform="Sentinel-2A",
        bands=["B4", "B3", "B2", "B8", "B11", "B12"],
        channel_count=6,
        spatial_resolution_m=10.0,
        width=240,
        height=240,
        metadata_trusted=True,
    )
    decision = router.route(desc)
    assert decision.model_spec.model_id == MODEL_A_SENTINEL2_MS.model_id
    assert decision.model_spec.in_channels == 6
    assert decision.bands_used == ["B4", "B3", "B2", "B8", "B11", "B12"]
    assert "multispectral" in decision.routing_reason.lower()


# -----------------------------------------------------------------------------
# TEST 2: Sentinel-2 RGB-Only -> REJECTED (Phase 15.3: strict format contract)
# Phase 15.3: Sentinel-2 source_type with only 3 RGB bands must raise
# AmbiguousModalityError. Silent fallback to RGB satellite is not permitted.
# -----------------------------------------------------------------------------
def test_router_sentinel2_rgb_only(router):
    desc = OpticalInputDescriptor(
        source_type=SourceType.SENTINEL_2,
        sensor="MSI",
        platform="Sentinel-2B",
        bands=["B4", "B3", "B2"],
        channel_count=3,
        spatial_resolution_m=10.0,
        width=240,
        height=240,
        metadata_trusted=True,
    )
    # Phase 15.3: Sentinel-2 selected but only 3-band RGB provided -> strict rejection.
    # Do NOT silently route to an RGB model when the user selected a multispectral type.
    with pytest.raises(AmbiguousModalityError) as exc_info:
        router.route(desc)
    assert "multispectral" in str(exc_info.value).lower() or "rgb only" in str(exc_info.value).lower()


# -----------------------------------------------------------------------------
# TEST 3: Drone RGB -> Drone Model
# -----------------------------------------------------------------------------
def test_router_drone_rgb(router):
    desc = OpticalInputDescriptor(
        source_type=SourceType.DRONE,
        sensor="DJI Zenmuse H20T",
        platform="Matrice 300 RTK",
        bands=["R", "G", "B"],
        channel_count=3,
        spatial_resolution_m=0.03,
        width=1920,
        height=1080,
        metadata_trusted=True,
    )
    decision = router.route(desc)
    assert decision.model_spec.model_id == MODEL_B_DRONE_RGB.model_id
    assert decision.model_spec.in_channels == 3
    assert decision.bands_used == ["R", "G", "B"]
    assert "drone" in decision.routing_reason.lower()


# -----------------------------------------------------------------------------
# TEST 4: Aerial RGB -> Drone/Aerial Model
# -----------------------------------------------------------------------------
def test_router_aerial_rgb(router):
    desc = OpticalInputDescriptor(
        source_type=SourceType.AERIAL_RGB,
        sensor="Phase One iXM-RS150F",
        platform="King Air Survey Aircraft",
        bands=["R", "G", "B"],
        channel_count=3,
        spatial_resolution_m=0.15,
        width=2048,
        height=2048,
        metadata_trusted=True,
    )
    decision = router.route(desc)
    assert decision.model_spec.model_id == MODEL_B_DRONE_RGB.model_id
    assert decision.model_spec.in_channels == 3
    assert "aerial" in decision.routing_reason.lower()


# -----------------------------------------------------------------------------
# TEST 5: Unknown Source -> Rejected with AmbiguousModalityError
# -----------------------------------------------------------------------------
def test_router_unknown_source_rejected(router):
    desc = OpticalInputDescriptor(
        source_type=SourceType.UNKNOWN,
        sensor=None,
        platform=None,
        bands=[],
        channel_count=3,
        spatial_resolution_m=None,
        width=512,
        height=512,
        metadata_trusted=False,
    )
    with pytest.raises(AmbiguousModalityError) as exc_info:
        router.route(desc)
    assert "Cannot deterministically determine optical domain" in str(exc_info.value)


# -----------------------------------------------------------------------------
# TEST 6: Missing B11 -> REJECTED (Phase 15.3: strict format contract)
# Phase 15.3: S2 source_type with 5 bands (missing B11) must not silently route
# to an RGB model. AmbiguousModalityError is the correct strict response.
# -----------------------------------------------------------------------------
def test_router_missing_b11_fallback(router):
    # Sentinel-2 with B4, B3, B2, B8, B12 (missing B11)
    desc = OpticalInputDescriptor(
        source_type=SourceType.SENTINEL_2,
        sensor="MSI",
        platform="Sentinel-2A",
        bands=["B4", "B3", "B2", "B8", "B12"],
        channel_count=5,
        spatial_resolution_m=10.0,
        width=240,
        height=240,
        metadata_trusted=True,
    )
    # Phase 15.3: Does not silently construct 5->6 bands or fall back to RGB.
    # Incomplete Sentinel-2 input must be rejected with an explicit error.
    with pytest.raises(AmbiguousModalityError) as exc_info:
        router.route(desc)
    assert "multispectral" in str(exc_info.value).lower() or "rgb only" in str(exc_info.value).lower()


# -----------------------------------------------------------------------------
# TEST 7: Missing B8 -> REJECTED (Phase 15.3: strict format contract)
# Phase 15.3: S2 source_type with 5 bands (missing B8) must not route to RGB.
# -----------------------------------------------------------------------------
def test_router_missing_b8_fallback(router):
    desc = OpticalInputDescriptor(
        source_type=SourceType.SENTINEL_2,
        sensor="MSI",
        platform="Sentinel-2A",
        bands=["B4", "B3", "B2", "B11", "B12"],
        channel_count=5,
        spatial_resolution_m=10.0,
        width=240,
        height=240,
        metadata_trusted=True,
    )
    # Phase 15.3: Incomplete Sentinel-2 input (missing B8) must be rejected.
    with pytest.raises(AmbiguousModalityError) as exc_info:
        router.route(desc)
    assert "multispectral" in str(exc_info.value).lower() or "rgb only" in str(exc_info.value).lower()


# -----------------------------------------------------------------------------
# TEST 8: Misaligned SWIR -> Bilinear Resampling Preprocessing Contract
# -----------------------------------------------------------------------------
def test_misaligned_swir_resampling(operational_engine, mock_temp_dir):
    # Create 10m bands (240x240) and 20m bands (120x120)
    band_paths = {}
    for b_name in ["B4", "B3", "B2", "B8"]:
        p = os.path.join(mock_temp_dir, f"{b_name}.png")
        Image.fromarray(np.full((240, 240), 50, dtype=np.uint8)).save(p)
        band_paths[b_name] = p

    for b_name in ["B11", "B12"]:
        p = os.path.join(mock_temp_dir, f"{b_name}.png")
        Image.fromarray(np.full((120, 120), 30, dtype=np.uint8)).save(p)
        band_paths[b_name] = p

    desc = OpticalInputDescriptor(
        source_type=SourceType.SENTINEL_2,
        sensor="MSI",
        bands=["B4", "B3", "B2", "B8", "B11", "B12"],
        channel_count=6,
        band_paths=band_paths,
        width=240,
        height=240,
        metadata_trusted=True,
    )
    decision = operational_engine.router.route(desc)
    tensor, preview, dims, letterbox = operational_engine.preprocess_input(desc, decision)

    # Tensor must be correctly resampled to (1, 6, 512, 512)
    assert tensor.shape == (1, 6, 512, 512)
    assert dims == (240, 240)
    assert preview.size == (240, 240)


# -----------------------------------------------------------------------------
# TEST 9: Wrong Checkpoint SHA -> FAIL-CLOSED (ModelVerificationError)
# -----------------------------------------------------------------------------
def test_wrong_checkpoint_sha_fails_closed(mock_temp_dir):
    # Create a corrupted dummy checkpoint
    fake_ckpt = os.path.join(mock_temp_dir, "fake_model.pt")
    with open(fake_ckpt, "wb") as f:
        f.write(b"CORRUPTED_WEIGHTS_DATA_TAMPERED")

    tampered_spec = OpticalModelSpec(
        model_id="test-tampered-model",
        name="Tampered Test Model",
        version="0.0.1",
        domain="TEST",
        in_channels=3,
        input_bands=["R", "G", "B"],
        checkpoint_rel_path=fake_ckpt,
        expected_sha256="0000000000000000000000000000000000000000000000000000000000000000",
        target_size=(512, 512),
        preprocessing_version="test-v1",
        norm_means=[0.5, 0.5, 0.5],
        norm_stds=[0.2, 0.2, 0.2],
        default_threshold=0.50,
        reported_benchmark={},
    )

    with pytest.raises(ModelVerificationError) as exc_info:
        tampered_spec.verify_integrity()
    assert "[FAIL-CLOSED]" in str(exc_info.value)
    assert "Cryptographic SHA-256 verification failed" in str(exc_info.value)


# -----------------------------------------------------------------------------
# TEST 10: Preprocessing Channel Order & Normalization Integrity
# -----------------------------------------------------------------------------
def test_preprocessing_channel_order_integrity(operational_engine, mock_temp_dir):
    # Create test bands with distinct pixel values: B4=10, B3=20, B2=30, B8=40, B11=50, B12=60
    band_paths = {}
    vals = {"B4": 10, "B3": 20, "B2": 30, "B8": 40, "B11": 50, "B12": 60}
    for b_name, val in vals.items():
        p = os.path.join(mock_temp_dir, f"{b_name}.png")
        Image.fromarray(np.full((240, 240), val, dtype=np.uint8)).save(p)
        band_paths[b_name] = p

    desc = OpticalInputDescriptor(
        source_type=SourceType.SENTINEL_2,
        sensor="MSI",
        bands=["B4", "B3", "B2", "B8", "B11", "B12"],
        channel_count=6,
        band_paths=band_paths,
        width=240,
        height=240,
        metadata_trusted=True,
    )
    decision = operational_engine.router.route(desc)
    tensor, _, _, _ = operational_engine.preprocess_input(desc, decision)

    # Verify tensor shape
    assert tensor.shape == (1, 6, 512, 512)

    # Verify that channels have distinct normalized values reflecting exact band order [B4, B3, B2, B8, B11, B12]
    means = MODEL_A_SENTINEL2_MS.norm_means
    stds = MODEL_A_SENTINEL2_MS.norm_stds
    for c in range(6):
        c_val = tensor[0, c, 100, 100].item()
        expected = (vals[list(vals.keys())[c]] - means[c]) / (stds[c] + 1e-7)
        assert abs(c_val - expected) < 1e-3, f"Channel {c} mismatch in exact band order!"
