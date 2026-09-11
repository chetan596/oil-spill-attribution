from fastapi import APIRouter
from app.api.schemas.hindcast import HindcastRequest, HindcastResponse

router = APIRouter()

@router.post("/simulate", response_model=HindcastResponse)
def run_reverse_drift(request: HindcastRequest):
    return HindcastResponse(
        origin_lat=18.95,
        origin_lng=72.82,
        release_timestamp="2026-03-10T12:00:00Z",
        trajectory_points=[]
    )
