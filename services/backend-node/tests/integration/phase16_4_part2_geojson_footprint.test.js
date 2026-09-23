/**
 * Phase 16.4 Part 2 — Map + GeoJSON Spill Footprint Integration
 *
 * Backend tests covering:
 * 1.  Valid GeoTIFF CRS is preserved in canonical payload
 * 2.  imageFootprint generated correctly (GeoJSON Feature, provenance REAL)
 * 3.  Spill mask converts to spillFootprint GeoJSON Feature
 * 4.  spillFootprint uses raster transform (derived from geometry FeatureCollection)
 * 5.  EPSG:4326 output is valid WGS84 geometry
 * 6.  Projected CRS area calculation preserved
 * 7.  Area m²/km² consistency
 * 8.  Centroid derived from spill geometry — object { latitude, longitude, provenance }
 * 9.  Multi-component spill → MultiPolygon Feature
 * 10. Missing CRS disables geospatial investigation (available: false)
 * 11. Missing bounds disables geospatial investigation (available: false)
 * 12. No fabricated coordinates in non-georeferenced payload
 * 13. REAL provenance on imageFootprint
 * 14. MODEL_DERIVED provenance on spillFootprint
 * 15. Centroid provenance is MODEL_DERIVED
 * 16. Existing SAR Part 1 regression (imageFootprint present on SAR job with geo data)
 * 17. No spillFootprint when model detects nothing
 * 18. Fingerprint determinism with geospatial data
 */

const { buildCanonicalInvestigationPayload } = require('../../src/manual-analysis/canonical-investigation.normalizer');

// ── Geometry fixtures ────────────────────────────────────────────────────────

const RASTER_POLYGON_GEOM = {
  type: 'Polygon',
  coordinates: [
    [[72.5, 18.5], [73.0, 18.5], [73.0, 19.0], [72.5, 19.0], [72.5, 18.5]],
  ],
};

const SPILL_POLYGON_GEOM = {
  type: 'Polygon',
  coordinates: [
    [[72.6, 18.6], [72.8, 18.6], [72.8, 18.8], [72.6, 18.8], [72.6, 18.6]],
  ],
};

function makeMultiComponentGeometry() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[72.60, 18.60], [72.70, 18.60], [72.70, 18.70], [72.60, 18.70], [72.60, 18.60]]],
        },
        properties: { featureType: 'OIL_SPILL_POLYGON', componentId: 1, areaKm2: 1.2 },
      },
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[72.80, 18.80], [72.90, 18.80], [72.90, 18.90], [72.80, 18.90], [72.80, 18.80]]],
        },
        properties: { featureType: 'OIL_SPILL_POLYGON', componentId: 2, areaKm2: 0.8 },
      },
    ],
  };
}

// ── Builder: create a full job with mlResult embedded in payload ──────────────

