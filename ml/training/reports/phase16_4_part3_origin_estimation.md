# Phase 16.4 Part 3 — Spill Origin Estimation Integration

**Date:** 2026-09-22  
**Status:** ✅ COMPLETE  
**Depends on:** Phase 16.4 Part 1 (Canonical Payload), Phase 16.4 Part 2 (GeoJSON Footprints)

---

## Objective

Integrate the existing Lagrangian drift service into the manual GeoTIFF investigation workflow to produce an **ESTIMATED SPILL ORIGIN** marker on the analysis map.

---

## Existing Origin Algorithm Used

The codebase contained no `spillOriginEstimationService.js`, `geometryExtractionService.js`, `driftTrajectoryService.js`, `aisCorrelationService.js`, or `vesselIdentificationService.js`.

The existing origin estimation algorithm is **`drift.service.js`** (`runDriftSimulation()`), which:
1. Calls `POST /api/v1/hindcast/simulate` on the Python ML service (Lagrangian model)
2. Falls back deterministically to a built-in demo Lagrangian model when the Python service is unreachable (`DEMO_MODE=true`)
3. Returns `originLat`, `originLng`, `uncertaintyRadiusKm`, and `simulationMeta`

This service was already imported in `manual-analysis.service.js`. Phase 16.4 Part 3 wraps it.

---

## Files Changed

| File | Action | Purpose |
|---|---|---|
| `services/backend-node/src/manual-analysis/spillOriginEstimationService.js` | **NEW** | Named service wrapper with four data-quality gates |
| `services/backend-node/src/manual-analysis/manual-analysis.service.js` | MODIFIED | Imports service; adds `buildCanonicalWithOrigin()` async helper; replaces 4 `buildCanonicalInvestigationPayload()` call sites |
| `apps/web/src/components/map/ManualOriginLayer.jsx` | **NEW** | Leaflet layer rendering `ESTIMATED SPILL ORIGIN` |
| `apps/web/src/pages/Analysis.jsx` | MODIFIED | Imports `ManualOriginLayer`; mounts as Layer 1C |
| `apps/web/src/utils/canonicalInvestigation.js` | MODIFIED | Carries `origin` block through normalizer passthrough and fallback |
| `services/backend-node/tests/integration/phase16_4_part3_origin_estimation.test.js` | **NEW** | 26-test suite (17 spec + 9 helper unit tests) |

---

## API Changes

`GET /api/v1/manual-analysis/:jobId` now returns:

```json
{
  "...canonical fields...",
  "origin": {
    "status": "ESTIMATED",
    "estimatedPoint": {
      "latitude": 18.9440,
      "longitude": 72.6560
    },
    "uncertainty": {
      "radiusKm": 2.6,
      "confidence": "LOW_TO_MEDIUM",
      "notes": "..."
    },
    "method": "Lagrangian reverse hindcast (24h backward trace from model-derived spill centroid)",
    "engine": "BUILT-IN DEMONSTRATION LAGRANGIAN MODEL",
    "provenance": "MODEL_DERIVED",
    "source": "SPILL_ORIGIN_ESTIMATION_SERVICE",
    "timestampSource": "ESTIMATION_TIME_PROXY (acquisition timestamp not available)",
    "centroidUsed": { "latitude": 18.75, "longitude": 72.75 },
    "hoursBack": 24,
    "simulationMeta": { "...": "..." }
  },
  "provenance": {
    "...existing fields...",
    "origin": "MODEL_DERIVED"
  }
}
```

Non-ESTIMATED states:
```json
{
  "origin": {
    "status": "NOT_AVAILABLE",
    "estimatedPoint": null,
    "uncertainty": null,
    "method": null,
    "provenance": "NOT_AVAILABLE",
    "source": "SPILL_ORIGIN_ESTIMATION_SERVICE",
    "unavailableReason": "Source image has no valid geospatial reference..."
  }
}
```

---

## Origin Input Requirements

| Input | Required | Source | Fabricated if missing? |
|---|---|---|---|
| `geospatial.available === true` | **Yes — gate** | Raster CRS + bounds | **No** — returns NOT_AVAILABLE |
| `spillFootprint` (valid GeoJSON) | **Yes — gate** | Model segmentation | **No** — returns INSUFFICIENT_DATA |
| `centroid.latitude/longitude` | **Yes — gate** | Model-derived centroid | **No** — returns INSUFFICIENT_DATA |
| Acquisition timestamp | No | GeoTIFF metadata | **No** — documented as PROXY in timestampSource |
| Wind / ocean currents | No | Demo: built-in MetOcean field | **No** — documented as "source: demo" in simulationMeta |

