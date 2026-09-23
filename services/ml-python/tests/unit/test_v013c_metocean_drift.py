"""
Unit Tests for Part 0.13C: Metocean Drift & Backtracking Integration.
Verifies Lagrangian advection kinematics, temporal alignment, ERA5 spatial resolution documentation,
backward hindcast, forward forecast, modeled origin derivation, uncertainty envelope calculation,
GeoJSON generation, and scientific guardrails.
"""

import math
from datetime import datetime, timezone, timedelta
import pytest

from app.drift.spill_drift_engine import (
    haversine_distance_km,
    initial_compass_bearing_deg,
    compute_geographic_displacement,
    align_metocean_forcing,
    generate_drift_trajectory_path,
    execute_candidate_drift_analysis,
    DriftEngineError,
)
from app.drift.environmental import EnvironmentalParameters, KNOTS_TO_KMH
from app.drift.uncertainty import calculate_uncertainty_radius_km, generate_uncertainty_polygon_geojson


def test_haversine_distance_known_coordinates():
    # Mumbai (18.922, 72.834) to Gateway offshore (~10 km)
    lat1, lon1 = 18.922, 72.834
    lat2, lon2 = 18.922, 72.934  # ~0.1 deg lon ~ 10.5 km
    dist = haversine_distance_km(lat1, lon1, lat2, lon2)
    assert 10.0 <= dist <= 11.0


def test_initial_compass_bearing():
    # Due North: (0, 0) -> (10, 0) should be 0 deg
    bearing_n = initial_compass_bearing_deg(0.0, 0.0, 10.0, 0.0)
    assert bearing_n == 0.0

    # Due East: (0, 0) -> (0, 10) should be 90 deg
    bearing_e = initial_compass_bearing_deg(0.0, 0.0, 0.0, 10.0)
    assert bearing_e == 90.0


def test_geographic_displacement_kinematics():
    lat, lng = 20.0, 70.0
    u_kmh, v_kmh = 10.0, 0.0  # 10 km/h Eastward for 1 hour
    new_lat, new_lng = compute_geographic_displacement(lat, lng, u_kmh, v_kmh, 1.0)
    
    assert new_lat == 20.0
    assert new_lng > 70.0
    dist = haversine_distance_km(lat, lng, new_lat, new_lng)
    assert dist == pytest.approx(10.0, rel=1e-2)


def test_metocean_forcing_alignment_and_era5_spatial_documentation():
    sar_time = datetime(2026, 9, 19, 12, 0, 0, tzinfo=timezone.utc)
    env_params = {
        "wind_speed_kts": 15.0,
        "wind_direction_deg": 270.0,  # Westerly wind (blowing FROM 270 deg)
        "current_speed_kts": 1.0,
        "current_direction_deg": 90.0,  # Eastward current (flowing TOWARDS 90 deg)
        "windage_factor": 0.03,
        "source": "ERA5_REANALYSIS"
    }

    env, meta = align_metocean_forcing(sar_time, env_params, source_type="REAL_CDSE")

    assert env.wind_speed_kts == 15.0
    assert env.wind_direction_deg == 270.0
    assert meta["source"] == "ERA5_REANALYSIS"
    
    # Check ERA5 10m height documentation guardrail (not 10m spatial resolution)
    assert "10-m surface wind is an atmospheric measurement height" in meta["spatialResolutionNote"]
    assert "resampled from coarse reanalysis grid" in meta["spatialResolutionNote"]


def test_lagrangian_trajectory_backward_hindcast():
    start_time = datetime(2026, 9, 19, 12, 0, 0, tzinfo=timezone.utc)
    start_lat, start_lng = 20.0, 70.0
    env = EnvironmentalParameters(
        wind_speed_kts=10.0,
        wind_direction_deg=0.0, # Northerly wind (blowing from North towards South)
        current_speed_kts=0.0,
        windage_leeway_factor=0.03
    )

    # In backward hindcast, if wind blows from North towards South, the slick was previously to the NORTH
    path = generate_drift_trajectory_path(
        start_lat=start_lat,
        start_lng=start_lng,
        start_time=start_time,
        hours=6,
        env=env,
        phase="backward",
        step_minutes=60
    )

    assert len(path) == 7  # 0h to 6h
    assert path[0]["seqIndex"] == 0
    assert path[0]["lat"] == 20.0
    assert path[0]["lng"] == 70.0
    assert path[0]["timestamp"] == start_time.isoformat()

    # Oldest point in backward trajectory (modeled origin)
    origin = path[-1]
    assert origin["seqIndex"] == 6
    assert origin["lat"] > 20.0  # Came from North!
    assert origin["elapsedHours"] == 6.0
    assert origin["uncertaintyRadiusKm"] > 0.5


def test_uncertainty_envelope_calculation():
    # At t=0, uncertainty = 0.5 km
    u0 = calculate_uncertainty_radius_km(0.0)
    assert u0 == 0.5

    # At t=24h, diffusion expansion: sqrt(2 * 5.0 * 24*3600) / 1000 = sqrt(864000) / 1000 = 0.9295 km
    # Total = 0.5 + 0.9295 = 1.4295 km
    u24 = calculate_uncertainty_radius_km(24.0, eddy_diffusivity_m2s=5.0, initial_uncertainty_km=0.5)
    assert u24 == pytest.approx(1.4295, abs=0.01)

    poly = generate_uncertainty_polygon_geojson(18.9, 72.8, u24)
    assert poly["type"] == "Polygon"
    assert len(poly["coordinates"][0]) == 33  # 32 points + closing point


def test_execute_candidate_drift_analysis_complete_contract():
    obs_lat, obs_lng = 18.92, 72.84
    detection_time = "2026-09-19T06:00:00Z"
    
    result = execute_candidate_drift_analysis(
        observed_lat=obs_lat,
        observed_lng=obs_lng,
        detection_time=detection_time,
        hours_back=12,
        hours_forward=4,
        source_metadata={"sourceType": "REAL_CDSE", "sceneId": "S1A_IW_GRDH_TEST"}
    )

    assert result["status"] == "success"
    assert result["sourceType"] == "REAL_CDSE"
    assert result["observed"]["status"] == "OBSERVED"
    assert result["drift"]["status"] == "MODELLED"
    assert result["derived"]["status"] == "DERIVED"

    # Modeled origin
    modeled_origin = result["drift"]["modeledOrigin"]
    assert modeled_origin["status"] == "MODELLED_SPILL_ORIGIN"
    assert "uncertaintyRadiusKm" in modeled_origin
    assert "uncertaintyPolygonGeojson" in modeled_origin

    # GeoJSON FeatureCollection
    geojson = result["geojson"]
    assert geojson["type"] == "FeatureCollection"
    assert len(geojson["features"]) == 5

    # Prohibitions & Scientific Guardrails
    guardrails = result["scientificGuardrails"]
    assert guardrails["aisAttribution"] == "NOT_IMPLEMENTED"
    assert guardrails["vesselResponsibility"] == "NOT_ESTABLISHED"
    assert guardrails["dischargeLocationConfirmation"] == "NOT_ESTABLISHED"
    assert guardrails["llmSynthesis"] == "NOT_IMPLEMENTED"


def test_execute_candidate_drift_analysis_fail_closed_on_invalid_coords():
    with pytest.raises(DriftEngineError, match="out of geographic bounds"):
        execute_candidate_drift_analysis(observed_lat=120.0, observed_lng=72.84)
