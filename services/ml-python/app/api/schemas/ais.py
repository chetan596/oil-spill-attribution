"""
Pydantic Schemas for AIS Vessel Correlation & Evidence API (Part 0.13D)
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional


class VesselTrackInput(BaseModel):
    mmsi: str = Field(..., description="Maritime Mobile Service Identity")
    name: Optional[str] = Field(None, description="Vessel Name")
    imo: Optional[str] = Field(None, description="IMO Number")
    vesselType: Optional[str] = Field(None, description="Vessel Category / Type")
    flag: Optional[str] = Field(None, description="Flag State")
    trackPoints: List[Dict[str, Any]] = Field(default_factory=list, description="Array of AIS trajectory points")


class AISCorrelationRequest(BaseModel):
    drift_result: Dict[str, Any] = Field(..., description="Part 0.13C Drift & Backtracking simulation result")
    vessel_tracks: List[Dict[str, Any]] = Field(..., description="List of candidate vessel tracks with positions")
    sar_metadata: Optional[Dict[str, Any]] = Field(None, description="SAR scene provenance metadata")
    search_radius_km: float = Field(50.0, ge=1.0, le=200.0, description="Spatial search radius in km")
    time_window_hours: float = Field(24.0, ge=1.0, le=168.0, description="Temporal search buffer around modelled origin")
    ais_source_type: str = Field("REAL_AIS", description="'REAL_AIS' or 'DEMO'")


class AISCorrelationResponse(BaseModel):
    status: str = "success"
    provenance: Dict[str, Any]
    searchCorridor: Dict[str, Any]
    rankingPolicy: str = "CORRELATION_CANDIDATE_ORDER"
    candidateCount: int
    candidates: List[Dict[str, Any]]
    geojson: Dict[str, Any]
    scientificGuardrails: Dict[str, Any]
    performance: Dict[str, Any]
