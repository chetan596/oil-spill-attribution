"""
Metocean Drift & Reverse Hindcasting Engine.
Part 0.13C / Phase 16.4 Part 5 - Ocean Guard AI

Computes Lagrangian hydrodynamic backward hindcast trajectories and forward dispersion
forecasts for SAR candidate dark formations using coupled surface wind leeway and ocean currents.

Scientific Guardrails:
- Modelled origin and trajectories are strictly MODELLED (never confirmed spill source or discharge location).
- Vessel causality and legal liability are NOT established.
- AIS attribution and LLM synthesis are NOT evaluated in this phase.
- Provenance strictly separates REAL_HINDCAST, REAL_REANALYSIS_FORWARD, REAL_MULTI_OBSERVATION_CURRENT,
  REAL_ARCHIVED_FORECAST, REAL_FORECAST, and DEMO.
- Synthetic demo values are NEVER relabeled as real reanalysis.
- Canonical internal velocity unit is strictly meters per second (m/s).
"""

import os
import math
import time
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple, Union

from app.drift.environmental import (
    EnvironmentalParameters,
    KNOTS_TO_MS,
    KNOTS_TO_KMH,
    MS_TO_KNOTS
)
from app.drift.uncertainty import (
    calculate_uncertainty_radius_km,
    generate_uncertainty_polygon_geojson,
    DEFAULT_EDDY_DIFFUSIVITY_M2S,
    INITIAL_OBSERVATION_UNCERTAINTY_KM
)
from app.drift.metocean import (
    HourlyForcingPoint,
    MetoceanForcingSeries,
    MetoceanProvenance,
    get_metocean_forcing,
    generate_demo_forcing_series,
    MetoceanCredentialsMissingError,
    MetoceanDataUnavailableError,
    MetoceanAdapterError,
)

logger = logging.getLogger(__name__)

KM_PER_DEG_LAT = 111.139  # km per degree of latitude
EARTH_RADIUS_METERS = 6371000.0


class DriftEngineError(Exception):
    """Raised when drift simulation input or integration fails."""
    pass


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great-circle distance between two points in kilometers using the Haversine formula.
    """
    earth_radius_km = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2))
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(earth_radius_km * c, 4)


def initial_compass_bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the initial compass bearing from point 1 to point 2 in degrees (0-360, clockwise from North).
    """
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_lambda = math.radians(lon2 - lon1)

    x = math.sin(delta_lambda) * math.cos(phi2)
    y = math.cos(phi1) * math.sin(phi2) - (math.sin(phi1) * math.cos(phi2) * math.cos(delta_lambda))
    initial_bearing_rad = math.atan2(x, y)
    bearing_deg = (math.degrees(initial_bearing_rad) + 360.0) % 360.0
    return round(bearing_deg, 2)


def compute_displacement_from_velocity_ms(
    lat: float,
    lng: float,
    u_ms: float,
    v_ms: float,
    dt_seconds: float,
) -> Tuple[float, float]:
    """
    Compute updated geographic coordinates (lat, lng) given velocity in m/s over dt_seconds.
    u_ms: Eastward velocity component (m/s)
    v_ms: Northward velocity component (m/s)
    dt_seconds: Time interval in seconds
    """
    d_north_m = v_ms * dt_seconds
    d_east_m = u_ms * dt_seconds

    d_lat_deg = (d_north_m / EARTH_RADIUS_METERS) * (180.0 / math.pi)
    avg_lat_rad = math.radians(lat + d_lat_deg / 2.0)
    cos_lat = math.cos(avg_lat_rad)
    if abs(cos_lat) < 1e-6:
        cos_lat = 1e-6

    d_lng_deg = (d_east_m / (EARTH_RADIUS_METERS * cos_lat)) * (180.0 / math.pi)

    new_lat = round(lat + d_lat_deg, 6)
    new_lng = round(lng + d_lng_deg, 6)
    return new_lat, new_lng


