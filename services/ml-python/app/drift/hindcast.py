"""
Backward Hindcast Drift Simulation Module (Phase 5)

Traces the surface oil slick backwards in time from observed detection location
to candidate release origin.
"""

from datetime import datetime
from typing import Dict, Any, Optional
from app.drift.environmental import EnvironmentalParameters
from app.drift.trajectory import generate_trajectory_path
from app.drift.uncertainty import generate_uncertainty_polygon_geojson


def run_backward_hindcast(
    detection_lat: float,
    detection_lng: float,
    detection_time: datetime,
    hours_back: int = 24,
    env: Optional[EnvironmentalParameters] = None,
) -> Dict[str, Any]:
    """
    Execute backward reverse hindcast drift simulation.

    Args:
        detection_lat: Observed slick centroid latitude.
        detection_lng: Observed slick centroid longitude.
        detection_time: Satellite acquisition detection timestamp.
        hours_back: Simulation duration backwards in time (hours).
        env: Environmental parameters.

    Returns:
        Dict: Structured hindcast result containing modelled origin, trajectory, and uncertainty.
    """
    if env is None:
        env = EnvironmentalParameters()

    backward_path = generate_trajectory_path(
        start_lat=detection_lat,
        start_lng=detection_lng,
        start_time=detection_time,
        hours=hours_back,
        env=env,
        phase="backward",
        step_minutes=60,
    )

    origin_point = backward_path[-1]
    origin_lat = origin_point["latitude"]
    origin_lng = origin_point["longitude"]
    origin_timestamp = origin_point["timestamp"]
    origin_uncertainty_km = origin_point["uncertainty_radius_km"]

    uncertainty_polygon = generate_uncertainty_polygon_geojson(
        center_lat=origin_lat,
        center_lng=origin_lng,
        radius_km=origin_uncertainty_km,
    )

    return {
        "status": "success",
        "engine": "BUILT-IN DEMONSTRATION LAGRANGIAN MODEL",
        "phase": "hindcast_backward",
        "observed_detection": {
            "latitude": detection_lat,
            "longitude": detection_lng,
            "timestamp": detection_time.isoformat(),
            "source": "observed_sentinel1_sar",
        },
        "modelled_origin": {
            "latitude": origin_lat,
            "longitude": origin_lng,
            "timestamp": origin_timestamp,
            "uncertainty_radius_km": origin_uncertainty_km,
            "uncertainty_polygon_geojson": uncertainty_polygon,
            "classification": "MODELLED SPILL ORIGIN",
        },
        "time_window_hours": hours_back,
        "backward_path": backward_path,
        "environmental_parameters": env.to_dict(),
        "disclaimer": "Modelled trajectory and origin derived from Lagrangian hydrodynamic simulation under demonstration environmental forcing. Not causal proof of pollution.",
    }
