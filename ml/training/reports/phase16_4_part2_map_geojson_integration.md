# Phase 16.4 Part 2 — Map + GeoJSON Spill Footprint Integration

**Date:** 2026-09-22  
**Status:** ✅ COMPLETE  
**Depends on:** Phase 16.4 Part 1 (Canonical Investigation Payload & Manual Job Loading)

---

## Objective

Connect the canonical investigation payload from Phase 16.4 Part 1 to the existing `/analysis/:id` map.

The uploaded GeoTIFF's **real geospatial metadata** determines where the image and model-derived oil-spill footprint appear on the map.

---

## Implementation Summary

### 1. Backend — `canonical-investigation.normalizer.js`

**Extended the `geospatial` block** to include three new fields:

| Field | Provenance | Source |
|---|---|---|
| `geospatial.imageFootprint` | **REAL** | Raster CRS + affine transform (bounding polygon) |
| `geospatial.spillFootprint` | **MODEL_DERIVED** | Binary mask → `mlResult.geometry` FeatureCollection |
| `geospatial.centroid` | **MODEL_DERIVED** | `{ latitude, longitude, provenance }` object |

**Image Footprint extraction:**
- Primary source: `mlResult.imageFootprint` (GeoJSON Feature)
- Fallback: `mlResult.footprint` plain geometry
- Always stamped `provenance: "REAL"`, `featureType: "IMAGE_FOOTPRINT"`, `status: "OBSERVED_RASTER_BOUNDS"`

**Spill Footprint extraction:**
- Primary: `mlResult.geometry` FeatureCollection — filters `featureType === "OIL_SPILL_POLYGON"`
- **1 component** → single `Polygon` Feature
- **N > 1 components** → merged `MultiPolygon` Feature with `componentCount` in properties
- Secondary fallback: `mlResult.spillFootprint` direct Feature/geometry
- Always stamped `provenance: "MODEL_DERIVED"`, `featureType: "OIL_SPILL_POLYGON"`

**Centroid shape change:**  
Centroid is now a canonical `{ latitude: number, longitude: number, provenance: "MODEL_DERIVED" }` object instead of a `[lat, lng]` array. The `centroid.provenance = "MODEL_DERIVED"` signals to the frontend that this is inferred from the model, not from ground truth.

---

### 2. Frontend — `ManualFootprintLayer.jsx` (NEW)

**File:** [`apps/web/src/components/map/ManualFootprintLayer.jsx`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/apps/web/src/components/map/ManualFootprintLayer.jsx)

Reuses the existing `react-leaflet` infrastructure. Renders three sub-layers:

#### Layer A — Image Footprint (REAL)
- **Style:** Dashed sky-blue outline (`#38bdf8`), `dashArray: '8, 5'`, 4% fill opacity
- Shows actual raster geographic bounds
- Popup + Tooltip with `REAL INPUT GEOLOCATION` badge

#### Layer B — Spill Footprint (MODEL_DERIVED)
- **Style:** Teal fill (`#49C6C8`) matching existing project slick palette, 22% fill opacity
- Handles both `Polygon` and `MultiPolygon` geometries
- Popup shows area km², confidence %, modality, component count, `MODEL_DERIVED` badge in amber

#### Layer C — Spill Centroid Marker (MODEL_DERIVED)
- `CircleMarker` at the canonical centroid coordinates
- Shows lat/lng in monospace, confidence, `MODEL_DERIVED` provenance badge

**Key design decisions:**
- Renders `null` when `geospatial.available === false` — no fallback fabricated geometry
- All popups/tooltips include explicit provenance labels to prevent misinterpretation
- `key` prop derived from first coordinate to force remount on job change

---

### 3. Frontend — `Analysis.jsx`

**File:** [`apps/web/src/pages/Analysis.jsx`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/apps/web/src/pages/Analysis.jsx)

Two changes:

**a) Centroid extraction fix (lines ~833–835):**
```js
// Handles both [lat, lng] array (legacy) and { latitude, longitude, provenance } object
const centroidLat = centroid
  ? (Array.isArray(centroid) ? centroid[0] : (centroid.latitude ?? centroid.lat ?? null))
  : null;
const centroidLng = centroid
  ? (Array.isArray(centroid) ? centroid[1] : (centroid.longitude ?? centroid.lng ?? null))
  : null;
```

**b) ManualFootprintLayer added to map (after SceneFootprintLayer):**
```jsx
{manualInvestigationData && manualInvestigationData.geospatial?.available && (
  <ManualFootprintLayer
    imageFootprint={manualInvestigationData.geospatial.imageFootprint}
    spillFootprint={manualInvestigationData.geospatial.spillFootprint}
    centroid={manualInvestigationData.geospatial.centroid}
    areaKm2={manualInvestigationData.geospatial.areaKm2}
    confidence={manualInvestigationData.detection?.confidence}
    modality={manualInvestigationData.input?.modality}
    visible={true}
  />
)}
```

