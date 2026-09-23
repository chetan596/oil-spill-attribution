"""
Phase 12 — End-to-End Integration Tests for Operational Optical Inference Router.
Tests complete execution:
  1. Sentinel-2 6-band real sample -> mados-resnet34-rgbnir-swir-v1
  2. Sentinel-2 RGB real sample -> mados-resnet34-rgb-v1
  3. Drone RGB real sample -> kerf-resnet34-focaldice-v1
  4. FastAPI endpoint /api/v1/detection/optical/infer
  5. FastAPI endpoint /api/v1/detection/manual-analysis/infer with domain routing
"""

import os
import json
import tempfile
import pytest
import numpy as np
from PIL import Image
from fastapi.testclient import TestClient

from app.main import app
from app.models.optical_model_registry import (
    OpticalInputDescriptor,
    SourceType,
    MODEL_A_SENTINEL2_MS,
    MODEL_B_DRONE_RGB,
    MODEL_C_SATELLITE_RGB,
)
from app.inference.optical_router import operational_optical_engine

_repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def sample_e2e_data():
    temp_dir = tempfile.mkdtemp()

    # 1. Create 6 Sentinel-2 band images
    s2_bands = {}
    for b_idx, b_name in enumerate(["B4", "B3", "B2", "B8", "B11", "B12"]):
        p = os.path.join(temp_dir, f"s2_{b_name}.png")
        # Continuous reflectance in range [0..255]
        arr = np.random.randint(10, 80, (240, 240), dtype=np.uint8)
        # Add artificial slick signature
        arr[80:140, 80:140] = 5 + b_idx * 2
        Image.fromarray(arr).save(p)
        s2_bands[b_name] = p

    # 2. Create RGB satellite image
    sat_rgb_path = os.path.join(temp_dir, "sat_rgb.png")
    sat_arr = np.random.randint(20, 100, (240, 240, 3), dtype=np.uint8)
    sat_arr[90:130, 90:130] = [15, 20, 25]
    Image.fromarray(sat_arr).save(sat_rgb_path)

    # 3. Create Drone high-res RGB image
    drone_rgb_path = os.path.join(temp_dir, "drone_rgb.jpg")
    drone_arr = np.random.randint(60, 220, (512, 512, 3), dtype=np.uint8)
    drone_arr[150:300, 150:300] = [30, 35, 40]
    Image.fromarray(drone_arr).save(drone_rgb_path, format="JPEG")

    yield {
        "temp_dir": temp_dir,
        "s2_bands": s2_bands,
        "sat_rgb_path": sat_rgb_path,
        "drone_rgb_path": drone_rgb_path,
    }


def test_e2e_sentinel2_multispectral_inference(sample_e2e_data):
    """Test full operational pipeline on Sentinel-2 6-band input."""
    out_dir = os.path.join(sample_e2e_data["temp_dir"], "output_s2_ms")
    res = operational_optical_engine.run_inference(
        band_paths=sample_e2e_data["s2_bands"],
        user_selected_type="SENTINEL_2",
        output_dir=out_dir,
        prefix="s2_test",
    )

    assert res["status"] == "COMPLETED"
    assert res["model"]["modelId"] == MODEL_A_SENTINEL2_MS.model_id
    assert res["model"]["inputType"] == "SENTINEL_2"
    assert res["model"]["bandsUsed"] == ["B4", "B3", "B2", "B8", "B11", "B12"]
    assert res["model"]["checkpointSha256"] == MODEL_A_SENTINEL2_MS.expected_sha256

    assert "classification" in res
    assert "segmentation" in res
    assert res["segmentation"]["performed"] is True
    assert res["segmentation"]["mask_available"] is True
    assert isinstance(res["segmentation"]["foreground_pixels"], int)
    assert 0.0 <= res["segmentation"]["foreground_fraction"] <= 1.0

    # Verify visual artifacts (including RGB preview constructed from B4-B3-B2)
    artifacts = res["artifacts"]
    assert os.path.exists(artifacts["original_image"])
    assert os.path.exists(artifacts["mask_image"])
    assert os.path.exists(artifacts["annotated_image"])

    with Image.open(artifacts["original_image"]) as orig, \
         Image.open(artifacts["mask_image"]) as mask, \
         Image.open(artifacts["annotated_image"]) as ann:
        assert orig.size == (240, 240)
        assert mask.size == (240, 240)
        assert ann.size == (240, 240)


