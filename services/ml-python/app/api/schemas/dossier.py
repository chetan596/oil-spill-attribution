"""
Pydantic Schemas for Dossier Synthesis API (Part 0.13F)
"""

from pydantic import BaseModel, Field
from typing import Dict, Any, Optional


class DossierSynthesisRequest(BaseModel):
    canonical_evidence: Dict[str, Any] = Field(..., description="Part 0.13E Canonical Evidence Contract object")
    provider: Optional[str] = Field(None, description="LLM provider: 'mock', 'gemini', 'openai'")
    model: Optional[str] = Field(None, description="LLM model identifier")
    temperature: Optional[float] = Field(None, ge=0.0, le=0.2, description="Sampling temperature (clamped <= 0.2)")


class DossierSynthesisResponse(BaseModel):
    status: str = "success"
    schemaVersion: str = "OG-DOSSIER-V1"
    dossier: Dict[str, Any]
