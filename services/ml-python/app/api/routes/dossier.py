"""
FastAPI Routes for Evidence-to-Dossier LLM Synthesis (Part 0.13F)
Endpoint: POST /api/v1/dossier/synthesize
"""

import logging
from fastapi import APIRouter, HTTPException, status

from app.api.schemas.dossier import DossierSynthesisRequest, DossierSynthesisResponse
from app.dossier.dossier_synthesis import (
    synthesize_investigation_dossier,
    DossierValidationError,
)
from app.dossier.llm_provider import LLMConfig, LLMProviderError

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/synthesize",
    response_model=DossierSynthesisResponse,
    summary="Synthesize an Analytical Investigation Dossier from canonical evidence",
)
def synthesize_dossier(request: DossierSynthesisRequest) -> DossierSynthesisResponse:
    """
    Transforms a Part 0.13E Canonical Evidence Contract object into an auditable,
    structured Analytical Investigation Dossier (OG-DOSSIER-V1) with evidenceRefs,
    factual summaries, and strict non-attribution legal guardrails.
    """
    try:
        cfg = LLMConfig(
            provider=request.provider,
            model=request.model,
            temperature=request.temperature
        )
        dossier = synthesize_investigation_dossier(
            canonical_evidence=request.canonical_evidence,
            config=cfg
        )
        return DossierSynthesisResponse(
            status="success",
            schemaVersion="OG-DOSSIER-V1",
            dossier=dossier
        )

    except DossierValidationError as e:
        logger.error("[DossierAPI] Schema validation error: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Dossier synthesis validation error: {str(e)}"
        )
    except Exception as e:
        logger.error("[DossierAPI] Synthesis processing failed: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Dossier synthesis failed: {str(e)}"
        )
