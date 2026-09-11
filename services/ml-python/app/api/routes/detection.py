from fastapi import APIRouter
from app.api.schemas.detection import DetectionRequest, DetectionResponse

router = APIRouter()

@router.post("/segment", response_model=DetectionResponse)
def segment_oil_slick(request: DetectionRequest):
    return DetectionResponse(
        slick_polygons=[],
        total_area_km2=0.0,
        confidence=0.92,
        estimated_age_hours=14.5
    )
