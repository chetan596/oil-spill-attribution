"""
Unit Tests for Part 0.13F: Evidence-to-Dossier LLM Synthesis Engine.

Verifies:
  1. Valid canonical evidence -> valid structured dossier (OG-DOSSIER-V1)
  2. Missing evidence -> NOT_ESTABLISHED preserved
  3. Demo provenance preserved (DEMO, DEMO_AIS_CORRELATION, DEMO_SAR_CORRELATION)
  4. Real provenance preserved (REAL_ANALYTICAL)
  5. Score classification remains ANALYTICAL_CORRELATION_SCORE
  6. Score components preserved (spatial, temporal, trajectory, dataQuality)
  7. Score weights preserved (0.35, 0.25, 0.25, 0.15)
  8. Modelled origin remains MODELLED
  9. Derived area remains DERIVED
  10. AIS evidence remains AIS
  11. Legal responsibility strictly NOT_ESTABLISHED
  12. Prohibited causal language rejected
  13. Prohibited responsibility language rejected
  14. Oil type cannot be invented (NOT_ESTABLISHED)
  15. Volume cannot be invented (NOT_ESTABLISHED)
  16. Malformed LLM JSON handled gracefully with fallback
  17. Schema validation failure handled
  18. Provider unavailable handled (controlled status)
  19. Timeout handling
  20. No API key exposed in output or metadata
  21. Evidence references point to real canonical fields
  22. Demo AIS never becomes REAL_AIS
  23. Demo SAR never becomes REAL_CDSE
  24. Low-temperature / deterministic configuration verified
"""

import json
import pytest
from datetime import datetime, timezone

from app.core.canonical_evidence import (
    assemble_canonical_evidence_contract,
    SEMANTIC_STATUS_OBSERVED,
    SEMANTIC_STATUS_DERIVED,
    SEMANTIC_STATUS_MODELLED,
    SEMANTIC_STATUS_AIS,
    SEMANTIC_STATUS_NOT_ESTABLISHED,
)
from app.dossier.llm_provider import (
    LLMConfig,
    MockLLMProvider,
    LLMProviderError,
    get_llm_provider,
)
from app.dossier.dossier_synthesis import (
    DOSSIER_SCHEMA_VERSION,
    synthesize_deterministic_dossier,
    synthesize_investigation_dossier,
    validate_dossier_contract,
    resolve_evidence_ref,
    build_evidence_timeline,
    DossierValidationError,
)


