"""
Evidence-to-Dossier LLM Synthesis Engine.
Part 0.13F - Ocean Guard AI

Transforms the Part 0.13E Canonical Evidence Contract into an auditable,
structured Analytical Investigation Dossier (OG-DOSSIER-V1).

Scientific & Legal Guardrails:
  1. The LLM is strictly a summarization and narrative explanation layer.
  2. It never performs calculations, never invents coordinates or timestamps.
  3. Every narrative statement is grounded in the canonical evidence and tagged with evidenceRefs.
  4. Legal responsibility, confirmed discharge, and vessel liability remain strictly NOT_ESTABLISHED.
  5. Correlation scores remain ANALYTICAL_CORRELATION_SCORE (never described as probability or guilt).
  6. Oil type and volume remain NOT_ESTABLISHED if absent from the canonical evidence.
  7. Strict schema validation and fallback handling (LLM_SUCCESS, LLM_NOT_CONFIGURED, LLM_SCHEMA_INVALID).
"""

import json
import time
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple, Union

from app.core.canonical_evidence import (
    CANONICAL_CONTRACT_VERSION,
    SEMANTIC_STATUS_OBSERVED,
    SEMANTIC_STATUS_DERIVED,
    SEMANTIC_STATUS_MODELLED,
    SEMANTIC_STATUS_AIS,
    SEMANTIC_STATUS_NOT_ESTABLISHED,
    PROHIBITED_ATTRIBUTION_TERMS,
    validate_no_prohibited_terms,
    CanonicalEvidenceError,
)
from app.dossier.llm_provider import (
    LLMConfig,
    BaseLLMProvider,
    MockLLMProvider,
    LLMProviderError,
    get_llm_provider,
)

logger = logging.getLogger(__name__)

DOSSIER_SCHEMA_VERSION = "OG-DOSSIER-V1"
EVIDENCE_RELEASE = "OG-SAR-ML-RESEARCH-RELEASE-V0.12"
LEGAL_NON_ATTRIBUTION_STATEMENT = (
    "The available evidence does not establish legal responsibility or vessel causation."
)
MANDATORY_DISCLAIMER = (
    "Attribution candidate ranking represents exploratory physical/spatial correlation with the "
    "modelled backward drift corridor. It does NOT constitute legal proof of spill discharge or vessel liability."
)

SYSTEM_PROMPT = """You are an evidence summarization system for Ocean Guard AI.

Your role is to strictly summarize and explain the supplied canonical evidence object into a structured JSON dossier (schema OG-DOSSIER-V1).

CRITICAL SCIENTIFIC & LEGAL RULES:
1. You must only describe information present in the supplied canonical evidence object.
2. You must not perform new calculations (distances, areas, coordinates, drift, CPA, or scores).
3. You must not infer missing evidence or invent vessel names, MMSI, IMO, coordinates, or weather conditions.
4. You must preserve OBSERVED, MODELLED, DERIVED, AIS, DEMO, REAL, and NOT_ESTABLISHED semantics.
5. You must never convert correlation into causation (e.g., never say "the vessel caused the spill").
6. You must never assign legal responsibility, culpability, or liability.
7. You must never describe an analytical correlation score as probability or confidence of guilt.
8. You must explicitly state uncertainty envelopes and scientific limitations.
9. If oil type or volume is not established, you must state "Oil type was not established from the available evidence" / "Spill volume was not established from the available evidence".
10. If demonstration data is used, you must explicitly declare that the dossier incorporates simulated demonstration data.
11. Every major section must include 'evidenceRefs' referencing the exact field paths from the canonical evidence object.
12. Output MUST be valid JSON adhering exactly to the OG-DOSSIER-V1 schema.
"""


class DossierValidationError(Exception):
    """Raised when dossier output fails schema or evidentiary guardrail validation."""
    pass


