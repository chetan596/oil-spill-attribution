# Phase 16.4 — Part 4: Drift / Backtracking Integration Report

**Status:** COMPLETE  
**Date:** 2026-09-22  
**Service Layer:** Backend Node.js & React Frontend (Manual GeoTIFF Investigation Pipeline)

---

## Executive Summary

Phase 16.4 Part 4 integrates the hydrodynamic Lagrangian drift simulation engine into the canonical manual investigation pipeline. This phase adds backward hindcast ("ESTIMATED BACKTRACK") and forward forecast ("ESTIMATED FORECAST") drift trajectories to the investigation payload and the interactive Leaflet map, while strictly maintaining scientific provenance guardrails and absolute AIS isolation.

The drift simulation is unified with origin estimation: the drift engine executes only **once** per investigation, and `origin.estimatedPoint` is directly extracted from the terminal point of the backward trajectory.

---

## 1. Existing Drift Engine & Execution Contract

### Engine Architecture
- **Primary Engine:** Python ML FastAPI Service (`POST /api/v1/hindcast/simulate`) via `drift.service.js`.
- **Demonstration Fallback:** Deterministic built-in Lagrangian advection solver (`computeDemoLagrangianDrift()`) in `drift.service.js` active when Python ML service is offline or in demonstration mode.
- **Unified Service Wrapper:** `spillOriginEstimationService.js` coordinates the single execution for both origin estimation and trajectory reconstruction.

### Exact Contract
- **Input Parameters:**
  - `latitude` (number): Model-derived spill centroid latitude.
  - `longitude` (number): Model-derived spill centroid longitude.
  - `detectionTimestamp` (ISO string | null): Raster acquisition timestamp or null.
  - `hoursBack` (number, default: 24): Hindcast duration.
  - `hoursForward` (number, default: 6): Forecast duration.
  - `source` (string): `"manual_investigation"`.
- **Output Structure:**
  - `status`: `"success"` or `"failed"`.
  - `engine`: `"BUILT-IN DEMONSTRATION LAGRANGIAN MODEL"` or ML service engine identifier.
  - `originLat`, `originLng`, `originTimestamp`: Origin discharge coordinates and time.
  - `uncertaintyRadiusKm`: Modelled diffusion uncertainty radius (e.g., 2.6 km at 24h).
  - `backwardPath`: Array of step objects from detection time $T_0$ backward to $T_{-24}$.
  - `forwardPath`: Array of step objects from detection time $T_0$ forward to $T_{+6}$.
  - `simulationMeta`: MetOcean forcing parameters, source classification, and disclaimers.

---

## 2. Backward & Forward Drift Trajectories

### Backward Trajectory ("ESTIMATED BACKTRACK")
- **Provenance:** `MODEL_DERIVED`
- **Geometry:** GeoJSON Feature with `LineString` coordinates `[[lng, lat], ...]`.
- **Direction:** Reverse Lagrangian hindcast from spill centroid ($T_0$) to estimated discharge origin ($T_{-24}$).
- **Start Point:** Model-derived centroid coordinate.
- **End Point:** Terminal waypoint of the backward trajectory.

### Origin Endpoint Consistency
The estimated origin point is derived directly from the terminal waypoint of the backward trajectory:
$$\text{origin.estimatedPoint} \equiv \text{drift.backward.endPoint} \equiv \text{backwardPath}[\text{last}]$$
Because a single unified execution runs, there is zero numerical divergence or duplicate computation.

### Forward Trajectory ("ESTIMATED FORECAST")
- **Engine Capability:** Forward simulation is genuinely supported by the engine when `hoursForward > 0`.
- **When Supported (`hoursForward = 6`):**
  - `forward.status`: `"ESTIMATED"`
  - `forward.trajectory`: GeoJSON Feature with `LineString` coordinates `[[lng, lat], ...]`.
  - `forward.hours`: 6
  - `forward.startPoint`: Centroid coordinate.
  - `forward.endPoint`: Terminal forward forecast coordinate.
- **When Unsupported or Disabled (`hoursForward = 0`):**
  - `forward.status`: `"NOT_AVAILABLE"`
  - `forward.trajectory`: `null`
  - `forward.feature`: `null`
  - No synthetic forecast is fabricated.

---

## 3. Provenance & Scientific Guardrails

| Entity | Provenance Classification | Notes |
| :--- | :--- | :--- |
| **Raster Input** | `REAL` | Derived from actual GeoTIFF affine transform + CRS. |
| **Spill Footprint** | `MODEL_DERIVED` | Extracted from deep learning segmentation mask. |
| **Centroid** | `MODEL_DERIVED` | Center of mass of model-derived spill polygon. |
| **Origin Point** | `MODEL_DERIVED` | Terminal point of reverse Lagrangian hindcast. Labelled `ESTIMATED SPILL ORIGIN`. |
| **Drift Trajectories**| `MODEL_DERIVED` | Labelled `ESTIMATED BACKTRACK` and `ESTIMATED FORECAST`. |
| **Environmental Forcing**| `DEMO` / `REAL` / `NOT_AVAILABLE` | Explicitly marked. Demo forcing displays a prominent UI warning. |
| **Vessel Attribution** | `NOT_ESTABLISHED` | Completely isolated. Zero AIS queries or vessel markers. |

### Environmental Data Provenance
- In demonstration mode:
  `environmentalData.source = "DEMO"` and `isDemo = true`.
- When demo mode is active, the UI renders a visible tactical pill:
  `DEMONSTRATION METOCEAN FORCING`.
- If demo mode is disabled and environmental data is unavailable:
  `drift.status = "ENVIRONMENTAL_DATA_UNAVAILABLE"`.

