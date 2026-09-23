"""
FastAPI Routes for AIS Vessel Correlation & Evidence (Part 0.13D)
Endpoint: POST /api/v1/ais/correlate
"""

import logging
from fastapi import APIRouter, HTTPException, status

from app.api.schemas.ais import AISCorrelationRequest, AISCorrelationResponse
from app.ais.spill_ais_engine import correlate_vessels_with_drift_corridor, AISEngineError

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/correlate",
    response_model=AISCorrelationResponse,
    summary="Execute spatio-temporal AIS correlation against modelled drift corridor",
)
def correlate_ais_vessels(request: AISCorrelationRequest) -> AISCorrelationResponse:
    """
    Correlates candidate vessel trajectories with the Part 0.13C modelled backward drift corridor.
    Computes CPA, spatial distance metrics, temporal offset, trajectory consistency, data quality,
    and transparent analytical correlation scoring.
    """
    try:
        result = correlate_vessels_with_drift_corridor(
            drift_result=request.drift_result,
            vessel_tracks=request.vessel_tracks,
            sar_metadata=request.sar_metadata,
            search_radius_km=request.search_radius_km,
            time_window_hours=request.time_window_hours,
            ais_source_type=request.ais_source_type
        )
        return AISCorrelationResponse(**result)

    except AISEngineError as e:
        logger.error("[AISCorrelationAPI] Validation error: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"AIS correlation error: {str(e)}"
        )
    except Exception as e:
        logger.error("[AISCorrelationAPI] Execution failed: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AIS correlation processing failed: {str(e)}"
        )