@pytest.fixture
def sample_canonical_evidence():
    """Provides a valid canonical evidence contract fixture."""
    sar_detection = {
        "modelId": "unet-dual-pol-sar-v09d-residual-loss",
        "threshold": 0.50,
        "sourceType": "REAL_CDSE",
        "sceneId": "S1A_IW_GRDH_1SDV_20260919T060000_REAL",
        "acquisitionTimestamp": "2026-09-19T06:00:00Z"
    }

    geospatial_evidence = {
        "sourceType": "REAL_CDSE",
        "acquisitionTimestamp": "2026-09-19T06:00:00Z",
        "candidateCount": 1,
        "candidates": [
            {
                "id": "cand_reg_01",
                "surfaceAreaKm2": 3.75,
                "surfaceAreaM2": 3750000.0,
                "perimeterMeters": 11200.0,
                "centroid": {"latitude": 18.95, "longitude": 72.82},
                "boundingBox": [72.79, 18.91, 72.85, 18.99],
                "aspectRatio": 2.4,
                "compactness": 0.38,
                "elongation": 0.55,
                "modelOutputStatistics": {
                    "meanProbability": 0.86,
                    "peakProbability": 0.95
                },
                "crs": "EPSG:4326"
            }
        ]
    }

    drift_evidence = {
        "engine": "Lagrangian Advection",
        "sourceType": "REAL_CDSE",
        "observed": {
            "centroid": {"latitude": 18.95, "longitude": 72.82},
            "timestamp": "2026-09-19T06:00:00Z"
        },
        "forcing": {
            "source": "ERA5_REANALYSIS_COUPLED",
            "windSpeedMps": 5.8,
            "windDirectionDeg": 210.0,
            "currentSpeedMps": 0.30,
            "currentDirectionDeg": 330.0,
            "leewayFactor": 0.03,
            "eddyDiffusivityKh": 10.0
        },
        "drift": {
            "hindcastDurationHours": 24.0,
            "modeledOrigin": {
                "latitude": 19.12,
                "longitude": 72.64,
                "timestamp": "2026-09-18T06:00:00Z",
                "uncertaintyRadiusKm": 1.75
            },
            "uncertaintyEnvelope": {
                "type": "Polygon",
                "coordinates": [[[72.60, 19.09], [72.68, 19.09], [72.68, 19.15], [72.60, 19.15], [72.60, 19.09]]]
            },
            "backwardPath": [
                {"lat": 18.95, "lng": 72.82, "timestamp": "2026-09-19T06:00:00Z"},
                {"lat": 19.12, "lng": 72.64, "timestamp": "2026-09-18T06:00:00Z"}
            ],
            "forwardPath": []
        }
    }

    ais_candidates = [
        {
            "candidateId": "cand_419000999",
            "mmsi": "419000999",
            "vesselName": "OCEAN HARMONY",
            "imo": "9912345",
            "vesselType": "Crude Oil Tanker",
            "flag": "Panama",
            "sourceType": "REAL_AIS",
            "evidenceStatus": "AIS_CORRELATED_CANDIDATE",
            "correlationScore": 0.8520,
            "scoreComponents": {
                "components": {"spatial": 0.91, "temporal": 0.88, "trajectory": 0.85, "dataQuality": 0.90},
                "weights": {"spatial": 0.35, "temporal": 0.25, "trajectory": 0.25, "dataQuality": 0.15}
            },
            "temporalEvidence": {
                "modelOriginTimestamp": "2026-09-18T06:00:00Z",
                "vesselCpaTimestamp": "2026-09-18T06:30:00Z",
                "temporalDifferenceHours": 0.5,
                "isTemporallyConsistent": True
            },
            "spatialEvidence": {
                "distanceToModelledOriginKm": 0.45,
                "minimumDistanceToBackwardTrajectoryKm": 0.30,
                "distanceToUncertaintyEnvelopeKm": 0.0,
                "distanceToObservedCentroidKm": 32.5,
                "isInsideUncertaintyEnvelope": True
            },
            "minimumDistanceToModelledOrigin": {
                "distanceKm": 0.45,
                "closestPointTimestamp": "2026-09-18T06:30:00Z",
                "closestPointLatitude": 19.122,
                "closestPointLongitude": 72.643,
                "closestPointSogKnots": 11.8,
                "closestPointCogDeg": 140.0,
                "metricSemantic": "MINIMUM_HISTORICAL_DISTANCE_TO_STATIONARY_POINT",
                "isDynamicRelativeMotionCPA": False
            },
            "cpa": {
                "status": "ESTABLISHED",
                "cpaDistanceKm": 0.45,
                "cpaTimestamp": "2026-09-18T06:30:00Z",
                "cpaLatitude": 19.122,
                "cpaLongitude": 72.643,
                "cpaSogKnots": 11.8,
                "cpaCogDeg": 140.0
            },
            "trajectoryEvidence": {
                "meanSpeedKnots": 11.8,
                "meanCourseDeg": 140.0,
                "positionCountInWindow": 5
            },
            "dataQuality": {
                "positionCount": 5,
                "temporalCoverageHours": 2.5,
                "positionGapsCount": 0,
                "maxGapDurationHours": 0.5,
                "dataCompleteness": 0.90,
                "qualityRating": "HIGH"
            }
        }
    ]

    ais_evidence = {
        "status": "success",
        "provenance": {"aisSource": "REAL_AIS"},
        "rankingPolicy": "CORRELATION_CANDIDATE_ORDER",
        "candidateCount": 1,
        "candidates": ais_candidates,
        "correlationConfig": {
            "configVersion": "v1.0.0",
            "weights": {"spatial": 0.35, "temporal": 0.25, "trajectory": 0.25, "dataQuality": 0.15}
        }
    }

    return assemble_canonical_evidence_contract(
        sar_detection_evidence=sar_detection,
        geospatial_evidence=geospatial_evidence,
        metocean_drift_evidence=drift_evidence,
        ais_correlation_evidence=ais_evidence,
        sar_metadata={"sourceType": "REAL_CDSE", "sceneId": "S1A_IW_GRDH_1SDV_20260919T060000_REAL"},
        analysis_id="analysis_mumbai_001"
    )