### Timestamp Handling
- If GeoTIFF metadata contains an acquisition timestamp:
  `timestampSource = "RASTER_ACQUISITION_TIMESTAMP"`.
- If unavailable, current time is used strictly as a calculation proxy:
  `timestampSource = "ESTIMATION_TIME_PROXY"`.
- `Date.now()` is never represented as an observed acquisition time.

### Uncertainty Representation
- Preserved directly from the engine's advection-diffusion modeling ($R(t) = 2.5 \sqrt{2Kt}$).
- Exposed as `uncertainty.radiusKm` (e.g., $\pm 2.6\text{ km}$).
- Labelled `ESTIMATED UNCERTAINTY` (not "accuracy" or "confidence percentage").

---

## 4. Idempotency & Caching Strategy

An in-memory simulation cache (`driftSimulationCache`) in `spillOriginEstimationService.js` indexes results by:
$$\text{cacheKey} = \text{jobId} :: \text{CRS} :: \text{bounds} :: \text{lat} :: \text{lng} :: \text{timestamp} :: \text{hoursBack} :: \text{hoursForward} :: \text{envMode} :: \text{engineVersion}$$

Repeated requests (`GET /api/v1/manual-analysis/:jobId`) return identical, cached drift and origin objects without re-running simulations.

---

## 5. Map & UI Integration

- **New Component:** [`ManualDriftLayer.jsx`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/apps/web/src/components/map/ManualDriftLayer.jsx)
  - Amber dashed polyline (`#E7A63A`, dashArray `'6, 5'`) for `ESTIMATED BACKTRACK`.
  - Green dashed polyline (`#4ADE80`, dashArray `'4, 4'`) for `ESTIMATED FORECAST`.
  - Waypoints with popups exposing duration, environmental provenance, timestamp source, uncertainty, and the disclaimer:
    > *"This is NOT an observed vessel trajectory."*
  - Prominent badge for `DEMONSTRATION METOCEAN FORCING`.
- **Page Integration:** Mounted as **Layer 1D** in [`Analysis.jsx`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/apps/web/src/pages/Analysis.jsx) with `key="manual-drift-${jobId}"`, ensuring clean unmounting when switching jobs.

---

## 6. Verification & Test Results

### Backend Integration Tests (`phase16_4_part4_drift_integration.test.js`)
**24 / 24 Tests Passed** (0.74s):
1. Valid geospatial + spill → drift executes (`ESTIMATED`)
2. Backward trajectory returned
3. Backward trajectory is valid GeoJSON LineString Feature
4. Trajectory provenance is `MODEL_DERIVED`
5. Origin endpoint strictly agrees with backward trajectory endpoint
6. Missing geospatial → `NOT_AVAILABLE`
7. Missing spill footprint → `INSUFFICIENT_DATA`
8. Missing centroid → `INSUFFICIENT_DATA`
9. Real acquisition timestamp preserved (`RASTER_ACQUISITION_TIMESTAMP`)
10. Missing timestamp marked proxy (`ESTIMATION_TIME_PROXY`)
11. DEMO environmental source explicitly labelled (`DEMO`)
12. REAL environmental source preserved when returned
13. DEMO mode disabled + missing environment → `ENVIRONMENTAL_DATA_UNAVAILABLE`
14. Engine failure → `FAILED`
15. No fake trajectory on failure
16. Forward trajectory returned when supported (`hoursForward > 0`)
17. Unsupported forward trajectory (`hoursForward = 0`) → `NOT_AVAILABLE`
18. Uncertainty preserved
19. Deterministic / cached repeated result
20. AIS service not invoked
21. Vessel attribution remains `NOT_ESTABLISHED`
22. Part 1 regression: canonical contract remains valid
23. Part 2 regression: image & spill footprints intact
24. Part 3 regression: estimateOrigin backwards compatibility

### Frontend Unit & Component Tests (`phase16_4_part4_drift_integration.test.jsx`)
**14 / 14 Tests Passed** (13ms):
25. Backward trajectory renders with Polyline positions
26. Forward trajectory renders only when available; suppressed when `NOT_AVAILABLE`
27. Demo MetOcean forcing is clearly identified
28. REAL environmental source is labelled `REAL`
29. Proxy timestamp is labelled `ESTIMATION_TIME_PROXY`
30. No trajectory when geospatial unavailable (`NOT_AVAILABLE`)
31. No trajectory when spill unavailable (`INSUFFICIENT_DATA`)
32. Failed drift state renders gracefully (null, no crash)
33. Trajectory provenance label is `MODEL_DERIVED`
34. Origin remains visible alongside drift
35. Spill footprint remains visible alongside drift
36. Image footprint remains visible alongside drift
37. Trajectory resets / cleans up when switching jobs
38. Zero AIS / vessel markers created

### Regression Suite
- **Phase 16.4 Parts 1–4 Backend:** 80 / 80 passed
- **Phase 16.2 Optical RGB Backend:** 6 / 6 passed
- **Frontend Vitest Suite (Parts 16.1, 16.2, 16.4):** 83 / 83 passed
- **Frontend Production Build (`npm run build`):** Built cleanly in 2.25s (0 errors)

---

## 7. Known Scientific & Technical Limitations

1. **Environmental Forcing:** In offline/demo mode, wind (12.4 kts NW) and current (0.8 kts SE) are synthetic demonstration values and must not be used as legal or factual evidence of real oceanic drift.
2. **Trajectory Nature:** The backward trajectory is an estimated advection-diffusion hindcast from model-derived pixels; it does not represent an observed GPS track of a vessel or slick.
3. **Temporal Uncertainty:** When raster acquisition timestamp is not present in container metadata, calculation uses an estimation proxy timestamp, which expands temporal uncertainty bounds.
4. **Vessel Attribution:** Not established. No AIS correlation or vessel identification is performed in this phase.
