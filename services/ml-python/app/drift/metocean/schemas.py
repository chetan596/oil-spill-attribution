"""
Metocean Forcing Data Models & Typed Schemas (Phase 16.4 Part 5)

Defines strictly typed Pydantic models for time-resolved hourly meteorological
and oceanographic forcing points, provenance metadata, and query contracts.
"""

from datetime import datetime
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field


class HourlyForcingPoint(BaseModel):
    """
    Time-resolved hourly forcing point defining surface currents and winds at a geographic position.
    Canonical internal velocity units are strictly meters per second (m/s).
    """
    timestamp: datetime = Field(..., description="UTC ISO-8601 timestamp of this hourly forcing slice")
    latitude: float = Field(..., description="Latitude in decimal degrees (WGS84, -90 to +90)")
    longitude: float = Field(..., description="Longitude in decimal degrees (WGS84, -180 to +180)")
    current_u: float = Field(..., description="Eastward ocean current velocity in m/s (positive East)")
    current_v: float = Field(..., description="Northward ocean current velocity in m/s (positive North)")
    wind_u: float = Field(..., description="Eastward 10m surface wind velocity in m/s (positive East)")
    wind_v: float = Field(..., description="Northward 10m surface wind velocity in m/s (positive North)")
    current_unit: str = Field("m/s", description="Canonical SI unit for ocean current")
    wind_unit: str = Field("m/s", description="Canonical SI unit for 10m wind")
    source_unit: str = Field("m/s", description="Original unit reported by the data provider")
    conversion_applied: bool = Field(False, description="True if unit conversion was applied at provider boundary")
    current_source: str = Field(..., description="Provider source identifier (e.g. COPERNICUS_MARINE_MULTIOBS)")
    wind_source: str = Field(..., description="Provider source identifier (e.g. ECMWF_ERA5)")
    current_dataset: str = Field(..., description="Official Copernicus dataset ID")
    wind_dataset: str = Field(..., description="Official ECMWF dataset ID")


class MetoceanProvenance(BaseModel):
    """
    Full traceability and scientific provenance for a metocean forcing series.
    """
    forcing_provenance: str = Field(
        ...,
        description="One of: REAL_HINDCAST, REAL_REANALYSIS_FORWARD, REAL_MULTI_OBSERVATION_CURRENT, REAL_ARCHIVED_FORECAST, REAL_FORECAST, DEMO, NOT_AVAILABLE"
    )
    provider_current: str = Field("COPERNICUS_MARINE", description="Current provider name")
    provider_wind: str = Field("ECMWF_CDS", description="Wind provider name")
    dataset_current: str = Field(..., description="Exact CMEMS dataset identifier")
    dataset_wind: str = Field(..., description="Exact ECMWF dataset identifier")
    current_forcing_definition: str = Field(
        ...,
        description="Scientific definition of current (e.g. 'Geostrophic + Tidal current (uo - ue, vo - ve) at surface z=0m coupled with 3% wind leeway')"
    )
    temporal_resolution: str = Field("1h", description="Temporal step resolution (e.g. 1h)")
    spatial_resolution_current: str = Field("0.25 deg", description="Spatial grid resolution of current")
    spatial_resolution_wind: str = Field("0.25 deg", description="Spatial grid resolution of wind")
    depth_level: str = Field("surface (z=0m)", description="Depth convention of ocean current")
    units: Dict[str, Any] = Field(
        default_factory=lambda: {
            "current": "m/s",
            "wind": "m/s",
            "distance": "km",
            "uncertainty": "km"
        }
    )
    retrieval_timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    coverage_start: str = Field(..., description="Start timestamp of forcing period (ISO UTC)")
    coverage_end: str = Field(..., description="End timestamp of forcing period (ISO UTC)")


class MetoceanForcingSeries(BaseModel):
    """
    Container for time-resolved hourly forcing series across backward and forward phases.
    """
    status: str = Field("SUCCESS", description="SUCCESS | METOCEAN_DATA_UNAVAILABLE | METOCEAN_PROVIDER_CONFIGURATION_REQUIRED")
    provenance: MetoceanProvenance
    backward_points: List[HourlyForcingPoint] = Field(default_factory=list, description="Hourly forcing for T0 - 24h -> T0")
    forward_points: List[HourlyForcingPoint] = Field(default_factory=list, description="Hourly forcing for T0 -> T0 + 6h")
    error_message: Optional[str] = None
