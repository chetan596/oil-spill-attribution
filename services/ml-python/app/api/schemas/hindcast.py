"""
Pydantic Schemas for Hydrodynamic Hindcast & Forecast API (Phase 5)
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


class TrajectoryPoint(BaseModel):
    seq_index: int
    latitude: float
    longitude: float
    lat: float
    lng: float
    timestamp: str
    elapsed_hours: float
    uncertainty_radius_km: float
    drift_speed_kmh: float
    drift_heading_deg: float
    phase: str


class HindcastSimulationResponse(BaseModel):
    """Structured response from drift simulation."""
    status: str
    engine: str
    origin_lat: float
    origin_lng: float
    origin_timestamp: str
    time_window_hours: int
    uncertainty_radius_km: float
    backward_path: List[Dict[str, Any]]
    forward_path: List[Dict[str, Any]]
    geojson: Dict[str, Any]
    simulation_meta: Dict[str, Any]
