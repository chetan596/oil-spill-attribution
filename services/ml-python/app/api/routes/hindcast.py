"""
FastAPI Routes for Oil Spill Drift Simulation (Phase 5)
Endpoint: /api/v1/hindcast/simulate
"""

from fastapi import APIRouter, HTTPException, status
from app.api.schemas.hindcast import HindcastSimulationRequest, HindcastSimulationResponse
from app.drift.gnome_runner import gnome_runner
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/simulate",
    response_model=HindcastSimulationResponse,
    summary="Run Lagrangian reverse hindcast & forward forecast simulation",
)
def run_drift_simulation(request: HindcastSimulationRequest):
    """
    Executes physically-informed oil spill drift simulation:
      - Backward reverse hindcast to determine Modelled Spill Origin and origin timestamp.
      - Forward forecast predicting slick trajectory.
      - Modelled Origin Uncertainty Radius calculation and GeoJSON generation.
    """
    try:
        env_params = {
            "wind_speed_kts": request.wind_speed_kts,
            "wind_direction_deg": request.wind_direction_deg,
            "current_speed_kts": request.current_speed_kts,
            "current_direction_deg": request.current_direction_deg,
            "windage_leeway_factor": request.windage_factor,
            "source": request.source or "demo",
        }

        result = gnome_runner.run_drift_simulation(
            detection_lat=request.latitude,
            detection_lng=request.longitude,
            detection_time=request.detection_timestamp,
            hours_back=request.hours_back,
            hours_forward=request.hours_forward,
            env_params=env_params,
        )

        return HindcastSimulationResponse(**result)

    except Exception as e:
        logger.error("[HindcastAPI] Simulation execution failed: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Drift simulation failed: {str(e)}",
        )