This only mounts when `geospatial.available === true`, ensuring **zero fabricated rendering** for non-georeferenced images.

---

### 4. Frontend — `canonicalInvestigation.js`

**File:** [`apps/web/src/utils/canonicalInvestigation.js`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/apps/web/src/utils/canonicalInvestigation.js)

The `normalizeCanonicalInvestigation` function now carries `imageFootprint` and `spillFootprint` through the geospatial block, preserving provenance from the backend payload.

---

## Provenance Guarantee

| Data Field | Provenance | Label |
|---|---|---|
| Image bounding polygon | `REAL` | Derived from raster CRS + affine transform |
| Oil spill polygon | `MODEL_DERIVED` | Semantic segmentation mask |
| Centroid | `MODEL_DERIVED` | Geometric centroid of spill mask |
| Area km² | `MODEL_DERIVED` | Pixel count × physical pixel size |
| AIS / vessel / drift | `NOT_ESTABLISHED` | Never computed or displayed |

**NEVER fabricated:** coordinates, CRS, drift trajectory, oil type, vessel attribution.

---

## Test Results

### Backend Tests — 30/30 Passing

**Phase 16.4 Part 1 (Regression):** 12/12 ✅  
**Phase 16.4 Part 2 (New):** 18/18 ✅

| # | Test | Result |
|---|---|---|
| 1 | Valid GeoTIFF CRS preserved | ✅ |
| 2 | `imageFootprint` is correct GeoJSON Feature | ✅ |
| 3 | Spill mask converts to `spillFootprint` Feature | ✅ |
| 4 | `spillFootprint` coordinates within raster bounds | ✅ |
| 5 | EPSG:4326 output valid WGS84 range | ✅ |
| 6 | Area m²/km² values preserved from mlResult | ✅ |
| 7 | Fallback: `areaKm2 = areaM2 / 1e6` | ✅ |
| 8 | Centroid shape `{ latitude, longitude, provenance }` | ✅ |
| 9 | Multi-component spill → `MultiPolygon` | ✅ |
| 10 | Missing CRS → `available: false` | ✅ |
| 11 | Missing bounds → `available: false` | ✅ |
| 12 | No fabricated coords in non-georeferenced payload | ✅ |
| 13 | `imageFootprint.properties.provenance = "REAL"` | ✅ |
| 14 | `spillFootprint.properties.provenance = "MODEL_DERIVED"` | ✅ |
| 15 | `centroid.provenance = "MODEL_DERIVED"` | ✅ |
| 16 | SAR job with geo data → non-null `imageFootprint` | ✅ |
| 17 | Empty geometry → `spillFootprint = null` | ✅ |
| 18 | Fingerprint determinism | ✅ |

---

## Files Modified / Created

| File | Action | Purpose |
|---|---|---|
| `services/backend-node/src/manual-analysis/canonical-investigation.normalizer.js` | MODIFIED | Added `imageFootprint`, `spillFootprint`, canonical centroid object |
| `apps/web/src/components/map/ManualFootprintLayer.jsx` | **NEW** | Renders image + spill footprints and centroid on the Leaflet map |
| `apps/web/src/pages/Analysis.jsx` | MODIFIED | Imports `ManualFootprintLayer`, fixes centroid extraction, mounts layer |
| `apps/web/src/utils/canonicalInvestigation.js` | MODIFIED | Carries `imageFootprint`/`spillFootprint` through frontend normalizer |
| `services/backend-node/tests/integration/phase16_4_part2_geojson_footprint.test.js` | **NEW** | 18 backend integration tests |
| `services/backend-node/tests/integration/phase16_4_analysis_data_contract.test.js` | MODIFIED | Updated centroid assertion for new object shape |

---

## Scientific Guardrails Maintained

- ✅ No fabricated coordinates at any layer
- ✅ `imageFootprint` provenance: `REAL` — always from actual raster transform
- ✅ `spillFootprint` provenance: `MODEL_DERIVED` — labelled in all UI popups
- ✅ `geospatial.available = false` → component renders `null` (no phantom geometry)
- ✅ AIS / vessel / drift / oil-type: `NOT_ESTABLISHED` — not displayed
- ✅ Centroid provenance is `MODEL_DERIVED` — the UI labels it explicitly

---

## STOP — PHASE 16.4 PART 2 COMPLETE

Do not proceed to Part 3 until instructed.
