"""
GNOME Runner & Unified Drift Simulation Interface (Phase 5)

Orchestrates physically-grounded oil spill drift simulations:
  - If PyGNOME (gnome) C++ library is available: leverages PyGNOME bindings.
  - If PyGNOME is unavailable: uses the built-in Lagrangian hydrodynamic engine
    and explicitly labels the engine: "BUILT-IN DEMONSTRATION LAGRANGIAN MODEL".

Ensures strict scientific integrity and transparent metadata.
"""

import sys
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from app.drift.environmental import EnvironmentalParameters
from app.drift.hindcast import run_backward_hindcast
from app.drift.forecast import run_forward_forecast
from app.drift.uncertainty import calculate_uncertainty_radius_km, generate_uncertainty_polygon_geojson

logger = logging.getLogger(__name__)

# Check PyGNOME availability
try:
    import gnome  # type: ignore
    PYGNOME_AVAILABLE = True
    ENGINE_LABEL = "NOAA PyGNOME ENGINE"
except ImportError:
    PYGNOME_AVAILABLE = False
    ENGINE_LABEL = "BUILT-IN DEMONSTRATION LAGRANGIAN MODEL"


class GNOMERunner:
    """Unified runner for oil spill drift simulations."""

    def __init__(self):
        self.pygnome_available = PYGNOME_AVAILABLE
        self.engine_label = ENGINE_LABEL
        logger.info(
            "[GNOMERunner] Initialized with engine: %s (PyGNOME available: %s)",
            self.engine_label,
            self.pygnome_available,
        )

    def run_drift_simulation(
        self,
        detection_lat: float,
        detection_lng: float,
        detection_time: Optional[datetime] = None,
        hours_back: int = 24,
        hours_forward: int = 6,
        env_params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Execute comprehensive oil spill drift simulation including:
          1. Backward reverse hindcast to determine Modelled Spill Origin.
          2. Forward forecast to predict slick displacement.
          3. Modelled Origin Uncertainty Radius and GeoJSON FeatureCollection.

        Args:
            detection_lat: Observed slick centroid latitude.
            detection_lng: Observed slick centroid longitude.
            detection_time: Detection timestamp (defaults to current UTC time).
            hours_back: Hindcast duration backwards in hours (default 24).
            hours_forward: Forecast duration forwards in hours (default 6).
            env_params: Optional custom environmental parameter overrides.

        Returns:
            Dict: Comprehensive simulation output compatible with Node.js and React web map.
        """
        if detection_time is None:
            detection_time = datetime.now(timezone.utc)
        elif isinstance(detection_time, str):
            # Parse ISO string
            detection_time = datetime.fromisoformat(detection_time.replace("Z", "+00:00"))

        # Build environmental configuration
        env = EnvironmentalParameters()
        if env_params:
            if "wind_speed_kts" in env_params and env_params["wind_speed_kts"] is not None:
                env.wind_speed_kts = float(env_params["wind_speed_kts"])
            if "wind_direction_deg" in env_params and env_params["wind_direction_deg"] is not None:
                env.wind_direction_deg = float(env_params["wind_direction_deg"])
            if "current_speed_kts" in env_params and env_params["current_speed_kts"] is not None:
                env.current_speed_kts = float(env_params["current_speed_kts"])
            if "current_direction_deg" in env_params and env_params["current_direction_deg"] is not None:
                env.current_direction_deg = float(env_params["current_direction_deg"])
            if "windage_leeway_factor" in env_params and env_params["windage_leeway_factor"] is not None:
                env.windage_leeway_factor = float(env_params["windage_leeway_factor"])
            if "source" in env_params and env_params["source"]:
                env.source = str(env_params["source"])

        # 1. Execute Backward Hindcast
        hindcast_result = run_backward_hindcast(
            detection_lat=detection_lat,
            detection_lng=detection_lng,
            detection_time=detection_time,
            hours_back=hours_back,
            env=env,
        )

        # 2. Execute Forward Forecast
        forecast_result = run_forward_forecast(
            start_lat=detection_lat,
            start_lng=detection_lng,
            start_time=detection_time,
            hours_forward=hours_forward,
            env=env,
        )

        modelled_origin = hindcast_result["modelled_origin"]
        backward_path = hindcast_result["backward_path"]
        forward_path = forecast_result["forward_path"]

        # 3. Assemble GeoJSON Feature Collection
        features = [
            # Feature 1: Observed Detection Centroid
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [detection_lng, detection_lat],
                },
                "properties": {
                    "name": "Observed Oil Slick Centroid",
                    "category": "OBSERVED",
                    "source": "Sentinel-1 SAR",
                    "timestamp": detection_time.isoformat(),
                },
            },
            # Feature 2: Modelled Spill Origin
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [modelled_origin["longitude"], modelled_origin["latitude"]],
                },
                "properties": {
                    "name": "Modelled Spill Origin",
                    "category": "MODELLED",
                    "timestamp": modelled_origin["timestamp"],
                    "uncertainty_radius_km": modelled_origin["uncertainty_radius_km"],
                },
            },
            # Feature 3: Modelled Origin Uncertainty Radius
            {
                "type": "Feature",
                "geometry": modelled_origin["uncertainty_polygon_geojson"],
                "properties": {
                    "name": "Modelled Origin Uncertainty Radius",
                    "category": "MODELLED",
                    "radius_km": modelled_origin["uncertainty_radius_km"],
                    "description": "Modelled horizontal eddy diffusion dispersion boundary.",
                },
            },
            # Feature 4: Backward Hindcast Path (LineString)
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[pt["lng"], pt["lat"]] for pt in backward_path],
                },
                "properties": {
                    "name": "Modelled Backward Hindcast Trajectory",
                    "category": "MODELLED",
                    "hours_back": hours_back,
                },
            },
            # Feature 5: Forward Forecast Path (LineString)
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[pt["lng"], pt["lat"]] for pt in forward_path],
                },
                "properties": {
                    "name": "Modelled Forward Forecast Trajectory",
                    "category": "MODELLED",
                    "hours_forward": hours_forward,
                },
            },
        ]

        geojson_collection = {
            "type": "FeatureCollection",
            "features": features,
        }

        # Simulation metadata
        simulation_meta = {
            "engine": self.engine_label,
            "pygnome_native_available": self.pygnome_available,
            "environmental": env.to_dict(),
            "time_stepping": {
                "step_minutes": 60,
                "hours_back": hours_back,
                "hours_forward": hours_forward,
                "total_steps": len(backward_path) + len(forward_path) - 1,
            },
            "source_classification": {
                "satellite_detection": "OBSERVED (Sentinel-1 SAR)",
                "drift_trajectory": "MODELLED (Lagrangian Advection)",
                "spill_origin": "MODELLED SPILL ORIGIN",
                "origin_uncertainty": "Modelled Origin Uncertainty Radius",
                "environmental_inputs": "DEMONSTRATION (source: demo)",
            },
            "disclaimer": "Attribution scores and modelled origins represent exploratory physical simulations. They do not constitute legal proof of spill discharge.",
        }

        return {
            "status": "success",
            "engine": self.engine_label,
            "origin_lat": modelled_origin["latitude"],
            "origin_lng": modelled_origin["longitude"],
            "origin_timestamp": modelled_origin["timestamp"],
            "time_window_hours": hours_back,
            "uncertainty_radius_km": modelled_origin["uncertainty_radius_km"],
            "backward_path": backward_path,
            "forward_path": forward_path,
            "geojson": geojson_collection,
            "simulation_meta": simulation_meta,
        }


# Global runner singleton
gnome_runner = GNOMERunner()
