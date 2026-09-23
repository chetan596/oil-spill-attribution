"""
AIS Vessel Trajectory Spatio-Temporal Correlation Engine.
Part 0.13D - Ocean Guard AI

Evaluates maritime Automatic Identification System (AIS) vessel trajectories against
the Part 0.13C modelled backward drift corridor and uncertainty envelope.

Scientific Guardrails:
- Produces AIS CORRELATION EVIDENCE based on spatio-temporal consistency.
- Strictly does NOT establish legal responsibility, confirmed discharge, intentional dumping, or liability.
- Prohibits terminology: RESPONSIBLE_VESSEL, CONFIRMED_VESSEL, GUILTY_VESSEL.
- Prohibits LLM synthesis in this phase.
- Explicitly isolates REAL and DEMO data streams.
"""

import math
import time
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple, Union

from app.drift.spill_drift_engine import haversine_distance_km, initial_compass_bearing_deg

logger = logging.getLogger(__name__)


class AISEngineError(Exception):
    """Raised when AIS correlation input validation or processing fails."""
    pass


class AISCorrelationConfig:
    """
    Versioned configuration for AIS trajectory spatio-temporal correlation.
    Externalizes analytical parameters and weights for reproducible research and audits.
    """
    def __init__(
        self,
        config_version: str = "v1.0.0",
        spatial_decay_scale_km: float = 15.0,
        temporal_decay_scale_hours: float = 6.0,
        trajectory_decay_scale_km: float = 12.0,
        gap_threshold_hours: float = 2.0,
        default_time_window_hours: float = 24.0,
        weight_spatial: float = 0.35,
        weight_temporal: float = 0.25,
        weight_trajectory: float = 0.25,
        weight_data_quality: float = 0.15,
    ):
        self.config_version = config_version
        self.spatial_decay_scale_km = float(spatial_decay_scale_km)
        self.temporal_decay_scale_hours = float(temporal_decay_scale_hours)
        self.trajectory_decay_scale_km = float(trajectory_decay_scale_km)
        self.gap_threshold_hours = float(gap_threshold_hours)
        self.default_time_window_hours = float(default_time_window_hours)
        self.weight_spatial = float(weight_spatial)
        self.weight_temporal = float(weight_temporal)
        self.weight_trajectory = float(weight_trajectory)
        self.weight_data_quality = float(weight_data_quality)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "configVersion": self.config_version,
            "parameters": {
                "spatialDecayScaleKm": self.spatial_decay_scale_km,
                "temporalDecayScaleHours": self.temporal_decay_scale_hours,
                "trajectoryDecayScaleKm": self.trajectory_decay_scale_km,
                "gapThresholdHours": self.gap_threshold_hours,
                "defaultTimeWindowHours": self.default_time_window_hours,
            },
            "weights": {
                "spatial": self.weight_spatial,
                "temporal": self.weight_temporal,
                "trajectory": self.weight_trajectory,
                "dataQuality": self.weight_data_quality,
            }
        }


DEFAULT_AIS_CONFIG = AISCorrelationConfig()


def parse_timestamp(ts: Union[str, datetime, int, float]) -> datetime:
    """
    Parse a datetime, ISO 8601 string, or Unix timestamp into UTC datetime.
    """
    if isinstance(ts, datetime):
        if ts.tzinfo is None:
            return ts.replace(tzinfo=timezone.utc)
        return ts.astimezone(timezone.utc)
    if isinstance(ts, (int, float)):
        # If milliseconds timestamp
        if ts > 1e11:
            ts = ts / 1000.0
        return datetime.fromtimestamp(ts, tz=timezone.utc)
    if isinstance(ts, str):
        cleaned = ts.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(cleaned)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
        except Exception:
            raise AISEngineError(f"Unable to parse timestamp: '{ts}'")
    raise AISEngineError(f"Unsupported timestamp format: {type(ts)}")


