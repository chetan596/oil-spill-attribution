# PART 0.13F — EVIDENCE-TO-DOSSIER LLM SYNTHESIS REPORT

**Release:** `OG-SAR-ML-RESEARCH-RELEASE-V0.12`  
**Dossier Specification:** `OG-DOSSIER-V1`  
**Canonical Evidence Input:** `OG-CANONICAL-EVIDENCE-CONTRACT-V1.0`  
**Pipeline Level:** Narrative Synthesis & Evidentiary Dossier Generation  
**Layer Module:** `services/ml-python/app/dossier/`  
**Audit Date:** September 2026  

---

## 1. Executive Statement

> [!IMPORTANT]
> **Scientific & Legal Boundary:**  
> LLM synthesis in Ocean Guard AI is strictly a **summarization and narrative explanation layer**. It does **NOT** constitute an independent analytical, detection, attribution, scoring, calculation, or decision-making engine. It never establishes legal responsibility, confirmed discharge, or vessel liability (`NOT_ESTABLISHED`).

The sole authoritative input to the LLM layer is the verified, structured **Canonical Evidence Contract** (`OG-CANONICAL-EVIDENCE-CONTRACT-V1.0`) produced by Part 0.13E. The LLM never directly consumes raw SAR pixels, neural network activation tensors, raw AIS streams, or unverified user inputs.

```
+-------------------------------------------------------------------------------+
| Multi-Stage Upstream Processing (Parts 0.13A - 0.13D)                         |
| SAR Detection (0.13A) -> Geospatial (0.13B) -> Drift (0.13C) -> AIS (0.13D)  |
+-------------------------------------------------------------------------------+
                                      │
                                      ▼
+-------------------------------------------------------------------------------+
| Part 0.13E: Canonical Evidence Contract (OG-CANONICAL-EVIDENCE-CONTRACT-V1.0) |
| - Provenance, Observed, Modelled, Derived, AIS metrics & Guardrails           |
+-------------------------------------------------------------------------------+
                                      │
                                      ▼
+-------------------------------------------------------------------------------+
| Part 0.13F: LLM Synthesis Engine (OG-DOSSIER-V1)                              |
| - Low-Temperature Provider (T <= 0.20) / Deterministic Synthesis             |
| - Evidence Reference Traceability (`evidenceRefs`)                            |
| - Legal Non-Attribution & Oil/Volume Guardrails Enforced                      |
+-------------------------------------------------------------------------------+
                                      │
                                      ▼
+-------------------------------------------------------------------------------+
| Node.js Backend API (`services/backend-node`) & User Interface                |
+-------------------------------------------------------------------------------+
```

---

## 2. Source of Truth & Authoritative Input

The LLM is strictly constrained to consume the versioned canonical evidence package from `services/ml-python/app/core/canonical_evidence.py`.

### Strict Input Boundary
- **Consumes:** Pre-computed, mathematically validated properties (`sarDetection`, `geospatialEvidence`, `metoceanDriftEvidence`, `aisCorrelationEvidence`, `provenance`, `scientificLimitations`).
- **Never Consumes:** Raw Sentinel-1 GeoTIFF rasters, raw uncalibrated SAR dB matrices, raw AIS NMEA sentences, or arbitrary frontend prompt overrides.

---

## 3. Claim Discipline & Evidentiary Semantics

Every narrative statement in the synthesized dossier preserves the exact semantic classification established in the upstream research pipeline:

| Classification | Meaning | Example Narrative Phrasing |
| :--- | :--- | :--- |
| `OBSERVED` | Direct sensor observation / radar measurement | *"Satellite SAR dual-polarization analysis detected an observed candidate dark formation at..."* |
| `DERIVED` | Deterministic mathematical calculation | *"Geospatial analysis derived an affected planar surface extent of 3.75 km² using EPSG:6933 projection."* |
| `MODELLED` | Hydrodynamic numerical simulation | *"Reverse Lagrangian hydrodynamic advection hindcast over 24.0 hours modelled a potential origin corridor..."* |
| `AIS` | Maritime transponder trajectory telemetry | *"AIS telemetry indicates that the vessel trajectory was spatially and temporally consistent with the modelled origin corridor."* |
| `NOT_ESTABLISHED` | Insufficient evidence / out-of-scope attribution | *"Oil type and volume were not established from the available evidence."* / *"Legal responsibility remains NOT_ESTABLISHED."* |

---

## 4. Structured Dossier Contract (`OG-DOSSIER-V1`)

The output schema provides complete machine-parseable structure, timeline ordering, and evidentiary traceability:

