# Phase 6 Implementation Report: LLM-Assisted Analytical Investigation Dossier

**Project:** SIH26143 — Satellite-based Oil Spill Detection and Attribution System  
**Phase:** Phase 6 — LLM-Assisted Analytical Investigation Dossier  
**Status:** COMPLETE & VERIFIED  
**Date:** September 2026  
**Active SAR Detector Checkpoint:** `unet-dual-pol-sar-v2`  
**Operational Drift Engine:** `BUILT-IN DEMONSTRATION LAGRANGIAN MODEL`  

---

## 1. Executive Summary

Phase 6 introduces an LLM-assisted evidence synthesis and reporting layer that converts pre-computed, deterministic model outputs and geospatial evidence into a standardized, human-readable **Analytical Investigation Dossier**. 

### Critical Scientific & Legal Boundary
The LLM functions strictly as an **evidence summarization and narrative structuring layer**. Under no circumstances does the LLM perform analytical calculations, detect slicks, segment radar imagery, advect trajectories, or determine vessel culpability. All numerical values, coordinates, timestamps, and attribution scores are passed directly from the underlying deterministic services.

---

## 2. Scientific Terminology & Data Classification Framework

All synthesized narratives, API responses, and user interface components strictly adhere to the project's evidentiary standards:

### Data Classification Standards
- **`OBSERVED`**: Empirical satellite radar observations (Sentinel-1 C-band SAR VV+VH rasters, polygonized dark formation footprint, centroid coordinate, detection timestamp).
- **`MODELLED`**: Numerical physics simulations (Lagrangian reverse hindcast trajectory, Modelled Spill Origin, forward forecast, dispersion uncertainty radius).
- **`DEMONSTRATION`**: Synthetic or benchmark environmental parameters and AIS vessel telemetry when marked with `source = "demo"`.

### Standardized Scientific Terminology
- **Permitted Terms:** *"Potential Oil Slick"*, *"Candidate Vessel"*, *"Attribution Score"*, *"Modelled Spill Origin"*, *"Modelled Origin Uncertainty Radius"*, *"Modelled Backward Trajectory"*, *"Modelled Forward Forecast"*, *"Demonstration Environmental Scenario"*.
- **Strictly Prohibited Terms:** *"guilty vessel"*, *"responsible vessel"*, *"confirmed polluter"*, *"proven discharge"*, *"culprit"*, *"legally responsible"*.

---

## 3. System Architecture & Evidence Pipeline

The evidence processing pipeline flows unidirectionally from deterministic engines to the structured dossier:

```
Sentinel-1 SAR Detection (U-Net v2)
            ↓
Spill Polygon & Centroid [OBSERVED]
            ↓
Lagrangian Reverse Hindcast [MODELLED]
            ↓
AIS Vessel Correlation Scoring [DEMONSTRATION]
            ↓
EvidenceService (Structured Evidence Compilation)
            ↓
LLMService (Provider Abstraction / Deterministic Synthesis)
            ↓
DossierService (Schema Validation & Disclaimer Enforcement)
            ↓
PostgreSQL Persistence (Report Model)
            ↓
React Investigation Dossier UI
```

---

## 4. Component Implementations

### 1. Structured Evidence Contract (`services/backend-node/src/services/evidence.service.js`)
Constructs an immutable, structured evidence object containing:
- **`observedEvidence`**: Sensor type (`Sentinel-1 SAR`), scene ID, acquisition timestamp, slick area ($4.73\text{ km}^2$), centroid coordinate ($18.9210^\circ\text{N}, 72.8320^\circ\text{E}$), detection confidence ($94\%$).
- **`modelledEvidence`**: Drift engine (`BUILT-IN DEMONSTRATION LAGRANGIAN MODEL`), Modelled Spill Origin ($19.1130^\circ\text{N}, 72.5440^\circ\text{E}$), Modelled Origin Uncertainty Radius ($\pm 2.6\text{ km}$), 24h hindcast trajectory (25 points), 6h forward forecast (7 points), MetOcean parameters ($12.4\text{ kts}$ NW wind, $0.8\text{ kts}$ SE current).
- **`aisEvidence`**: Candidate vessel catalogue, ranking, total Attribution Score, component scores (proximity, temporal, trajectory, anomaly), and kinematics.
- **`disclaimers`**: Legal, evidentiary, and demonstration notices.

### 2. LLM Provider Abstraction (`services/backend-node/src/services/llm.service.js`)
Encapsulates external model providers and offline fallback logic:
- Configurable via environment variables: `LLM_ENABLED`, `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`, `LLM_TIMEOUT_MS`.
- Built-in **Deterministic Mock Provider**: Generates rich, fully validated dossiers using actual supplied evidence parameters with zero external network dependencies.
- Provider interfaces for Google Gemini and OpenAI with JSON structured mode and timeout safety.