def calculate_point_to_linestring_min_distance(
    pt_lat: float,
    pt_lon: float,
    linestring_coords: List[List[float]]
) -> float:
    """
    Calculate the minimum geodesic distance (in km) from a point to any segment of a LineString.
    linestring_coords: list of [lon, lat] or (lat, lon) coordinates.
    """
    if not linestring_coords:
        return float("inf")

    min_dist = float("inf")
    for coord in linestring_coords:
        # Check coordinate format [lon, lat] vs (lat, lon)
        c_lon, c_lat = coord[0], coord[1]
        dist = haversine_distance_km(pt_lat, pt_lon, c_lat, c_lon)
        if dist < min_dist:
            min_dist = dist

    return round(min_dist, 4)


def calculate_vessel_cpa(
    track_points: List[Dict[str, Any]],
    target_lat: float,
    target_lon: float,
) -> Dict[str, Any]:
    """
    Calculate Closest Point of Approach (CPA) / Minimum Historical Distance for a vessel track
    relative to a stationary target point (modelled origin or observed centroid).

    Note on CPA Semantics:
        This metric calculates the minimum historical geodesic distance between discrete AIS
        positions and the stationary reference point. It is distinct from dynamic 2-body
        relative-motion CPA between two moving vessels.

    Returns:
        Dict with cpaDistanceKm, cpaTimestamp, cpaLatitude, cpaLongitude, cpaSog, cpaCog,
        and explicit metricSemantic metadata.
    """
    if not track_points:
        return {
            "status": "NOT_ESTABLISHED",
            "cpaDistanceKm": None,
            "cpaTimestamp": None,
            "cpaLatitude": None,
            "cpaLongitude": None,
            "cpaSogKnots": None,
            "cpaCogDeg": None,
            "metricSemantic": "MINIMUM_HISTORICAL_DISTANCE_TO_STATIONARY_POINT",
            "isDynamicRelativeMotionCPA": False
        }

    min_dist = float("inf")
    closest_pt = None

    for pt in track_points:
        p_lat = float(pt.get("latitude", pt.get("lat", 0.0)))
        p_lon = float(pt.get("longitude", pt.get("lon", pt.get("lng", 0.0))))

        dist = haversine_distance_km(target_lat, target_lon, p_lat, p_lon)
        if dist < min_dist:
            min_dist = dist
            closest_pt = pt

    if closest_pt is None:
        return {
            "status": "NOT_ESTABLISHED",
            "cpaDistanceKm": None,
            "cpaTimestamp": None,
            "cpaLatitude": None,
            "cpaLongitude": None,
            "cpaSogKnots": None,
            "cpaCogDeg": None,
            "metricSemantic": "MINIMUM_HISTORICAL_DISTANCE_TO_STATIONARY_POINT",
            "isDynamicRelativeMotionCPA": False
        }

    cpa_time = parse_timestamp(closest_pt.get("timestamp", datetime.now(timezone.utc))).isoformat()
    sog = closest_pt.get("SOG", closest_pt.get("speedKnots", closest_pt.get("speed_kts", None)))
    cog = closest_pt.get("COG", closest_pt.get("courseDeg", closest_pt.get("course_deg", closest_pt.get("heading", None))))

    return {
        "status": "ESTABLISHED",
        "cpaDistanceKm": round(min_dist, 3),
        "cpaTimestamp": cpa_time,
        "cpaLatitude": round(float(closest_pt.get("latitude", closest_pt.get("lat"))), 6),
        "cpaLongitude": round(float(closest_pt.get("longitude", closest_pt.get("lon", closest_pt.get("lng")))), 6),
        "cpaSogKnots": round(float(sog), 2) if sog is not None else None,
        "cpaCogDeg": round(float(cog), 1) if cog is not None else None,
        "metricSemantic": "MINIMUM_HISTORICAL_DISTANCE_TO_STATIONARY_POINT",
        "isDynamicRelativeMotionCPA": False
    }


