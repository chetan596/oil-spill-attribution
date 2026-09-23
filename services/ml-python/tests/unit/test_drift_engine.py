"""
Unit and Integration Tests for Drift Engine (Phase 5)
"""

import pytest
from datetime import datetime, timezone
from app.drift.environmental import EnvironmentalParameters
from app.drift.uncertainty import calculate_uncertainty_radius_km, generate_uncertainty_polygon_geojson
from app.drift.trajectory import compute_geographic_displacement, generate_trajectory_path
from app.drift.hindcast import run_backward_hindcast
from app.drift.forecast import run_forward_forecast
from app.drift.gnome_runner import GNOMERunner, gnome_runner


def test_environmental_parameters_validation():
    env = EnvironmentalParameters(wind_speed_kts=12.4, current_speed_kts=0.8)
    env.validate()
    u, v = env.get_drift_velocity_components_kmh()
    assert isinstance(u, float)
    assert isinstance(v, float)

    # Test invalid wind speed raises ValueError
    with pytest.raises(ValueError):
        invalid_env = EnvironmentalParameters(wind_speed_kts=200.0)
        invalid_env.validate()


def test_uncertainty_dispersion_calculation():
    # 0 hours -> initial radius (0.5 km)
    r0 = calculate_uncertainty_radius_km(0.0)
    assert r0 == 0.5

    # 24 hours -> expanding radius > 0.5 km
    r24 = calculate_uncertainty_radius_km(24.0)
    assert r24 > 1.0

    poly = generate_uncertainty_polygon_geojson(19.0, 72.5, r24)
    assert poly["type"] == "Polygon"
    assert len(poly["coordinates"][0]) == 33  # 32 points + closed ring
    assert poly["coordinates"][0][0] == poly["coordinates"][0][-1]


def test_geographic_displacement():
    lat, lng = 18.921, 72.832
    # Move eastward by 10 km/h for 1 hour
    new_lat, new_lng = compute_geographic_displacement(lat, lng, u_kmh=10.0, v_kmh=0.0, dt_hours=1.0)
    assert new_lat == lat
    assert new_lng > lng


def test_backward_hindcast_simulation():
    detection_time = datetime(2026, 3, 10, 12, 0, 0, tzinfo=timezone.utc)
    res = run_backward_hindcast(
        detection_lat=18.921,
        detection_lng=72.832,
        detection_time=detection_time,
        hours_back=24,
    )

    assert res["status"] == "success"
    assert res["engine"] == "BUILT-IN DEMONSTRATION LAGRANGIAN MODEL"
    assert "modelled_origin" in res
    assert res["modelled_origin"]["latitude"] != 18.921
    assert len(res["backward_path"]) == 25  # 0h to 24h = 25 hourly points


def test_forward_forecast_simulation():
    detection_time = datetime(2026, 3, 10, 12, 0, 0, tzinfo=timezone.utc)
    res = run_forward_forecast(
        start_lat=18.921,
        start_lng=72.832,
        start_time=detection_time,
        hours_forward=6,
    )

    assert res["status"] == "success"
    assert len(res["forward_path"]) == 7  # 0h to 6h = 7 hourly points


def test_gnome_runner_unified_simulation():
    res = gnome_runner.run_drift_simulation(
        detection_lat=18.921,
        detection_lng=72.832,
        detection_time="2026-03-10T12:00:00Z",
        hours_back=24,
        hours_forward=6,
    )

    assert res["status"] == "success"
    assert "origin_lat" in res
    assert "origin_lng" in res
    assert "origin_timestamp" in res
    assert "geojson" in res
    assert res["geojson"]["type"] == "FeatureCollection"
    assert len(res["geojson"]["features"]) == 5


def test_fastapi_hindcast_simulate_endpoint():
    try:
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
    except Exception as e:
        pytest.skip(f"FastAPI TestClient unavailable: {e}")

    payload = {
        "latitude": 18.921,
        "longitude": 72.832,
        "detection_timestamp": "2026-03-10T12:00:00Z",
        "hours_back": 24,
        "hours_forward": 6,
        "wind_speed_kts": 12.4,
        "wind_direction_deg": 315.0,
        "current_speed_kts": 0.8,
        "current_direction_deg": 125.0,
        "windage_factor": 0.03,
        "source": "demo",
    }

    response = client.post("/api/v1/hindcast/simulate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["engine"] == "BUILT-IN DEMONSTRATION LAGRANGIAN MODEL"
    assert len(data["backward_path"]) == 25
    assert len(data["forward_path"]) == 7
    assert data["geojson"]["type"] == "FeatureCollection"
