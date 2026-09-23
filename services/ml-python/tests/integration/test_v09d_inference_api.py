"""
Integration Tests for FastAPI Frozen V09D Inference API (/api/v1/detection/v09d-inference).
"""

import os
import tempfile
import pytest
import numpy as np
from PIL import Image
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_v09d_inference_endpoint_successful_execution():
    """Verify POST /api/v1/detection/v09d-inference executes and returns complete contract."""
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = tmp.name
        # Create a synthetic grayscale test SAR patch
        arr = np.random.randint(10, 100, size=(512, 512), dtype=np.uint8)
        img = Image.fromarray(arr, mode="L")
        img.save(tmp_path)

    try:
        payload = {
            "image_path": tmp_path,
            "scene_id": "test_fixture_scene_001",
            "threshold": 0.50,
            "source_type": "UPLOADED_REAL_SAR",
            "generate_artifacts": False
        }
        response = client.post("/api/v1/detection/v09d-inference", json=payload)
        assert response.status_code == 200
        data = response.json()

        # Contract checks
        assert data["status"] == "SUCCESS"
        assert data["model"]["id"] == "unet-dual-pol-sar-v09d-residual-loss"
        assert data["model"]["release"] == "OG-SAR-ML-RESEARCH-RELEASE-V0.12"
        assert data["model"]["status"] == "EXPERIMENTAL_VALIDATED_WITH_LIMITATIONS"
        assert data["model"]["checkpointSha256"] == "ab22ffa2fb1c3be99ff2bb99353db76ed4934bd00210f7bce21df74506ce827d"
        assert data["model"]["parameters"] == 1114338
        assert data["model"]["benchmarkMetadata"]["heldOutRecall"] == 0.015054
        assert data["model"]["benchmarkMetadata"]["heldOutIoU"] == 0.011823

        assert data["input"]["sourceType"] == "UPLOADED_REAL_SAR"
        assert data["input"]["preprocessing"] == "sentinel1_sigma0_db_v1"
        assert data["inference"]["operatingThreshold"] == 0.50
        assert data["inference"]["tileSize"] == 512
        assert data["inference"]["stride"] == 448
        assert data["inference"]["blending"] == "hann_window"
        assert data["inference"]["timingMs"]["total"] > 0.0

        assert "prediction" in data
        assert "geospatial" in data
        assert len(data["limitations"]) >= 4
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def test_v09d_inference_endpoint_rejects_optical_rgb():
    """Verify POST /api/v1/detection/v09d-inference rejects optical RGB photography with 422."""
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = tmp.name
        # Create an RGB image with high chromatic variance
        rgb_arr = np.zeros((128, 128, 3), dtype=np.uint8)
        rgb_arr[:, :, 0] = 255
        rgb_arr[:, :, 1] = 10
        rgb_arr[:, :, 2] = 20
        img = Image.fromarray(rgb_arr, mode="RGB")
        img.save(tmp_path)

    try:
        payload = {
            "image_path": tmp_path,
            "scene_id": "optical_photo_test",
            "threshold": 0.50
        }
        response = client.post("/api/v1/detection/v09d-inference", json=payload)
        assert response.status_code == 422
        assert "optical color photograph" in response.json()["detail"].lower()
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def test_v09d_inference_endpoint_missing_file_error():
    """Verify POST /api/v1/detection/v09d-inference returns 422 for non-existent file."""
    payload = {
        "image_path": "non_existent_file_path_12345.tif",
        "threshold": 0.50
    }
    response = client.post("/api/v1/detection/v09d-inference", json=payload)
    assert response.status_code == 422
    assert "not found" in response.json()["detail"].lower()


def test_segment_endpoint_with_v09d_model_id():
    """Verify existing /api/v1/detection/segment endpoint handles model_id='unet-dual-pol-sar-v09d-residual-loss'."""
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = tmp.name
        arr = np.random.randint(20, 80, size=(256, 256), dtype=np.uint8)
        Image.fromarray(arr, mode="L").save(tmp_path)

    try:
        payload = {
            "scene_id": "test-v09d-scene",
            "image_path": tmp_path,
            "threshold": 0.50,
            "polarization": "VV",
            "model_id": "unet-dual-pol-sar-v09d-residual-loss"
        }
        response = client.post("/api/v1/detection/segment", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["scene_id"] == "test-v09d-scene"
        assert data["model_version"] == "unet-dual-pol-sar-v09d-residual-loss"
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
