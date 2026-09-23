"""
Integration Tests for RGB Classification FastAPI Endpoints (Part 0.14B).
Tests:
  - POST /api/v1/detection/rgb-classify with valid JPG
  - POST /api/v1/detection/rgb-classify with valid PNG
  - POST /api/v1/detection/rgb-classify with custom threshold
  - POST /api/v1/detection/rgb-classify rejecting TIFF / SAR (Modality Guard HTTP 422)
  - POST /api/v1/detection/rgb-classify with missing file (HTTP 400)
  - POST /api/v1/detection/rgb-classify with corrupted image (HTTP 400)
"""

import os
import tempfile
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


def create_temp_image(filename="test.jpg", color=(40, 80, 120), size=(100, 100)):
    temp_dir = tempfile.mkdtemp()
    filepath = os.path.join(temp_dir, filename)
    img = Image.new("RGB", size, color=color)
    img.save(filepath)
    return filepath


def create_temp_tiff(filename="scene.tif"):
    temp_dir = tempfile.mkdtemp()
    filepath = os.path.join(temp_dir, filename)
    with open(filepath, "wb") as f:
        f.write(b"II\x2a\x00\x08\x00\x00\x00\x00\x00")
    return filepath


def test_rgb_classify_endpoint_valid_jpg(client):
    """Test classification of a valid JPG image via FastAPI endpoint."""
    img_path = create_temp_image("ocean.jpg")
    response = client.post(
        "/api/v1/detection/rgb-classify",
        json={"image_path": img_path}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["OIL_SPILL_DETECTED", "NO_OIL_SPILL_DETECTED"]
    assert isinstance(data["oil_spill_detected"], bool)
    assert 0.0 <= data["model_probability"] <= 1.0
    assert data["decision_threshold"] == 0.80
    assert data["modality"] == "OPTICAL_RGB"
    assert data["location"] == "NOT_ESTABLISHED"
    assert "inference_time_ms" in data


def test_rgb_classify_endpoint_valid_png(client):
    """Test classification of a valid PNG image via FastAPI endpoint."""
    img_path = create_temp_image("spill.png")
    response = client.post(
        "/api/v1/detection/rgb-classify",
        json={"image_path": img_path}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["OIL_SPILL_DETECTED", "NO_OIL_SPILL_DETECTED"]
    assert data["modality"] == "OPTICAL_RGB"
    assert data["input_metadata"]["format"] == "PNG"


def test_rgb_classify_endpoint_custom_threshold(client):
    """Test overriding decision threshold."""
    img_path = create_temp_image("sample.jpg")
    response = client.post(
        "/api/v1/detection/rgb-classify",
        json={"image_path": img_path, "threshold": 0.50}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["decision_threshold"] == 0.50


def test_rgb_classify_endpoint_rejects_sar_tiff(client):
    """Verify modality guard returns HTTP 422 when a TIFF/SAR image is submitted."""
    tiff_path = create_temp_tiff("sar_raster.tif")
    response = client.post(
        "/api/v1/detection/rgb-classify",
        json={"image_path": tiff_path}
    )
    assert response.status_code == 422
    data = response.json()
    assert "TIFF/SAR" in data["detail"]


def test_rgb_classify_endpoint_missing_file(client):
    """Verify HTTP 400 when image path does not exist."""
    response = client.post(
        "/api/v1/detection/rgb-classify",
        json={"image_path": "d:/non_existent_image_12345.jpg"}
    )
    assert response.status_code == 400
    assert "not found" in response.json()["detail"].lower()
