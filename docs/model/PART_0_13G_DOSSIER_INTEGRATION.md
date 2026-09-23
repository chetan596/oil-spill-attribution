# PART 0.13G — DOSSIER INTEGRATION & REPORTING CONTRACT

**Release:** `OG-SAR-ML-RESEARCH-RELEASE-V0.12`  
**Integration Contract:** `OG-DOSSIER-V1`  
**Authoritative Evidence Contract:** `OG-CANONICAL-EVIDENCE-CONTRACT-V1.0`  
**Date:** September 2026  
**Status:** `INTEGRATION_VERIFIED`  

---

## 1. Executive Summary

Part 0.13G establishes the formal integration and reporting contract for the **Analytical Investigation Dossier (`OG-DOSSIER-V1`)** across the complete Ocean Guard AI system. It seamlessly connects the frozen scientific pipeline (Parts 0.13A–0.13F) with the Node.js backend (`services/backend-node`) and the Next.js web application (`apps/web`).

> [!IMPORTANT]
> **Single Source of Truth Guarantee**:  
> Node is an orchestration, validation, persistence, and public API layer. Scientific evidence remains authoritative from the frozen canonical evidence pipeline.  
> Part 0.13G does not introduce a second deterministic dossier-generation engine.  
> Part 0.13G integrates the validated `OG-DOSSIER-V1` artifact into the application. It does not introduce new scientific inference.

---

## 2. Architecture & Data Flow

The browser strictly connects to the Node.js backend gateway (`services/backend-node`). The Python ML/LLM service (`services/ml-python`) remains a private analytical and synthesis service.

```
+------------------+
|                  |  POST /api/v1/dossier/:analysisId/generate
|   Web Frontend   | ---------------------------------------------> +-------------------------+
|    (apps/web)    |                                                |                         |
|                  | <--------------------------------------------- |   Node.js Backend       |
|                  |       Returns Validated OG-DOSSIER-V1          | (services/backend-node) |
+------------------+                                                |                         |
                                                                    +-------------------------+
                                                                                 |
                                                              1. Assemble Canonical Evidence
                                                              2. POST /api/v1/dossier/synthesize
                                                              3. Validate OG-DOSSIER-V1
                                                              4. Persist to PostgreSQL (Report)
                                                                                 |
                                                                                 v
                                                                    +-------------------------+
                                                                    |    Python ML Service    |
                                                                    |  (services/ml-python)   |
                                                                    |                         |
                                                                    |  Authoritative 0.13F    |
                                                                    |  Synthesis Engine       |
                                                                    +-------------------------+
```

---

## 3. Single Source of Truth & Python 0.13F Ownership

1. **Authoritative Evidence Engine**: `services/ml-python/app/core/canonical_evidence.py` (`OG-CANONICAL-EVIDENCE-CONTRACT-V1.0`) is the sole authoritative evidence schema.
2. **Authoritative Synthesis Engine**: `services/ml-python/app/dossier/dossier_synthesis.py` (`OG-DOSSIER-V1`) owns all LLM narrative synthesis and deterministic fallback generation.
3. **No Duplicate Node Engine**: Node.js does not maintain or execute an independent narrative template engine. If the Python service fails or is unreachable, Node returns a controlled `DOSSIER_GENERATION_FAILED` (HTTP 502) error.

---

## 4. Dossier Lifecycle & Persistence

Persisted dossiers are stored in PostgreSQL using the Prisma `Report` model and assigned a canonical, deterministic identifier:

- **Dossier Identifier**: `OG-DOSSIER-<ANALYSIS_ID_PREFIX>` (e.g. `OG-DOSSIER-2026-001`, `OG-DOSSIER-ANALYSIS`)
- **Lifecycle States**:
  - `GENERATING`: Synthesis job in progress.
  - `READY`: Dossier schema successfully validated against `OG-DOSSIER-V1` and persisted.
  - `FAILED`: Python service or validation error encountered.

### Required Lineage Fields
Every persisted dossier retains:
- `dossierId`: Canonical identifier.
- `analysisId`: Traceable to satellite analysis run.
- `spillId`: Traceable to detected slick candidate.
- `schemaVersion`: `"OG-DOSSIER-V1"`.
- `evidenceRelease`: `"OG-SAR-ML-RESEARCH-RELEASE-V0.12"`.
- `generationMode`: `"LLM"` or `"DETERMINISTIC"`.
- `provenance`: Provenance isolation object (`REAL_ANALYTICAL`, `DEMO`, `DEMO_AIS_CORRELATION`, `DEMO_SAR_CORRELATION`).
- `status`: `"READY"`.
- `createdAt`: ISO generation timestamp.

---