### 3. Dossier Orchestration & Schema Validation (`services/backend-node/src/services/dossier.service.js`)
- Loads prompt templates from `prompts/`.
- Validates the resulting JSON object against the required schema:
  - `executiveSummary` (string)
  - `observedEvidence` (array of strings)
  - `modelledEvidence` (array of strings)
  - `candidateAssessments` (array of structured vessel evaluations)
  - `timeline` (array of chronological phase objects)
  - `limitations` (array of physical/data constraints)
  - `recommendedFollowUp` (array of investigative actions)
  - `disclaimer` (string)
- Verbatim enforcement of the mandatory legal disclaimer.
- Persists dossiers to the `prisma.report` database model.

### 4. Prompt Specifications (`prompts/`)
- **`dossier-system.md`**: Enforces strict evidentiary limits: *"The model must summarize only supplied evidence. It must never invent missing information or infer legal responsibility."*
- **`dossier-summary.md`**: Guides factual executive summary and event timeline generation.
- **`candidate-analysis.md`**: Directs neutral, metric-grounded candidate vessel assessment.
- **`limitations.md`**: Enforces documentation of sensor resolution, MetOcean assumptions, and demonstration constraints.

### 5. API Endpoints (`services/backend-node/src/routes/dossier.routes.js`)
- `POST /api/v1/dossier/:analysisId/generate` (requires authentication): Synthesizes, validates, and persists a dossier.
- `GET /api/v1/dossier/:analysisId` (requires authentication): Retrieves an existing persisted dossier.

### 6. User Interface (`apps/web/src/pages/Reports.jsx`)
- Interactive incident selector and "Generate Investigation Dossier" trigger with loading indicators.
- Executive summary card with evidentiary status badges.
- Prominent demonstration warning banners for MetOcean and AIS data sources.
- Tabular and card views for Observed SAR evidence, Modelled drift hindcast, and Candidate Vessel correlation breakdowns.
- Chronological Event Timeline and Actionable Recommended Follow-ups.
- Verbatim Mandatory Evidentiary Disclaimer banner.
- Native print / PDF export stylesheet support.

---

## 5. End-to-End Verification & Test Results

### 1. Python ML Service Tests
```bash
cd services/ml-python
.venv/Scripts/python.exe -m pytest tests/
```
- **Result:** 38 passed in 2.77s (100% pass rate).

### 2. Node.js Backend Test Suite
```bash
cd services/backend-node
npm test
```
- **Result:** 8 test suites passed, 42 tests passed (100% pass rate).
- **New Unit Test Suites Added:**
  - `tests/unit/evidence.service.test.js`
  - `tests/unit/llm.service.test.js`
  - `tests/unit/dossier.service.test.js`

### 3. Web Frontend Production Build
```bash
cd apps/web
npm run build
```
- **Result:** Built in 2.58s with zero warnings/errors.

### 4. End-to-End System Verification
```bash
node scripts/verify_phase6_e2e.js
```
- **Result:** Exit code 0 (All 7 verification stages passed):
  1. Demonstration AIS & PostgreSQL database environment initialized.
  2. Observed SAR spill created at $(18.9210^\circ\text{N}, 72.8320^\circ\text{E})$.
  3. Lagrangian drift simulation executed and persisted.
  4. AIS candidate vessels correlated against Modelled Origin ($19.1130^\circ\text{N}, 72.5440^\circ\text{E}$).
  5. EvidenceService compiled structured evidence package with valid `OBSERVED`, `MODELLED`, and `DEMONSTRATION` tags.
  6. DossierService synthesized, validated, and persisted structured dossier JSON.
  7. Persisted dossier verified via `GET /api/v1/dossier/:analysisId`.

---

## 6. Actual Dossier Executive Summary Output

```text
Anomalous surface oil slick signature (4.73 km²) was observed in Sentinel-1 SAR imagery (scene: demo-scene-001) at coordinates 18.921°N, 72.832°E with 94% detection confidence. A 24-hour backward Lagrangian drift hindcast (BUILT-IN DEMONSTRATION LAGRANGIAN MODEL) estimated the Modelled Spill Origin at 19.113°N, 72.544°E with a Modelled Origin Uncertainty Radius of ±2.6 km. Spatiotemporal correlation against 3 candidate vessels in the demonstration AIS registry identified ARABIAN FORTUNE (Attribution Score: 56%, closest approach: 1.24 km) as the highest correlated vessel.
```

### Mandatory Evidentiary Disclaimer
> **IMPORTANT NOTICE:**  
> Attribution scores represent modelled spatial, temporal, and trajectory correlations from available AIS and SAR-derived information. They do not establish legal responsibility, causation, or proof of pollution by any vessel. AIS records used in this demonstration are synthetic/demo records and do not represent actual historical vessel movements.

---

## 7. Confirmation of Constraints

- **No Scientific Calculations in LLM:** Confirmed. All detection metrics, geodesic distances, reverse hindcast advection steps, and attribution correlation scores originate from deterministic Python and Node.js engines.
- **No API Key Exposure:** Confirmed. All LLM credentials remain exclusively server-side.
- **Offline / Demo Operability:** Confirmed. Default mode operates with zero paid API dependency using the deterministic mock provider.
