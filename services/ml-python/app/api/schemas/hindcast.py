"""
Pydantic Schemas for Hydrodynamic Hindcast & Forecast API (Part 0.13C)
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional


class HindcastSimulationRequest(BaseModel):
    """Payload to trigger a reverse hindcast and forward forecast simulation."""
    latitude: float = Field(..., description="Observed slick centroid latitude")
    longitude: float = Field(..., description="Observed slick centroid longitude")
    detection_timestamp: Optional[str] = Field(None, description="ISO timestamp of satellite acquisition")
    hours_back: int = Field(24, ge=1, le=168, description="Hindcast backward duration in hours")
    hours_forward: int = Field(6, ge=0, le=168, description="Forecast forward duration in hours")
    wind_speed_kts: Optional[float] = Field(None, description="Optional custom wind speed in knots")
    wind_direction_deg: Optional[float] = Field(None, description="Optional custom wind direction in degrees")
    current_speed_kts: Optional[float] = Field(None, description="Optional custom current speed in knots")
    current_direction_deg: Optional[float] = Field(None, description="Optional custom current direction in degrees")
    windage_factor: Optional[float] = Field(None, description="Optional custom windage factor (0.01 - 0.05)")
    source: Optional[str] = Field("demo", description="Environmental source label")
    source_type: Optional[str] = Field("DEMO", description="'REAL_CDSE', 'UPLOADED_REAL_SAR', or 'DEMO'")
    scene_id: Optional[str] = Field(None, description="Scene or scenario identifier")


class CandidateDriftAnalysisRequest(BaseModel):
    """Payload to trigger drift analysis on a Part 0.13B candidate spill analysis object."""
    observed_centroid: Dict[str, float] = Field(..., description="Observed centroid {'latitude': ..., 'longitude': ...}")
    acquisition_timestamp: Optional[str] = Field(None, description="ISO timestamp of SAR detection")
    scene_id: Optional[str] = Field("candidate_spill_scene", description="Scene or candidate ID")
    source_type: str = Field("REAL_CDSE", description="'REAL_CDSE', 'UPLOADED_REAL_SAR', or 'DEMO'")
    hours_back: int = Field(24, ge=1, le=168, description="Hindcast backward duration in hours")
    hours_forward: int = Field(6, ge=0, le=168, description="Forecast forward duration in hours")
    env_params: Optional[Dict[str, Any]] = Field(None, description="Optional custom environmental forcing parameters")


class TrajectoryPoint(BaseModel):
    seq_index: Optional[int] = None
    seqIndex: Optional[int] = None
    latitude: float
    longitude: float
    lat: float
    lng: float
    timestamp: str
    elapsed_hours: Optional[float] = None
    elapsedHours: Optional[float] = None
    uncertainty_radius_km: Optional[float] = None
    uncertaintyRadiusKm: Optional[float] = None
    drift_speed_kmh: Optional[float] = None
    driftSpeedKmh: Optional[float] = None
    drift_heading_deg: Optional[float] = None
    driftHeadingDeg: Optional[float] = None
    phase: str
    status: Optional[str] = None


class HindcastSimulationResponse(BaseModel):
    """Structured response from drift simulation."""
    status: str = "success"
    engine: str
    origin_lat: float
    origin_lng: float
    origin_timestamp: str
    time_window_hours: int
    uncertainty_radius_km: float
    backward_path: List[Dict[str, Any]]
    forward_path: List[Dict[str, Any]]
    geojson: Dict[str, Any]
    simulation_meta: Dict[str, Any] = Field(default_factory=dict)
    observed: Optional[Dict[str, Any]] = None
    metocean: Optional[Dict[str, Any]] = None
    drift: Optional[Dict[str, Any]] = None
    derived: Optional[Dict[str, Any]] = None
    scientificGuardrails: Optional[Dict[str, Any]] = None
    performance: Optional[Dict[str, Any]] = None
    disclaimer: Optional[str] = None
