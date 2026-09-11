from pydantic import BaseModel
from typing import List, Dict, Any

class HindcastRequest(BaseModel):
    slick_geometry: Dict[str, Any] = {}
    detection_time: str = ""
    hours_back: int = 24

class HindcastResponse(BaseModel):
    origin_lat: float
    origin_lng: float
    release_timestamp: str
    trajectory_points: List[Dict[str, Any]] = []