def calculate_data_quality_metrics(
    track_points: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Evaluate AIS data completeness, sampling regularity, and track continuity.
    """
    if not track_points:
        return {
            "positionCount": 0,
            "temporalCoverageHours": 0.0,
            "positionGapsCount": 0,
            "maxGapDurationHours": 0.0,
            "dataCompleteness": 0.0,
            "qualityRating": "INSUFFICIENT"
        }

    pos_count = len(track_points)
    if pos_count == 1:
        return {
            "positionCount": 1,
            "temporalCoverageHours": 0.0,
            "positionGapsCount": 0,
            "maxGapDurationHours": 0.0,
            "dataCompleteness": 0.2,
            "qualityRating": "VERY_LOW"
        }

    # Sort track points chronologically
    sorted_pts = sorted(track_points, key=lambda p: parse_timestamp(p.get("timestamp", 0)))
    timestamps = [parse_timestamp(p.get("timestamp")) for p in sorted_pts]

    total_coverage_sec = (timestamps[-1] - timestamps[0]).total_seconds()
    coverage_hours = round(max(0.0, total_coverage_sec / 3600.0), 2)

    # Inspect gaps (> 2.0 hours)
    gaps_count = 0
    max_gap_hours = 0.0
    for i in range(1, len(timestamps)):
        dt_gap_h = (timestamps[i] - timestamps[i - 1]).total_seconds() / 3600.0
        if dt_gap_h > 2.0:
            gaps_count += 1
        if dt_gap_h > max_gap_hours:
            max_gap_hours = dt_gap_h

    # Completeness score: penalize sparse sampling or huge gaps
    expected_pts = max(1.0, coverage_hours * 1.0)  # expect at least 1 report per hour in tracking window
    ratio = min(1.0, pos_count / expected_pts)
    gap_penalty = min(0.5, gaps_count * 0.15)
    completeness_score = round(max(0.05, ratio * (1.0 - gap_penalty)), 3)

    if completeness_score >= 0.7:
        quality_rating = "HIGH"
    elif completeness_score >= 0.4:
        quality_rating = "MODERATE"
    else:
        quality_rating = "LOW"

    return {
        "positionCount": pos_count,
        "temporalCoverageHours": coverage_hours,
        "positionGapsCount": gaps_count,
        "maxGapDurationHours": round(max_gap_hours, 2),
        "dataCompleteness": completeness_score,
        "qualityRating": quality_rating
    }


def compute_correlation_score(
    distance_to_origin_km: float,
    min_distance_to_trajectory_km: float,
    uncertainty_radius_km: float,
    temporal_difference_hours: float,
    data_quality_score: float,
    cpa_distance_km: Optional[float] = None,
    config: Optional[AISCorrelationConfig] = None,
) -> Tuple[float, Dict[str, Any]]:
    """
    Compute a transparent analytical correlation score in [0.0, 1.0].
    
    Formula components:
      - Spatial Proximity Score (w=0.35): Decay exp(-d_eff / 15.0 km)
      - Temporal Alignment Score (w=0.25): Decay exp(-dt / 6.0 hours)
      - Trajectory Proximity Score (w=0.25): Distance to backward drift line (12.0 km scale)
      - Data Quality Weighting (w=0.15): Integrity of AIS track
    """
    cfg = config or DEFAULT_AIS_CONFIG

    # 1. Effective spatial distance (account for diffusion uncertainty envelope)
    raw_dist = min(distance_to_origin_km, min_distance_to_trajectory_km)
    d_eff = max(0.0, raw_dist - uncertainty_radius_km)
    spatial_score = math.exp(-d_eff / cfg.spatial_decay_scale_km)

    # 2. Temporal alignment score
    temporal_score = math.exp(-temporal_difference_hours / cfg.temporal_decay_scale_hours)

    # 3. Trajectory alignment score
    traj_dist = min_distance_to_trajectory_km if min_distance_to_trajectory_km is not None else raw_dist
    trajectory_score = math.exp(-traj_dist / cfg.trajectory_decay_scale_km)

    # 4. Data completeness factor
    quality_factor = max(0.2, min(1.0, data_quality_score))

    # Synthesis
    total_score = (
        cfg.weight_spatial * spatial_score +
        cfg.weight_temporal * temporal_score +
        cfg.weight_trajectory * trajectory_score +
        cfg.weight_data_quality * quality_factor
    )
    final_score = round(max(0.0, min(1.0, total_score)), 4)

    component_breakdown = {
        "scoreType": "ANALYTICAL_CORRELATION_SCORE",
        "correlationScore": final_score,
        "components": {
            "spatial": round(spatial_score, 4),
            "temporal": round(temporal_score, 4),
            "trajectory": round(trajectory_score, 4),
            "dataQuality": round(quality_factor, 4)
        },
        "weights": {
            "spatial": cfg.weight_spatial,
            "temporal": cfg.weight_temporal,
            "trajectory": cfg.weight_trajectory,
            "dataQuality": cfg.weight_data_quality
        },
        # Backward-compatibility fields
        "spatialProximityScore": round(spatial_score, 4),
        "temporalAlignmentScore": round(temporal_score, 4),
        "trajectoryAlignmentScore": round(trajectory_score, 4),
        "dataQualityFactor": round(quality_factor, 4),
        "rawFinalScore": final_score
    }

    return final_score, component_breakdown


def correlate_vessels_with_drift_corridor(
    drift_result: Dict[str, Any],
    vessel_tracks: List[Dict[str, Any]],
    sar_metadata: Optional[Dict[str, Any]] = None,
    search_radius_km: float = 50.0,
    time_window_hours: float = 24.0,
    ais_source_type: str = "REAL_AIS",
    config: Optional[AISCorrelationConfig] = None
) -> Dict[str, Any]:
    """
    Execute spatio-temporal correlation of maritime AIS vessel tracks against the
    Part 0.13C modelled backward drift corridor.

    Args:
        drift_result: Complete output dictionary from Part 0.13C drift engine.
        vessel_tracks: List of vessel track dictionaries with MMSI and track point lists.
        sar_metadata: Provenance metadata from Part 0.13A/B (sourceType, sceneId, timestamp).
        search_radius_km: Spatial search radius in km around modelled corridor.
        time_window_hours: Temporal search buffer in hours around modelled origin.
        ais_source_type: 'REAL_AIS' or 'DEMO'.
        config: Versioned AISCorrelationConfig instance.

    Returns:
        Structured AIS correlation evidence dictionary with ranked candidate records and GeoJSON tracks.
    """
    t_start = time.perf_counter()
    cfg = config or DEFAULT_AIS_CONFIG

    if not drift_result or "drift" not in drift_result:
        raise AISEngineError("Valid Part 0.13C drift analysis result is required for AIS correlation.")

    # 1. Extract Drift Anchors & Search Boundaries
    observed = drift_result.get("observed", {})
    obs_centroid = observed.get("centroid", {})
    obs_lat = float(obs_centroid.get("latitude", 0.0))
    obs_lng = float(obs_centroid.get("longitude", 0.0))
    sar_timestamp_str = observed.get("timestamp", datetime.now(timezone.utc).isoformat())
    sar_time = parse_timestamp(sar_timestamp_str)

    drift_data = drift_result.get("drift", {})
    modeled_origin = drift_data.get("modeledOrigin", {})
    origin_lat = float(modeled_origin.get("latitude", obs_lat))
    origin_lng = float(modeled_origin.get("longitude", obs_lng))
    origin_timestamp_str = modeled_origin.get("timestamp", sar_timestamp_str)
    origin_time = parse_timestamp(origin_timestamp_str)
    uncertainty_radius_km = float(modeled_origin.get("uncertaintyRadiusKm", 1.43))

    backward_path = drift_data.get("backwardPath", [])
    traj_coords = [[pt.get("longitude", pt.get("lng")), pt.get("latitude", pt.get("lat"))] for pt in backward_path]

    # Search window bounds
    search_start = origin_time - timedelta(hours=time_window_hours)
    search_end = sar_time + timedelta(hours=6.0)

    # Provenance isolation validation
    sar_meta = sar_metadata or {}
    sar_source = sar_meta.get("sourceType", drift_result.get("sourceType", "REAL_CDSE"))
    
    if sar_source == "REAL_CDSE" and ais_source_type == "REAL_AIS":
        combination_status = "REAL_ANALYTICAL"
    elif sar_source == "DEMO" and ais_source_type == "DEMO":
        combination_status = "DEMO"
    elif sar_source in ("REAL_CDSE", "UPLOADED_REAL_SAR") and ais_source_type == "DEMO":
        combination_status = "DEMO_AIS_CORRELATION"
    elif sar_source == "DEMO" and ais_source_type == "REAL_AIS":
        combination_status = "DEMO_SAR_CORRELATION"
    else:
        combination_status = "CUSTOM_ANALYTICAL"

    # 2. Correlate Each Candidate Vessel Track
    t_proc_start = time.perf_counter()
    candidates: List[Dict[str, Any]] = []
    geojson_features: List[Dict[str, Any]] = []

    for v_idx, v_track in enumerate(vessel_tracks):
        mmsi = str(v_track.get("mmsi", v_track.get("MMSI", f"vessel_{v_idx+1}")))
        name = v_track.get("name", v_track.get("vesselName", f"Vessel {mmsi}"))
        imo = v_track.get("imo", v_track.get("IMO", None))
        vessel_type = v_track.get("vesselType", v_track.get("type", "Merchant / Tanker"))
        flag = v_track.get("flag", "Unknown")

        raw_points = v_track.get("trackPoints", v_track.get("points", v_track.get("positions", [])))
        if not raw_points and isinstance(v_track.get("latitude"), (int, float)):
            # Single-point position
            raw_points = [v_track]

        # Filter track points within temporal window
        window_points = []
        for pt in raw_points:
            try:
                pt_dt = parse_timestamp(pt.get("timestamp", 0))
                if search_start <= pt_dt <= search_end:
                    window_points.append(pt)
            except Exception:
                continue

        # If no points in search window, use all points with flag
        eval_points = window_points if window_points else raw_points
        if not eval_points:
            continue

        # A. Data Quality
        data_quality = calculate_data_quality_metrics(eval_points)

        # B. Closest Point of Approach (CPA) / Min Distance to Modeled Origin
        cpa_origin = calculate_vessel_cpa(eval_points, origin_lat, origin_lng)

        # C. Closest Point of Approach / Min Distance to Observed SAR Centroid
        cpa_centroid = calculate_vessel_cpa(eval_points, obs_lat, obs_lng)

        # D. Minimum Distance to Backward Drift Trajectory LineString
        min_traj_dist = float("inf")
        for pt in eval_points:
            p_lat = float(pt.get("latitude", pt.get("lat", 0.0)))
            p_lon = float(pt.get("longitude", pt.get("lon", pt.get("lng", 0.0))))
            d_traj = calculate_point_to_linestring_min_distance(p_lat, p_lon, traj_coords)
            if d_traj < min_traj_dist:
                min_traj_dist = d_traj

        dist_to_origin = cpa_origin.get("cpaDistanceKm", float("inf"))
        dist_to_centroid = cpa_centroid.get("cpaDistanceKm", float("inf"))
        dist_to_envelope = max(0.0, dist_to_origin - uncertainty_radius_km) if dist_to_origin is not None else float("inf")

        # E. Temporal Consistency
        if cpa_origin.get("cpaTimestamp"):
            vessel_cpa_time = parse_timestamp(cpa_origin["cpaTimestamp"])
            dt_hours = abs((vessel_cpa_time - origin_time).total_seconds()) / 3600.0
            vessel_time_str = vessel_cpa_time.isoformat()
        else:
            dt_hours = 24.0
            vessel_time_str = None

        # F. Trajectory Consistency & Speed Profile
        sogs = [float(p.get("SOG", p.get("speedKnots", 0.0))) for p in eval_points if p.get("SOG") is not None or p.get("speedKnots") is not None]
        mean_sog = round(float(sum(sogs) / max(len(sogs), 1)), 2) if sogs else None

        cogs = [float(p.get("COG", p.get("courseDeg", 0.0))) for p in eval_points if p.get("COG") is not None or p.get("courseDeg") is not None]
        mean_cog = round(float(sum(cogs) / max(len(cogs), 1)), 1) if cogs else None

        # G. Analytical Correlation Score
        correlation_score, score_data = compute_correlation_score(
            distance_to_origin_km=dist_to_origin if dist_to_origin is not None else 999.0,
            min_distance_to_trajectory_km=min_traj_dist if min_traj_dist != float("inf") else 999.0,
            uncertainty_radius_km=uncertainty_radius_km,
            temporal_difference_hours=dt_hours,
            data_quality_score=data_quality["dataCompleteness"],
            cpa_distance_km=dist_to_origin,
            config=cfg
        )

        # H. Explicit Evidence Status
        if data_quality["qualityRating"] == "INSUFFICIENT" or len(eval_points) < 2:
            evidence_status = "AIS_INSUFFICIENT_DATA"
        elif dist_to_origin <= search_radius_km and dt_hours <= time_window_hours:
            evidence_status = "AIS_CORRELATED_CANDIDATE"
        elif dist_to_origin <= search_radius_km * 1.5:
            evidence_status = "AIS_PARTIAL_DATA"
        else:
            evidence_status = "NOT_ESTABLISHED"

        # Formulate Candidate Record
        candidate_rec = {
            "candidateId": f"cand_{mmsi}",
            "mmsi": mmsi,
            "vesselName": name,
            "imo": imo,
            "vesselType": vessel_type,
            "flag": flag,
            "sourceType": ais_source_type,
            "evidenceStatus": evidence_status,
            "correlationScore": correlation_score,
            "scoreComponents": score_data,
            "analyticalCorrelation": {
                "score": correlation_score,
                "scoreType": "ANALYTICAL_CORRELATION_SCORE",
                "components": score_data["components"],
                "weights": score_data["weights"]
            },
            "temporalEvidence": {
                "modelOriginTimestamp": origin_timestamp_str,
                "vesselCpaTimestamp": vessel_time_str,
                "temporalDifferenceHours": round(dt_hours, 2),
                "isTemporallyConsistent": bool(dt_hours <= 12.0)
            },
            "spatialEvidence": {
                "distanceToModelledOriginKm": dist_to_origin,
                "minimumDistanceToBackwardTrajectoryKm": round(min_traj_dist, 3) if min_traj_dist != float("inf") else None,
                "distanceToUncertaintyEnvelopeKm": round(dist_to_envelope, 3),
                "distanceToObservedCentroidKm": dist_to_centroid,
                "isInsideUncertaintyEnvelope": bool(dist_to_envelope == 0.0)
            },
            "minimumDistanceToModelledOrigin": {
                "distanceKm": cpa_origin.get("cpaDistanceKm"),
                "closestPointTimestamp": cpa_origin.get("cpaTimestamp"),
                "closestPointLatitude": cpa_origin.get("cpaLatitude"),
                "closestPointLongitude": cpa_origin.get("cpaLongitude"),
                "closestPointSogKnots": cpa_origin.get("cpaSogKnots"),
                "closestPointCogDeg": cpa_origin.get("cpaCogDeg"),
                "metricSemantic": "MINIMUM_HISTORICAL_DISTANCE_TO_STATIONARY_POINT",
                "isDynamicRelativeMotionCPA": False
            },
            "cpa": cpa_origin,
            "trajectoryEvidence": {
                "meanSpeedKnots": mean_sog,
                "meanCourseDeg": mean_cog,
                "positionCountInWindow": len(eval_points)
            },
            "dataQuality": data_quality,
            "scientificGuardrails": {
                "legalResponsibility": "NOT_ESTABLISHED",
                "confirmedDischarge": "NOT_ESTABLISHED",
                "vesselLiability": "NOT_ESTABLISHED",
                "analyticalLimitation": "Spatio-temporal alignment with modelled drift corridor constitutes analytical correlation evidence only; does not establish causation or legal liability."
            }
        }
        candidates.append(candidate_rec)

        # Build GeoJSON Feature for Vessel Track
        if len(eval_points) >= 2:
            track_line_coords = []
            for p in eval_points:
                p_lon = float(p.get("longitude", p.get("lon", p.get("lng", 0.0))))
                p_lat = float(p.get("latitude", p.get("lat", 0.0)))
                track_line_coords.append([round(p_lon, 6), round(p_lat, 6)])

            geojson_features.append({
                "type": "Feature",
                "id": f"vessel_track_{mmsi}",
                "geometry": {
                    "type": "LineString",
                    "coordinates": track_line_coords
                },
                "properties": {
                    "name": f"AIS Track: {name} ({mmsi})",
                    "category": "AIS_TRACK",
                    "mmsi": mmsi,
                    "correlationScore": correlation_score,
                    "evidenceStatus": evidence_status,
                    "pointCount": len(eval_points),
                    "sourceType": ais_source_type
                }
            })

        # Build GeoJSON Feature for CPA / Closest Point
        if cpa_origin.get("cpaLatitude") is not None and cpa_origin.get("cpaLongitude") is not None:
            geojson_features.append({
                "type": "Feature",
                "id": f"vessel_cpa_{mmsi}",
                "geometry": {
                    "type": "Point",
                    "coordinates": [cpa_origin["cpaLongitude"], cpa_origin["cpaLatitude"]]
                },
                "properties": {
                    "name": f"Closest Point to Origin: {name} ({mmsi})",
                    "category": "CPA_POINT",
                    "mmsi": mmsi,
                    "cpaDistanceKm": cpa_origin["cpaDistanceKm"],
                    "timestamp": cpa_origin["cpaTimestamp"],
                    "metricSemantic": "MINIMUM_HISTORICAL_DISTANCE_TO_STATIONARY_POINT"
                }
            })

    # 3. Sort Candidate Vessels (CORRELATION_CANDIDATE_ORDER)
    candidates.sort(key=lambda c: c["correlationScore"], reverse=True)
    t_proc_ms = round((time.perf_counter() - t_proc_start) * 1000, 2)
    t_total_ms = round((time.perf_counter() - t_start) * 1000, 2)

    # GeoJSON FeatureCollection
    geojson_collection = {
        "type": "FeatureCollection",
        "features": geojson_features,
        "metadata": {
            "candidateCount": len(candidates),
            "aisSourceType": ais_source_type,
            "combinationStatus": combination_status,
            "searchRadiusKm": search_radius_km,
            "timeWindowHours": time_window_hours
        }
    }

    return {
        "status": "success",
        "provenance": {
            "sarSource": sar_source,
            "sarAcquisitionTimestamp": sar_timestamp_str,
            "aisSource": ais_source_type,
            "combinationStatus": combination_status,
            "driftEngine": drift_result.get("engine", "Lagrangian Advection"),
            "modelRelease": "OG-SAR-ML-RESEARCH-RELEASE-V0.12",
            "analysisTimestamp": datetime.now(timezone.utc).isoformat(),
            "correlationConfigVersion": cfg.config_version
        },
        "correlationConfig": cfg.to_dict(),
        "searchCorridor": {
            "searchStart": search_start.isoformat(),
            "searchEnd": search_end.isoformat(),
            "searchRadiusKm": search_radius_km,
            "timeWindowHours": time_window_hours,
            "modeledOrigin": {
                "latitude": origin_lat,
                "longitude": origin_lng,
                "timestamp": origin_timestamp_str,
                "uncertaintyRadiusKm": uncertainty_radius_km
            }
        },
        "rankingPolicy": "CORRELATION_CANDIDATE_ORDER",
        "candidateCount": len(candidates),
        "candidates": candidates,
        "geojson": geojson_collection,
        "scientificGuardrails": {
            "legalResponsibility": "NOT_ESTABLISHED",
            "confirmedDischarge": "NOT_ESTABLISHED",
            "intentionalDischarge": "NOT_ESTABLISHED",
            "vesselLiability": "NOT_ESTABLISHED",
            "llmSynthesis": "NOT_IMPLEMENTED",
            "disclaimer": "Attribution candidate ranking represents exploratory physical/spatial correlation with the modelled backward drift corridor. It does NOT constitute legal proof of spill discharge or vessel liability."
        },
        "performance": {
            "aisTrajectoryProcessingMs": t_proc_ms,
            "totalCorrelationDurationMs": t_total_ms
        }
    }