---

## Data-Quality Gates

### Gate 1 — Geospatial
```
geospatial.available === true → proceed
geospatial.available === false → origin.status = NOT_AVAILABLE
```

### Gate 2 — Spill Footprint
```
spillFootprint != null AND coordinates not empty → proceed
spillFootprint == null → origin.status = INSUFFICIENT_DATA
```
Image footprint is **NOT** used as a substitute for spill footprint.

### Gate 3 — Centroid
```
centroid with valid lat/lng in [-90..90] × [-180..180] → proceed
invalid or null centroid → origin.status = INSUFFICIENT_DATA
```

### Gate 4 — Timestamp (Non-blocking)
```
acquisitionTimestamp present → passed to drift engine; logged as RASTER_ACQUISITION_TIMESTAMP
acquisitionTimestamp null → drift engine uses Date.now() as proxy; logged as ESTIMATION_TIME_PROXY
```
Timestamp is **never fabricated**.

---

## Successful Origin Behavior

When all gates pass:
1. `spillOriginEstimationService.estimateOrigin()` calls `driftService.runDriftSimulation()`
2. Centroid lat/lng seeds the Lagrangian reverse hindcast
3. End-point of backward path = estimated discharge origin
4. `origin.status = "ESTIMATED"`, `estimatedPoint` = `{ latitude, longitude }`
5. `uncertainty.radiusKm` from drift result (grows with hindcast duration)
6. `provenance = "MODEL_DERIVED"` always

---

## Missing-Data Behavior

| Condition | `origin.status` | `estimatedPoint` |
|---|---|---|
| `geospatial.available = false` | `NOT_AVAILABLE` | `null` |
| `geospatial = null` | `NOT_AVAILABLE` | `null` |
| `spillFootprint = null` | `INSUFFICIENT_DATA` | `null` |
| Empty polygon coordinates | `INSUFFICIENT_DATA` | `null` |
| Invalid/null centroid | `INSUFFICIENT_DATA` | `null` |
| Drift service throws | `FAILED` | `null` |

Map: `ManualOriginLayer` renders `null` for any non-ESTIMATED status. No phantom marker.

---

## Provenance

| Field | Provenance | Notes |
|---|---|---|
| Input geolocation (image) | `REAL` | Raster CRS + affine transform |
| Spill footprint | `MODEL_DERIVED` | Segmentation model output |
| Spill centroid | `MODEL_DERIVED` | Geometric centroid of mask |
| **Estimated origin** | **`MODEL_DERIVED`** | Lagrangian reverse hindcast endpoint |
| AIS / vessel | `NOT_ESTABLISHED` | Not computed, not displayed |
| Oil type | `NOT_ESTABLISHED` | Not computed, not displayed |

---

## AIS / Vessel Isolation

- `spillOriginEstimationService.js` contains zero references to `aisService`, `aisRepository`, or `vesselIdentificationService`
- `provenance.vesselAttribution` remains `"NOT_ESTABLISHED"` in all canonical payloads
- Origin estimation does NOT connect estimated point → AIS → vessel
- Test 13 asserts the source file contains no AIS identifiers

---

## Frontend Behaviour

### ManualOriginLayer.jsx

- Renders when `origin.status === 'ESTIMATED'` **only**
- Shows three sub-elements:
  - **Uncertainty radius** — dashed amber circle at `uncertainty.radiusKm`
  - **Target rings** — outer and inner amber `CircleMarker`
  - **Popup** — shows: `ESTIMATED SPILL ORIGIN` header, `MODEL-DERIVED` badge, lat/lng, uncertainty, method, engine, timestamp source, scientific disclaimer
- Scientific disclaimer in popup: *"This is an estimated discharge origin derived from Lagrangian reverse hindcast modelling. It is NOT a confirmed source location and does NOT identify a responsible vessel."*
- Renders `null` for all non-ESTIMATED states

### Layer order in Analysis.jsx

