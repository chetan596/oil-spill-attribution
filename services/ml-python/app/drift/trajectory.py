"""
Lagrangian Trajectory Kinematics Module (Phase 5)

Performs geographic advection integration using surface drift velocity vectors:
  - Forward advection integration
  - Backward advection integration (reverse hindcasting)
  - Geodesic coordinate displacement conversion
"""

import math
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Tuple
from app.drift.environmental import EnvironmentalParameters
from app.drift.uncertainty import calculate_uncertainty_radius_km

KM_PER_DEG_LAT = 111.139  # Approximate km per degree of latitude


def compute_geographic_displacement(
    lat: float,
    lng: float,
    u_kmh: float,
    v_kmh: float,
    dt_hours: float,
) -> Tuple[float, float]:
    """
    Calculate new geographic coordinates after advection displacement.

    Args:
        lat: Starting latitude (degrees).
        lng: Starting longitude (degrees).
        u_kmh: Eastward velocity component (km/h).
        v_kmh: Northward velocity component (km/h).
        dt_hours: Time step duration in hours (positive or negative).

    Returns:
        (new_lat, new_lng): Updated coordinates.
    """
    d_north_km = v_kmh * dt_hours
    d_east_km = u_kmh * dt_hours

    d_lat_deg = d_north_km / KM_PER_DEG_LAT

    # Longitude convergence with latitude
    avg_lat_rad = math.radians(lat + d_lat_deg / 2.0)
    cos_lat = math.cos(avg_lat_rad)
    if abs(cos_lat) < 1e-6:
        cos_lat = 1e-6

    km_per_deg_lng = KM_PER_DEG_LAT * cos_lat
    d_lng_deg = d_east_km / km_per_deg_lng

    new_lat = round(lat + d_lat_deg, 5)
    new_lng = round(lng + d_lng_deg, 5)

    return new_lat, new_lng


def generate_trajectory_path(
    start_lat: float,
    start_lng: float,
    start_time: datetime,
    hours: int,
    env: EnvironmentalParameters,
    phase: str = "backward",  # "backward" or "forward"
    step_minutes: int = 60,
) -> List[Dict[str, Any]]:
    """
    Integrate a Lagrangian particle trajectory path over time.

    Args:
        start_lat: Initial latitude (degrees).
        start_lng: Initial longitude (degrees).
        start_time: Initial timestamp.
        hours: Total simulation duration in hours.
        env: Environmental parameters.
        phase: "backward" for reverse hindcast, "forward" for forecast.
        step_minutes: Integration time step (default 60 min = 1 hour).

    Returns:
        List[Dict]: Ordered trajectory waypoints with coordinates, timestamps, and uncertainty.
    """
    u_kmh, v_kmh = env.get_drift_velocity_components_kmh()
    total_speed_kmh = math.sqrt(u_kmh**2 + v_kmh**2)
    heading_deg = (math.degrees(math.atan2(u_kmh, v_kmh)) + 360.0) % 360.0

    steps = int((hours * 60) / step_minutes)
    dt_hours = step_minutes / 60.0
    time_multiplier = -1.0 if phase == "backward" else 1.0

    current_lat = start_lat
    current_lng = start_lng
    current_time = start_time

    path: List[Dict[str, Any]] = []

    # First point: origin/start
    initial_uncertainty = calculate_uncertainty_radius_km(0.0)
    path.append({
        "seq_index": 0,
        "latitude": round(current_lat, 5),
        "longitude": round(current_lng, 5),
        "lat": round(current_lat, 5),
        "lng": round(current_lng, 5),
        "timestamp": current_time.isoformat(),
        "elapsed_hours": 0.0,
        "uncertainty_radius_km": initial_uncertainty,
        "drift_speed_kmh": round(total_speed_kmh, 2),
        "drift_heading_deg": round(heading_deg, 1),
        "phase": phase,
    })

    for step in range(1, steps + 1):
        # Step in time
        delta_t = timedelta(minutes=step_minutes)
        if phase == "backward":
            current_time = current_time - delta_t
            # In backward integration, slick came from opposite displacement
            current_lat, current_lng = compute_geographic_displacement(
                current_lat, current_lng, -u_kmh, -v_kmh, dt_hours
            )
        else:
            current_time = current_time + delta_t
            # In forward integration, slick moves in drift direction
            current_lat, current_lng = compute_geographic_displacement(
                current_lat, current_lng, u_kmh, v_kmh, dt_hours
            )

        elapsed_h = step * dt_hours
        uncertainty_km = calculate_uncertainty_radius_km(elapsed_h)

        path.append({
            "seq_index": step,
            "latitude": round(current_lat, 5),
            "longitude": round(current_lng, 5),
            "lat": round(current_lat, 5),
            "lng": round(current_lng, 5),
            "timestamp": current_time.isoformat(),
            "elapsed_hours": round(elapsed_h, 2),
            "uncertainty_radius_km": uncertainty_km,
            "drift_speed_kmh": round(total_speed_kmh, 2),
            "drift_heading_deg": round(heading_deg, 1),
            "phase": phase,
        })

    return path
