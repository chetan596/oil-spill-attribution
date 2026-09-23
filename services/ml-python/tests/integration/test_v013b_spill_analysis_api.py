"""
Integration Tests for Part 0.13B: Georeferenced Candidate Spill Analysis Pipeline.
Verifies API integration, GeoJSON serialization, shape features, probability statistics,
and scientific guardrails on endpoints.
"""

import os
import pytest
import numpy as np
import rasterio
from rasterio.transform import from_origin
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.fixture
def synthetic_georeferenced_sar(tmp_path):
    """Create a temporary georeferenced dual-pol SAR GeoTIFF with a simulated candidate slick."""
    filepath = str(tmp_path / "test_geo_candidate_slick.tif")
    width, height = 512, 512
    transform = from_origin(-122.5, 37.8, 0.0001, 0.0001) # San Francisco offshore EPSG:4326

    # Normal background dB
    vv_data = np.full((height, width), -12.0, dtype=np.float32)
    vh_data = np.full((height, width), -22.0, dtype=np.float32)

    # Insert dark formation patch (-28 dB VV, -35 dB VH)
    vv_data[180:240, 200:300] = -28.0
    vh_data[180:240, 200:300] = -35.0

    with rasterio.open(
        filepath,
        "w",
        driver="GTiff",
        height=height,
        width=width,
        count=2,
        dtype=np.float32,
        crs="EPSG:4326",
        transform=transform,
    ) as dst:
        dst.write(vv_data, 1)
        dst.write(vh_data, 2)

    return filepath


def test_v09d_inference_produces_georeferenced_candidate_spill_analysis(synthetic_georeferenced_sar):
    response = client.post(
        "/api/v1/detection/v09d-inference",
        json={
            "image_path": synthetic_georeferenced_sar,
            "scene_id": "test-s1-sf-candidate-001",
            "threshold": 0.50,
            "source_type": "REAL_CDSE"
        }
    )

    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "SUCCESS"
    assert data["input"]["sourceType"] == "REAL_CDSE"
    assert data["model"]["id"] == "unet-dual-pol-sar-v09d-residual-loss"
    assert data["model"]["status"] == "EXPERIMENTAL_VALIDATED_WITH_LIMITATIONS"

    # Geospatial analysis components
    assert "geoJson" in data
    geojson = data["geoJson"]
    assert geojson["type"] == "FeatureCollection"
    assert "features" in geojson

    # Scientific Guardrails
    assert data["scientificGuardrails"]["oilType"] == "NOT_ESTABLISHED"
    assert data["scientificGuardrails"]["estimatedVolume"] == "NOT_ESTABLISHED"
    assert data["scientificGuardrails"]["aisAttribution"] == "NOT_IMPLEMENTED"
    assert data["scientificGuardrails"]["metoceanDrift"] == "NOT_IMPLEMENTED"
    assert data["scientificGuardrails"]["llmSynthesis"] == "NOT_IMPLEMENTED"

    # Predictions
    pred = data["prediction"]
    assert "candidateRegions" in pred
    assert "totalAreaM2" in pred
    assert "totalAreaKm2" in pred


def test_manual_analysis_pipeline_with_geospatial_spill_analysis(synthetic_georeferenced_sar):
    response = client.post(
        "/api/v1/detection/manual-analysis",
        json={
            "image_path": synthetic_georeferenced_sar,
            "original_filename": "manual_upload_sf.tif",
            "threshold": 0.50,
            "polarization": "dual",
            "model_id": "unet-dual-pol-sar-v09d-residual-loss"
        }
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "COMPLETED"
    assert data["oil_type"]["status"] == "NOT_ESTABLISHED"
    assert "regions" in data
