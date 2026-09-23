"""
Unit Tests for Part 0.13E: Canonical Evidence Contract & AIS Scientific Audit.

Validates:
  1. Complete evidence chain data flow (0.13A -> 0.13B -> 0.13C -> 0.13D -> Canonical Contract).
  2. Canonical structured evidence object completeness and schema compliance.
  3. CPA semantics audit (stationary reference point minimum distance vs dynamic relative motion CPA).
  4. Analytical correlation score classification (ANALYTICAL_CORRELATION_SCORE), components, and weights exposure.
  5. Configuration reproducibility & AISCorrelationConfig versioning.
  6. REAL / DEMO provenance isolation across all combinations.
  7. Strict enforcement of non-attribution legal guardrails (legalResponsibility == NOT_ESTABLISHED).
  8. Prohibition and rejection of forbidden attribution terminology.
  9. Future LLM contract boundary definition.
"""

import pytest
from datetime import datetime, timezone, timedelta

from app.ais.spill_ais_engine import (
    AISCorrelationConfig,
    DEFAULT_AIS_CONFIG,
    compute_correlation_score,
    calculate_vessel_cpa,
    correlate_vessels_with_drift_corridor,
)
from app.core.canonical_evidence import (
    CANONICAL_CONTRACT_VERSION,
    SEMANTIC_STATUS_OBSERVED,
    SEMANTIC_STATUS_DERIVED,
    SEMANTIC_STATUS_MODELLED,
    SEMANTIC_STATUS_AIS,
    SEMANTIC_STATUS_NOT_ESTABLISHED,
    PROHIBITED_ATTRIBUTION_TERMS,
    assemble_canonical_evidence_contract,
    derive_combination_provenance_status,
    validate_no_prohibited_terms,
    CanonicalEvidenceError,
)


@pytest.fixture
def mock_evidence_chain():
    """Provides a realistic multi-stage evidence chain fixture."""
    # 0.13A SAR Detection Evidence
    sar_detection = {
        "modelId": "unet-dual-pol-sar-v09d-residual-loss",
        "threshold": 0.50,
        "sourceType": "REAL_CDSE",
        "sceneId": "S1A_IW_GRDH_1SDV_20260919T060000_TEST",
        "acquisitionTimestamp": "2026-09-19T06:00:00Z"
    }

    # 0.13B Geospatial Spill Candidate Evidence
    geospatial_evidence = {
        "sourceType": "REAL_CDSE",
        "sceneId": "S1A_IW_GRDH_1SDV_20260919T060000_TEST",
        "acquisitionTimestamp": "2026-09-19T06:00:00Z",
        "candidateCount": 1,
        "candidates": [
            {
                "id": "cand_reg_mumbai_1",
                "surfaceAreaKm2": 4.85,
                "surfaceAreaM2": 4850000.0,
                "perimeterMeters": 14200.0,
                "centroid": {"latitude": 18.92, "longitude": 72.81},
                "boundingBox": [72.78, 18.89, 72.84, 18.95],
                "aspectRatio": 2.85,
                "compactness": 0.32,
                "elongation": 0.65,
                "modelOutputStatistics": {
                    "meanProbability": 0.88,
                    "peakProbability": 0.96,
                    "stdDevProbability": 0.07
                },
                "crs": "EPSG:4326"
            }
        ],
        "geojson": {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "id": "cand_reg_mumbai_1",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[72.78, 18.89], [72.84, 18.89], [72.84, 18.95], [72.78, 18.95], [72.78, 18.89]]]
                    },
                    "properties": {"name": "Candidate Spill 1"}
                }
            ]
        }
    }

    # 0.13C Metocean Drift & Backtracking Evidence
    drift_evidence = {
        "engine": "Lagrangian Advection",
        "sourceType": "REAL_CDSE",
        "observed": {
            "centroid": {"latitude": 18.92, "longitude": 72.81},
            "timestamp": "2026-09-19T06:00:00Z"
        },
        "forcing": {
            "source": "ERA5_REANALYSIS_COUPLED",
            "windSpeedMps": 6.5,
            "windDirectionDeg": 220.0,
            "currentSpeedMps": 0.35,
            "currentDirectionDeg": 340.0,
            "leewayFactor": 0.03,
            "eddyDiffusivityKh": 10.0
        },
        "drift": {
            "hindcastDurationHours": 24.0,
            "modeledOrigin": {
                "latitude": 19.15,
                "longitude": 72.62,
                "timestamp": "2026-09-18T06:00:00Z",
                "uncertaintyRadiusKm": 1.85
            },
            "uncertaintyEnvelope": {
                "type": "Polygon",
                "coordinates": [[[72.58, 19.12], [72.66, 19.12], [72.66, 19.18], [72.58, 19.18], [72.58, 19.12]]]
            },
            "backwardPath": [
                {"lat": 18.92, "lng": 72.81, "timestamp": "2026-09-19T06:00:00Z"},
                {"lat": 19.04, "lng": 72.71, "timestamp": "2026-09-18T18:00:00Z"},
                {"lat": 19.15, "lng": 72.62, "timestamp": "2026-09-18T06:00:00Z"}
            ],
            "forwardPath": []
        },
        "geojson": {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "id": "drift_backward_path",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[72.81, 18.92], [72.71, 19.04], [72.62, 19.15]]
                    },
                    "properties": {"name": "Backward Drift Path"}
                }
            ]
        }
    }

    # 0.13D AIS Trajectory Correlation Evidence
    vessel_tracks = [
        {
            "mmsi": "419000888",
            "name": "ARABIAN SEAS",
            "imo": "9812345",
            "vesselType": "Oil Tanker",
            "flag": "India",
            "trackPoints": [
                {"lat": 19.13, "lng": 72.60, "timestamp": "2026-09-18T05:30:00Z", "SOG": 12.5, "COG": 135.0},
                {"lat": 19.15, "lng": 72.63, "timestamp": "2026-09-18T06:15:00Z", "SOG": 12.4, "COG": 135.0},
                {"lat": 19.18, "lng": 72.66, "timestamp": "2026-09-18T07:00:00Z", "SOG": 12.5, "COG": 135.0},
            ]
        }
    ]

    ais_evidence = correlate_vessels_with_drift_corridor(
        drift_result=drift_evidence,
        vessel_tracks=vessel_tracks,
        sar_metadata={"sourceType": "REAL_CDSE", "sceneId": "S1A_IW_GRDH_1SDV_20260919T060000_TEST"},
        ais_source_type="REAL_AIS"
    )

    return {
        "sar_detection": sar_detection,
        "geospatial": geospatial_evidence,
        "drift": drift_evidence,
        "ais": ais_evidence
    }


