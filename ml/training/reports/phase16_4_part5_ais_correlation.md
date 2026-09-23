# Phase 16.4 — Part 5: AIS Correlation + Potential Vessel Candidates Report

**Status:** COMPLETE  
**Date:** 2026-09-22  
**Service Layer:** Backend Node.js & React Frontend (Canonical Manual GeoTIFF Investigation Pipeline)

---

## Executive Summary

Phase 16.4 Part 5 integrates spatiotemporal correlation of historical Automatic Identification System (AIS) vessel transponder tracks with the model-derived estimated spill origin established in Parts 1–4.

### Primary Operational Mandate & Legal Guardrails
1. **Candidate Identity:** All identified vessels are strictly categorized and presented as `status: "POTENTIAL_CANDIDATE"` with section title `AIS CORRELATION EVIDENCE`.
2. **Attribution State:** Final vessel attribution is strictly guarded as `attribution.status: "NOT_ESTABLISHED"`. No code or interface claims a vessel caused the spill or is a confirmed polluter.
3. **Forbidden Nomenclature:** Zero production code, schema fields, or UI labels contain terms such as `responsibleVessel`, `confirmedPolluter`, `definitiveSource`, `provenResponsibleVessel`, `MOST LIKELY POLLUTER`, or `RESPONSIBLE VESSEL RANKING`.
4. **Source Provenance:** The system explicitly distinguishes `DEMO` AIS telemetry from `REAL` coastal station feeds. Demonstration data prominently displays `DEMONSTRATION AIS DATA` and `DATA SOURCE: DEMO AIS — NOT REAL-WORLD AIS EVIDENCE`.
5. **Zero Recomputation:** Origin coordinates, uncertainty radius, and drift trajectories from Parts 1–4 are ingested directly as fixed inputs.

---

## 1. Actual AIS Data Source & Isolation

### Repository State Audit
- **Demonstration Datasets:**
  - `services/backend-node/src/data/demo-vessels.json`: 6 realistic demonstration commercial vessels (Tankers, Bulk Carriers, Cargo).
  - `services/backend-node/src/data/demo-ais-tracks.json`: 9,076 synthetic transponder observations.
  - Active PostgreSQL Database: Seeded with 8 vessels and 108,607 historical AIS track points.
- **Real-World Live / External Provider:**
  - `clients/ais.client.js`: Stub implementation returning empty telemetry `[]`.
  - There is currently **no verified external or live real-world AIS provider**.
- **Isolation Policy:**
  - When `DEMO_MODE=true` (default): `source: "DEMO"`, `isDemo: true`, `provenance: "DEMO"`.
  - When `DEMO_MODE=false` and no live provider exists: `status: "AIS_DATA_UNAVAILABLE"`, `isDemo: false`, `candidates: []`.
  - **No external AIS sources are downloaded, invented, or silently introduced.**

---

## 2. Demonstration Dataset Coverage

The bundled demonstration AIS dataset covers approximately:
- **Temporal Coverage:** 2026-03-09T00:00:00.000Z through 2026-03-16T23:59:59.000Z.
- **Geographic Coverage:** Arabian Sea / Mumbai maritime corridor:
  - Latitude: $18.5^\circ\text{N} \text{ to } 20.0^\circ\text{N}$ (and extended continental shelf segments).
  - Longitude: $71.5^\circ\text{E} \text{ to } 73.5^\circ\text{E}$.
- **Zero Fabrication:** If an investigation is placed outside this spatiotemporal box (e.g. year 2025, or North Atlantic coordinates), the service genuinely returns `status: "NO_CANDIDATES"`, `candidates: []`.

---

## 3. AIS Search Radius vs. Model Origin Uncertainty Radius

The system strictly decouples the AIS spatial search radius from the model-derived origin diffusion uncertainty radius:

| Concept | Dimension / Default | Description |
| :--- | :--- | :--- |
| **AIS Search Radius** (`searchRadiusKm`) | 50 km (configurable) | Broad spatiotemporal query envelope used to retrieve any vessels operating within regional maritime vicinity of estimated origin. |
| **Origin Uncertainty Radius** (`originUncertaintyKm`) | 2.5 km (diffusion model) | Physical uncertainty envelope derived from Lagrangian drift simulation hindcast diffusion. |

