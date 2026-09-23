"""
Canonical Evidence Contract & Multi-Stage Evidence Assembly.
Part 0.13E - Ocean Guard AI

Assembles a unified, versioned, tamper-auditable Canonical Evidence Package from:
  1. Part 0.13A: Frozen V09D SAR Segmentation (OBSERVED)
  2. Part 0.13B: Georeferenced Candidate Spill Analysis (DERIVED)
  3. Part 0.13C: Metocean Drift & Reverse Hindcast (MODELLED)
  4. Part 0.13D: AIS Vessel Trajectory Correlation (AIS)

Scientific & Legal Guardrails:
  - Every evidence field contains explicit provenance and semantic status.
  - Legal responsibility, confirmed discharge, and vessel liability are strictly NOT_ESTABLISHED.
  - Prohibits terminology: RESPONSIBLE_VESSEL, CONFIRMED_VESSEL, GUILTY_VESSEL, CAUSED_SPILL.
  - Explicitly defines the Future LLM Boundary (summarization only; no calculations or guilt attribution).
"""

import time
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple, Union

logger = logging.getLogger(__name__)

CANONICAL_CONTRACT_VERSION = "OG-CANONICAL-EVIDENCE-CONTRACT-V1.0"

# Explicit Semantic Statuses
SEMANTIC_STATUS_OBSERVED = "OBSERVED"
SEMANTIC_STATUS_DERIVED = "DERIVED"
SEMANTIC_STATUS_MODELLED = "MODELLED"
SEMANTIC_STATUS_AIS = "AIS"
SEMANTIC_STATUS_NOT_ESTABLISHED = "NOT_ESTABLISHED"

# Prohibited Attribution Terminology
PROHIBITED_ATTRIBUTION_TERMS = {
    "RESPONSIBLE_VESSEL",
    "CONFIRMED_VESSEL",
    "GUILTY_VESSEL",
    "CAUSED_SPILL",
    "PROBABILITY_OF_GUILT",
    "ATTRIBUTION_CONFIDENCE_SCORE",
    "DISCHARGE_PROBABILITY",
}


class CanonicalEvidenceError(Exception):
    """Raised when canonical evidence contract assembly or validation fails."""
    pass


def validate_no_prohibited_terms(data: Any, path: str = "") -> None:
    """
    Recursively scans data structure to ensure no prohibited attribution terms are used
    as candidate statuses, ranking labels, or claims.
    Ignores the guardrail definitions list itself (prohibitedAttributionTerms, strictlyProhibitedActions).
    """
    if path.endswith("prohibitedAttributionTerms") or path.endswith("strictlyProhibitedActions") or "prohibitedAttributionTerms" in path or "strictlyProhibitedActions" in path:
        return

    if isinstance(data, str):
        for term in PROHIBITED_ATTRIBUTION_TERMS:
            if term in data.upper():
                raise CanonicalEvidenceError(
                    f"Violation of Scientific Guardrails: Prohibited attribution term '{term}' found at path '{path}'"
                )
    elif isinstance(data, dict):
        for k, v in data.items():
            validate_no_prohibited_terms(v, f"{path}.{k}" if path else k)
    elif isinstance(data, list):
        for idx, item in enumerate(data):
            validate_no_prohibited_terms(item, f"{path}[{idx}]")


def derive_combination_provenance_status(
    sar_source: str,
    ais_source: str
) -> str:
    """
    Enforce strict REAL/DEMO isolation matrix.
    Never silently combine demo and real data streams.
    """
    sar_is_real = sar_source in ("REAL_CDSE", "UPLOADED_REAL_SAR", "REAL_SAR")
    ais_is_real = ais_source in ("REAL_AIS", "REAL")

    if sar_is_real and ais_is_real:
        return "REAL_ANALYTICAL"
    elif not sar_is_real and not ais_is_real:
        return "DEMO"
    elif sar_is_real and not ais_is_real:
        return "DEMO_AIS_CORRELATION"
    elif not sar_is_real and ais_is_real:
        return "DEMO_SAR_CORRELATION"
    return "CUSTOM_ANALYTICAL"


