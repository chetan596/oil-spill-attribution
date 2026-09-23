"""
Integration Tests for Part 0.13F: Dossier Synthesis FastAPI Endpoint.
Endpoint: POST /api/v1/dossier/synthesize
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.canonical_evidence import assemble_canonical_evidence_contract

client = TestClient(app)


def test_dossier_synthesize_endpoint_success():
    """Verify POST /api/v1/dossier/synthesize executes cleanly with valid canonical evidence."""
    canonical_evidence = assemble_canonical_evidence_contract(
        sar_metadata={"sourceType": "REAL_CDSE", "sceneId": "S1A_SCENE_INTEGRATION"},
        analysis_id="analysis_integration_001"
    )

    payload = {
        "canonical_evidence": canonical_evidence,
        "provider": "mock",
        "temperature": 0.1
    }

    response = client.post("/api/v1/dossier/synthesize", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["schemaVersion"] == "OG-DOSSIER-V1"
    assert "dossier" in data
    dossier = data["dossier"]
    assert dossier["legalResponsibility"]["status"] == "NOT_ESTABLISHED"
    assert dossier["oilTypeAndVolume"]["oilTypeStatus"] == "NOT_ESTABLISHED"


def test_dossier_synthesize_endpoint_validation_error():
    """Verify POST /api/v1/dossier/synthesize returns 422 on invalid payload."""
    payload = {
        "canonical_evidence": {"broken": "no_provenance"},
        "provider": "mock"
    }

    response = client.post("/api/v1/dossier/synthesize", json=payload)
    assert response.status_code == 422
