# PART 0.13F — DEEP FORENSIC IMPLEMENTATION AUDIT REPORT

**Release:** `OG-SAR-ML-RESEARCH-RELEASE-V0.12`  
**Audit Scope:** Evidence-to-Dossier LLM Synthesis Layer  
**Audit Date:** September 2026  
**Auditor:** Ocean Guard AI Architecture & Scientific Audit Engine  

---

## 1. Executive Summary

A comprehensive, forensic implementation audit was conducted on **Part 0.13F — Evidence-to-Dossier LLM Synthesis**. The audit evaluated the codebase across 20 distinct technical and scientific dimensions, verifying that the LLM layer functions strictly as an **evidence summarization and narrative explanation engine** and does **not** perform independent calculations, attribution scoring, or legal culpability determination.

### Overall Status: `PASS`

| Audit Dimension | Status | Key Forensic Verification |
| :--- | :---: | :--- |
| **Canonical Evidence Boundary** | `PASS` | LLM input is strictly restricted to Part 0.13E `OG-CANONICAL-EVIDENCE-CONTRACT-V1.0`. No raw SAR rasters or raw AIS streams reach the prompt. |
| **Deterministic Synthesis** | `PASS` | `synthesize_deterministic_dossier` dynamically extracts evidence fields; contains zero hardcoded coordinates, vessel names, or scenario constants. |
| **Evidence Immutability** | `PASS` | Canonical evidence values remain authoritative. Top-level provenance, score types, and guardrails are strictly validated against inputs. |
| **Evidence References** | `PASS` | All narrative sections include `evidenceRefs` that resolve against active field paths in the canonical contract. |
| **NOT_ESTABLISHED Guardrails** | `PASS` | `oilTypeStatus`, `volumeStatus`, and `legalResponsibility.status` are strictly required to be `NOT_ESTABLISHED`. |
| **Provenance Isolation** | `PASS` | All 4 combinations (`REAL_ANALYTICAL`, `DEMO`, `DEMO_AIS_CORRELATION`, `DEMO_SAR_CORRELATION`) are verified and preserved. |
| **Analytical Score Semantics** | `PASS` | Score is classified strictly as `ANALYTICAL_CORRELATION_SCORE` with transparent components/weights; conversion to probability is prohibited. |
| **Legal Non-Attribution Guardrails**| `PASS` | `legalResponsibility.status` is `NOT_ESTABLISHED`. Blacklisted blame terms are recursively intercepted and rejected. |
| **Modelled vs Observed Semantics** | `PASS` | Statuses (`OBSERVED`, `DERIVED`, `MODELLED`, `AIS`, `NOT_ESTABLISHED`) are strictly preserved in dossier structures and timeline. |
| **Failure Mode Handling** | `PASS` | Controlled fallback states (`LLM_SUCCESS`, `DETERMINISTIC_SYNTHESIS`, `LLM_NOT_CONFIGURED`, `LLM_SCHEMA_INVALID`, `LLM_GENERATION_FAILED`) verified. |
| **Structured Output Validation** | `PASS` | Output is validated against `OG-DOSSIER-V1` schema before acceptance. Malformed outputs trigger safe deterministic fallback. |
| **Provider Security** | `PASS` | Temperature clamped to $\le 0.20$. API keys are masked (`***...6789`) and never exposed in logs, outputs, or error payloads. |
| **Prompt Injection Boundary** | `PASS` | System prompt instructions are isolated. Post-generation schema validation and prohibited term scans intercept adversarial data injections. |
| **Test Quality** | `PASS` | 16 dedicated unit and integration tests verify all 24 required behaviors with zero reliance on live paid APIs. |
| **API Architecture Boundary** | `PASS` | Browser communicates strictly via Node.js API; Python ML/LLM service is never directly exposed to the frontend. |
| **Documentation Consistency** | `PASS` | `docs/model/PART_0_13F_LLM_DOSSIER_SYNTHESIS.md` accurately matches implementation. |
| **Scientific Integrity** | `PASS` | V09D model remains frozen under `OG-SAR-ML-RESEARCH-RELEASE-V0.12`. Zero ML retraining or parameter drift. |
| **Regression Audit** | `PASS` | 244 / 244 tests passing (100% pass rate, 0 regressions from baseline 228). |

