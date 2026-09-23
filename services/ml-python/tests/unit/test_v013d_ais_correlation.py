"""
Unit Tests for Part 0.13D: AIS Correlation & Vessel Evidence Engine.
Verifies CPA calculation, trajectory distance, data quality metrics, correlation scoring,
candidate ranking policy, evidence statuses, provenance isolation, and legal/scientific guardrails.
"""

from datetime import datetime, timezone, timedelta
import pytest

from app.ais.spill_ais_engine import (
    parse_timestamp,
    calculate_point_to_linestring_min_distance,
    calculate_vessel_cpa,
    calculate_data_quality_metrics,
    compute_correlation_score,
    correlate_vessels_with_drift_corridor,
    AISEngineError,
)


def test_parse_timestamp_formats():
    iso_str = "2026-09-19T10:30:00Z"
    dt = parse_timestamp(iso_str)
    assert dt.year == 2026
    assert dt.month == 9
    assert dt.hour == 10

    unix_ms = 1789813800000
    dt_unix = parse_timestamp(unix_ms)
    assert dt_unix.tzinfo is not None


def test_point_to_linestring_distance():
    # Target point at (18.9, 72.8)
    line_coords = [
        [72.7, 18.9],
        [72.8, 18.9],
        [72.9, 18.9],
    ]
    dist = calculate_point_to_linestring_min_distance(18.9, 72.8, line_coords)
    assert dist == 0.0


def test_calculate_vessel_cpa_known_points():
    target_lat, target_lon = 19.0, 72.5
    track_points = [
        {"lat": 18.8, "lng": 72.5, "timestamp": "2026-09-19T06:00:00Z", "SOG": 12.0, "COG": 0.0},
        {"lat": 19.01, "lng": 72.5, "timestamp": "2026-09-19T07:00:00Z", "SOG": 12.2, "COG": 0.0}, # CPA (~1.1 km)
        {"lat": 19.2, "lng": 72.5, "timestamp": "2026-09-19T08:00:00Z", "SOG": 12.0, "COG": 0.0},
    ]

    cpa = calculate_vessel_cpa(track_points, target_lat, target_lon)
    assert cpa["status"] == "ESTABLISHED"
    assert cpa["cpaDistanceKm"] == pytest.approx(1.11, abs=0.1)
    assert cpa["cpaTimestamp"] == "2026-09-19T07:00:00+00:00"
    assert cpa["cpaLatitude"] == 19.01
    assert cpa["cpaSogKnots"] == 12.2


def test_data_quality_metrics_evaluation():
    # Dense, regular reporting
    dense_track = [
        {"lat": 18.0 + i*0.05, "lng": 72.0, "timestamp": (datetime(2026, 9, 19, 0, 0, tzinfo=timezone.utc) + timedelta(hours=i)).isoformat()}
        for i in range(10)
    ]
    dq_dense = calculate_data_quality_metrics(dense_track)
    assert dq_dense["positionCount"] == 10
    assert dq_dense["positionGapsCount"] == 0
    assert dq_dense["qualityRating"] == "HIGH"
    assert dq_dense["dataCompleteness"] >= 0.7

    # Sparse track with gap > 4h
    sparse_track = [
        {"lat": 18.0, "lng": 72.0, "timestamp": "2026-09-19T00:00:00Z"},
        {"lat": 18.5, "lng": 72.0, "timestamp": "2026-09-19T06:00:00Z"}, # 6h gap
    ]
    dq_sparse = calculate_data_quality_metrics(sparse_track)
    assert dq_sparse["positionGapsCount"] == 1
    assert dq_sparse["maxGapDurationHours"] == 6.0


def test_compute_correlation_score():
    score_close, breakdown_close = compute_correlation_score(
        distance_to_origin_km=2.0,
        min_distance_to_trajectory_km=1.5,
        uncertainty_radius_km=1.4,
        temporal_difference_hours=1.0,
        data_quality_score=0.9
    )
    assert score_close > 0.85
    assert breakdown_close["spatialProximityScore"] > 0.9

    score_far, breakdown_far = compute_correlation_score(
        distance_to_origin_km=85.0,
        min_distance_to_trajectory_km=70.0,
        uncertainty_radius_km=1.4,
        temporal_difference_hours=18.0,
        data_quality_score=0.5
    )
    assert score_far < 0.3