```json
{
  "schemaVersion": "OG-DOSSIER-V1",
  "generatedAt": "2026-09-19T18:00:00Z",
  "evidenceRelease": "OG-SAR-ML-RESEARCH-RELEASE-V0.12",
  "provenance": {
    "sarSource": "REAL_CDSE",
    "aisSource": "REAL_AIS",
    "combinationStatus": "REAL_ANALYTICAL",
    "evidenceContractVersion": "OG-CANONICAL-EVIDENCE-CONTRACT-V1.0",
    "analysisId": "analysis_mumbai_001"
  },
  "executiveSummary": "...",
  "spillDetection": {
    "status": "CANDIDATE_DARK_FORMATION",
    "summary": "...",
    "observedEvidence": [...],
    "modelledEvidence": [...],
    "limitations": [...],
    "evidenceRefs": ["sarDetection.modelId", "sarDetection.operatingThreshold"]
  },
  "geospatialEvidence": {
    "summary": "...",
    "area": { "value": 3.75, "unit": "km2", "status": "DERIVED" },
    "centroid": { "latitude": 18.95, "longitude": 72.82, "status": "OBSERVED" },
    "shape": { "aspectRatio": 2.4, "compactness": 0.38, "elongation": 0.55, "status": "DERIVED" },
    "limitations": [...],
    "evidenceRefs": ["geospatialEvidence.surfaceAreaKm2", "geospatialEvidence.observedCentroid"]
  },
  "driftEvidence": {
    "summary": "...",
    "modelledOrigin": {
      "latitude": 19.12,
      "longitude": 72.64,
      "timestamp": "2026-09-18T06:00:00Z",
      "status": "MODELLED"
    },
    "trajectorySummary": "...",
    "uncertaintySummary": "...",
    "forcingSummary": "...",
    "limitations": [...],
    "evidenceRefs": ["metoceanDriftEvidence.modelledOrigin", "metoceanDriftEvidence.forcingParameters"]
  },
  "aisEvidence": {
    "summary": "...",
    "rankingPolicy": "CORRELATION_CANDIDATE_ORDER",
    "candidateVessels": [
      {
        "candidateId": "cand_419000999",
        "mmsi": "419000999",
        "vesselName": "OCEAN HARMONY",
        "vesselType": "Crude Oil Tanker",
        "flag": "Panama",
        "evidenceStatus": "AIS_CORRELATED_CANDIDATE",
        "analyticalCorrelationScore": 0.8520,
        "scoreBreakdown": { "spatial": 0.91, "temporal": 0.88, "trajectory": 0.85, "dataQuality": 0.90 },
        "scoreWeights": { "spatial": 0.35, "temporal": 0.25, "trajectory": 0.25, "dataQuality": 0.15 },
        "distanceToModelledOriginKm": 0.45,
        "temporalDifferenceHours": 0.5,
        "dataQualityRating": "HIGH",
        "interpretation": "Analytical spatio-temporal consistency only; does not establish causation or fault.",
        "evidenceRefs": ["aisCorrelationEvidence.candidates[0].mmsi", "aisCorrelationEvidence.candidates[0].analyticalCorrelation"]
      }
    ],
    "dataQualitySummary": "...",
    "correlationSummary": "...",
    "limitations": [...],
    "evidenceRefs": ["aisCorrelationEvidence.rankingPolicy", "aisCorrelationEvidence.candidates"]
  },
  "analyticalCorrelation": {
    "scoreType": "ANALYTICAL_CORRELATION_SCORE",
    "summary": "Analytical composite score weighting spatial proximity (0.35), temporal alignment (0.25), trajectory proximity (0.25), and AIS data quality (0.15).",
    "components": { "spatial": 0.91, "temporal": 0.88, "trajectory": 0.85, "dataQuality": 0.90 },
    "weights": { "spatial": 0.35, "temporal": 0.25, "trajectory": 0.25, "dataQuality": 0.15 },
    "interpretation": "Analytical spatio-temporal consistency only.",
    "evidenceRefs": ["aisCorrelationEvidence.candidates[0].analyticalCorrelation"]
  },
  "timeline": [
    {
      "timestamp": "2026-09-18T06:00:00Z",
      "phase": "MODELLED_REVERSE_HINDCAST_ORIGIN",
      "semanticStatus": "MODELLED",
      "description": "Lagrangian drift backward hindcast estimates candidate origin window (Uncertainty radius: 1.75 km).",
      "evidenceRef": "metoceanDriftEvidence.modelledOrigin.timestamp"
    },
    {
      "timestamp": "2026-09-19T06:00:00Z",
      "phase": "SAR_SATELLITE_ACQUISITION",
      "semanticStatus": "OBSERVED",
      "description": "Sentinel-1 SAR acquisition over region.",
      "evidenceRef": "provenance.sarAcquisitionTimestamp"
    }
  ],
  "scientificLimitations": [...],
  "oilTypeAndVolume": {
    "oilTypeStatus": "NOT_ESTABLISHED",
    "oilTypeStatement": "Oil type was not established from the available evidence.",
    "volumeStatus": "NOT_ESTABLISHED",
    "volumeStatement": "Spill volume was not established from the available evidence."
  },
  "legalResponsibility": {
    "status": "NOT_ESTABLISHED",
    "statement": "The available evidence does not establish legal responsibility or vessel causation.",
    "disclaimer": "Attribution candidate ranking represents exploratory physical/spatial correlation with the modelled backward drift corridor. It does NOT constitute legal proof of spill discharge or vessel liability."
  },
  "synthesisMetadata": {
    "synthesisStatus": "DETERMINISTIC_SYNTHESIS",
    "provider": "mock",
    "model": "gemini-1.5-pro",
    "temperature": 0.10,
    "synthesisDurationMs": 2.45
  }
}
```