---

## 2. Files Inspected

1. `services/ml-python/app/core/canonical_evidence.py` (Canonical evidence contract & validation)
2. `services/ml-python/app/dossier/llm_provider.py` (Provider abstraction: Mock, Gemini, OpenAI, LLMConfig)
3. `services/ml-python/app/dossier/dossier_synthesis.py` (Synthesis engine, deterministic generator, contract validator)
4. `services/ml-python/app/api/schemas/dossier.py` (Pydantic request/response schemas)
5. `services/ml-python/app/api/routes/dossier.py` (FastAPI route `POST /api/v1/dossier/synthesize`)
6. `services/ml-python/app/main.py` (FastAPI route registration)
7. `services/ml-python/tests/unit/test_v013f_llm_dossier.py` (Unit test suite)
8. `services/ml-python/tests/integration/test_v013f_dossier_api.py` (Integration test suite)
9. `services/backend-node/src/routes/dossier.routes.js` (Node backend API gateway)
10. `services/backend-node/src/services/dossier.service.js` (Node orchestration service)
11. `docs/model/PART_0_13F_LLM_DOSSIER_SYNTHESIS.md` (Implementation documentation)

---

## 3. Detailed Forensic Findings by Dimension

### 3.1 Canonical Evidence Source (`PASS`)
- **Input Path:** `POST /api/v1/dossier/synthesize` receives `DossierSynthesisRequest(canonical_evidence=...)` which passes directly to `synthesize_investigation_dossier`.
- **Isolation:** Raw GeoTIFF matrices, complex tensors, raw NMEA AIS feeds, and raw hydrodynamic grids are excluded from the canonical evidence contract and never serialized into the prompt.
- **Verification:** Only structured summary metadata is formatted for LLM ingestion.

### 3.2 Deterministic Synthesis Implementation (`PASS`)
- **Function:** `synthesize_deterministic_dossier(canonical_evidence)` in `dossier_synthesis.py`.
- **Dynamic Field Binding:**
  - Area: Extracted dynamically from `geo.get("surfaceAreaKm2")`.
  - Centroid: Extracted dynamically from `geo.get("observedCentroid")`.
  - Modelled Origin: Extracted dynamically from `drift.get("modelledOrigin")`.
  - Candidate Vessels: Iterates dynamically over `ais.get("candidates")`.
  - Scores: Formats pre-computed `c.get("analyticalCorrelation")`.
- **Hardcoding Check:** Verified zero hardcoded Mumbai coordinates, vessel names, or timestamps in the deterministic generator.
- **Demo Handling:** If `combinationStatus` is `DEMO`, explicitly appends: *"This dossier incorporates explicitly labelled demonstration data."*

### 3.3 Evidence Immutability & Traceability (`PASS`)
- In `validate_dossier_contract`:
  - `provenance.combinationStatus`, `sarSource`, and `aisSource` must strictly match `canonical_evidence.provenance`.
  - `legalResponsibility.status` must be `NOT_ESTABLISHED`.
  - `oilTypeAndVolume.oilTypeStatus` and `volumeStatus` must be `NOT_ESTABLISHED`.
  - `analyticalCorrelation.scoreType` must be `ANALYTICAL_CORRELATION_SCORE`.

### 3.4 Evidence Reference Resolution (`PASS`)
- **Resolver:** `resolve_evidence_ref(canonical_evidence, path)` resolves dot-notation paths and array index expressions (e.g. `aisCorrelationEvidence.candidates[0].mmsi`).
- **Validation:** Every major section (`spillDetection`, `geospatialEvidence`, `driftEvidence`, `aisEvidence`, `analyticalCorrelation`) must provide a non-empty `evidenceRefs` array.
- **Test Coverage:** `test_evidence_references_resolve_to_real_fields` verified 100% path resolution.

