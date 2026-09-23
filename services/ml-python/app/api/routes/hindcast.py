"""
FastAPI Routes for Oil Spill Drift Simulation (Part 0.13C)
Endpoints:
  - POST /api/v1/hindcast/simulate
  - POST /api/v1/hindcast/analyze-candidate
"""

import logging
from typing import Dict, Any
from fastapi import APIRouter, HTTPException, status

from app.api.schemas.hindcast import (
    HindcastSimulationRequest,
    HindcastSimulationResponse,
    CandidateDriftAnalysisRequest,
)
from app.drift.spill_drift_engine import execute_candidate_drift_analysis, DriftEngineError

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/simulate",
    response_model=HindcastSimulationResponse,
    summary="Run Lagrangian reverse hindcast & forward forecast simulation",
)
def run_drift_simulation(request: HindcastSimulationRequest) -> HindcastSimulationResponse:
    """
    Executes physically-grounded oil spill drift simulation:
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

        source_meta = {
            "sourceType": request.source_type or ("DEMO" if request.source == "demo" else "REAL_CDSE"),
            "sceneId": request.scene_id or "simulation_scene",
        }

        result = execute_candidate_drift_analysis(
            observed_lat=request.latitude,
            observed_lng=request.longitude,
            detection_time=request.detection_timestamp,
            hours_back=request.hours_back,
            hours_forward=request.hours_forward,
            env_params=env_params,
            source_metadata=source_meta,
        )

        # Map to HindcastSimulationResponse
        modeled_orig = result["drift"]["modeledOrigin"]
        return HindcastSimulationResponse(
            status="success",
            engine=result["engine"],
            origin_lat=modeled_orig["latitude"],
            origin_lng=modeled_orig["longitude"],
            origin_timestamp=modeled_orig["timestamp"],
            time_window_hours=request.hours_back,
            uncertainty_radius_km=modeled_orig["uncertaintyRadiusKm"],
            backward_path=result["drift"]["backwardPath"],
            forward_path=result["drift"]["forwardPath"],
            geojson=result["geojson"],
            simulation_meta=result["metocean"],
            observed=result["observed"],
            metocean=result["metocean"],
            drift=result["drift"],
            derived=result["derived"],
            scientificGuardrails=result["scientificGuardrails"],
            performance=result["performance"],
            disclaimer=result["disclaimer"],
        )

    except DriftEngineError as e:
        err_msg = str(e)
        logger.error("[HindcastAPI] Simulation validation failed: %s", err_msg)
        status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
        if "METOCEAN_PROVIDER_CONFIGURATION_REQUIRED" in err_msg:
            status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        elif "METOCEAN_DATA_UNAVAILABLE" in err_msg:
            status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        raise HTTPException(
            status_code=status_code,
            detail=err_msg
        )
    except Exception as e:
        logger.error("[HindcastAPI] Simulation execution failed: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Drift simulation failed: {str(e)}",
        )


@router.post(
    "/analyze-candidate",
    summary="Execute drift analysis on a Part 0.13B candidate spill analysis object",
)
def analyze_candidate_drift(request: CandidateDriftAnalysisRequest) -> Dict[str, Any]:
    """
    Directly ingest candidate spill analysis output from Part 0.13B, extracting the observed
    centroid, satellite acquisition timestamp, and provenance metadata to calculate reverse
    hindcast, forward forecast, and GeoJSON features.
    """
    try:
        lat = request.observed_centroid.get("latitude")
        lng = request.observed_centroid.get("longitude")

        if lat is None or lng is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Observed centroid must contain 'latitude' and 'longitude' keys."
            )

        source_meta = {
            "sourceType": request.source_type,
            "sceneId": request.scene_id,
        }

        result = execute_candidate_drift_analysis(
            observed_lat=lat,
            observed_lng=lng,
            detection_time=request.acquisition_timestamp,
            hours_back=request.hours_back,
            hours_forward=request.hours_forward,
            env_params=request.env_params,
            source_metadata=source_meta,
        )

        return result

    except DriftEngineError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Candidate drift analysis failed: {str(e)}")