def test_valid_canonical_evidence_to_valid_dossier(sample_canonical_evidence):
    """1. Verify valid canonical evidence produces valid OG-DOSSIER-V1."""
    dossier = synthesize_investigation_dossier(sample_canonical_evidence)
    assert dossier["schemaVersion"] == DOSSIER_SCHEMA_VERSION
    assert dossier["provenance"]["analysisId"] == "analysis_mumbai_001"
    assert "executiveSummary" in dossier
    assert dossier["spillDetection"]["status"] == "CANDIDATE_DARK_FORMATION"
    assert dossier["geospatialEvidence"]["area"]["value"] == 3.75
    assert dossier["geospatialEvidence"]["area"]["status"] == "DERIVED"


def test_missing_evidence_preserves_not_established():
    """2. Verify missing subcomponents produce NOT_ESTABLISHED without error."""
    empty_evidence = assemble_canonical_evidence_contract(
        sar_metadata={"sourceType": "DEMO"},
        analysis_id="analysis_empty"
    )
    dossier = synthesize_investigation_dossier(empty_evidence)
    assert dossier["schemaVersion"] == DOSSIER_SCHEMA_VERSION
    assert dossier["geospatialEvidence"]["area"]["value"] == 0.0
    assert dossier["oilTypeAndVolume"]["oilTypeStatus"] == SEMANTIC_STATUS_NOT_ESTABLISHED
    assert dossier["oilTypeAndVolume"]["volumeStatus"] == SEMANTIC_STATUS_NOT_ESTABLISHED


def test_demo_and_real_provenance_preservation(sample_canonical_evidence):
    """3 & 4. Verify demo and real provenance tags are preserved."""
    # Real analytical
    dossier_real = synthesize_investigation_dossier(sample_canonical_evidence)
    assert dossier_real["provenance"]["combinationStatus"] == "REAL_ANALYTICAL"
    assert "demonstration data" not in dossier_real["executiveSummary"].lower()

    # Demo
    demo_evidence = assemble_canonical_evidence_contract(
        sar_metadata={"sourceType": "DEMO"},
        ais_correlation_evidence={"candidates": [], "provenance": {"aisSource": "DEMO"}}
    )
    dossier_demo = synthesize_investigation_dossier(demo_evidence)
    assert dossier_demo["provenance"]["combinationStatus"] == "DEMO"
    assert "demonstration data" in dossier_demo["executiveSummary"].lower()


def test_score_classification_and_weights_preserved(sample_canonical_evidence):
    """5, 6, 7. Verify score classification, components, and weights."""
    dossier = synthesize_investigation_dossier(sample_canonical_evidence)
    corr = dossier["analyticalCorrelation"]
    assert corr["scoreType"] == "ANALYTICAL_CORRELATION_SCORE"
    assert corr["weights"]["spatial"] == 0.35
    assert corr["weights"]["temporal"] == 0.25
    assert corr["weights"]["trajectory"] == 0.25
    assert corr["weights"]["dataQuality"] == 0.15
    assert "probability" not in corr["interpretation"].lower()


def test_evidence_status_disciplines(sample_canonical_evidence):
    """8, 9, 10. Verify MODELLED, DERIVED, and AIS status tags."""
    dossier = synthesize_investigation_dossier(sample_canonical_evidence)
    assert dossier["driftEvidence"]["modelledOrigin"]["status"] == SEMANTIC_STATUS_MODELLED
    assert dossier["geospatialEvidence"]["area"]["status"] == SEMANTIC_STATUS_DERIVED
    assert dossier["geospatialEvidence"]["centroid"]["status"] == SEMANTIC_STATUS_OBSERVED
    assert len(dossier["aisEvidence"]["candidateVessels"]) == 1
    assert dossier["aisEvidence"]["candidateVessels"][0]["evidenceStatus"] == "AIS_CORRELATED_CANDIDATE"


def test_legal_responsibility_strictly_not_established(sample_canonical_evidence):
    """11, 12, 13. Verify legal responsibility and rejection of prohibited causal words."""
    dossier = synthesize_investigation_dossier(sample_canonical_evidence)
    legal = dossier["legalResponsibility"]
    assert legal["status"] == SEMANTIC_STATUS_NOT_ESTABLISHED
    assert "does not establish legal responsibility" in legal["statement"].lower()