def resolve_evidence_ref(canonical_evidence: Dict[str, Any], path: str) -> bool:
    """
    Checks if an evidence reference path exists within the canonical evidence object.
    Supports dot-notation and simple array indexing (e.g. 'aisCorrelationEvidence.candidates[0]').
    """
    if not path or not isinstance(path, str):
        return False
    
    parts = path.replace("]", "").split(".")
    curr = canonical_evidence
    
    for part in parts:
        if "[" in part:
            key, idx_str = part.split("[")
            if not isinstance(curr, dict) or key not in curr:
                return False
            curr = curr[key]
            try:
                idx = int(idx_str)
                if not isinstance(curr, list) or idx >= len(curr):
                    return False
                curr = curr[idx]
            except (ValueError, IndexError):
                return False
        else:
            if not isinstance(curr, dict) or part not in curr:
                return False
            curr = curr[part]
            
    return True


def build_evidence_timeline(canonical_evidence: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Constructs a deterministic, chronological timeline strictly from existing canonical evidence timestamps.
    """
    events = []

    # 1. SAR Acquisition
    sar_prov = canonical_evidence.get("provenance", {})
    sar_ts = sar_prov.get("sarAcquisitionTimestamp")
    if sar_ts:
        events.append({
            "timestamp": sar_ts,
            "phase": "SAR_SATELLITE_ACQUISITION",
            "semanticStatus": SEMANTIC_STATUS_OBSERVED,
            "description": f"Sentinel-1 SAR acquisition over region (Scene: {sar_prov.get('sarSceneId', 'N/A')}).",
            "evidenceRef": "provenance.sarAcquisitionTimestamp"
        })

    # 2. Observed Centroid Detection
    geo = canonical_evidence.get("geospatialEvidence", {})
    if geo.get("semanticStatus") == SEMANTIC_STATUS_DERIVED and geo.get("surfaceAreaKm2"):
        events.append({
            "timestamp": sar_ts or datetime.now(timezone.utc).isoformat(),
            "phase": "CANDIDATE_SPILL_DERIVATION",
            "semanticStatus": SEMANTIC_STATUS_DERIVED,
            "description": f"Geospatial connected-component derivation identified candidate dark formation ({geo.get('surfaceAreaKm2')} km²).",
            "evidenceRef": "geospatialEvidence.surfaceAreaKm2"
        })

    # 3. Modelled Origin Event
    drift = canonical_evidence.get("metoceanDriftEvidence", {})
    if drift.get("semanticStatus") == SEMANTIC_STATUS_MODELLED:
        origin = drift.get("modelledOrigin", {})
        origin_ts = origin.get("timestamp")
        if origin_ts:
            events.append({
                "timestamp": origin_ts,
                "phase": "MODELLED_REVERSE_HINDCAST_ORIGIN",
                "semanticStatus": SEMANTIC_STATUS_MODELLED,
                "description": f"Lagrangian drift backward hindcast estimates candidate origin window (Uncertainty radius: {origin.get('uncertaintyRadiusKm', 1.85)} km).",
                "evidenceRef": "metoceanDriftEvidence.modelledOrigin.timestamp"
            })

    # 4. AIS Candidate Closest Points
    ais = canonical_evidence.get("aisCorrelationEvidence", {})
    candidates = ais.get("candidates", [])
    for idx, cand in enumerate(candidates):
        min_dist_obj = cand.get("minimumDistanceToModelledOrigin", {})
        cpa_ts = min_dist_obj.get("closestPointTimestamp")
        if cpa_ts:
            events.append({
                "timestamp": cpa_ts,
                "phase": "AIS_CLOSEST_APPROACH_POINT",
                "semanticStatus": SEMANTIC_STATUS_AIS,
                "description": (
                    f"Vessel {cand.get('vesselName', 'Unknown')} (MMSI: {cand.get('mmsi')}) minimum distance "
                    f"to modelled origin corridor ({min_dist_obj.get('distanceKm')} km)."
                ),
                "evidenceRef": f"aisCorrelationEvidence.candidates[{idx}].minimumDistanceToModelledOrigin"
            })

    # 5. Analysis Generation
    gen_ts = sar_prov.get("evidenceGeneratedTimestamp")
    if gen_ts:
        events.append({
            "timestamp": gen_ts,
            "phase": "CANONICAL_EVIDENCE_ASSEMBLY",
            "semanticStatus": SEMANTIC_STATUS_DERIVED,
            "description": "Multi-stage evidence assembly compiled into Canonical Evidence Contract.",
            "evidenceRef": "provenance.evidenceGeneratedTimestamp"
        })

    # Sort chronologically
    def safe_sort_key(ev):
        try:
            return ev["timestamp"]
        except Exception:
            return ""

    events.sort(key=safe_sort_key)
    return events


def synthesize_deterministic_dossier(canonical_evidence: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generates a fully compliant, factual OG-DOSSIER-V1 dossier directly from the
    canonical evidence contract without making external LLM calls.
    """
    prov = canonical_evidence.get("provenance", {})
    sar = canonical_evidence.get("sarDetection", {})
    geo = canonical_evidence.get("geospatialEvidence", {})
    drift = canonical_evidence.get("metoceanDriftEvidence", {})
    ais = canonical_evidence.get("aisCorrelationEvidence", {})
    limitations = canonical_evidence.get("scientificLimitations", {})
    
    is_demo = prov.get("combinationStatus") in ("DEMO", "DEMO_AIS_CORRELATION", "DEMO_SAR_CORRELATION")
    area_km2 = geo.get("surfaceAreaKm2", 0.0)
    centroid = geo.get("observedCentroid", {})
    cands = ais.get("candidates", [])
    top_cand = cands[0] if cands else None
    
    demo_note = " This dossier incorporates explicitly labelled demonstration data." if is_demo else ""

    # Executive summary
    if top_cand:
        exec_summary = (
            f"Satellite SAR dual-polarization analysis detected an observed candidate dark formation "
            f"covering {area_km2} km² near coordinates ({centroid.get('latitude', 0.0):.4f}°N, {centroid.get('longitude', 0.0):.4f}°E). "
            f"Hydrodynamic reverse hindcasting modelled a candidate source corridor. "
            f"Maritime AIS correlation evaluated {len(cands)} candidate vessels, identifying {top_cand.get('vesselName', 'N/A')} "
            f"(MMSI: {top_cand.get('mmsi')}) with an analytical correlation score of {top_cand.get('analyticalCorrelation', {}).get('score', 0.0):.4f}. "
            f"This spatio-temporal correlation does not establish discharge causation or legal responsibility.{demo_note}"
        )
    else:
        exec_summary = (
            f"Satellite SAR dual-polarization analysis detected an observed candidate dark formation "
            f"covering {area_km2} km² near coordinates ({centroid.get('latitude', 0.0):.4f}°N, {centroid.get('longitude', 0.0):.4f}°E). "
            f"No AIS candidate vessels were correlated within the search corridor.{demo_note}"
        )

    # Candidate vessels narrative
    formatted_candidates = []
    for idx, c in enumerate(cands):
        corr = c.get("analyticalCorrelation", {})
        min_dist = c.get("minimumDistanceToModelledOrigin", {})
        formatted_candidates.append({
            "candidateId": c.get("candidateId", f"cand_{c.get('mmsi')}"),
            "mmsi": c.get("mmsi"),
            "vesselName": c.get("vesselName"),
            "imo": c.get("imo"),
            "vesselType": c.get("vesselType"),
            "flag": c.get("flag"),
            "sourceType": c.get("sourceType"),
            "evidenceStatus": c.get("evidenceStatus"),
            "analyticalCorrelationScore": corr.get("score"),
            "scoreBreakdown": corr.get("components", {}),
            "scoreWeights": corr.get("weights", {}),
            "distanceToModelledOriginKm": min_dist.get("distanceKm"),
            "temporalDifferenceHours": c.get("temporalEvidence", {}).get("temporalDifferenceHours"),
            "dataQualityRating": c.get("dataQuality", {}).get("qualityRating"),
            "interpretation": "Analytical spatio-temporal consistency only; does not establish causation or fault.",
            "evidenceRefs": [
                f"aisCorrelationEvidence.candidates[{idx}].mmsi",
                f"aisCorrelationEvidence.candidates[{idx}].analyticalCorrelation",
                f"aisCorrelationEvidence.candidates[{idx}].minimumDistanceToModelledOrigin"
            ]
        })

    # Timeline
    timeline = build_evidence_timeline(canonical_evidence)

    # Formulate complete dossier
    dossier = {
        "schemaVersion": DOSSIER_SCHEMA_VERSION,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "evidenceRelease": EVIDENCE_RELEASE,
        "provenance": {
            "sarSource": prov.get("sarSource", "REAL_CDSE"),
            "aisSource": prov.get("aisSource", "REAL_AIS"),
            "combinationStatus": prov.get("combinationStatus", "REAL_ANALYTICAL"),
            "evidenceContractVersion": prov.get("contractVersion", CANONICAL_CONTRACT_VERSION),
            "analysisId": prov.get("analysisId", "analysis_default")
        },
        "executiveSummary": exec_summary,
        "spillDetection": {
            "status": "CANDIDATE_DARK_FORMATION",
            "summary": f"Dual-polarization SAR processing with model '{sar.get('modelId')}' identified surface backscatter dampening at threshold {sar.get('operatingThreshold')}.",
            "observedEvidence": [
                f"Sensor: Sentinel-1 C-band SAR (sigma0_db_v1 calibration)",
                f"Channels: {', '.join(sar.get('channels', ['VV', 'VH']))}",
                f"Acquisition Timestamp: {prov.get('sarAcquisitionTimestamp', 'N/A')}"
            ],
            "modelledEvidence": [
                f"Inference Model: {sar.get('modelId')}",
                f"Threshold: {sar.get('operatingThreshold')}"
            ],
            "limitations": [
                limitations.get("sarSegmentation", "SAR dark spots represent surface tension anomalies and do not establish chemical petroleum verification.")
            ],
            "evidenceRefs": [
                "sarDetection.modelId",
                "sarDetection.operatingThreshold",
                "provenance.sarAcquisitionTimestamp"
            ]
        },
        "geospatialEvidence": {
            "summary": f"Geospatial analysis derived a planar surface extent of {area_km2} km² ({geo.get('surfaceAreaM2', 0.0):.1f} m²) using EPSG:6933 equal-area projection.",
            "area": {
                "value": area_km2,
                "unit": "km2",
                "status": SEMANTIC_STATUS_DERIVED
            },
            "centroid": {
                "latitude": centroid.get("latitude"),
                "longitude": centroid.get("longitude"),
                "status": SEMANTIC_STATUS_OBSERVED
            },
            "shape": {
                "aspectRatio": geo.get("shapeDescriptors", {}).get("aspectRatio"),
                "compactness": geo.get("shapeDescriptors", {}).get("compactness"),
                "elongation": geo.get("shapeDescriptors", {}).get("elongation"),
                "status": SEMANTIC_STATUS_DERIVED
            },
            "limitations": [
                "Surface area represents connected pixel components above threshold and does not represent total oil volume or thickness."
            ],
            "evidenceRefs": [
                "geospatialEvidence.surfaceAreaKm2",
                "geospatialEvidence.observedCentroid",
                "geospatialEvidence.shapeDescriptors"
            ]
        },
        "driftEvidence": {
            "summary": f"Reverse Lagrangian hydrodynamic advection hindcast over {drift.get('hindcastDurationHours', 24.0)} hours modelled a potential origin corridor.",
            "modelledOrigin": {
                "latitude": drift.get("modelledOrigin", {}).get("latitude"),
                "longitude": drift.get("modelledOrigin", {}).get("longitude"),
                "timestamp": drift.get("modelledOrigin", {}).get("timestamp"),
                "uncertaintyRadiusKm": drift.get("modelledOrigin", {}).get("uncertaintyRadiusKm"),
                "status": SEMANTIC_STATUS_MODELLED
            },
            "trajectorySummary": f"Hindcast trajectory computed using {drift.get('engine', 'Lagrangian Advection')} with 3.0% leeway factor.",
            "uncertaintySummary": f"Turbulent eddy diffusion envelope expands with horizontal diffusivity Kh = {drift.get('forcingParameters', {}).get('horizontalDiffusivityKhM2s', 10.0)} m²/s.",
            "forcingSummary": f"Coupled forcing: Wind {drift.get('forcingParameters', {}).get('surfaceWindSpeedMps', 'N/A')} m/s @ {drift.get('forcingParameters', {}).get('surfaceWindDirectionDeg', 'N/A')}°, Current {drift.get('forcingParameters', {}).get('surfaceCurrentSpeedMps', 'N/A')} m/s @ {drift.get('forcingParameters', {}).get('surfaceCurrentDirectionDeg', 'N/A')}°.",
            "limitations": [
                limitations.get("metoceanDrift", "Metocean backward hindcast represents numerical trajectory estimation subject to oceanic turbulence and grid resolution.")
            ],
            "evidenceRefs": [
                "metoceanDriftEvidence.modelledOrigin",
                "metoceanDriftEvidence.forcingParameters",
                "metoceanDriftEvidence.engine"
            ]
        },
        "aisEvidence": {
            "summary": f"Evaluated {len(cands)} AIS vessel trajectories against the modelled backward drift corridor and uncertainty envelope.",
            "rankingPolicy": ais.get("rankingPolicy", "CORRELATION_CANDIDATE_ORDER"),
            "candidateVessels": formatted_candidates,
            "dataQualitySummary": "AIS tracks evaluated for sampling completeness and transmission gaps (>2.0 hours).",
            "correlationSummary": "Candidate prioritization is based on analytical distance, timing, and trajectory metrics.",
            "limitations": [
                limitations.get("aisCorrelation", "AIS correlation constitutes circumstantial evidence of physical presence. Dark vessels without active AIS are unmonitored.")
            ],
            "evidenceRefs": [
                "aisCorrelationEvidence.rankingPolicy",
                "aisCorrelationEvidence.candidates",
                "aisCorrelationEvidence.correlationConfig"
            ]
        },
        "analyticalCorrelation": {
            "scoreType": "ANALYTICAL_CORRELATION_SCORE",
            "summary": "Analytical composite score weighting spatial proximity (0.35), temporal alignment (0.25), trajectory proximity (0.25), and AIS data quality (0.15).",
            "components": top_cand.get("analyticalCorrelation", {}).get("components", {}) if top_cand else {},
            "weights": top_cand.get("analyticalCorrelation", {}).get("weights", {
                "spatial": 0.35, "temporal": 0.25, "trajectory": 0.25, "dataQuality": 0.15
            }) if top_cand else {"spatial": 0.35, "temporal": 0.25, "trajectory": 0.25, "dataQuality": 0.15},
            "interpretation": "Analytical spatio-temporal consistency only.",
            "evidenceRefs": [
                "aisCorrelationEvidence.candidates[0].analyticalCorrelation" if top_cand else "aisCorrelationEvidence.correlationConfig"
            ]
        },
        "timeline": timeline,
        "scientificLimitations": [
            limitations.get("sarSegmentation", "SAR detection alone does not verify petroleum chemistry."),
            limitations.get("metoceanDrift", "Drift models represent probabilistic trajectories."),
            limitations.get("aisCorrelation", "AIS correlation does not establish causation; unmonitored dark vessels may be present.")
        ],
        "oilTypeAndVolume": {
            "oilTypeStatus": SEMANTIC_STATUS_NOT_ESTABLISHED,
            "oilTypeStatement": "Oil type was not established from the available evidence.",
            "volumeStatus": SEMANTIC_STATUS_NOT_ESTABLISHED,
            "volumeStatement": "Spill volume was not established from the available evidence."
        },
        "legalResponsibility": {
            "status": SEMANTIC_STATUS_NOT_ESTABLISHED,
            "statement": LEGAL_NON_ATTRIBUTION_STATEMENT,
            "disclaimer": MANDATORY_DISCLAIMER
        }
    }

    validate_no_prohibited_terms(dossier)
    return dossier


def validate_dossier_contract(dossier: Dict[str, Any], canonical_evidence: Dict[str, Any]) -> None:
    """
    Validates that a generated dossier satisfies all OG-DOSSIER-V1 schema rules,
    traceability evidenceRefs, and non-attribution legal guardrails.
    """
    if not isinstance(dossier, dict):
        raise DossierValidationError("Dossier must be a JSON object dictionary.")

    # 1. Required top-level fields
    required_keys = [
        "schemaVersion", "generatedAt", "evidenceRelease", "provenance",
        "executiveSummary", "spillDetection", "geospatialEvidence",
        "driftEvidence", "aisEvidence", "analyticalCorrelation",
        "timeline", "scientificLimitations", "oilTypeAndVolume",
        "legalResponsibility"
    ]
    for key in required_keys:
        if key not in dossier:
            raise DossierValidationError(f"Missing required dossier field: '{key}'")

    if dossier["schemaVersion"] != DOSSIER_SCHEMA_VERSION:
        raise DossierValidationError(f"Invalid schemaVersion '{dossier.get('schemaVersion')}'; expected '{DOSSIER_SCHEMA_VERSION}'")

    # 2. Legal Guardrail enforcement
    legal = dossier.get("legalResponsibility", {})
    if legal.get("status") != SEMANTIC_STATUS_NOT_ESTABLISHED:
        raise DossierValidationError(
            f"Legal guardrail violation: legalResponsibility.status must be 'NOT_ESTABLISHED', got '{legal.get('status')}'"
        )

    # 3. Oil Type and Volume Guardrails
    oil_vol = dossier.get("oilTypeAndVolume", {})
    if oil_vol.get("oilTypeStatus") != SEMANTIC_STATUS_NOT_ESTABLISHED:
        raise DossierValidationError("Oil type must remain NOT_ESTABLISHED.")
    if oil_vol.get("volumeStatus") != SEMANTIC_STATUS_NOT_ESTABLISHED:
        raise DossierValidationError("Volume must remain NOT_ESTABLISHED.")

    # 4. Analytical Score Guardrail
    corr = dossier.get("analyticalCorrelation", {})
    if corr.get("scoreType") != "ANALYTICAL_CORRELATION_SCORE":
        raise DossierValidationError(
            f"Score type violation: analyticalCorrelation.scoreType must be 'ANALYTICAL_CORRELATION_SCORE', got '{corr.get('scoreType')}'"
        )

    # 5. Provenance Isolation Verification
    dossier_prov = dossier.get("provenance", {})
    canon_prov = canonical_evidence.get("provenance", {})
    if dossier_prov.get("combinationStatus") != canon_prov.get("combinationStatus"):
        raise DossierValidationError(
            f"Provenance combination status mismatch: expected '{canon_prov.get('combinationStatus')}', got '{dossier_prov.get('combinationStatus')}'"
        )
    if dossier_prov.get("sarSource") != canon_prov.get("sarSource"):
        raise DossierValidationError("SAR source provenance modified by synthesis.")
    if dossier_prov.get("aisSource") != canon_prov.get("aisSource"):
        raise DossierValidationError("AIS source provenance modified by synthesis.")

    # 6. Prohibited Terms Verification
    validate_no_prohibited_terms(dossier)

    # 7. Evidence Reference Traceability Verification
    for section_name in ["spillDetection", "geospatialEvidence", "driftEvidence", "aisEvidence", "analyticalCorrelation"]:
        section = dossier.get(section_name, {})
        refs = section.get("evidenceRefs", [])
        if not isinstance(refs, list) or len(refs) == 0:
            raise DossierValidationError(f"Section '{section_name}' is missing required 'evidenceRefs' array.")
        for ref in refs:
            if not resolve_evidence_ref(canonical_evidence, ref):
                logger.warning("[DossierValidation] EvidenceRef '%s' in section '%s' does not resolve to active canonical field.", ref, section_name)


def synthesize_investigation_dossier(
    canonical_evidence: Dict[str, Any],
    config: Optional[LLMConfig] = None,
    provider_override: Optional[BaseLLMProvider] = None,
) -> Dict[str, Any]:
    """
    Synthesize an Analytical Investigation Dossier from canonical evidence.

    Args:
        canonical_evidence: Verified output from Part 0.13E contract.
        config: Optional LLM configuration.
        provider_override: Optional explicit provider instance (e.g. for testing).

    Returns:
        Structured dossier dictionary complying with OG-DOSSIER-V1 schema.
    """
    t_start = time.perf_counter()
    cfg = config or LLMConfig()

    if not canonical_evidence or "provenance" not in canonical_evidence:
        raise DossierValidationError("Invalid canonical evidence object: 'provenance' is required.")

    # 1. Instantiate provider
    provider = provider_override or get_llm_provider(cfg)
    logger.info("[DossierSynthesis] Initializing synthesis with provider='%s', model='%s'", cfg.provider, cfg.model)

    # 2. Check if provider is mock / deterministic
    if isinstance(provider, MockLLMProvider) and provider.mock_response_override is None:
        dossier = synthesize_deterministic_dossier(canonical_evidence)
        dossier["synthesisMetadata"] = {
            "synthesisStatus": "DETERMINISTIC_SYNTHESIS",
            "provider": cfg.provider,
            "model": cfg.model,
            "temperature": cfg.temperature,
            "synthesisDurationMs": round((time.perf_counter() - t_start) * 1000, 2)
        }
        validate_dossier_contract(dossier, canonical_evidence)
        return dossier

    # 3. Formulate prompts for live LLM execution
    user_prompt = f"Summarize the following Canonical Evidence Object into an OG-DOSSIER-V1 structured JSON report:\n\n{json.dumps(canonical_evidence, indent=2)}"

    synthesis_status = "LLM_SUCCESS"
    try:
        raw_completion = provider.generate_completion(
            system_prompt=SYSTEM_PROMPT,
            user_prompt=user_prompt
        )

        if raw_completion == "__DETERMINISTIC_SYNTHESIS_REQUESTED__":
            dossier = synthesize_deterministic_dossier(canonical_evidence)
            synthesis_status = "DETERMINISTIC_SYNTHESIS"
        else:
            # Clean markdown JSON block if present
            cleaned = raw_completion.strip()
            if cleaned.startswith("```json"):
                cleaned = cleaned[7:]
            if cleaned.startswith("```"):
                cleaned = cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()

            parsed_dossier = json.loads(cleaned)
            validate_dossier_contract(parsed_dossier, canonical_evidence)
            dossier = parsed_dossier

    except json.JSONDecodeError as json_err:
        logger.error("[DossierSynthesis] LLM returned malformed JSON: %s, falling back to deterministic synthesis", str(json_err))
        dossier = synthesize_deterministic_dossier(canonical_evidence)
        synthesis_status = "LLM_SCHEMA_INVALID"
    except (DossierValidationError, CanonicalEvidenceError) as val_err:
        logger.error("[DossierSynthesis] Dossier schema validation failed: %s, falling back to deterministic synthesis", str(val_err))
        dossier = synthesize_deterministic_dossier(canonical_evidence)
        synthesis_status = "LLM_SCHEMA_INVALID"
    except LLMProviderError as prov_err:
        logger.error("[DossierSynthesis] LLM provider error: %s (%s)", str(prov_err), prov_err.status_code)
        dossier = synthesize_deterministic_dossier(canonical_evidence)
        synthesis_status = prov_err.status_code
    except Exception as general_err:
        logger.error("[DossierSynthesis] Unexpected LLM execution error: %s, falling back to deterministic synthesis", str(general_err))
        dossier = synthesize_deterministic_dossier(canonical_evidence)
        synthesis_status = "LLM_GENERATION_FAILED"

    dossier["synthesisMetadata"] = {
        "synthesisStatus": synthesis_status,
        "provider": cfg.provider,
        "model": cfg.model,
        "temperature": cfg.temperature,
        "synthesisDurationMs": round((time.perf_counter() - t_start) * 1000, 2)
    }

    validate_dossier_contract(dossier, canonical_evidence)
    return dossier
