from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class DetectionRequest(BaseModel):
    scene_id: str = Field(..., description="Unique satellite scene identifier (e.g. demo-scene-001)")
    image_path: Optional[str] = Field(None, description="Path to SAR GeoTIFF on disk")
    threshold: float = Field(0.5, ge=0.0, le=1.0, description="Decision threshold for probability binarization")
    polarization: str = Field("VV", description="Polarization channel: 'VV', 'VH', or 'dual'")


class DetectionResponse(BaseModel):
    scene_id: str
    detection_status: str = Field(..., description="'detected', 'no_slick', 'model_unavailable', 'georeferencing_missing', or 'error'")
    confidence: Optional[float] = Field(None, description="Mean prediction confidence score (0.0 to 1.0)")
    slick_polygons: List[Dict[str, Any]] = Field(default_factory=list, description="GeoJSON Polygon features in EPSG:4326")
    total_area_km2: Optional[float] = Field(None, description="Total contaminated surface area in km²")
    estimated_age_hours: Optional[float] = Field(None, description="Estimated hours between discharge and satellite capture")
    model_version: str = Field(..., description="Model identifier from registry")
    georeferencing_status: str = Field(..., description="'valid' or 'missing'")
    processing_metadata: Dict[str, Any] = Field(default_factory=dict, description="Metadata regarding preprocessing, tiling, or fallback")