## 5. API Contracts

All dossier endpoints require JWT authentication.

### 5.1 POST `/api/v1/dossier/:analysisId/generate`
- **Purpose**: Generates and persists an Analytical Investigation Dossier for an analysis.
- **Request Body**: Optional `{ provider?: string, model?: string, temperature?: number }`.
- **Security Boundary**: The server resolves canonical evidence directly from authoritative database records. Browser-supplied scientific metrics (such as `surfaceAreaKm2`, `correlationScore`, `vesselMmsi`, `legalResponsibility`) are strictly ignored and cannot override canonical records.
- **Response**: `201 Created` with validated `{ reportId, dossierId, analysisId, spillId, title, status: "READY", createdAt, dossier }`.

### 5.2 GET `/api/v1/dossier/:analysisId`
- **Purpose**: Retrieves a previously persisted dossier.
- **Response**: `200 OK` with validated `{ reportId, dossierId, analysisId, spillId, title, status: "READY", createdAt, dossier }`.

### 5.3 GET `/api/v1/dossier`
- **Purpose**: Lists all archived dossiers with summary metadata.
- **Response**: `200 OK` with array of dossier summary records.

---

## 6. Provenance & Guardrail Enforcement

| Guardrail | Enforcement Rule | Verification Result |
|---|---|---|
| **Provenance Isolation** | `REAL_ANALYTICAL`, `DEMO`, `DEMO_AIS_CORRELATION`, `DEMO_SAR_CORRELATION` strictly preserved; no DEMO $\rightarrow$ REAL promotion. | **PASS** |
| **Generation Mode** | `LLM` vs `DETERMINISTIC` preserved exactly as returned by Python; never relabeled. | **PASS** |
| **Legal Responsibility** | `legalResponsibility.status === "NOT_ESTABLISHED"` unconditionally enforced. Prohibited terms (`RESPONSIBLE_VESSEL`, `CONFIRMED_VESSEL`, etc.) rejected. | **PASS** |
| **Oil Type & Volume** | `oilTypeStatus === "NOT_ESTABLISHED"`, `volumeStatus === "NOT_ESTABLISHED"` preserved. | **PASS** |
| **Analytical Score** | `scoreType === "ANALYTICAL_CORRELATION_SCORE"` displayed strictly as "Spatio-temporal evidence consistency only", never as probability or culpability. | **PASS** |
| **Evidence References** | `evidenceRefs` preserved across Node transport and Web display. | **PASS** |

---

## 7. Frontend Integration (`apps/web`)

The Next.js/Vite frontend (`apps/web/src/pages/Reports.jsx`, `apps/web/src/api/dossier.api.js`) renders the full `OG-DOSSIER-V1` artifact using the existing dark aesthetic:

- **Executive Summary**: Narrative overview with generation mode badge (`LLM` or `DETERMINISTIC`).
- **Observed SAR Slick**: Sensor, area, confidence, bounding coordinates (`OBSERVED`).
- **Metocean Drift Hindcast**: Modelled origin, uncertainty envelope, forcing vectors (`MODELLED`).
- **AIS Candidate Telemetry**: Ranked candidate vessels, closest approach (CPA), temporal delta (`AIS`).
- **Analytical Correlation**: Spatio-temporal consistency breakdown with explicit non-attribution disclaimer.
- **Scientific Limitations & Disclaimers**: Explicit statement of single-snapshot SAR limitations and synthetic AIS status.
- **Oil Type & Volume**: Rendered as *"Oil type not established from available evidence"* and *"Spill volume not established from available evidence"*.
- **Legal Status**: Rendered with prominent *"Legal responsibility not established"* badge.

---

## 8. Verification & Test Results

### 8.1 Automated Test Execution

1. **Python ML Test Suite (`services/ml-python`)**:
   - Total Tests: **244 / 244 PASSED** (0 Failures, 0 Regressions).
   - Baseline preserved: 100% pass rate.
2. **Node.js Backend Test Suite (`services/backend-node`)**:
   - Total Tests: **94 / 94 PASSED** (15 / 15 test suites passed).
   - Unit tests: 64 passed.
   - Integration tests: 30 passed (including 23 mandatory Part 0.13G integration & tampering audit behaviors in `tests/integration/dossier_integration.test.js`).
3. **Frontend Production Build (`apps/web`)**:
   - `npm run build` executed successfully with 0 errors (`vite build` production bundle generated).

---

## 9. Conclusion & Freeze Status

Part 0.13G integration is complete, fully tested, and verified.

- **PDF Generation**: Strictly NOT implemented (reserved for next phase).
- **Scientific Logic**: Untouched and frozen.
- **Recommendation**: `FREEZE`.
