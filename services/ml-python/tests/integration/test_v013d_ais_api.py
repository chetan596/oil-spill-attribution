"""
Integration Tests for Part 0.13D: AIS Correlation API Endpoint.
Verifies POST /api/v1/ais/correlate.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_ais_correlate_endpoint_successful_execution():
    drift_result = {
        "engine": "BUILT-IN DEMONSTRATION LAGRANGIAN MODEL",
        "sourceType": "REAL_CDSE",
        "observed": {
            "centroid": {"latitude": 37.82, "longitude": -122.45},
            "timestamp": "2026-09-19T10:00:00Z"
        },
        "drift": {
            "modeledOrigin": {
                "latitude": 37.95,
                "longitude": -122.60,
                "timestamp": "2026-09-18T10:00:00Z",
                "uncertaintyRadiusKm": 1.43
            },
            "backwardPath": [
                {"lat": 37.82, "lng": -122.45, "timestamp": "2026-09-19T10:00:00Z"},
                {"lat": 37.95, "lng": -122.60, "timestamp": "2026-09-18T10:00:00Z"}
            ]
        }
    }

    vessel_tracks = [
        {
            "mmsi": "367123456",
            "name": "GOLDEN GATE TANKER",
            "vesselType": "Oil Tanker",
            "trackPoints": [
                {"lat": 37.94, "lng": -122.59, "timestamp": "2026-09-18T09:45:00Z", "SOG": 11.2, "COG": 120.0},
                {"lat": 37.96, "lng": -122.61, "timestamp": "2026-09-18T10:15:00Z", "SOG": 11.4, "COG": 120.0},
            ]
        }
    ]

    response = client.post(
        "/api/v1/ais/correlate",
        json={
            "drift_result": drift_result,
            "vessel_tracks": vessel_tracks,
            "sar_metadata": {"sourceType": "REAL_CDSE"},
            "search_radius_km": 50.0,
            "time_window_hours": 24.0,
            "ais_source_type": "REAL_AIS"
        }
    )

    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "success"
    assert data["rankingPolicy"] == "CORRELATION_CANDIDATE_ORDER"
    assert data["candidateCount"] == 1
    assert data["provenance"]["combinationStatus"] == "REAL_ANALYTICAL"

    candidate = data["candidates"][0]
    assert candidate["mmsi"] == "367123456"
    assert candidate["evidenceStatus"] == "AIS_CORRELATED_CANDIDATE"
    assert candidate["correlationScore"] > 0.80

    # Scientific & Legal Guardrails
    guardrails = data["scientificGuardrails"]
    assert guardrails["legalResponsibility"] == "NOT_ESTABLISHED"
    assert guardrails["confirmedDischarge"] == "NOT_ESTABLISHED"
    assert guardrails["vesselLiability"] == "NOT_ESTABLISHED"
    assert guardrails["llmSynthesis"] == "NOT_IMPLEMENTED"


def test_ais_correlate_endpoint_demo_isolation():
    drift_result = {
        "engine": "DEMO LAGRANGIAN",
        "sourceType": "REAL_CDSE",
        "observed": {"centroid": {"latitude": 18.9, "longitude": 72.8}, "timestamp": "2026-09-19T00:00:00Z"},
        "drift": {
            "modeledOrigin": {"latitude": 19.1, "longitude": 72.6, "timestamp": "2026-09-18T00:00:00Z", "uncertaintyRadiusKm": 1.43},
            "backwardPath": [{"lat": 18.9, "lng": 72.8}, {"lat": 19.1, "lng": 72.6}]
        }
    }

    # REAL SAR + DEMO AIS combination
    response = client.post(
        "/api/v1/ais/correlate",
        json={
            "drift_result": drift_result,
            "vessel_tracks": [{"mmsi": "demo_01", "trackPoints": [{"lat": 19.1, "lng": 72.6, "timestamp": "2026-09-18T00:00:00Z"}]}],
            "sar_metadata": {"sourceType": "REAL_CDSE"},
            "ais_source_type": "DEMO"
        }
    )

    assert response.status_code == 200
    data = response.json()
    assert data["provenance"]["combinationStatus"] == "DEMO_AIS_CORRELATION"