def test_canonical_evidence_contract_structure_and_completeness(mock_evidence_chain):
    """Verify all required fields, schemas, and semantic status tags in the canonical contract."""
    contract = assemble_canonical_evidence_contract(
        sar_detection_evidence=mock_evidence_chain["sar_detection"],
        geospatial_evidence=mock_evidence_chain["geospatial"],
        metocean_drift_evidence=mock_evidence_chain["drift"],
        ais_correlation_evidence=mock_evidence_chain["ais"],
        sar_metadata={"sourceType": "REAL_CDSE", "sceneId": "S1A_SCENE_001"},
        analysis_id="test_analysis_101"
    )

    assert contract["contractVersion"] == CANONICAL_CONTRACT_VERSION
    assert contract["provenance"]["analysisId"] == "test_analysis_101"
    assert contract["provenance"]["combinationStatus"] == "REAL_ANALYTICAL"
    assert contract["provenance"]["modelRelease"] == "OG-SAR-ML-RESEARCH-RELEASE-V0.12"

    # Semantic Status checks
    assert contract["sarDetection"]["semanticStatus"] == SEMANTIC_STATUS_OBSERVED
    assert contract["geospatialEvidence"]["semanticStatus"] == SEMANTIC_STATUS_DERIVED
    assert contract["metoceanDriftEvidence"]["semanticStatus"] == SEMANTIC_STATUS_MODELLED
    assert contract["aisCorrelationEvidence"]["semanticStatus"] == SEMANTIC_STATUS_AIS

    # Data content checks
    assert contract["geospatialEvidence"]["surfaceAreaKm2"] == 4.85
    assert contract["metoceanDriftEvidence"]["hindcastDurationHours"] == 24.0
    assert contract["aisCorrelationEvidence"]["candidateCount"] == 1
    assert contract["aisCorrelationEvidence"]["candidates"][0]["mmsi"] == "419000888"


def test_cpa_semantics_audit_and_stationary_point_distinction():
    """
    Verify CPA is explicitly characterized as minimum historical distance to stationary target,
    not dynamic relative-motion CPA.
    """
    target_lat, target_lon = 19.15, 72.62
    track_points = [
        {"lat": 19.10, "lng": 72.60, "timestamp": "2026-09-18T05:00:00Z", "SOG": 10.0, "COG": 45.0},
        {"lat": 19.151, "lng": 72.621, "timestamp": "2026-09-18T06:00:00Z", "SOG": 10.1, "COG": 45.0},
        {"lat": 19.20, "lng": 72.64, "timestamp": "2026-09-18T07:00:00Z", "SOG": 10.0, "COG": 45.0},
    ]

    cpa = calculate_vessel_cpa(track_points, target_lat, target_lon)
    assert cpa["status"] == "ESTABLISHED"
    assert cpa["metricSemantic"] == "MINIMUM_HISTORICAL_DISTANCE_TO_STATIONARY_POINT"
    assert cpa["isDynamicRelativeMotionCPA"] is False
    assert cpa["cpaDistanceKm"] < 0.2  # ~150 meters