def compute_geographic_displacement(
    lat: float,
    lng: float,
    u_kmh: float,
    v_kmh: float,
    dt_hours: float,
) -> Tuple[float, float]:
    """
    Legacy helper: Compute updated geographic coordinates (lat, lng) given velocity components in km/h.
    """
    u_ms = u_kmh / 3.6
    v_ms = v_kmh / 3.6
    return compute_displacement_from_velocity_ms(lat, lng, u_ms, v_ms, dt_hours * 3600.0)


def align_metocean_forcing(
    sar_time: datetime,
    env_params: Optional[Dict[str, Any]] = None,
    source_type: str = "REAL_CDSE"
) -> Tuple[EnvironmentalParameters, Dict[str, Any]]:
    """
    Align meteorological and oceanographic forcing parameters with SAR acquisition timestamp.
    Validates temporal offset and formats spatial resolution documentation.
    """
    env = EnvironmentalParameters()
    if env_params:
        if "wind_speed_kts" in env_params and env_params["wind_speed_kts"] is not None:
            env.wind_speed_kts = float(env_params["wind_speed_kts"])
        elif "wind_speed_ms" in env_params and env_params["wind_speed_ms"] is not None:
            env.wind_speed_kts = float(env_params["wind_speed_ms"]) * MS_TO_KNOTS

        if "wind_direction_deg" in env_params and env_params["wind_direction_deg"] is not None:
            env.wind_direction_deg = float(env_params["wind_direction_deg"])

        if "current_speed_kts" in env_params and env_params["current_speed_kts"] is not None:
            env.current_speed_kts = float(env_params["current_speed_kts"])
        elif "current_speed_ms" in env_params and env_params["current_speed_ms"] is not None:
            env.current_speed_kts = float(env_params["current_speed_ms"]) * MS_TO_KNOTS

        if "current_direction_deg" in env_params and env_params["current_direction_deg"] is not None:
            env.current_direction_deg = float(env_params["current_direction_deg"])

        if "windage_leeway_factor" in env_params and env_params["windage_leeway_factor"] is not None:
            env.windage_leeway_factor = float(env_params["windage_leeway_factor"])
        elif "windage_factor" in env_params and env_params["windage_factor"] is not None:
            env.windage_leeway_factor = float(env_params["windage_factor"])

        if "source" in env_params and env_params["source"]:
            env.source = str(env_params["source"])

    if source_type == "DEMO" or env.source == "demo":
        env.source = "DEMO"
        metocean_source_label = "DEMONSTRATION (source: demo)"
        temporal_offset_hours = 0.0
    else:
        metocean_source_label = f"REAL METOCEAN ({env.source})"
        temporal_offset_hours = round(float(env_params.get("temporal_offset_hours", 0.5)), 2) if env_params else 0.5

    metocean_meta = {
        "source": env.source,
        "sourceClassification": metocean_source_label,
        "temporalOffsetHours": temporal_offset_hours,
        "spatialResolutionNote": "ERA5 10-m surface wind is an atmospheric measurement height, resampled from coarse reanalysis grid (~25 km) to target domain.",
        "temporalAlignmentNote": "Wind forcing represents hourly/reanalysis state; daily SST fields represent contextual mean.",
        "wind": {
            "speedKts": env.wind_speed_kts,
            "speedMs": round(env.wind_speed_kts * KNOTS_TO_MS, 2),
            "directionFromDeg": env.wind_direction_deg,
            "windageLeewayFactor": env.windage_leeway_factor,
        },
        "current": {
            "speedKts": env.current_speed_kts,
            "speedMs": round(env.current_speed_kts * KNOTS_TO_MS, 2),
            "directionTowardsDeg": env.current_direction_deg,
        }
    }

    return env, metocean_meta