---

## 5. Scientific & Legal Guardrails

### 1. Legal Non-Attribution Principle
- `legalResponsibility.status` is strictly `NOT_ESTABLISHED`.
- Prohibited Terms Rejected: `RESPONSIBLE_VESSEL`, `CONFIRMED_VESSEL`, `GUILTY_VESSEL`, `CAUSED_SPILL`, `PROBABILITY_OF_GUILT`, `ATTRIBUTION_CONFIDENCE_SCORE`, `DISCHARGE_PROBABILITY`.
- Any output attempting to assign blame triggers an immediate `CanonicalEvidenceError` / `DossierValidationError`.

### 2. Analytical Score Guardrail
- `scoreType` is strictly `ANALYTICAL_CORRELATION_SCORE`.
- `interpretation` is strictly `"Analytical spatio-temporal consistency only."`
- The system forbids describing analytical scores as "probability of guilt" or "attribution confidence".

### 3. Oil Type and Spill Volume Guardrails
- If not verified upstream, `oilTypeStatus` and `volumeStatus` remain strictly `NOT_ESTABLISHED`.
- The LLM is prohibited from classifying hydrocarbon grades (crude, bunker, diesel) or estimating barrels/tonnes without chemical sensor data.

---

## 6. Provider Abstraction & Security

### Architecture (`app/dossier/llm_provider.py`)
- **Supported Providers:** `mock` (default for deterministic CI/CD and offline execution), `gemini` (Google GenAI REST API), `openai` (OpenAI Chat Completions API).
- **Temperature Guardrail:** All configurations clamp temperature to $\le 0.20$ (default $0.10$) to enforce factual consistency.
- **Credential Protection:** API keys are never logged, never included in error stack traces, and masked in string representations (`***...6789`).

### Failure Handling & Controlled Statuses
| Status | Meaning | Action Taken |
| :--- | :--- | :--- |
| `LLM_SUCCESS` | Live provider successfully generated valid JSON dossier | Return validated dossier |
| `DETERMINISTIC_SYNTHESIS` | Mock provider generated deterministic factual dossier | Return validated dossier |
| `LLM_NOT_CONFIGURED` | External API key missing | Controlled fallback to deterministic synthesis |
| `LLM_SCHEMA_INVALID` | Malformed JSON or schema violation from LLM | Controlled fallback to deterministic synthesis |
| `LLM_GENERATION_FAILED` | Network timeout or provider API HTTP error | Controlled fallback to deterministic synthesis |

---

## 7. Test Verification & Zero Regressions

### Test Suite Execution
- **Unit Suite:** `services/ml-python/tests/unit`
- **Integration Suite:** `services/ml-python/tests/integration`
- **Results:** **244 / 244 Tests Passed** (0 failures, 0 regressions).

```
====================== 244 passed, 32 warnings in 22.14s ======================
```

### Coverage of Part 0.13F Features
- `test_valid_canonical_evidence_to_valid_dossier`: Schema validation & executive summary.
- `test_missing_evidence_preserves_not_established`: Factual fallback for incomplete data.
- `test_demo_and_real_provenance_preservation`: Strict isolation of demo vs real data.
- `test_score_classification_and_weights_preserved`: Score classification and 0.35/0.25/0.25/0.15 weight exposure.
- `test_evidence_status_disciplines`: MODELLED, DERIVED, AIS semantics.
- `test_legal_responsibility_strictly_not_established`: Legal non-attribution.
- `test_oil_type_and_volume_not_established`: Prohibits inventing petroleum grades or volume.
- `test_malformed_llm_json_fallback_handling`: Resilient error handling.
- `test_schema_validation_failure_handling`: Schema guardrail enforcement.
- `test_provider_unavailable_handling`: Unconfigured API handling.
- `test_no_api_key_exposed_in_output_or_repr`: Credential security & masking.
- `test_evidence_references_resolve_to_real_fields`: `evidenceRefs` field path verification.
- `test_demo_and_real_isolation_checks`: Ensures demo data never masquerades as real CDSE.
- `test_deterministic_low_temperature_configuration`: Low temperature clamping ($\le 0.20$).
- `test_dossier_synthesize_endpoint_success`: FastAPI route integration test (`POST /api/v1/dossier/synthesize`).

---

## 8. Status & Next Steps

- **Part 0.13F is COMPLETE and VERIFIED.**
- Zero regressions across the full pipeline test suite (244 tests passing).
- Stopping and awaiting user review. Do **NOT** implement 0.13G, final PDF/report generation, or additional analytics.