function makeGeoJob(mlResultOverrides = {}, payloadOverrides = {}) {
  const mlResult = {
    modelId: 'unet-dual-pol-sar-v09d-residual-loss',
    confidence: 0.87,
    estimatedAreaM2: 2500.0,
    estimatedAreaKm2: 0.0025,
    geospatialStatus: 'ESTABLISHED',
    crs: 'EPSG:4326',
    bounds: [72.5, 18.5, 73.0, 19.0],
    centroid: { latitude: 18.75, longitude: 72.75 },
    geospatial: {
      geolocationStatus: 'ESTABLISHED',
      crs: 'EPSG:4326',
      bounds: [72.5, 18.5, 73.0, 19.0],
      physicalAreaM2: 2500.0,
      physicalAreaKm2: 0.0025,
    },
    imageFootprint: {
      type: 'Feature',
      geometry: RASTER_POLYGON_GEOM,
      properties: { featureType: 'IMAGE_FOOTPRINT', label: 'IMAGE FOOTPRINT' },
    },
    geometry: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: SPILL_POLYGON_GEOM,
          properties: { featureType: 'OIL_SPILL_POLYGON', areaKm2: 0.0025, areaM2: 2500.0, confidence: 0.87 },
        },
      ],
    },
    ...mlResultOverrides,
  };

  return {
    id: 'test-job-p2-' + Math.random().toString(36).slice(2, 8),
    analysisId: 'test-analysis-p2-' + Math.random().toString(36).slice(2, 8),
    status: 'COMPLETED',
    payload: {
      isTiff: true,
      sourceType: 'SENTINEL1_DUAL_POL',
      polarizations: ['VV', 'VH'],
      geospatial: {
        geolocationStatus: 'ESTABLISHED',
        crs: 'EPSG:4326',
        bounds: [72.5, 18.5, 73.0, 19.0],
        physicalAreaM2: 2500.0,
        physicalAreaKm2: 0.0025,
      },
      mlResult,
      ...payloadOverrides,
    },
    completedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeManualRecord(overrides = {}) {
  return {
    id: 'test-manual-p2-' + Math.random().toString(36).slice(2, 8),
    jobId: 'test-job-p2',
    sourceType: 'SENTINEL1_DUAL_POL',
    originalFilename: 'sentinel1_scene.tif',
    mimeType: 'image/tiff',
    channels: 2,
    oilSpillDetected: true,
    detectionConfidence: 0.87,
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// TESTS
// ────────────────────────────────────────────────────────────────────────────

describe('Phase 16.4 Part 2 — Map + GeoJSON Spill Footprint Integration', () => {

  // ── 1. Valid CRS preserved ────────────────────────────────────────────────

  test('1. Valid GeoTIFF CRS is preserved in canonical payload', () => {
    const job = makeGeoJob();
    const manualRecord = makeManualRecord();

    const payload = buildCanonicalInvestigationPayload(job, manualRecord);
    expect(payload.geospatial.available).toBe(true);
    expect(payload.geospatial.crs).toBe('EPSG:4326');
    expect(payload.geospatial.crsName).toBe('WGS 84');
  });

  // ── 2. imageFootprint generated correctly ─────────────────────────────────

  test('2. imageFootprint is a GeoJSON Feature with correct geometry', () => {
    const job = makeGeoJob();
    const manualRecord = makeManualRecord();

    const payload = buildCanonicalInvestigationPayload(job, manualRecord);
    const { imageFootprint } = payload.geospatial;

    expect(imageFootprint).not.toBeNull();
    expect(imageFootprint.type).toBe('Feature');
    expect(imageFootprint.geometry).not.toBeNull();
    expect(imageFootprint.geometry.type).toBe('Polygon');
    expect(Array.isArray(imageFootprint.geometry.coordinates)).toBe(true);
    expect(imageFootprint.geometry.coordinates[0]).toHaveLength(5); // closed ring
  });

  // ── 3. spillFootprint converted from FeatureCollection ───────────────────

  test('3. Spill mask converts to spillFootprint GeoJSON Feature', () => {
    const job = makeGeoJob();
    const manualRecord = makeManualRecord();

    const payload = buildCanonicalInvestigationPayload(job, manualRecord);
    const { spillFootprint } = payload.geospatial;

    expect(spillFootprint).not.toBeNull();
    expect(spillFootprint.type).toBe('Feature');
    expect(spillFootprint.geometry).not.toBeNull();
    expect(['Polygon', 'MultiPolygon']).toContain(spillFootprint.geometry.type);
    expect(Array.isArray(spillFootprint.geometry.coordinates)).toBe(true);
  });

  // ── 4. spillFootprint uses raster transform coordinates ───────────────────

  test('4. spillFootprint coordinates are within raster bounds (uses raster transform)', () => {
    const job = makeGeoJob();
    const manualRecord = makeManualRecord();

    const payload = buildCanonicalInvestigationPayload(job, manualRecord);
    const { spillFootprint } = payload.geospatial;

    const coords = spillFootprint.geometry.coordinates[0];
    for (const [lng, lat] of coords) {
      expect(lng).toBeGreaterThanOrEqual(72.5);
      expect(lng).toBeLessThanOrEqual(73.0);
      expect(lat).toBeGreaterThanOrEqual(18.5);
      expect(lat).toBeLessThanOrEqual(19.0);
    }
  });

  // ── 5. EPSG:4326 output is valid WGS84 ───────────────────────────────────

  test('5. EPSG:4326 output is valid WGS84 (lat -90..90, lng -180..180)', () => {
    const job = makeGeoJob();
    const manualRecord = makeManualRecord();

    const payload = buildCanonicalInvestigationPayload(job, manualRecord);
    const { imageFootprint, centroid } = payload.geospatial;

    for (const [lng, lat] of imageFootprint.geometry.coordinates[0]) {
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
      expect(lng).toBeGreaterThanOrEqual(-180);
      expect(lng).toBeLessThanOrEqual(180);
    }

    expect(centroid.latitude).toBeGreaterThanOrEqual(-90);
    expect(centroid.latitude).toBeLessThanOrEqual(90);
    expect(centroid.longitude).toBeGreaterThanOrEqual(-180);
    expect(centroid.longitude).toBeLessThanOrEqual(180);
  });

  // ── 6. Projected CRS area calculation ─────────────────────────────────────

  test('6. Area values from mlResult are preserved correctly', () => {
    const job = makeGeoJob({ estimatedAreaM2: 12500.0, estimatedAreaKm2: 0.0125 });
    const manualRecord = makeManualRecord();

    const payload = buildCanonicalInvestigationPayload(job, manualRecord);
    expect(payload.geospatial.areaM2).toBe(12500.0);
    expect(payload.geospatial.areaKm2).toBe(0.0125);
  });

  // ── 7. Area m²/km² consistency ───────────────────────────────────────────

  test('7. Area m²/km² consistency: areaKm2 = areaM2 / 1e6 when only m² provided', () => {
    // Build a minimal geo job with ONLY m2 — no km2 anywhere
    const job = {
      id: 'test-area-km2-' + Math.random().toString(36).slice(2, 8),
      status: 'COMPLETED',
      payload: {
        isTiff: true,
        sourceType: 'SENTINEL1_DUAL_POL',
        geospatial: {
          geolocationStatus: 'ESTABLISHED',
          crs: 'EPSG:4326',
          bounds: [72.5, 18.5, 73.0, 19.0],
          physicalAreaM2: 5000.0,
          // physicalAreaKm2 intentionally absent
        },
        mlResult: {
          modelId: 'unet-dual-pol-sar-v09d-residual-loss',
          confidence: 0.87,
          estimatedAreaM2: 5000.0,
          // estimatedAreaKm2 intentionally absent
          geospatialStatus: 'ESTABLISHED',
          centroid: { latitude: 18.75, longitude: 72.75 },
          geospatial: {
            geolocationStatus: 'ESTABLISHED',
            crs: 'EPSG:4326',
            bounds: [72.5, 18.5, 73.0, 19.0],
            physicalAreaM2: 5000.0,
            // physicalAreaKm2 intentionally absent
          },
          imageFootprint: {
            type: 'Feature',
            geometry: RASTER_POLYGON_GEOM,
            properties: { featureType: 'IMAGE_FOOTPRINT' },
          },
          geometry: {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              geometry: SPILL_POLYGON_GEOM,
              properties: { featureType: 'OIL_SPILL_POLYGON' },
            }],
          },
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const manualRecord = makeManualRecord();

    const payload = buildCanonicalInvestigationPayload(job, manualRecord);
    expect(payload.geospatial.areaM2).toBe(5000.0);
    // Fallback: areaKm2 = areaM2 / 1e6
    expect(payload.geospatial.areaKm2).toBeCloseTo(0.005, 6);
  });

  // ── 8. Centroid object shape ──────────────────────────────────────────────

  test('8. Centroid is { latitude, longitude, provenance: MODEL_DERIVED }', () => {
    const job = makeGeoJob();
    const manualRecord = makeManualRecord();

    const payload = buildCanonicalInvestigationPayload(job, manualRecord);
    const { centroid } = payload.geospatial;

    expect(centroid).not.toBeNull();
    expect(typeof centroid).toBe('object');
    expect(typeof centroid.latitude).toBe('number');
    expect(typeof centroid.longitude).toBe('number');
    expect(centroid.provenance).toBe('MODEL_DERIVED');
    expect(centroid.latitude).toBeCloseTo(18.75, 2);
    expect(centroid.longitude).toBeCloseTo(72.75, 2);
  });

  // ── 9. Multi-component spill → MultiPolygon ──────────────────────────────

  test('9. Multi-component spill geometry produces MultiPolygon Feature', () => {
    const job = makeGeoJob({ geometry: makeMultiComponentGeometry() });
    const manualRecord = makeManualRecord();

    const payload = buildCanonicalInvestigationPayload(job, manualRecord);
    const { spillFootprint } = payload.geospatial;

    expect(spillFootprint).not.toBeNull();
    expect(spillFootprint.geometry.type).toBe('MultiPolygon');
    expect(spillFootprint.geometry.coordinates).toHaveLength(2);
    expect(spillFootprint.properties.componentCount).toBe(2);
    expect(spillFootprint.properties.provenance).toBe('MODEL_DERIVED');
  });

  // ── 10. Missing CRS disables geospatial ──────────────────────────────────

  test('10. Missing CRS produces geospatial.available = false', () => {
    const job = makeGeoJob(
      { geospatialStatus: 'NOT_ESTABLISHED', crs: null, centroid: null, geospatial: { geolocationStatus: 'NOT_ESTABLISHED', crs: null, bounds: null } },
      { geospatial: { geolocationStatus: 'NOT_ESTABLISHED', crs: null, bounds: null } }
    );
    const manualRecord = makeManualRecord();

    const payload = buildCanonicalInvestigationPayload(job, manualRecord);
    expect(payload.geospatial.available).toBe(false);
    expect(payload.geospatial.imageFootprint).toBeNull();
    expect(payload.geospatial.spillFootprint).toBeNull();
    expect(payload.geospatial.centroid).toBeNull();
  });

  // ── 11. Missing bounds disables geospatial ───────────────────────────────

  test('11. Missing bounds disables geospatial investigation', () => {
    const job = makeGeoJob(
      { bounds: null, geospatial: { geolocationStatus: 'ESTABLISHED', crs: 'EPSG:4326', bounds: null } },
      { geospatial: { geolocationStatus: 'ESTABLISHED', crs: 'EPSG:4326', bounds: null } }
    );
    const manualRecord = makeManualRecord();

    const payload = buildCanonicalInvestigationPayload(job, manualRecord);
    expect(payload.geospatial.available).toBe(false);
  });

  // ── 12. No fabricated coordinates when not georeferenced ─────────────────

  test('12. No fabricated coordinates in non-georeferenced payload', () => {
    const job = {
      id: 'no-geo-job',
      analysisId: 'no-geo-analysis',
      status: 'COMPLETED',
      payload: {
        isTiff: true,
        sourceType: 'SENTINEL1_DUAL_POL',
        geospatial: { geolocationStatus: 'NOT_ESTABLISHED', crs: null, bounds: null },
        mlResult: {
          modelId: 'unet-dual-pol-sar-v09d-residual-loss',
          confidence: 0.7,
          geospatial: { geolocationStatus: 'NOT_ESTABLISHED', crs: null },
          centroid: null,
          geometry: null,
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const manualRecord = makeManualRecord({ detectionConfidence: 0.7 });

    const payload = buildCanonicalInvestigationPayload(job, manualRecord);
    expect(payload.geospatial.available).toBe(false);
    expect(payload.geospatial.centroid).toBeNull();
    expect(payload.geospatial.imageFootprint).toBeNull();
    expect(payload.geospatial.spillFootprint).toBeNull();
    expect(payload.geospatial.areaM2).toBeNull();
    expect(payload.geospatial.areaKm2).toBeNull();
    expect(payload.provenance.inputGeolocation).toBe('NOT_AVAILABLE');
  });

  // ── 13. REAL provenance on imageFootprint ─────────────────────────────────

  test('13. imageFootprint has provenance = REAL and featureType = IMAGE_FOOTPRINT', () => {
    const job = makeGeoJob();
    const manualRecord = makeManualRecord();

    const payload = buildCanonicalInvestigationPayload(job, manualRecord);
    const { imageFootprint } = payload.geospatial;

    expect(imageFootprint.properties.provenance).toBe('REAL');
    expect(imageFootprint.properties.featureType).toBe('IMAGE_FOOTPRINT');
  });

  // ── 14. MODEL_DERIVED provenance on spillFootprint ────────────────────────

  test('14. spillFootprint has provenance = MODEL_DERIVED and featureType = OIL_SPILL_POLYGON', () => {
    const job = makeGeoJob();
    const manualRecord = makeManualRecord();

    const payload = buildCanonicalInvestigationPayload(job, manualRecord);
    const { spillFootprint } = payload.geospatial;

    expect(spillFootprint.properties.provenance).toBe('MODEL_DERIVED');
    expect(spillFootprint.properties.featureType).toBe('OIL_SPILL_POLYGON');
  });

  // ── 15. Centroid provenance MODEL_DERIVED ─────────────────────────────────

  test('15. Centroid provenance is MODEL_DERIVED', () => {
    const job = makeGeoJob();
    const manualRecord = makeManualRecord();

    const payload = buildCanonicalInvestigationPayload(job, manualRecord);
    expect(payload.geospatial.centroid.provenance).toBe('MODEL_DERIVED');
  });

  // ── 16. SAR regression: imageFootprint present when geo data present ──────

  test('16. SAR job with geospatial data produces non-null imageFootprint', () => {
    const job = makeGeoJob();
    const manualRecord = makeManualRecord();

    const payload = buildCanonicalInvestigationPayload(job, manualRecord);
    expect(payload.geospatial.available).toBe(true);
    expect(payload.geospatial.imageFootprint).not.toBeNull();
    expect(payload.input.modality).toBe('SAR_DUAL_POL');
    expect(payload.model.modelId).toBe('unet-dual-pol-sar-v09d-residual-loss');
  });

  // ── 17. No spillFootprint when model detects nothing ─────────────────────

  test('17. spillFootprint is null when model detects no spill (empty geometry)', () => {
    const job = makeGeoJob({
      geometry: {
        type: 'FeatureCollection',
        features: [], // no spill features
      },
      confidence: 0.0,
    });
    const manualRecord = makeManualRecord({ oilSpillDetected: false });

    const payload = buildCanonicalInvestigationPayload(job, manualRecord);
    expect(payload.geospatial.spillFootprint).toBeNull();
  });

  // ── 18. Fingerprint determinism ───────────────────────────────────────────

  test('18. Fingerprint determinism: same inputs produce same fingerprint', () => {
    const job = makeGeoJob();
    job.id = 'fixed-job-id-fp';
    const manualRecord = makeManualRecord();

    const p1 = buildCanonicalInvestigationPayload(job, manualRecord);
    const p2 = buildCanonicalInvestigationPayload(job, manualRecord);
    expect(p1.fingerprint).toBe(p2.fingerprint);
    expect(typeof p1.fingerprint).toBe('string');
    expect(p1.fingerprint.length).toBe(64); // SHA-256 hex
  });

});