def generate_drift_trajectory_path(
    start_lat: float,
    start_lng: float,
    start_time: datetime,
    hours: int,
    env: Optional[EnvironmentalParameters] = None,
    forcing_points: Optional[List[HourlyForcingPoint]] = None,
    phase: str = "backward",
    step_minutes: int = 60,
    windage_leeway_factor: float = 0.030,
) -> List[Dict[str, Any]]:
    """
    Integrate Lagrangian advection trajectory step-by-step with temporal and uncertainty tracking.
    Supports either time-resolved HourlyForcingPoint[] or fallback EnvironmentalParameters.
    Canonical velocity units are m/s.
    """
    steps = max(1, int((hours * 60) / step_minutes))
    dt_seconds = step_minutes * 60.0
    dt_hours = step_minutes / 60.0

    current_lat = start_lat
    current_lng = start_lng
    current_time = start_time

    path: List[Dict[str, Any]] = []
    initial_uncertainty = calculate_uncertainty_radius_km(0.0)

    # Determine initial velocity vector
    if forcing_points and len(forcing_points) > 0:
        p0 = forcing_points[0]
        u_drift_ms = p0.current_u + windage_leeway_factor * p0.wind_u
        v_drift_ms = p0.current_v + windage_leeway_factor * p0.wind_v
        curr_dataset = p0.current_dataset
        wind_ds = p0.wind_dataset
    elif env:
        u_kmh, v_kmh = env.get_drift_velocity_components_kmh()
        u_drift_ms = u_kmh / 3.6
        v_drift_ms = v_kmh / 3.6
        curr_dataset = env.scenario_name
        wind_ds = env.scenario_name
    else:
        u_drift_ms = 0.0
        v_drift_ms = 0.0
        curr_dataset = "UNKNOWN"
        wind_ds = "UNKNOWN"

    total_speed_ms = math.sqrt(u_drift_ms**2 + v_drift_ms**2)
    total_speed_kmh = total_speed_ms * 3.6
    total_speed_kts = total_speed_ms * MS_TO_KNOTS
    heading_deg = (math.degrees(math.atan2(u_drift_ms, v_drift_ms)) + 360.0) % 360.0

    # Initial anchor waypoint
    path.append({
        "seqIndex": 0,
        "latitude": round(current_lat, 6),
        "longitude": round(current_lng, 6),
        "lat": round(current_lat, 6),
        "lng": round(current_lng, 6),
        "timestamp": current_time.isoformat(),
        "elapsedHours": 0.0,
        "cumulativeDisplacementKm": 0.0,
        "uncertaintyRadiusKm": initial_uncertainty,
        "driftSpeedMs": round(total_speed_ms, 3),
        "driftSpeedKmh": round(total_speed_kmh, 2),
        "driftSpeedKts": round(total_speed_kts, 2),
        "driftHeadingDeg": round(heading_deg, 1),
        "phase": phase,
        "status": "OBSERVED" if phase == "backward" else "MODELLED",
        "forcing": {
            "currentU": round(u_drift_ms, 4),
            "currentV": round(v_drift_ms, 4),
            "unit": "m/s",
            "currentDataset": curr_dataset,
            "windDataset": wind_ds,
        }
    })

    cumulative_dist_km = 0.0
    prev_lat, prev_lng = current_lat, current_lng

    for step in range(1, steps + 1):
        delta_t = timedelta(minutes=step_minutes)

        # Retrieve forcing vector for this timestep
        if forcing_points and len(forcing_points) > 0:
            # Pick forcing point closest to current step
            idx = min(step - 1, len(forcing_points) - 1)
            f_pt = forcing_points[idx]
            u_step_ms = f_pt.current_u + windage_leeway_factor * f_pt.wind_u
            v_step_ms = f_pt.current_v + windage_leeway_factor * f_pt.wind_v
            pt_cur_u = f_pt.current_u
            pt_cur_v = f_pt.current_v
            pt_wind_u = f_pt.wind_u
            pt_wind_v = f_pt.wind_v
            pt_cur_ds = f_pt.current_dataset
            pt_wind_ds = f_pt.wind_dataset
        else:
            u_step_ms = u_drift_ms
            v_step_ms = v_drift_ms
            pt_cur_u = u_drift_ms
            pt_cur_v = v_drift_ms
            pt_wind_u = 0.0
            pt_wind_v = 0.0
            pt_cur_ds = curr_dataset
            pt_wind_ds = wind_ds

        step_speed_ms = math.sqrt(u_step_ms**2 + v_step_ms**2)
        step_speed_kmh = step_speed_ms * 3.6
        step_speed_kts = step_speed_ms * MS_TO_KNOTS
        step_heading = (math.degrees(math.atan2(u_step_ms, v_step_ms)) + 360.0) % 360.0

        if phase == "backward":
            current_time = current_time - delta_t
            # Reverse advection displacement: x(t - dt) = x(t) - u(t)*dt
            current_lat, current_lng = compute_displacement_from_velocity_ms(
                current_lat, current_lng, -u_step_ms, -v_step_ms, dt_seconds
            )
        else:
            current_time = current_time + delta_t
            # Forward advection displacement: x(t + dt) = x(t) + u(t)*dt
            current_lat, current_lng = compute_displacement_from_velocity_ms(
                current_lat, current_lng, u_step_ms, v_step_ms, dt_seconds
            )

        step_dist = haversine_distance_km(prev_lat, prev_lng, current_lat, current_lng)
        cumulative_dist_km += step_dist
        prev_lat, prev_lng = current_lat, current_lng

        elapsed_h = step * dt_hours
        uncertainty_km = calculate_uncertainty_radius_km(elapsed_h)

        path.append({
            "seqIndex": step,
            "latitude": round(current_lat, 6),
            "longitude": round(current_lng, 6),
            "lat": round(current_lat, 6),
            "lng": round(current_lng, 6),
            "timestamp": current_time.isoformat(),
            "elapsedHours": round(elapsed_h, 2),
            "cumulativeDisplacementKm": round(cumulative_dist_km, 3),
            "uncertaintyRadiusKm": uncertainty_km,
            "driftSpeedMs": round(step_speed_ms, 3),
            "driftSpeedKmh": round(step_speed_kmh, 2),
            "driftSpeedKts": round(step_speed_kts, 2),
            "driftHeadingDeg": round(step_heading, 1),
            "phase": phase,
            "status": "MODELLED",
            "forcing": {
                "currentU": round(pt_cur_u, 4),
                "currentV": round(pt_cur_v, 4),
                "windU": round(pt_wind_u, 4),
                "windV": round(pt_wind_v, 4),
                "unit": "m/s",
                "currentDataset": pt_cur_ds,
                "windDataset": pt_wind_ds,
            }
        })

    return path