### 3.5 Non-Attribution & Legal Guardrails (`PASS`)
- `legalResponsibility.status` is strictly `NOT_ESTABLISHED`.
- Statement: *"The available evidence does not establish legal responsibility or vessel causation."*
- Prohibited Term Interceptor: `validate_no_prohibited_terms` recursively rejects any occurrence of:
  - `RESPONSIBLE_VESSEL`
  - `CONFIRMED_VESSEL`
  - `GUILTY_VESSEL`
  - `CAUSED_SPILL`
  - `PROBABILITY_OF_GUILT`
  - `ATTRIBUTION_CONFIDENCE_SCORE`
  - `DISCHARGE_PROBABILITY`

### 3.6 Oil Type & Volume Guardrails (`PASS`)
- If unverified by chemical sensors, `oilTypeStatus` and `volumeStatus` remain `NOT_ESTABLISHED`.
- `validate_dossier_contract` explicitly raises `DossierValidationError` if an LLM attempts to output an established petroleum grade (e.g. "crude oil") or invented volume without upstream validation.

### 3.7 Analytical Score Guardrail (`PASS`)
- Formula: $S_{\text{corr}} = 0.35 S_{\text{spatial}} + 0.25 S_{\text{temporal}} + 0.25 S_{\text{trajectory}} + 0.15 Q_{\text{dataQuality}}$.
- Classification: Strictly `ANALYTICAL_CORRELATION_SCORE`.
- Interpretation: `"Analytical spatio-temporal consistency only."`
- The system prevents describing scores as probability or confidence of guilt.

### 3.8 Failure Mode Handling (`PASS`)
The system guarantees deterministic graceful degradation under all failure scenarios:
1. `LLM_SUCCESS`: Live LLM output conforms to schema.
2. `DETERMINISTIC_SYNTHESIS`: Mock provider or offline execution.
3. `LLM_NOT_CONFIGURED`: Missing API credentials -> falls back to deterministic synthesis with explicit status `LLM_NOT_CONFIGURED`.
4. `LLM_SCHEMA_INVALID`: Malformed JSON or schema violation -> falls back to deterministic synthesis with status `LLM_SCHEMA_INVALID`.
5. `LLM_GENERATION_FAILED`: Network timeout / HTTP error -> falls back to deterministic synthesis with status `LLM_GENERATION_FAILED`.

### 3.9 Provider Security & Configuration (`PASS`)
- **Temperature:** Clamped to $\le 0.20$ (default $0.10$) across all configurations.
- **Secrets:** `LLMConfig.to_dict(mask_secrets=True)` masks API keys (`***...6789`). `__repr__` suppresses credentials.
- **No Hardcoded Keys:** All providers read from environment variables or runtime configuration.

### 3.10 API Architecture Boundary (`PASS`)
- Public API flow:
  `Browser -> Node.js Express Gateway (services/backend-node) -> Python ML/LLM Service (services/ml-python)`.
- No direct browser-to-Python connections are exposed.

---

## 4. Test Suite Execution & Regression Audit

```
Platform: Windows (Python 3.11, Pytest 8.1.1)
Target: services/ml-python/tests/unit services/ml-python/tests/integration

====================== 244 passed, 32 warnings in 22.14s ======================
```

- **Baseline before Part 0.13F:** 228 / 228 passed.
- **Current after Part 0.13F:** 244 / 244 passed.
- **New Tests Added:** 16 (14 unit tests, 2 integration tests).
- **Regressions:** 0.

---

## 5. Summary of Findings & Severity

| ID | Finding Description | Severity | Status / Mitigation |
| :--- | :--- | :---: | :--- |
| **F-01** | Prohibited term validator matches exact uppercase substrings; deep semantic paraphrasing is guarded via system prompt and schema constraints. | `LOW` | Mitigated by deterministic fallback and post-generation schema validation. |
| **F-02** | Live LLM provider invocation requires external network access; deterministic fallback ensures 100% offline availability for CI/CD and air-gapped deployments. | `INFO` | By design; verified in test suite. |

---

## 6. Recommendation

### Final Recommendation: `FREEZE`

Part 0.13F meets all scientific, legal, architectural, and test requirements. The LLM synthesis layer operates strictly within the prescribed summarization boundary with zero scientific logic alteration or attribution overreach.

**Next Stage:** Stop and await user review. Do **NOT** automatically proceed to Part 0.13G or report generation.
