from pydantic import BaseModel
from typing import List, Dict, Any

class DetectionRequest(BaseModel):
    image_url: str = ""
    threshold: float = 0.5

class DetectionResponse(BaseModel):
    slick_polygons: List[Dict[str, Any]] = []
    total_area_km2: float = 0.0
    confidence: float = 0.0
    estimated_age_hours: float = 0.0
