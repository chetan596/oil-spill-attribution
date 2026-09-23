"""
Integration Tests for Part 0.13C: Metocean Drift API Integration.
Verifies endpoints POST /api/v1/hindcast/simulate and POST /api/v1/hindcast/analyze-candidate.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_hindcast_simulate_endpoint_standard_simulation():
    response = client.post(
        "/api/v1/hindcast/simulate",
        json={
            "latitude": 18.922,
            "longitude": 72.834,
            "detection_timestamp": "2026-09-19T08:30:00Z",
            "hours_back": 12,
            "hours_forward": 6,
            "wind_speed_kts": 12.0,
            "wind_direction_deg": 315.0,
            "current_speed_kts": 0.8,
            "current_direction_deg": 125.0,
            "windage_factor": 0.03,
            "source": "ERA5_REANALYSIS"
        }
    )

    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "success"
    assert "origin_lat" in data
    assert "origin_lng" in data
    assert "origin_timestamp" in data
    assert "uncertainty_radius_km" in data
    assert len(data["backward_path"]) == 13 # 0 to 12h inclusive
    assert len(data["forward_path"]) == 7   # 0 to 6h inclusive

    # GeoJSON FeatureCollection
    geojson = data["geojson"]
    assert geojson["type"] == "FeatureCollection"
    assert len(geojson["features"]) == 5

    # Scientific Guardrails
    guardrails = data["scientificGuardrails"]
    assert guardrails["aisAttribution"] == "NOT_IMPLEMENTED"
    assert guardrails["vesselResponsibility"] == "NOT_ESTABLISHED"


def test_hindcast_analyze_candidate_spill_endpoint():
    response = client.post(
        "/api/v1/hindcast/analyze-candidate",
        json={
            "observed_centroid": {
                "latitude": 37.82,
                "longitude": -122.45
            },
            "acquisition_timestamp": "2026-09-19T10:15:00Z",
            "scene_id": "test_s1_san_francisco_candidate",
            "source_type": "REAL_CDSE",
            "hours_back": 18,
            "hours_forward": 6,
            "env_params": {
                "wind_speed_kts": 14.0,
                "wind_direction_deg": 280.0,
                "current_speed_kts": 0.5,
                "current_direction_deg": 100.0,
                "windage_factor": 0.032,
                "source": "ERA5_REANALYSIS"
            }
        }
    )

    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "success"
    assert data["sourceType"] == "REAL_CDSE"
    assert data["observed"]["centroid"]["latitude"] == 37.82
    assert data["observed"]["centroid"]["longitude"] == -122.45
    assert data["observed"]["status"] == "OBSERVED"

    # Drift & Modeled Origin
    drift = data["drift"]
    assert drift["status"] == "MODELLED"
    assert drift["modeledOrigin"]["status"] == "MODELLED_SPILL_ORIGIN"
    assert drift["modeledOrigin"]["latitude"] != 37.82

    # Derived
    derived = data["derived"]
    assert derived["status"] == "DERIVED"
    assert derived["netDriftDistanceKm"] > 0.0
    assert derived["elapsedTimeHours"] == 18.0

    # Guardrails
    assert data["scientificGuardrails"]["aisAttribution"] == "NOT_IMPLEMENTED"
    assert data["scientificGuardrails"]["vesselResponsibility"] == "NOT_ESTABLISHED"


def test_hindcast_simulate_endpoint_validation_error():
    response = client.post(
        "/api/v1/hindcast/simulate",
        json={
            "latitude": 95.0,  # Invalid latitude > 90
            "longitude": 72.0
        }
    )
    assert response.status_code == 422