def test_analytical_correlation_score_classification_and_weights_exposure():
    """
    Verify correlation score is classified as ANALYTICAL_CORRELATION_SCORE with transparent components/weights.
    """
    score, score_data = compute_correlation_score(
        distance_to_origin_km=1.2,
        min_distance_to_trajectory_km=0.8,
        uncertainty_radius_km=1.5,
        temporal_difference_hours=0.5,
        data_quality_score=0.95
    )

    assert score_data["scoreType"] == "ANALYTICAL_CORRELATION_SCORE"
    assert "components" in score_data
    assert "weights" in score_data

    # Verify mathematical weights: 0.35, 0.25, 0.25, 0.15
    assert score_data["weights"]["spatial"] == 0.35
    assert score_data["weights"]["temporal"] == 0.25
    assert score_data["weights"]["trajectory"] == 0.25
    assert score_data["weights"]["dataQuality"] == 0.15

    # Sum of weights must equal 1.0
    total_weights = sum(score_data["weights"].values())
    assert total_weights == pytest.approx(1.0)


def test_ais_correlation_config_versioning_and_reproducibility():
    """Verify AISCorrelationConfig externalizes parameters and records version."""
    custom_cfg = AISCorrelationConfig(
        config_version="v1.0.0-custom",
        spatial_decay_scale_km=20.0,
        temporal_decay_scale_hours=8.0,
        trajectory_decay_scale_km=15.0,
        weight_spatial=0.40,
        weight_temporal=0.20,
        weight_trajectory=0.25,
        weight_data_quality=0.15
    )
    cfg_dict = custom_cfg.to_dict()
    assert cfg_dict["configVersion"] == "v1.0.0-custom"
    assert cfg_dict["parameters"]["spatialDecayScaleKm"] == 20.0
    assert cfg_dict["weights"]["spatial"] == 0.40


def test_provenance_isolation_matrix():
    """Verify strict REAL/DEMO isolation across all 4 combinations."""
    assert derive_combination_provenance_status("REAL_CDSE", "REAL_AIS") == "REAL_ANALYTICAL"
    assert derive_combination_provenance_status("DEMO", "DEMO") == "DEMO"
    assert derive_combination_provenance_status("REAL_CDSE", "DEMO") == "DEMO_AIS_CORRELATION"
    assert derive_combination_provenance_status("DEMO", "REAL_AIS") == "DEMO_SAR_CORRELATION"


def test_legal_responsibility_strictly_not_established(mock_evidence_chain):
    """Verify legal responsibility, liability, and confirmed discharge remain strictly NOT_ESTABLISHED."""
    contract = assemble_canonical_evidence_contract(
        sar_detection_evidence=mock_evidence_chain["sar_detection"],
        geospatial_evidence=mock_evidence_chain["geospatial"],
        metocean_drift_evidence=mock_evidence_chain["drift"],
        ais_correlation_evidence=mock_evidence_chain["ais"]
    )

    guardrails = contract["legalGuardrails"]
    assert guardrails["legalResponsibility"] == SEMANTIC_STATUS_NOT_ESTABLISHED
    assert guardrails["confirmedDischarge"] == SEMANTIC_STATUS_NOT_ESTABLISHED
    assert guardrails["intentionalDischarge"] == SEMANTIC_STATUS_NOT_ESTABLISHED
    assert guardrails["vesselLiability"] == SEMANTIC_STATUS_NOT_ESTABLISHED


def test_rejection_of_prohibited_attribution_terms():
    """Verify validator strictly rejects forbidden blame / legal causation terms."""
    valid_data = {
        "candidate": "ARABIAN SEAS",
        "rankingPolicy": "CORRELATION_CANDIDATE_ORDER",
        "evidenceStatus": "AIS_CORRELATED_CANDIDATE"
    }
    validate_no_prohibited_terms(valid_data)

    for forbidden in PROHIBITED_ATTRIBUTION_TERMS:
        invalid_data = {
            "candidate": "ARABIAN SEAS",
            "status": forbidden
        }
        with pytest.raises(CanonicalEvidenceError, match="Violation of Scientific Guardrails"):
            validate_no_prohibited_terms(invalid_data)


def test_future_llm_boundary_declaration(mock_evidence_chain):
    """Verify the future LLM boundary defines strict summarization scope and prohibited actions."""
    contract = assemble_canonical_evidence_contract(
        sar_detection_evidence=mock_evidence_chain["sar_detection"],
        geospatial_evidence=mock_evidence_chain["geospatial"],
        metocean_drift_evidence=mock_evidence_chain["drift"],
        ais_correlation_evidence=mock_evidence_chain["ais"]
    )

    llm_boundary = contract["futureLlmBoundary"]
    assert llm_boundary["llmSynthesisStatus"] == "NOT_IMPLEMENTED"
    assert llm_boundary["contractScope"] == "STRICT_SUMMARIZATION_ONLY"
    assert len(llm_boundary["authorizedCapabilities"]) >= 4
    assert len(llm_boundary["strictlyProhibitedActions"]) >= 7

    # Check specific prohibited actions
    prohibitions = " ".join(llm_boundary["strictlyProhibitedActions"])
    assert "calculate distances" in prohibitions
    assert "calculate drift" in prohibitions
    assert "calculate correlation score" in prohibitions
    assert "infer legal responsibility" in prohibitions
    assert "convert correlation into causation" in prohibitions