def test_e2e_satellite_rgb_inference(sample_e2e_data):
    """Test full operational pipeline on RGB satellite input."""
    out_dir = os.path.join(sample_e2e_data["temp_dir"], "output_sat_rgb")
    res = operational_optical_engine.run_inference(
        image_path=sample_e2e_data["sat_rgb_path"],
        user_selected_type="RGB_SATELLITE",
        output_dir=out_dir,
        prefix="sat_test",
    )

    assert res["status"] == "COMPLETED"
    assert res["model"]["modelId"] == MODEL_C_SATELLITE_RGB.model_id
    assert res["model"]["inputType"] == "RGB_SATELLITE"
    assert res["model"]["bandsUsed"] == ["B4", "B3", "B2"]
    assert res["model"]["checkpointSha256"] == MODEL_C_SATELLITE_RGB.expected_sha256
    assert res["segmentation"]["performed"] is True


def test_e2e_drone_rgb_inference(sample_e2e_data):
    """Test full operational pipeline on drone/aerial RGB input."""
    out_dir = os.path.join(sample_e2e_data["temp_dir"], "output_drone_rgb")
    res = operational_optical_engine.run_inference(
        image_path=sample_e2e_data["drone_rgb_path"],
        user_selected_type="DRONE",
        output_dir=out_dir,
        prefix="drone_test",
    )

    assert res["status"] == "COMPLETED"
    assert res["model"]["modelId"] == MODEL_B_DRONE_RGB.model_id
    assert res["model"]["inputType"] == "DRONE"
    assert res["model"]["bandsUsed"] == ["R", "G", "B"]
    assert res["model"]["checkpointSha256"] == MODEL_B_DRONE_RGB.expected_sha256
    assert res["segmentation"]["performed"] is True


def test_api_optical_infer_endpoint(client, sample_e2e_data):
    """Test FastAPI /api/v1/detection/optical/infer endpoint."""
    out_dir = os.path.join(sample_e2e_data["temp_dir"], "api_out")
    payload = {
        "image_path": sample_e2e_data["drone_rgb_path"],
        "source_type": "DRONE",
        "output_dir": out_dir,
        "prefix": "api_test",
    }
    resp = client.post("/api/v1/detection/optical/infer", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "COMPLETED"
    assert data["model"]["modelId"] == MODEL_B_DRONE_RGB.model_id
    assert data["model"]["domain"] == "DRONE_AERIAL_RGB"
    assert "timing_ms" in data


def test_api_manual_analysis_infer_backward_compatibility(client, sample_e2e_data):
    """
    Phase 15.3: Test FastAPI /api/v1/detection/manual-analysis/infer endpoint.
    Phase 15.3 requires explicit source_type for deterministic routing. Requests
    without source_type where the heuristic cannot auto-resolve the sensor domain
    correctly return HTTP 422 AmbiguousModalityError (fail-safe routing behavior).
    This test documents the current strict-routing contract; callers MUST supply
    source_type (DRONE, RGB_SATELLITE, or SENTINEL_2) for optical inference.
    """
    out_dir = os.path.join(sample_e2e_data["temp_dir"], "api_manual_out")
    # Phase 15.3: source_type is now required for deterministic routing.
    # Without spatial_resolution_m or sensor metadata, the heuristic cannot
    # auto-classify a plain JPEG, triggering the AmbiguousModalityError guard.
    payload_no_source = {
        "image_path": sample_e2e_data["drone_rgb_path"],
        "output_dir": out_dir,
        "prefix": "manual_test",
    }
    resp_no_source = client.post("/api/v1/detection/manual-analysis/infer", json=payload_no_source)
    assert resp_no_source.status_code == 422, (
        "Phase 15.3: Requests without source_type where heuristics cannot auto-resolve "
        "must return HTTP 422 (AmbiguousModalityError fail-safe)."
    )

    # Phase 15.3: With explicit source_type the endpoint succeeds end-to-end.
    payload_with_source = {
        "image_path": sample_e2e_data["drone_rgb_path"],
        "source_type": "DRONE",
        "output_dir": out_dir,
        "prefix": "manual_test",
    }
    resp = client.post("/api/v1/detection/manual-analysis/infer", json=payload_with_source)
    assert resp.status_code == 200
    data = resp.json()
    assert "model" in data
    assert "classification" in data
    assert "segmentation" in data
    assert "input_metadata" in data
    assert "artifacts" in data