```
Layer 1A: Scene image footprint (REAL)
Layer 1B: Manual image + spill footprints (REAL / MODEL_DERIVED)
Layer 1C: Manual estimated spill origin (MODEL_DERIVED) ← NEW
Layer 2+: Demo-scenario MetOcean, slick, origin, trajectory, vessels
```

Footprint layers are preserved below origin — no replacement.

---

## Caching / Idempotency

- The demo Lagrangian engine is **deterministic**: same `(lat, lng, detectionTimestamp, hoursBack)` inputs always produce the same backward path endpoint
- No random coordinates or timestamps are used as identity keys
- Test 11 verifies that calling `estimateOrigin()` twice with identical inputs returns matching coordinates

When `acquisitionTimestamp = null`, the engine uses `Date.now()` — successive calls within the same second return the same origin. This is documented but acceptable for the demo-mode engine.

---

## Test Results

### Phase 16.4 Part 3 — 26 tests passing

| # | Test | Result |
|---|---|---|
| 1 | NOT_AVAILABLE when geospatial.available = false | ✅ |
| 2 | NOT_AVAILABLE when geospatial = null | ✅ |
| 3 | Valid geometry + centroid → ESTIMATED or FAILED | ✅ |
| 4 | ESTIMATED origin has provenance MODEL_DERIVED | ✅ |
| 5 | Missing CRS → NOT_AVAILABLE | ✅ |
| 6 | Missing bounds → NOT_AVAILABLE | ✅ |
| 7 | Null spill footprint → INSUFFICIENT_DATA | ✅ |
| 7b | Empty polygon coordinates → INSUFFICIENT_DATA | ✅ |
| 8 | Null timestamp documented as PROXY — not fabricated | ✅ |
| 8b | Real timestamp logged as RASTER_ACQUISITION_TIMESTAMP | ✅ |
| 9 | Demo engine labels environmental source as "demo" | ✅ |
| 10 | buildUnavailableOrigin returns correct structure | ✅ |
| 11 | Same inputs → same estimated coordinates (determinism) | ✅ |
| 12 | vesselAttribution = NOT_ESTABLISHED | ✅ |
| 13 | Service file contains no AIS identifiers | ✅ |
| 14 | imageFootprint.provenance = REAL | ✅ |
| 15 | spillFootprint.provenance = MODEL_DERIVED | ✅ |
| 16 | Part 1 regression — all canonical fields present | ✅ |
| 17 | Part 2 regression — imageFootprint + spillFootprint present | ✅ |
| + | extractCentroidCoords: array shape | ✅ |
| + | extractCentroidCoords: object shape | ✅ |
| + | extractCentroidCoords: null → null | ✅ |
| + | extractCentroidCoords: out-of-range → null | ✅ |
| + | isValidSpillFootprint: valid Feature → true | ✅ |
| + | isValidSpillFootprint: null → false | ✅ |
| + | isValidSpillFootprint: empty coords → false | ✅ |

### Regression

| Suite | Tests | Result |
|---|---|---|
| Phase 16.4 Part 1 | 12 | ✅ |
| Phase 16.4 Part 2 | 18 | ✅ |
| Phase 16.4 Part 3 | 26 | ✅ |
| Phase 16.2 Optical RGB | 6 | ✅ |
| **Total** | **62** | ✅ |

---

## Frontend Build

```
✓ built in 2.28s — 0 errors
```

---

## Limitations

1. **Timestamp proxy:** When the uploaded GeoTIFF lacks embedded acquisition metadata, `Date.now()` is used as the temporal anchor for the Lagrangian hindcast. This reduces temporal accuracy of the estimated origin.
2. **Demo environmental forcing:** In `DEMO_MODE`, the Lagrangian engine uses hardcoded demonstration MetOcean parameters (12.4 kts NW wind, 0.8 kts SE current). Real-ocean values would improve accuracy.
3. **Forward trajectory:** `hoursForward = 0` — no forecast trajectory is computed for manual investigations (not required by the spec).
4. **No AIS correlation:** By design. Origin estimation → vessel attribution is explicitly forbidden in this phase.
5. **Uncertainty model:** Uncertainty radius is a simplified diffusion model (R = 2.5√(2Kt) km). Real uncertainty depends on actual environmental variability.

---

## STOP — PHASE 16.4 PART 3 COMPLETE