### Corridor Condition
A vessel within the 50 km search radius is **not** automatically considered within the discharge corridor. The corridor entry property is strictly calculated as:
$$\text{enteredOriginUncertaintyCorridor} = (\text{closestApproachKm} \le \text{originUncertaintyKm})$$
- `enteredOriginUncertaintyCorridor: true`: Vessel physically passed through model-derived uncertainty envelope.
- `enteredOriginUncertaintyCorridor: false`: Vessel operated in the regional search area but remained outside the origin uncertainty corridor.

---

## 4. Temporal Provenance & Windowing

The temporal query window is derived from investigation time metadata:
- **Duration:** 48 hours ($\pm 24\text{ hours}$ centered on origin discharge timestamp).
- **When Verified Acquisition Timestamp Exists (`RASTER_ACQUISITION_TIMESTAMP`):**
  - `timestampSource`: `"RASTER_ACQUISITION_TIMESTAMP"`
  - `temporalUncertainty`: `false`
  - Note: `"Temporal query window centered on verified raster acquisition timestamp."`
- **When Proxy Timestamp Used (`ESTIMATION_TIME_PROXY`):**
  - `timestampSource`: `"ESTIMATION_TIME_PROXY"`
  - `temporalUncertainty`: `true`
  - Note: `"Temporal correlation is limited by timestamp uncertainty. Estimation proxy timestamp was used."`
  - UI visibly warns users of temporal proxy limitations.

---

## 5. Evidence Metrics & Scoring Synthesis

Existing scoring modules (`proximity.score.js`, `temporal.score.js`, `trajectory.score.js`, `anomaly.score.js`, `final.score.js`) are reused as **EVIDENCE METRICS ONLY**:

| Metric | Score Range | Meaning |
| :--- | :--- | :--- |
| `proximityScore` | $0.0 - 1.0$ | Inverse spatial distance between vessel CPA and estimated origin. |
| `temporalScore` | $0.0 - 1.0$ | Time delta between vessel CPA and estimated discharge time. |
| `trajectoryScore` | $0.0 - 1.0$ | Course consistency with backward drift hindcast vector. |
| `anomalyScore` | $0.0 - 1.0$ | Kinematic behavioral anomalies (e.g. sharp speed drops, course alterations). |
| `score` (Composite) | $0.0 - 1.0$ | Synthesized correlation evidence metric. |

> [!CAUTION]
> **Scoring Semantics:** Outputs are correlation evidence metrics only. They are NEVER interpreted or labelled as "pollution probability", "probability of responsibility", or "likelihood of causing the spill". No percentage confidence of guilt is ever generated.

---

## 6. AIS Gaps & Telemetry Absence

Missing AIS observations are explicitly not interpreted as vessel absence:
- `coverage.aisGapNotes`: `"AIS coverage reflects available transponder transmissions within the spatiotemporal search window."`
- In `NO_CANDIDATES` state: Visibly displays `"Missing AIS observations must not be interpreted as vessel absence."` (accounting for AIS transponder power-offs, coastal terrain shadowing, or satellite receiver latency).

---

## 7. Failure & Status States

Canonical AIS correlation status enum (`AIS_CORRELATION_STATUS`):
- `NOT_AVAILABLE`: Missing geospatial metadata or missing valid estimated origin.
- `AIS_DATA_UNAVAILABLE`: Real-world AIS provider is not established when `DEMO_MODE=false`.
- `INSUFFICIENT_TEMPORAL_DATA`: Missing temporal reference for origin discharge.
- `NO_CANDIDATES`: AIS query executed successfully, but zero transponder tracks were recorded.
- `CANDIDATES_FOUND`: One or more potential candidates correlated within the spatiotemporal window.
- `FAILED`: Pipeline or database query exception encountered.

---

## 8. Frontend Map & Interface Implementation