def test_correlate_vessels_with_drift_corridor_end_to_end():
    drift_result = {
        "engine": "Lagrangian Advection",
        "sourceType": "REAL_CDSE",
        "observed": {
            "centroid": {"latitude": 18.90, "longitude": 72.80},
            "timestamp": "2026-09-19T12:00:00Z"
        },
        "drift": {
            "modeledOrigin": {
                "latitude": 19.10,
                "longitude": 72.60,
                "timestamp": "2026-09-18T12:00:00Z",
                "uncertaintyRadiusKm": 1.43
            },
            "backwardPath": [
                {"lat": 18.90, "lng": 72.80, "timestamp": "2026-09-19T12:00:00Z"},
                {"lat": 19.00, "lng": 72.70, "timestamp": "2026-09-19T00:00:00Z"},
                {"lat": 19.10, "lng": 72.60, "timestamp": "2026-09-18T12:00:00Z"},
            ]
        }
    }

    # Vessel 1: Close passing tanker
    vessel_1 = {
        "mmsi": "419000111",
        "name": "PACIFIC EXPLORER",
        "vesselType": "Crude Oil Tanker",
        "trackPoints": [
            {"lat": 19.08, "lng": 72.58, "timestamp": "2026-09-18T11:30:00Z", "SOG": 13.5, "COG": 140.0},
            {"lat": 19.11, "lng": 72.61, "timestamp": "2026-09-18T12:15:00Z", "SOG": 13.4, "COG": 140.0},
            {"lat": 19.15, "lng": 72.65, "timestamp": "2026-09-18T13:00:00Z", "SOG": 13.5, "COG": 140.0},
        ]
    }

    # Vessel 2: Distant cargo ship (60 km away)
    vessel_2 = {
        "mmsi": "419000222",
        "name": "NORDIC TRADER",
        "vesselType": "Container Ship",
        "trackPoints": [
            {"lat": 19.60, "lng": 73.10, "timestamp": "2026-09-18T12:00:00Z", "SOG": 18.0, "COG": 210.0},
            {"lat": 19.80, "lng": 73.20, "timestamp": "2026-09-18T13:00:00Z", "SOG": 18.0, "COG": 210.0},
        ]
    }

    result = correlate_vessels_with_drift_corridor(
        drift_result=drift_result,
        vessel_tracks=[vessel_1, vessel_2],
        sar_metadata={"sourceType": "REAL_CDSE"},
        ais_source_type="REAL_AIS"
    )

    assert result["status"] == "success"
    assert result["rankingPolicy"] == "CORRELATION_CANDIDATE_ORDER"
    assert result["candidateCount"] == 2

    # Top candidate should be Vessel 1
    top_cand = result["candidates"][0]
    assert top_cand["mmsi"] == "419000111"
    assert top_cand["evidenceStatus"] == "AIS_CORRELATED_CANDIDATE"
    assert top_cand["correlationScore"] > 0.80

    # Second candidate
    second_cand = result["candidates"][1]
    assert second_cand["mmsi"] == "419000222"
    assert second_cand["correlationScore"] < top_cand["correlationScore"]

    # Provenance combinations
    assert result["provenance"]["combinationStatus"] == "REAL_ANALYTICAL"

    # Scientific Guardrails
    guardrails = result["scientificGuardrails"]
    assert guardrails["legalResponsibility"] == "NOT_ESTABLISHED"
    assert guardrails["confirmedDischarge"] == "NOT_ESTABLISHED"
    assert guardrails["vesselLiability"] == "NOT_ESTABLISHED"
    assert guardrails["llmSynthesis"] == "NOT_IMPLEMENTED"

    # GeoJSON FeatureCollection
    geojson = result["geojson"]
    assert geojson["type"] == "FeatureCollection"
    assert len(geojson["features"]) >= 2  # tracks + CPA points
