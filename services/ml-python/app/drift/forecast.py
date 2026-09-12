"""
Forward Forecast Drift Simulation Module (Phase 5)

Simulates the future trajectory and dispersion of an oil slick from
observed location forward in time.
"""

from datetime import datetime
from typing import Dict, Any, Optional
from app.drift.environmental import EnvironmentalParameters
from app.drift.trajectory import generate_trajectory_path
from app.drift.uncertainty import generate_uncertainty_polygon_geojson


def run_forward_forecast(
    start_lat: float,
    start_lng: float,
    start_time: datetime,
    hours_forward: int = 6,
    env: Optional[EnvironmentalParameters] = None,
) -> Dict[str, Any]:
    """
    Execute forward forecast drift simulation.

    Args:
        start_lat: Initial latitude.
        start_lng: Initial longitude.
        start_time: Initial timestamp.
        hours_forward: Duration forward in time (hours).
        env: Environmental parameters.

    Returns:
        Dict: Structured forecast result containing forward trajectory and dispersion uncertainty.
    """
    if env is None:
        env = EnvironmentalParameters()

    forward_path = generate_trajectory_path(
        start_lat=start_lat,
        start_lng=start_lng,
        start_time=start_time,
        hours=hours_forward,
        env=env,
        phase="forward",
        step_minutes=60,
    )

    final_point = forward_path[-1]
    final_lat = final_point["latitude"]
    final_lng = final_point["longitude"]
    final_timestamp = final_point["timestamp"]
    final_uncertainty_km = final_point["uncertainty_radius_km"]

    uncertainty_polygon = generate_uncertainty_polygon_geojson(
        center_lat=final_lat,
        center_lng=final_lng,
        radius_km=final_uncertainty_km,
    )

    return {
        "status": "success",
        "engine": "BUILT-IN DEMONSTRATION LAGRANGIAN MODEL",
        "phase": "forecast_forward",
        "forecast_origin": {
            "latitude": start_lat,
            "longitude": start_lng,
            "timestamp": start_time.isoformat(),
        },
        "forecast_endpoint": {
            "latitude": final_lat,
            "longitude": final_lng,
            "timestamp": final_timestamp,
            "uncertainty_radius_km": final_uncertainty_km,
            "uncertainty_polygon_geojson": uncertainty_polygon,
            "classification": "MODELLED FORWARD FORECAST",
        },
        "forecast_hours": hours_forward,
        "forward_path": forward_path,
        "environmental_parameters": env.to_dict(),
        "disclaimer": "Modelled forward forecast trajectory under demonstration environmental forcing.",
    }