### Map Component (`ManualCandidateLayer.jsx`) — Layer 1E
- **Historical AIS Tracks:** Dashed purple polyline (`#A855F7`, 2px weight, `4, 4` dash).
- **Vessel Position Marker:** `CircleMarker` at closest point of approach (`#A855F7` fill, `#7E22CE` border, radius 7px).
- **CPA Connection Line:** Dashed lavender line connecting closest approach position to estimated origin.
- **Interactive Popup:**
  - Header: Vessel Name, Rank, and `POTENTIAL AIS CANDIDATE` badge.
  - Demo Badge: `DEMONSTRATION AIS DATA` / `DATA SOURCE: DEMO AIS — NOT REAL-WORLD AIS EVIDENCE`.
  - Attribution Notice: `ATTRIBUTION: NOT ESTABLISHED` with statutory notice: *"AIS movement is spatially and temporally correlated with the model-derived estimated spill origin. This does NOT establish responsibility."*
  - Metrics Grid: Closest Distance (km), Uncertainty Corridor status (`ENTERED` vs `OUTSIDE`), Trajectory Match (`SUPPORTED` vs `INCONCLUSIVE`), Evidence Metric ($0.0 - 1.0$).
  - Vessel Specs: MMSI, IMO, Type, Flag, Length.

### HUD & Sidebar (`Analysis.jsx`)
- **Map HUD Warning Badge:** `demo-ais-warning` rendered on top-left overlay whenever demo AIS data is active.
- **Sidebar AIS Correlation Evidence Panel:** Renders candidate cards ranked by correlation evidence metric, maintaining full provenance and guardrail disclaimers.

---

## 9. Verification & Test Suite Results

### Backend Integration Test Suite (`phase16_4_part5_ais_correlation.test.js`)
**28 of 28 tests passing (100%):**
1. `Valid inputs + demo vessels in range → status: CANDIDATES_FOUND` — PASSED
2. `Each candidate has status: "POTENTIAL_CANDIDATE"` — PASSED
3. `Candidate rank assigned by correlation score descending (rank 1, 2, ...)` — PASSED
4. `AIS outside demo temporal coverage → status: NO_CANDIDATES` — PASSED
5. `AIS outside demo geographic coverage → status: NO_CANDIDATES` — PASSED
6. `AIS search radius (50 km) is separate from origin uncertainty radius (2.5 km)` — PASSED
7. `Candidate with closest approach <= originUncertaintyKm has enteredOriginUncertaintyCorridor: true` — PASSED
8. `Candidate with closest approach > originUncertaintyKm has enteredOriginUncertaintyCorridor: false` — PASSED
9. `RASTER_ACQUISITION_TIMESTAMP preserved and documented in queryWindow` — PASSED
10. `ESTIMATION_TIME_PROXY limits temporal interpretation (sets temporalUncertainty: true)` — PASSED
11. `DEMO AIS can never become REAL: isDemo is true and source is "DEMO"` — PASSED
12. `Missing real provider when DEMO_MODE=false returns AIS_DATA_UNAVAILABLE` — PASSED
13. `Missing geospatial returns NOT_AVAILABLE` — PASSED
14. `Missing origin or origin.status !== "ESTIMATED" returns NOT_AVAILABLE` — PASSED
15. `Invalid origin coordinates returns NOT_AVAILABLE` — PASSED
16. `Missing temporal reference returns INSUFFICIENT_TEMPORAL_DATA` — PASSED
17. `Zero candidates in spatiotemporal window returns NO_CANDIDATES with explicit aisGapNotes` — PASSED
18. `AIS gaps: missing AIS observations not interpreted as vessel absence` — PASSED
19. `Repository exception returns status: FAILED with structured error reason` — PASSED
20. `Candidate ordering by correlation evidence score does NOT alter attribution status` — PASSED
21. `Every candidate has attribution.status: "NOT_ESTABLISHED"` — PASSED
22. `No forbidden keys (responsibleVessel, confirmedPolluter, definitiveSource, provenResponsibleVessel) generated anywhere` — PASSED
23. `Evidence metrics only (proximityScore, temporalScore, trajectoryScore, anomalyScore)` — PASSED
24. `Deterministic and idempotent caching returns identical result on repeated calls` — PASSED
25. `Part 1 regression: canonical contract remains valid with aisCorrelation` — PASSED
26. `Part 2 & Part 3 regression: spill footprint and origin estimation intact` — PASSED
27. `Part 4 regression: backward drift trajectory intact with aisCorrelation attached` — PASSED
28. `manualAnalysisService.buildCanonicalWithOrigin attaches valid aisCorrelation block` — PASSED