def assemble_canonical_evidence_contract(
    sar_detection_evidence: Optional[Dict[str, Any]] = None,
    geospatial_evidence: Optional[Dict[str, Any]] = None,
    metocean_drift_evidence: Optional[Dict[str, Any]] = None,
    ais_correlation_evidence: Optional[Dict[str, Any]] = None,
    sar_metadata: Optional[Dict[str, Any]] = None,
    analysis_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Assemble and validate the complete canonical structured evidence contract.

    Args:
        sar_detection_evidence: Output from Part 0.13A (V09D inference).
        geospatial_evidence: Output from Part 0.13B (Candidate region analysis).
        metocean_drift_evidence: Output from Part 0.13C (Drift/backtracking engine).
        ais_correlation_evidence: Output from Part 0.13D (AIS correlation engine).
        sar_metadata: Direct SAR scene provenance metadata.
        analysis_id: Unique analysis identifier.

    Returns:
        Structured canonical evidence dictionary adhering to OG-CANONICAL-EVIDENCE-CONTRACT-V1.0.
    """
    t_start = time.perf_counter()
    gen_time_str = datetime.now(timezone.utc).isoformat()

    sar_meta = sar_metadata or {}
    sar_source = (
        sar_meta.get("sourceType") or
        (sar_detection_evidence.get("sourceType") if sar_detection_evidence else None) or
        (geospatial_evidence.get("sourceType") if geospatial_evidence else None) or
        (metocean_drift_evidence.get("sourceType") if metocean_drift_evidence else None) or
        "REAL_CDSE"
    )

    ais_source = (
        (ais_correlation_evidence.get("provenance", {}).get("aisSource") if ais_correlation_evidence else None) or
        "REAL_AIS"
    )

    combination_status = derive_combination_provenance_status(sar_source, ais_source)

    # 1. Audit Upstream Data Flow & Consistency
    # If geospatial candidate exists, extract primary candidate region
    primary_candidate_region = None
    if geospatial_evidence:
        candidates_list = geospatial_evidence.get("candidates", [])
        if candidates_list:
            primary_candidate_region = candidates_list[0]
        elif "surfaceAreaKm2" in geospatial_evidence:
            primary_candidate_region = geospatial_evidence

    # Verify drift observed centroid aligns with geospatial candidate centroid
    if metocean_drift_evidence and primary_candidate_region:
        drift_obs_lat = metocean_drift_evidence.get("observed", {}).get("centroid", {}).get("latitude")
        cand_centroid_lat = primary_candidate_region.get("centroid", {}).get("latitude")
        if drift_obs_lat is not None and cand_centroid_lat is not None:
            if abs(drift_obs_lat - cand_centroid_lat) > 0.05:
                logger.warning(
                    "[EvidenceContract] Spatial discrepancy between geospatial candidate (lat=%.4f) and drift observed centroid (lat=%.4f)",
                    cand_centroid_lat, drift_obs_lat
                )

    # 2. Build Structured Sections

    # A. Provenance Record
    provenance = {
        "contractVersion": CANONICAL_CONTRACT_VERSION,
        "analysisId": analysis_id or f"analysis_{int(time.time()*1000)}",
        "evidenceGeneratedTimestamp": gen_time_str,
        "sarSource": sar_source,
        "sarSceneId": sar_meta.get("sceneId", "SENTINEL1_SAR_SCENE"),
        "sarAcquisitionTimestamp": sar_meta.get("acquisitionTimestamp", (
            geospatial_evidence.get("acquisitionTimestamp") if geospatial_evidence else gen_time_str
        )),
        "metoceanSource": (
            metocean_drift_evidence.get("forcing", {}).get("source", "ERA5_REANALYSIS_COUPLED")
            if metocean_drift_evidence else "NOT_APPLIED"
        ),
        "driftModelVersion": (
            metocean_drift_evidence.get("engine", "LAGRANGIAN_ADVECTION_V1.0")
            if metocean_drift_evidence else "NOT_APPLIED"
        ),
        "aisSource": ais_source,
        "combinationStatus": combination_status,
        "modelRelease": "OG-SAR-ML-RESEARCH-RELEASE-V0.12",
        "checkpointModelId": "unet-dual-pol-sar-v09d-residual-loss",
    }

    # B. SAR Detection Evidence (OBSERVED)
    sar_section = {
        "semanticStatus": SEMANTIC_STATUS_OBSERVED,
        "modelId": "unet-dual-pol-sar-v09d-residual-loss",
        "operatingThreshold": 0.50,
        "totalRegionsDetected": (
            len(geospatial_evidence.get("candidates", []))
            if geospatial_evidence and "candidates" in geospatial_evidence
            else (1 if geospatial_evidence else 0)
        ),
        "rawInferenceAvailable": bool(sar_detection_evidence),
        "calibration": "sentinel1_sigma0_db_v1",
        "channels": ["VV", "VH", "VV_VH_RATIO"]
    }

    # C. Geospatial Spill Candidate Evidence (DERIVED)
    if primary_candidate_region:
        geo_section = {
            "semanticStatus": SEMANTIC_STATUS_DERIVED,
            "candidateRegionId": primary_candidate_region.get("id", primary_candidate_region.get("candidateId", "cand_reg_1")),
            "surfaceAreaKm2": primary_candidate_region.get("surfaceAreaKm2"),
            "surfaceAreaM2": primary_candidate_region.get("surfaceAreaM2"),
            "perimeterMeters": primary_candidate_region.get("perimeterMeters"),
            "observedCentroid": primary_candidate_region.get("centroid", {}),
            "boundingBox": primary_candidate_region.get("boundingBox", []),
            "shapeDescriptors": {
                "aspectRatio": primary_candidate_region.get("aspectRatio"),
                "compactness": primary_candidate_region.get("compactness"),
                "elongation": primary_candidate_region.get("elongation")
            },
            "modelOutputStatistics": primary_candidate_region.get("modelOutputStatistics", {
                "meanProbability": primary_candidate_region.get("meanConfidence"),
                "peakProbability": primary_candidate_region.get("maxConfidence")
            }),
            "crs": primary_candidate_region.get("crs", "EPSG:4326"),
            "metricCrs": "EPSG:6933"
        }
    else:
        geo_section = {
            "semanticStatus": SEMANTIC_STATUS_NOT_ESTABLISHED,
            "status": "NO_CANDIDATE_GEOMETRY"
        }

    # D. Metocean Drift & Reverse Hindcasting Evidence (MODELLED)
    if metocean_drift_evidence and "drift" in metocean_drift_evidence:
        drift_data = metocean_drift_evidence.get("drift", {})
        forcing_data = metocean_drift_evidence.get("forcing", {})
        obs_data = metocean_drift_evidence.get("observed", {})
        
        drift_section = {
            "semanticStatus": SEMANTIC_STATUS_MODELLED,
            "engine": metocean_drift_evidence.get("engine", "Lagrangian Advection"),
            "hindcastDurationHours": drift_data.get("hindcastDurationHours", 24.0),
            "observedCentroid": obs_data.get("centroid", {}),
            "observedTimestamp": obs_data.get("timestamp"),
            "modelledOrigin": drift_data.get("modeledOrigin", {}),
            "uncertaintyEnvelope": drift_data.get("uncertaintyEnvelope", {}),
            "backwardTrajectoryPath": drift_data.get("backwardPath", []),
            "forwardDispersionPath": drift_data.get("forwardPath", []),
            "forcingParameters": {
                "surfaceWindSpeedMps": forcing_data.get("windSpeedMps"),
                "surfaceWindDirectionDeg": forcing_data.get("windDirectionDeg"),
                "surfaceCurrentSpeedMps": forcing_data.get("currentSpeedMps"),
                "surfaceCurrentDirectionDeg": forcing_data.get("currentDirectionDeg"),
                "leewayFactor": forcing_data.get("leewayFactor", 0.03),
                "horizontalDiffusivityKhM2s": forcing_data.get("eddyDiffusivityKh", 10.0),
                "era5SpatialResolutionNote": "10-m surface wind denotes 10-meter atmospheric measurement height, not 10m horizontal spatial grid."
            }
        }
    else:
        drift_section = {
            "semanticStatus": SEMANTIC_STATUS_NOT_ESTABLISHED,
            "status": "DRIFT_SIMULATION_NOT_APPLIED"
        }

    # E. AIS Trajectory Correlation Evidence (AIS)
    if ais_correlation_evidence and "candidates" in ais_correlation_evidence:
        ais_candidates_raw = ais_correlation_evidence.get("candidates", [])
        ais_candidates_formatted = []

        for cand in ais_candidates_raw:
            score_data = cand.get("scoreComponents", {})
            cpa_data = cand.get("cpa", {})
            
            # Format clean candidate record
            cand_entry = {
                "candidateId": cand.get("candidateId"),
                "mmsi": cand.get("mmsi"),
                "vesselName": cand.get("vesselName"),
                "imo": cand.get("imo"),
                "vesselType": cand.get("vesselType"),
                "flag": cand.get("flag"),
                "sourceType": cand.get("sourceType"),
                "evidenceStatus": cand.get("evidenceStatus"),
                "analyticalCorrelation": {
                    "score": cand.get("correlationScore"),
                    "scoreType": "ANALYTICAL_CORRELATION_SCORE",
                    "components": score_data.get("components", {
                        "spatial": score_data.get("spatialProximityScore"),
                        "temporal": score_data.get("temporalAlignmentScore"),
                        "trajectory": score_data.get("trajectoryAlignmentScore"),
                        "dataQuality": score_data.get("dataQualityFactor")
                    }),
                    "weights": score_data.get("weights", {
                        "spatial": 0.35,
                        "temporal": 0.25,
                        "trajectory": 0.25,
                        "dataQuality": 0.15
                    })
                },
                "spatialEvidence": cand.get("spatialEvidence", {}),
                "temporalEvidence": cand.get("temporalEvidence", {}),
                "minimumDistanceToModelledOrigin": {
                    "distanceKm": cpa_data.get("cpaDistanceKm"),
                    "closestPointTimestamp": cpa_data.get("cpaTimestamp"),
                    "closestPointLatitude": cpa_data.get("cpaLatitude"),
                    "closestPointLongitude": cpa_data.get("cpaLongitude"),
                    "closestPointSogKnots": cpa_data.get("cpaSogKnots"),
                    "closestPointCogDeg": cpa_data.get("cpaCogDeg"),
                    "metricSemantic": "MINIMUM_HISTORICAL_DISTANCE_TO_STATIONARY_POINT",
                    "isDynamicRelativeMotionCPA": False
                },
                "cpa": cpa_data,
                "trajectoryEvidence": cand.get("trajectoryEvidence", {}),
                "dataQuality": cand.get("dataQuality", {}),
                "scientificGuardrails": {
                    "legalResponsibility": SEMANTIC_STATUS_NOT_ESTABLISHED,
                    "confirmedDischarge": SEMANTIC_STATUS_NOT_ESTABLISHED,
                    "vesselLiability": SEMANTIC_STATUS_NOT_ESTABLISHED,
                    "analyticalLimitation": "Spatio-temporal alignment with modelled drift corridor constitutes analytical correlation evidence only; does not establish causation or legal liability."
                }
            }
            ais_candidates_formatted.append(cand_entry)

        ais_section = {
            "semanticStatus": SEMANTIC_STATUS_AIS,
            "rankingPolicy": "CORRELATION_CANDIDATE_ORDER",
            "correlationConfig": ais_correlation_evidence.get("correlationConfig", {
                "configVersion": "v1.0.0",
                "weights": {"spatial": 0.35, "temporal": 0.25, "trajectory": 0.25, "dataQuality": 0.15}
            }),
            "searchCorridor": ais_correlation_evidence.get("searchCorridor", {}),
            "candidateCount": len(ais_candidates_formatted),
            "candidates": ais_candidates_formatted
        }
    else:
        ais_section = {
            "semanticStatus": SEMANTIC_STATUS_NOT_ESTABLISHED,
            "status": "AIS_CORRELATION_NOT_APPLIED",
            "candidateCount": 0,
            "candidates": []
        }

    # F. GeoJSON Evidence Layers
    geojson_features = []
    if geospatial_evidence and "geojson" in geospatial_evidence:
        geo_coll = geospatial_evidence["geojson"]
        if isinstance(geo_coll, dict) and "features" in geo_coll:
            geojson_features.extend(geo_coll["features"])
    if metocean_drift_evidence and "geojson" in metocean_drift_evidence:
        drift_coll = metocean_drift_evidence["geojson"]
        if isinstance(drift_coll, dict) and "features" in drift_coll:
            geojson_features.extend(drift_coll["features"])
    if ais_correlation_evidence and "geojson" in ais_correlation_evidence:
        ais_coll = ais_correlation_evidence["geojson"]
        if isinstance(ais_coll, dict) and "features" in ais_coll:
            geojson_features.extend(ais_coll["features"])

    geojson_collection = {
        "type": "FeatureCollection",
        "features": geojson_features,
        "metadata": {
            "totalFeatures": len(geojson_features),
            "combinationStatus": combination_status
        }
    }

    # G. Scientific Limitations
    scientific_limitations = {
        "sarSegmentation": (
            "SAR dark formations represent low-backscatter surface anomalies. "
            "Natural biogenic slicks, low wind calm zones (< 2-3 m/s), rain cells, and upwelling "
            "can produce lookalikes. SAR imagery alone cannot chemically verify petroleum hydrocarbons."
        ),
        "metoceanDrift": (
            "Lagrangian reverse hindcasting relies on gridded atmospheric/oceanic reanalysis (e.g., ERA5, HYCOM). "
            "Wind leeway factors (3.0%) and turbulent eddy diffusivity (Kh=10 m^2/s) model probability envelopes, "
            "not deterministic vessel discharge points."
        ),
        "aisCorrelation": (
            "AIS correlation identifies vessels physically present in the spatio-temporal search envelope. "
            "Correlation does not constitute proof of discharge. Unmonitored vessels with AIS transmitters disabled "
            "(dark vessels) or anomalous spoofed data may exist."
        )
    }

    # H. Legal Guardrails & Non-Attribution Principle
    legal_guardrails = {
        "legalResponsibility": SEMANTIC_STATUS_NOT_ESTABLISHED,
        "confirmedDischarge": SEMANTIC_STATUS_NOT_ESTABLISHED,
        "intentionalDischarge": SEMANTIC_STATUS_NOT_ESTABLISHED,
        "vesselLiability": SEMANTIC_STATUS_NOT_ESTABLISHED,
        "prohibitedAttributionTerms": sorted(list(PROHIBITED_ATTRIBUTION_TERMS)),
        "disclaimer": (
            "This structured evidence dossier presents objective physical, geospatial, hydrodynamic, and "
            "AIS correlation metrics. It strictly does NOT establish legal responsibility, fault, or liability."
        )
    }

    # I. Future LLM Contract & Boundary Definition
    future_llm_boundary = {
        "llmSynthesisStatus": "NOT_IMPLEMENTED",
        "contractScope": "STRICT_SUMMARIZATION_ONLY",
        "authorizedCapabilities": [
            "Summarize canonical evidence metrics into human-readable multi-disciplinary briefings.",
            "Report observed SAR surface area, model probabilities, and shape factors.",
            "Explain metocean drift parameters and reverse origin uncertainty envelopes.",
            "Present AIS correlation candidates in CORRELATION_CANDIDATE_ORDER with analytical score breakdowns.",
            "Highlight data quality gaps and unmonitored dark vessel limitations."
        ],
        "strictlyProhibitedActions": [
            "calculate distances",
            "calculate CPA",
            "calculate drift",
            "calculate spill area",
            "calculate correlation score",
            "modify scores",
            "infer missing AIS evidence",
            "invent vessel information",
            "infer legal responsibility",
            "convert correlation into causation"
        ]
    }

    # Construct Full Canonical Evidence Contract Object
    evidence_contract = {
        "contractVersion": CANONICAL_CONTRACT_VERSION,
        "provenance": provenance,
        "sarDetection": sar_section,
        "geospatialEvidence": geo_section,
        "metoceanDriftEvidence": drift_section,
        "aisCorrelationEvidence": ais_section,
        "geojson": geojson_collection,
        "scientificLimitations": scientific_limitations,
        "legalGuardrails": legal_guardrails,
        "futureLlmBoundary": future_llm_boundary,
        "performance": {
            "contractAssemblyDurationMs": round((time.perf_counter() - t_start) * 1000, 2)
        }
    }

    # Final Guardrail Check: Ensure no prohibited words in assembled structure
    validate_no_prohibited_terms(evidence_contract)

    return evidence_contract
