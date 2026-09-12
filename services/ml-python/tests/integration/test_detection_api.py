"""
Integration Tests for FastAPI Detection Endpoint (/api/v1/detection/segment).
Tests API response schemas, demo fallback, and parameter validation.
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_detection_demo_scene_fallback():
    payload = {
        "scene_id": "demo-scene-001",
        "image_path": None,
        "threshold": 0.5,
        "polarization": "VV"
    }
    response = client.post("/api/v1/detection/segment", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["scene_id"] == "demo-scene-001"
    assert data["detection_status"] == "detected"
    assert data["confidence"] > 0.9
    assert len(data["slick_polygons"]) > 0
    assert data["total_area_km2"] > 0.0
    assert data["processing_metadata"]["mode"] == "demo_fallback"
    assert data["processing_metadata"]["is_real_ml"] is False


def test_detection_missing_image_path_error():
    payload = {
        "scene_id": "non-demo-scene-999",
        "image_path": "non_existent_raster.tif",
        "threshold": 0.5,
        "polarization": "VV"
    }
    response = client.post("/api/v1/detection/segment", json=payload)
    assert response.status_code == 400
    assert "not found" in response.json()["detail"].lower()