### Frontend Unit & Component Test Suite (`phase16_4_part5_ais_correlation.test.jsx`)
**17 of 17 tests passing (100%):**
1. `ManualCandidateLayer renders valid candidates` — PASSED
2. `Historical AIS track polyline is rendered for each candidate` — PASSED
3. `Candidate vessel marker (CircleMarker) is rendered at closest approach` — PASSED
4. `CPA line connects closest approach to estimated origin` — PASSED
5. `Candidate status is strictly "POTENTIAL AIS CANDIDATE"` — PASSED
6. `Final vessel attribution strictly displays "NOT ESTABLISHED"` — PASSED
7. `DEMO AIS shows prominent "DEMONSTRATION AIS DATA" warning` — PASSED
8. `REAL AIS does not show DEMO warning` — PASSED
9. `Empty candidates array renders null (no phantom markers)` — PASSED
10. `Null / undefined candidates render null` — PASSED
11. `Corridor entry correctly reflects closestApproachKm <= originUncertaintyKm` — PASSED
12. `normalizeCanonicalInvestigation preserves aisCorrelation block intact` — PASSED
13. `validateCanonicalInvestigation succeeds for valid POTENTIAL_CANDIDATE` — PASSED
14. `validateCanonicalInvestigation rejects forbidden polluter fields` — PASSED
15. `Switching jobs / nulling candidates unmounts candidate layer cleanly` — PASSED
16. `Sidebar evidence metrics display closest approach, corridor, and score` — PASSED
17. `Origin, drift, and candidate layers coexist without collision` — PASSED

### Full Regression Suite Results
- `phase16_4_part4_drift_integration.test.js`: 24 passed
- `phase16_4_part3_origin_estimation.test.js`: 22 passed
- `phase16_4_part2_geojson_footprint.test.js`: 18 passed
- `phase16_4_analysis_data_contract.test.js`: 10 passed
- `phase16_2_optical_rgb_contract.test.js`: 12 passed
- **Total Backend Tests: 114 passed, 0 failed.**

### Frontend Production Build
```bash
npm run build
vite v5.4.21 building for production...
✓ 1675 modules transformed.
dist/index.html                     1.27 kB │ gzip:   0.72 kB
dist/assets/index-CLa1ZYws.css     16.05 kB │ gzip:   3.71 kB
dist/assets/index-CqLEJnhL.js   1,163.18 kB │ gzip: 271.03 kB
✓ built in 2.99s
```

---

## 10. File Change Index

| File | Type | Changes |
| :--- | :--- | :--- |
| `services/backend-node/src/manual-analysis/aisCorrelationService.js` | NEW | Primary spatiotemporal AIS correlation service with 6 safety gates, distance/uncertainty separation, scoring synthesis, and in-memory cache. |
| `services/backend-node/src/manual-analysis/manual-analysis.service.js` | MODIFIED | Integrated `aisCorrelationService.correlateCandidates` into `buildCanonicalWithOrigin`; exposed `vesselAttribution: "NOT_ESTABLISHED"`. |
| `apps/web/src/utils/canonicalInvestigation.js` | MODIFIED | Carried `aisCorrelation` block; enforced `validateCanonicalInvestigation` guardrails rejecting forbidden polluter fields. |
| `apps/web/src/components/map/ManualCandidateLayer.jsx` | NEW | Leaflet layer rendering candidate track polylines, closest approach markers, CPA vectors, and guardrail popup notices. |
| `apps/web/src/pages/Analysis.jsx` | MODIFIED | Mounted Layer 1E (`ManualCandidateLayer`); added `demo-ais-warning` HUD; implemented `AIS CORRELATION EVIDENCE` sidebar section. |
| `services/backend-node/tests/integration/phase16_4_part5_ais_correlation.test.js` | NEW | 28 automated integration tests covering all constraints, gates, and regressions. |
| `apps/web/src/components/__tests__/phase16_4_part5_ais_correlation.test.jsx` | NEW | 17 automated frontend component tests covering rendering, guardrails, and validation. |
| `ml/training/reports/phase16_4_part5_ais_correlation.md` | NEW | Comprehensive technical verification and audit report. |