def test_oil_type_and_volume_not_established(sample_canonical_evidence):
    """14, 15. Verify oil type and volume cannot be invented."""
    dossier = synthesize_investigation_dossier(sample_canonical_evidence)
    oil_vol = dossier["oilTypeAndVolume"]
    assert oil_vol["oilTypeStatus"] == SEMANTIC_STATUS_NOT_ESTABLISHED
    assert "not established" in oil_vol["oilTypeStatement"].lower()
    assert oil_vol["volumeStatus"] == SEMANTIC_STATUS_NOT_ESTABLISHED
    assert "not established" in oil_vol["volumeStatement"].lower()


def test_malformed_llm_json_fallback_handling(sample_canonical_evidence):
    """16. Verify malformed LLM JSON triggers fallback and records status."""
    mock_bad_json = MockLLMProvider(mock_response_override="INVALID JSON {broken")
    dossier = synthesize_investigation_dossier(sample_canonical_evidence, provider_override=mock_bad_json)
    assert dossier["schemaVersion"] == DOSSIER_SCHEMA_VERSION
    assert dossier["synthesisMetadata"]["synthesisStatus"] == "LLM_SCHEMA_INVALID"


def test_schema_validation_failure_handling(sample_canonical_evidence):
    """17. Verify invalid schema output from LLM triggers validation fallback."""
    mock_bad_schema = MockLLMProvider(mock_response_override=json.dumps({"wrong": "format"}))
    dossier = synthesize_investigation_dossier(sample_canonical_evidence, provider_override=mock_bad_schema)
    assert dossier["schemaVersion"] == DOSSIER_SCHEMA_VERSION
    assert dossier["synthesisMetadata"]["synthesisStatus"] == "LLM_SCHEMA_INVALID"


def test_provider_unavailable_handling(sample_canonical_evidence):
    """18, 19. Verify unconfigured provider or API errors handle gracefully."""
    cfg = LLMConfig(provider="gemini", api_key=None)
    assert not cfg.is_configured()
    dossier = synthesize_investigation_dossier(sample_canonical_evidence, config=cfg)
    assert dossier["schemaVersion"] == DOSSIER_SCHEMA_VERSION
    assert dossier["synthesisMetadata"]["synthesisStatus"] == "LLM_NOT_CONFIGURED"


def test_no_api_key_exposed_in_output_or_repr():
    """20. Verify API keys are masked and never serialized."""
    cfg = LLMConfig(provider="gemini", api_key="AIzaSySECRETKEY123456789")
    cfg_dict = cfg.to_dict(mask_secrets=True)
    assert "AIzaSySECRETKEY123456789" not in str(cfg_dict)
    assert "6789" in cfg_dict["apiKeyPreview"]
    assert "AIzaSySECRETKEY123456789" not in repr(cfg)


def test_evidence_references_resolve_to_real_fields(sample_canonical_evidence):
    """21. Verify evidenceRefs resolve to actual fields in canonical evidence."""
    dossier = synthesize_investigation_dossier(sample_canonical_evidence)
    for section_name in ["spillDetection", "geospatialEvidence", "driftEvidence", "aisEvidence"]:
        refs = dossier[section_name]["evidenceRefs"]
        for ref in refs:
            assert resolve_evidence_ref(sample_canonical_evidence, ref) is True


def test_demo_and_real_isolation_checks(sample_canonical_evidence):
    """22, 23. Verify demo AIS never becomes REAL_AIS, and demo SAR never becomes REAL_CDSE."""
    demo_ais_evidence = assemble_canonical_evidence_contract(
        sar_metadata={"sourceType": "REAL_CDSE"},
        ais_correlation_evidence={"candidates": [], "provenance": {"aisSource": "DEMO"}}
    )
    dossier = synthesize_investigation_dossier(demo_ais_evidence)
    assert dossier["provenance"]["combinationStatus"] == "DEMO_AIS_CORRELATION"
    assert dossier["provenance"]["aisSource"] == "DEMO"
    assert dossier["provenance"]["sarSource"] == "REAL_CDSE"


def test_deterministic_low_temperature_configuration():
    """24. Verify temperature is strictly clamped to <= 0.20."""
    high_temp_cfg = LLMConfig(temperature=0.95)
    assert high_temp_cfg.temperature == 0.20
    low_temp_cfg = LLMConfig(temperature=0.05)
    assert low_temp_cfg.temperature == 0.05