def execute_candidate_drift_analysis(
    observed_lat: float,
    observed_lng: float,
    detection_time: Optional[Union[datetime, str]] = None,
    hours_back: int = 24,
    hours_forward: int = 6,
    env_params: Optional[Dict[str, Any]] = None,
    source_metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Execute structured metocean drift and reverse hindcast simulation for a candidate spill centroid.
    Enforces authentic T0 gating, SI m/s velocity units, and transparent provenance taxonomy.
    """
    t_start = time.perf_counter()

    if observed_lat is None or observed_lng is None:
        raise DriftEngineError("Observed centroid coordinates (latitude, longitude) are required.")

    if not (-90.0 <= observed_lat <= 90.0 and -180.0 <= observed_lng <= 180.0):
        raise DriftEngineError(f"Observed coordinates ({observed_lat}, {observed_lng}) are out of geographic bounds.")

    src_meta = source_metadata or {}
    source_type = src_meta.get("sourceType", "UPLOADED_REAL_SAR")
    scene_id = src_meta.get("sceneId", "candidate_spill_scene")
    is_demo_mode = (os.environ.get("DEMO_MODE", "true").strip().lower() == "true")

    # ── Temporal Gating ──────────────────────────────────────────────────────────
    if detection_time is None or (isinstance(detection_time, str) and not detection_time.strip()):
        if source_type != "DEMO" and not is_demo_mode:
            raise DriftEngineError(
                "METOCEAN_TIMESTAMP_REQUIRED: An authentic acquisition timestamp T0 is mandatory "
                "for real oceanographic and meteorological forcing."
            )
        detection_dt = datetime.now(timezone.utc)
    elif isinstance(detection_time, str):
        try:
            detection_dt = datetime.fromisoformat(detection_time.replace("Z", "+00:00"))
        except Exception:
            if source_type != "DEMO" and not is_demo_mode:
                raise DriftEngineError("METOCEAN_TIMESTAMP_REQUIRED: Invalid ISO acquisition timestamp T0.")
            detection_dt = datetime.now(timezone.utc)
    elif isinstance(detection_time, datetime):
        detection_dt = detection_time
    else:
        if source_type != "DEMO" and not is_demo_mode:
            raise DriftEngineError("METOCEAN_TIMESTAMP_REQUIRED: Invalid acquisition timestamp object.")
        detection_dt = datetime.now(timezone.utc)

    if detection_dt.tzinfo is None:
        detection_dt = detection_dt.replace(tzinfo=timezone.utc)
    else:
        detection_dt = detection_dt.astimezone(timezone.utc)

    # ── Acquire Metocean Forcing Series ──────────────────────────────────────────
    t_met_start = time.perf_counter()
    forcing_series: Optional[MetoceanForcingSeries] = None
    windage_leeway_factor = 0.030

    if env_params:
        if "windage_leeway_factor" in env_params and env_params["windage_leeway_factor"] is not None:
            windage_leeway_factor = float(env_params["windage_leeway_factor"])
        elif "windage_factor" in env_params and env_params["windage_factor"] is not None:
            windage_leeway_factor = float(env_params["windage_factor"])

    # If explicit forcing points were supplied in env_params (e.g. unit testing)
    if env_params and "forcing_points" in env_params:
        f_pts = env_params["forcing_points"]
        b_pts = [p for p in f_pts if p.timestamp <= detection_dt]
        f_pts_fwd = [p for p in f_pts if p.timestamp > detection_dt]
        prov_label = env_params.get("forcing_provenance", "REAL_MULTI_OBSERVATION_CURRENT")
        prov = MetoceanProvenance(
            forcing_provenance=prov_label,
            provider_current=env_params.get("current_source", "COPERNICUS_MARINE"),
            provider_wind=env_params.get("wind_source", "ECMWF_CDS"),
            dataset_current=env_params.get("current_dataset", "cmems_obs-mob_glo_phy-cur_my_0.25deg_PT1H-i"),
            dataset_wind=env_params.get("wind_dataset", "reanalysis-era5-single-levels"),
            current_forcing_definition="Geostrophic + Tidal current coupled with 3% wind leeway",
            coverage_start=(detection_dt - timedelta(hours=hours_back)).isoformat(),
            coverage_end=(detection_dt + timedelta(hours=hours_forward)).isoformat(),
        )
        forcing_series = MetoceanForcingSeries(
            status="SUCCESS",
            provenance=prov,
            backward_points=b_pts,
            forward_points=f_pts_fwd,
        )
    elif env_params and env_params.get("source") == "demo":
        w_kts = float(env_params.get("wind_speed_kts", 12.4))
        w_deg = float(env_params.get("wind_direction_deg", 315.0))
        c_kts = float(env_params.get("current_speed_kts", 0.8))
        c_deg = float(env_params.get("current_direction_deg", 125.0))
        forcing_series = generate_demo_forcing_series(
            latitude=observed_lat,
            longitude=observed_lng,
            t0=detection_dt,
            hours_back=hours_back,
            hours_forward=hours_forward,
            wind_speed_kts=w_kts,
            wind_direction_deg=w_deg,
            current_speed_kts=c_kts,
            current_direction_deg=c_deg,
        )
    else:
        try:
            forcing_series = get_metocean_forcing(
                latitude=observed_lat,
                longitude=observed_lng,
                t0=detection_dt,
                hours_back=hours_back,
                hours_forward=hours_forward,
                demo_mode_override=is_demo_mode if source_type != "DEMO" else True,
            )
        except MetoceanCredentialsMissingError as e:
            logger.warning("[SpillDriftEngine] Provider credentials missing: %s", str(e))
            raise DriftEngineError(f"METOCEAN_PROVIDER_CONFIGURATION_REQUIRED: {str(e)}")
        except MetoceanDataUnavailableError as e:
            logger.warning("[SpillDriftEngine] Provider data unavailable: %s", str(e))
            raise DriftEngineError(f"METOCEAN_DATA_UNAVAILABLE: {str(e)}")
        except MetoceanAdapterError as e:
            raise DriftEngineError(str(e))

    t_met_ms = round((time.perf_counter() - t_met_start) * 1000, 2)

    # ── Backward Reverse Hindcast ────────────────────────────────────────────────
    t_back_start = time.perf_counter()
    backward_path = generate_drift_trajectory_path(
        start_lat=observed_lat,
        start_lng=observed_lng,
        start_time=detection_dt,
        hours=hours_back,
        forcing_points=forcing_series.backward_points if forcing_series else None,
        phase="backward",
        step_minutes=60,
        windage_leeway_factor=windage_leeway_factor,
    )
    t_back_ms = round((time.perf_counter() - t_back_start) * 1000, 2)

    # ── Forward Trajectory ───────────────────────────────────────────────────────
    t_fwd_start = time.perf_counter()
    forward_path = generate_drift_trajectory_path(
        start_lat=observed_lat,
        start_lng=observed_lng,
        start_time=detection_dt,
        hours=hours_forward,
        forcing_points=forcing_series.forward_points if forcing_series else None,
        phase="forward",
        step_minutes=60,
        windage_leeway_factor=windage_leeway_factor,
    )
    t_fwd_ms = round((time.perf_counter() - t_fwd_start) * 1000, 2)

    # ── Modelled Origin Extraction ───────────────────────────────────────────────
    origin_point = backward_path[-1]
    origin_lat = origin_point["latitude"]
    origin_lng = origin_point["longitude"]
    origin_time_str = origin_point["timestamp"]
    origin_uncertainty_km = origin_point["uncertaintyRadiusKm"]

    uncertainty_polygon = generate_uncertainty_polygon_geojson(
        center_lat=origin_lat,
        center_lng=origin_lng,
        radius_km=origin_uncertainty_km
    )

    # ── Derived Metrics ──────────────────────────────────────────────────────────
    net_distance_km = haversine_distance_km(observed_lat, observed_lng, origin_lat, origin_lng)
    bearing_from_origin = initial_compass_bearing_deg(origin_lat, origin_lng, observed_lat, observed_lng)

    initial_forcing = backward_path[0]["forcing"]
    mean_speed_ms = backward_path[0]["driftSpeedMs"]
    mean_speed_kmh = backward_path[0]["driftSpeedKmh"]
    mean_speed_kts = backward_path[0]["driftSpeedKts"]

    # ── Provenance Taxonomy ──────────────────────────────────────────────────────
    prov_meta = forcing_series.provenance if forcing_series else None
    backward_provenance = prov_meta.forcing_provenance if prov_meta else ("DEMO" if is_demo_mode else "NOT_AVAILABLE")

    # Forward provenance: ERA5 on historical scenes is REAL_REANALYSIS_FORWARD, NOT REAL_FORECAST
    now_utc = datetime.now(timezone.utc)
    is_historical_scene = (now_utc - detection_dt).total_seconds() > 86400

    if backward_provenance == "DEMO":
        forward_provenance = "DEMO"
    elif is_historical_scene:
        forward_provenance = "REAL_REANALYSIS_FORWARD"
    else:
        forward_provenance = "REAL_FORECAST"

    metocean_info = {
        "source": backward_provenance,
        "sourceClassification": f"REAL METOCEAN ({backward_provenance})" if backward_provenance != "DEMO" else "DEMONSTRATION (source: demo)",
        "forcingProvenance": backward_provenance,
        "forwardProvenance": forward_provenance,
        "provider": {
            "current": prov_meta.provider_current if prov_meta else "DEMO",
            "wind": prov_meta.provider_wind if prov_meta else "DEMO",
        },
        "datasets": {
            "current": prov_meta.dataset_current if prov_meta else "DEMO",
            "wind": prov_meta.dataset_wind if prov_meta else "DEMO",
        },
        "currentForcingDefinition": prov_meta.current_forcing_definition if prov_meta else "Demonstration",
        "spatialResolution": {
            "current": prov_meta.spatial_resolution_current if prov_meta else "synthetic",
            "wind": prov_meta.spatial_resolution_wind if prov_meta else "synthetic",
        },
        "temporalResolution": "1h",
        "units": {
            "current": "m/s",
            "wind": "m/s",
            "sourceUnit": "m/s" if backward_provenance != "DEMO" else "knots",
            "conversionApplied": False if backward_provenance != "DEMO" else True,
        },
        "windageLeewayFactor": windage_leeway_factor,
        "coverage": {
            "start": prov_meta.coverage_start if prov_meta else None,
            "end": prov_meta.coverage_end if prov_meta else None,
        }
    }

    # ── GeoJSON FeatureCollection ────────────────────────────────────────────────
    t_geo_start = time.perf_counter()
    geojson_features = [
        {
            "type": "Feature",
            "id": "observed_sar_centroid",
            "geometry": {
                "type": "Point",
                "coordinates": [round(observed_lng, 6), round(observed_lat, 6)]
            },
            "properties": {
                "name": "Observed Oil Slick Centroid",
                "category": "OBSERVED",
                "source": "Sentinel-1 SAR",
                "sceneId": scene_id,
                "timestamp": detection_dt.isoformat(),
                "latitude": round(observed_lat, 6),
                "longitude": round(observed_lng, 6),
            }
        },
        {
            "type": "Feature",
            "id": "modeled_spill_origin",
            "geometry": {
                "type": "Point",
                "coordinates": [round(origin_lng, 6), round(origin_lat, 6)]
            },
            "properties": {
                "name": "Modelled Spill Origin",
                "category": "MODELLED",
                "timestamp": origin_time_str,
                "hoursBack": hours_back,
                "displacementKm": net_distance_km,
                "uncertaintyRadiusKm": origin_uncertainty_km,
                "latitude": round(origin_lat, 6),
                "longitude": round(origin_lng, 6),
                "status": "MODELLED_SPILL_ORIGIN",
                "forcingProvenance": backward_provenance,
            }
        },
        {
            "type": "Feature",
            "id": "modeled_origin_uncertainty_envelope",
            "geometry": uncertainty_polygon,
            "properties": {
                "name": "Modelled Origin Uncertainty Radius",
                "category": "MODELLED",
                "radiusKm": origin_uncertainty_km,
                "description": "Modelled horizontal turbulent eddy diffusion dispersion boundary."
            }
        },
        {
            "type": "Feature",
            "id": "modeled_backward_hindcast_trajectory",
            "geometry": {
                "type": "LineString",
                "coordinates": [[pt["lng"], pt["lat"]] for pt in backward_path]
            },
            "properties": {
                "name": "Modelled Backward Hindcast Trajectory",
                "category": "MODELLED",
                "hoursBack": hours_back,
                "waypointsCount": len(backward_path),
                "netDistanceKm": net_distance_km,
                "forcingProvenance": backward_provenance,
                "currentDataset": metocean_info["datasets"]["current"],
                "windDataset": metocean_info["datasets"]["wind"],
                "units": "m/s",
            }
        },
        {
            "type": "Feature",
            "id": "modeled_forward_forecast_trajectory",
            "geometry": {
                "type": "LineString",
                "coordinates": [[pt["lng"], pt["lat"]] for pt in forward_path]
            },
            "properties": {
                "name": "Modelled Forward Forecast Trajectory",
                "category": "MODELLED",
                "hoursForward": hours_forward,
                "waypointsCount": len(forward_path),
                "forcingProvenance": forward_provenance,
                "currentDataset": metocean_info["datasets"]["current"],
                "windDataset": metocean_info["datasets"]["wind"],
                "units": "m/s",
            }
        }
    ]

    geojson_collection = {
        "type": "FeatureCollection",
        "features": geojson_features,
        "metadata": {
            "sceneId": scene_id,
            "sourceType": source_type,
            "crs": "EPSG:4326",
            "observedTimestamp": detection_dt.isoformat(),
            "modeledOriginTimestamp": origin_time_str,
            "forcingProvenance": backward_provenance,
            "forwardProvenance": forward_provenance,
        }
    }
    t_geo_ms = round((time.perf_counter() - t_geo_start) * 1000, 2)
    t_total_ms = round((time.perf_counter() - t_start) * 1000, 2)

    from app.drift.gnome_runner import ENGINE_LABEL

    return {
        "status": "success",
        "sceneId": scene_id,
        "sourceType": source_type,
        "engine": ENGINE_LABEL,
        "observed": {
            "centroid": {
                "latitude": round(observed_lat, 6),
                "longitude": round(observed_lng, 6),
            },
            "centroidGeometry": {
                "type": "Point",
                "coordinates": [round(observed_lng, 6), round(observed_lat, 6)]
            },
            "timestamp": detection_dt.isoformat(),
            "source": "Sentinel-1 SAR",
            "status": "OBSERVED"
        },
        "metocean": metocean_info,
        "drift": {
            "mode": "BACKWARD_HINDCAST",
            "status": "MODELLED",
            "timeWindowHours": hours_back,
            "forecastWindowHours": hours_forward,
            "forcingProvenance": backward_provenance,
            "forwardProvenance": forward_provenance,
            "modeledOrigin": {
                "latitude": round(origin_lat, 6),
                "longitude": round(origin_lng, 6),
                "timestamp": origin_time_str,
                "uncertaintyRadiusKm": origin_uncertainty_km,
                "uncertaintyPolygonGeojson": uncertainty_polygon,
                "status": "MODELLED_SPILL_ORIGIN"
            },
            "uncertaintyRadiusKm": origin_uncertainty_km,
            "backwardPath": backward_path,
            "forwardPath": forward_path
        },
        "derived": {
            "netDriftDistanceKm": net_distance_km,
            "elapsedTimeHours": float(hours_back),
            "meanDriftSpeedMs": mean_speed_ms,
            "meanDriftSpeedKmh": mean_speed_kmh,
            "meanDriftSpeedKts": mean_speed_kts,
            "driftBearingDeg": bearing_from_origin,
            "status": "DERIVED"
        },
        "scientificGuardrails": {
            "aisAttribution": "NOT_IMPLEMENTED",
            "vesselResponsibility": "NOT_ESTABLISHED",
            "dischargeLocationConfirmation": "NOT_ESTABLISHED",
            "llmSynthesis": "NOT_IMPLEMENTED",
            "analyticalLimitation": "Modelled origin and backward trajectory represent exploratory physical Lagrangian advection under specified metocean forcing; they do NOT constitute confirmed discharge location, time, vessel causality, or legal liability."
        },
        "geojson": geojson_collection,
        "performance": {
            "metoceanRetrievalDurationMs": t_met_ms,
            "backwardIntegrationDurationMs": t_back_ms,
            "forwardIntegrationDurationMs": t_fwd_ms,
            "geoJsonGenerationDurationMs": t_geo_ms,
            "totalDriftDurationMs": t_total_ms
        },
        "disclaimer": "Attribution scores and modelled origins represent exploratory physical simulations. They do not constitute legal proof of spill discharge."
    }
