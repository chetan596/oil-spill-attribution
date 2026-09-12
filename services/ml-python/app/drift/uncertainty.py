"""
Drift Uncertainty & Dispersion Module (Phase 5)

Computes modelled spatial dispersion uncertainty using horizontal turbulent diffusion:
  sigma(t) = sqrt(2 * K_h * t) + sigma_0
where:
  K_h = horizontal eddy diffusion coefficient (typically 1.0 to 10.0 m^2/s)
  t = elapsed simulation time in seconds
  sigma_0 = initial detection observation uncertainty

TERMINOLOGY NOTICE:
Termed strictly as "Modelled Origin Uncertainty Radius"
(not "proven confidence interval" or "ground-truth boundary").
"""

import math
from typing import List, Dict, Any, Tuple

DEFAULT_EDDY_DIFFUSIVITY_M2S = 5.0  # m^2/s (Standard coastal/shelf oceanography default)
INITIAL_OBSERVATION_UNCERTAINTY_KM = 0.5  # 500m initial SAR centroid uncertainty


def calculate_uncertainty_radius_km(
    elapsed_hours: float,
    eddy_diffusivity_m2s: float = DEFAULT_EDDY_DIFFUSIVITY_M2S,
    initial_uncertainty_km: float = INITIAL_OBSERVATION_UNCERTAINTY_KM,
) -> float:
    """
    Calculate the modelled diffusion dispersion uncertainty radius in kilometers.

    Args:
        elapsed_hours: Elapsed simulation time (hours).
        eddy_diffusivity_m2s: Horizontal eddy diffusivity K_h in m^2/s.
        initial_uncertainty_km: Initial detection spatial uncertainty (km).

    Returns:
        float: Modelled origin uncertainty radius in kilometers.
    """
    if elapsed_hours <= 0:
        return initial_uncertainty_km

    elapsed_seconds = elapsed_hours * 3600.0
    # sigma = sqrt(2 * K * t) in meters
    diffusion_radius_meters = math.sqrt(2.0 * eddy_diffusivity_m2s * elapsed_seconds)
    diffusion_radius_km = diffusion_radius_meters / 1000.0

    total_radius_km = initial_uncertainty_km + diffusion_radius_km
    return round(total_radius_km, 4)


def generate_uncertainty_polygon_geojson(
    center_lat: float,
    center_lng: float,
    radius_km: float,
    num_points: int = 32,
) -> Dict[str, Any]:
    """
    Generate a circular GeoJSON Polygon representing the Modelled Origin Uncertainty Radius.

    Args:
        center_lat: Centroid latitude.
        center_lng: Centroid longitude.
        radius_km: Uncertainty radius in km.
        num_points: Number of vertices in the polygon ring.

    Returns:
        Dict: GeoJSON Polygon geometry.
    """
    # Earth radius in km
    earth_radius_km = 6371.0
    lat_rad = math.radians(center_lat)
    lng_rad = math.radians(center_lng)
    angular_dist = radius_km / earth_radius_km

    ring: List[List[float]] = []

    for i in range(num_points):
        bearing = (2.0 * math.pi * i) / num_points
        pt_lat_rad = math.asin(
            math.sin(lat_rad) * math.cos(angular_dist)
            + math.cos(lat_rad) * math.sin(angular_dist) * math.cos(bearing)
        )
        pt_lng_rad = lng_rad + math.atan2(
            math.sin(bearing) * math.sin(angular_dist) * math.cos(lat_rad),
            math.cos(angular_dist) - math.sin(lat_rad) * math.sin(pt_lat_rad),
        )

        pt_lat = math.degrees(pt_lat_rad)
        pt_lng = math.degrees(pt_lng_rad)
        ring.append([round(pt_lng, 6), round(pt_lat, 6)])

    # Close the polygon ring
    ring.append(ring[0])

    return {
        "type": "Polygon",
        "coordinates": [ring],
    }
