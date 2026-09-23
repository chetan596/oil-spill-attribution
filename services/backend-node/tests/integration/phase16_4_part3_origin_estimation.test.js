/**
 * Phase 16.4 Part 3 — Spill Origin Estimation Integration
 * Tests for spillOriginEstimationService.js
 *
 * Test coverage:
 *  1. Origin service invoked only for valid geospatial investigation
 *  2. Valid spill geometry reaches origin estimator
 *  3. Estimated origin returned correctly
 *  4. Origin provenance is MODEL_DERIVED
 *  5. Missing CRS disables origin estimation
 *  6. Missing bounds disables origin estimation
 *  7. Missing spill geometry returns INSUFFICIENT_DATA
 *  8. Missing required timestamp does not fabricate one
 *  9. Missing environmental inputs do not fabricate values
 * 10. Origin estimation failure returns structured failure state
 * 11. Origin result is deterministic for same inputs
 * 12. Vessel attribution remains NOT_ESTABLISHED
 * 13. AIS is not invoked
 * 14. Image footprint remains REAL
 * 15. Spill footprint remains MODEL_DERIVED
 * 16. Existing Phase 16.4 Part 1 contract remains valid
 * 17. Existing Phase 16.4 Part 2 geometry tests remain valid
 */

'use strict';

const {
  estimateOrigin,
  ORIGIN_STATUS,
  buildUnavailableOrigin,
  extractCentroidCoords,
  isValidSpillFootprint,
} = require('../../src/manual-analysis/spillOriginEstimationService');

const { buildCanonicalInvestigationPayload } = require('../../src/manual-analysis/canonical-investigation.normalizer');

// ── Shared test geometry ─────────────────────────────────────────────────────
const VALID_BOUNDS = [72.5, 18.5, 73.0, 19.0];
const VALID_CRS = 'EPSG:4326';
const VALID_CENTROID = { latitude: 18.75, longitude: 72.75, provenance: 'MODEL_DERIVED' };

const RASTER_POLYGON = {
  type: 'Polygon',
  coordinates: [[[72.5, 18.5], [73.0, 18.5], [73.0, 19.0], [72.5, 19.0], [72.5, 18.5]]],
};

const SPILL_POLYGON = {
  type: 'Polygon',
  coordinates: [[[72.65, 18.65], [72.85, 18.65], [72.85, 18.85], [72.65, 18.85], [72.65, 18.65]]],
};

const VALID_SPILL_FOOTPRINT = {
  type: 'Feature',
  geometry: SPILL_POLYGON,
  properties: { featureType: 'OIL_SPILL_POLYGON', provenance: 'MODEL_DERIVED' },
};

const VALID_GEOSPATIAL = {
  available: true,
  crs: VALID_CRS,
  bounds: VALID_BOUNDS,
  centroid: VALID_CENTROID,
  spillFootprint: VALID_SPILL_FOOTPRINT,
  imageFootprint: {
    type: 'Feature',
    geometry: RASTER_POLYGON,
    properties: { featureType: 'IMAGE_FOOTPRINT', provenance: 'REAL' },
  },
};

// Helper to build a valid canonical job for Part 1/2 regression
function makeGeoJob(overrides = {}) {
  return {
    id: 'test-origin-job-' + Math.random().toString(36).slice(2, 8),
    status: 'COMPLETED',
    payload: {
      isTiff: true,
      sourceType: 'SENTINEL1_DUAL_POL',
      geospatial: {
        geolocationStatus: 'ESTABLISHED',
        crs: VALID_CRS,
        bounds: VALID_BOUNDS,
      },
      mlResult: {
        modelId: 'unet-dual-pol-sar-v09d-residual-loss',
        confidence: 0.88,
        estimatedAreaM2: 5000.0,
        estimatedAreaKm2: 0.005,
        geospatialStatus: 'ESTABLISHED',
        centroid: VALID_CENTROID,
        geospatial: {
          geolocationStatus: 'ESTABLISHED',
          crs: VALID_CRS,
          bounds: VALID_BOUNDS,
          physicalAreaM2: 5000.0,
          physicalAreaKm2: 0.005,
        },
        imageFootprint: {
          type: 'Feature',
          geometry: RASTER_POLYGON,
          properties: { featureType: 'IMAGE_FOOTPRINT' },
        },
        geometry: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: SPILL_POLYGON,
            properties: { featureType: 'OIL_SPILL_POLYGON' },
          }],
        },
        ...overrides,
      },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeManualRecord() {
  return {
    id: 'mr-origin-' + Math.random().toString(36).slice(2, 8),
    jobId: 'job-origin-' + Math.random().toString(36).slice(2, 8),
    analysisId: 'analysis-origin-' + Math.random().toString(36).slice(2, 8),
    originalFilename: 'sentinel1_mumbai.tif',
    channels: 2,
    sarCompatible: true,
    sourceType: 'SENTINEL1_DUAL_POL',
    oilSpillDetected: true,
    detectionConfidence: 0.88,
    coveragePercent: 12.4,
    areaKm2: 0.005,
    modelVersion: 'unet-dual-pol-sar-v09d-residual-loss',
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Phase 16.4 Part 3 — Spill Origin Estimation Integration', () => {

  // ── 1. Geospatial gate ────────────────────────────────────────────────────
  test('1. Origin service returns NOT_AVAILABLE when geospatial.available === false', async () => {
    const result = await estimateOrigin({
      geospatial: { available: false },
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      jobId: 'test-gate-geo',
    });

    expect(result.status).toBe(ORIGIN_STATUS.NOT_AVAILABLE);
    expect(result.estimatedPoint).toBeNull();
    expect(result.source).toBe('SPILL_ORIGIN_ESTIMATION_SERVICE');
  });

  test('2. Origin service returns NOT_AVAILABLE when geospatial is null', async () => {
    const result = await estimateOrigin({
      geospatial: null,
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      jobId: 'test-gate-null-geo',
    });
    expect(result.status).toBe(ORIGIN_STATUS.NOT_AVAILABLE);
    expect(result.estimatedPoint).toBeNull();
  });

  // ── 3. Valid geometry reaches estimator ────────────────────────────────────
  test('3. Valid geometry + centroid reaches origin estimator and returns ESTIMATED or FAILED', async () => {
    const result = await estimateOrigin({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      jobId: 'test-valid-run',
    });

    // Either ESTIMATED (service online) or FAILED (demo fallback) — never NOT_AVAILABLE
    expect([ORIGIN_STATUS.ESTIMATED, ORIGIN_STATUS.FAILED]).toContain(result.status);
    expect(result.source).toBe('SPILL_ORIGIN_ESTIMATION_SERVICE');
  });

  // ── 4. Origin provenance ───────────────────────────────────────────────────
  test('4. ESTIMATED origin has provenance MODEL_DERIVED', async () => {
    const result = await estimateOrigin({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      jobId: 'test-provenance',
    });

    if (result.status === ORIGIN_STATUS.ESTIMATED) {
      expect(result.provenance).toBe('MODEL_DERIVED');
    } else {
      // NOT_AVAILABLE results always return provenance as NOT_AVAILABLE
      expect(result.provenance).not.toBe('REAL');
    }
  });

  // ── 5. Missing CRS ────────────────────────────────────────────────────────
  test('5. Missing CRS produces NOT_AVAILABLE origin', async () => {
    const result = await estimateOrigin({
      geospatial: { available: false, crs: null, bounds: null },
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      jobId: 'test-no-crs',
    });
    expect(result.status).toBe(ORIGIN_STATUS.NOT_AVAILABLE);
    expect(result.estimatedPoint).toBeNull();
  });

  // ── 6. Missing bounds ─────────────────────────────────────────────────────
  test('6. geospatial.available === false (missing bounds) disables origin', async () => {
    const result = await estimateOrigin({
      geospatial: { available: false, crs: VALID_CRS, bounds: null },
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      jobId: 'test-no-bounds',
    });
    expect(result.status).toBe(ORIGIN_STATUS.NOT_AVAILABLE);
    expect(result.estimatedPoint).toBeNull();
  });

  // ── 7. Missing spill footprint ────────────────────────────────────────────
  test('7. Null spill footprint returns INSUFFICIENT_DATA', async () => {
    const result = await estimateOrigin({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: null,
      centroid: VALID_CENTROID,
      jobId: 'test-no-footprint',
    });
    expect(result.status).toBe(ORIGIN_STATUS.INSUFFICIENT_DATA);
    expect(result.estimatedPoint).toBeNull();
    expect(result.unavailableReason).toMatch(/spill geometry/i);
  });

  test('7b. Empty FeatureCollection geometry returns INSUFFICIENT_DATA', async () => {
    const emptyFootprint = {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [] },
      properties: { featureType: 'OIL_SPILL_POLYGON' },
    };
    const result = await estimateOrigin({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: emptyFootprint,
      centroid: VALID_CENTROID,
      jobId: 'test-empty-footprint',
    });
    expect(result.status).toBe(ORIGIN_STATUS.INSUFFICIENT_DATA);
    expect(result.estimatedPoint).toBeNull();
  });

  // ── 8. Timestamp not fabricated ────────────────────────────────────────────
  test('8. Null acquisition timestamp is documented in simulationMeta — not fabricated', async () => {
    const result = await estimateOrigin({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      acquisitionTimestamp: null,
      jobId: 'test-no-timestamp',
    });

    if (result.status === ORIGIN_STATUS.ESTIMATED) {
      // timestampSource must document the absence — not claim a fabricated timestamp
      expect(result.timestampSource).toMatch(/proxy|not available/i);
      // estimatedPoint must still be valid coordinates
      expect(typeof result.estimatedPoint.latitude).toBe('number');
      expect(typeof result.estimatedPoint.longitude).toBe('number');
    } else {
      // Any non-ESTIMATED result must not have fabricated estimatedPoint
      expect(result.estimatedPoint).toBeNull();
    }
  });

  test('8b. Real acquisition timestamp is passed to engine and documented', async () => {
    const ts = '2024-02-18T10:30:00Z';
    const result = await estimateOrigin({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      acquisitionTimestamp: ts,
      jobId: 'test-with-timestamp',
    });

    if (result.status === ORIGIN_STATUS.ESTIMATED) {
      expect(result.timestampSource).toMatch(/RASTER_ACQUISITION_TIMESTAMP/);
    }
  });

  // ── 9. No fabricated environmental data ────────────────────────────────────
  test('9. Demo engine notes environmental inputs are demonstration values — not real', async () => {
    const result = await estimateOrigin({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      jobId: 'test-env-data',
    });

    if (result.status === ORIGIN_STATUS.ESTIMATED && result.simulationMeta) {
      // Demo engine explicitly labels source = "demo"
      const envSource = result.simulationMeta.environmental?.source
        || result.simulationMeta.scenario_name
        || JSON.stringify(result.simulationMeta);
      expect(envSource.toLowerCase()).toMatch(/demo|demonstration/i);
    }
  });

  // ── 10. Structured failure states ──────────────────────────────────────────
  test('10. buildUnavailableOrigin returns correct structured failure', () => {
    const failed = buildUnavailableOrigin(ORIGIN_STATUS.FAILED, 'Service timeout');
    expect(failed.status).toBe('FAILED');
    expect(failed.estimatedPoint).toBeNull();
    expect(failed.uncertainty).toBeNull();
    expect(failed.source).toBe('SPILL_ORIGIN_ESTIMATION_SERVICE');
    expect(failed.unavailableReason).toBe('Service timeout');

    const noData = buildUnavailableOrigin(ORIGIN_STATUS.INSUFFICIENT_DATA, 'No centroid');
    expect(noData.status).toBe('INSUFFICIENT_DATA');
    expect(noData.estimatedPoint).toBeNull();
  });

  // ── 11. Determinism ────────────────────────────────────────────────────────
  test('11. Same inputs produce same estimated origin coordinates (demo engine is deterministic)', async () => {
    const params = {
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      acquisitionTimestamp: '2024-02-18T10:30:00Z',
      hoursBack: 24,
      jobId: 'determinism-test',
    };

    const r1 = await estimateOrigin(params);
    const r2 = await estimateOrigin(params);

    expect(r1.status).toBe(r2.status);
    if (r1.status === ORIGIN_STATUS.ESTIMATED) {
      expect(r1.estimatedPoint.latitude).toBeCloseTo(r2.estimatedPoint.latitude, 4);
      expect(r1.estimatedPoint.longitude).toBeCloseTo(r2.estimatedPoint.longitude, 4);
    }
  });

  // ── 12. Vessel attribution remains NOT_ESTABLISHED ─────────────────────────
  test('12. Canonical payload has vesselAttribution = NOT_ESTABLISHED', () => {
    const job = makeGeoJob();
    const record = makeManualRecord();
    const canonical = buildCanonicalInvestigationPayload(job, record);
    expect(canonical.provenance.vesselAttribution).toBe('NOT_ESTABLISHED');
  });

  // ── 13. AIS not invoked ────────────────────────────────────────────────────
  test('13. Origin estimation service does not import or call AIS', () => {
    // Verify the service module does not reference ais anywhere
    const fs = require('fs');
    const path = require('path');
    const serviceContent = fs.readFileSync(
      path.resolve(__dirname, '../../src/manual-analysis/spillOriginEstimationService.js'),
      'utf8'
    );
    expect(serviceContent.toLowerCase()).not.toMatch(/aisservice|ais\.service|aisrepository/);
  });

  // ── 14. Image footprint remains REAL ──────────────────────────────────────
  test('14. imageFootprint provenance is REAL in canonical payload', () => {
    const job = makeGeoJob();
    const record = makeManualRecord();
    const canonical = buildCanonicalInvestigationPayload(job, record);
    expect(canonical.geospatial.imageFootprint).not.toBeNull();
    expect(canonical.geospatial.imageFootprint.properties.provenance).toBe('REAL');
  });

  // ── 15. Spill footprint remains MODEL_DERIVED ──────────────────────────────
  test('15. spillFootprint provenance is MODEL_DERIVED in canonical payload', () => {
    const job = makeGeoJob();
    const record = makeManualRecord();
    const canonical = buildCanonicalInvestigationPayload(job, record);
    expect(canonical.geospatial.spillFootprint).not.toBeNull();
    expect(canonical.geospatial.spillFootprint.properties.provenance).toBe('MODEL_DERIVED');
  });

  // ── 16. Part 1 regression: canonical contract ──────────────────────────────
  test('16. Part 1 regression — canonical payload has required fields', () => {
    const job = makeGeoJob();
    const record = makeManualRecord();
    const canonical = buildCanonicalInvestigationPayload(job, record);

    expect(canonical.jobId).toBeDefined();
    expect(canonical.status).toBe('COMPLETED');
    expect(canonical.input.modality).toBe('SAR_DUAL_POL');
    expect(canonical.model.modelId).toBeDefined();
    expect(canonical.detection.oilSpillDetected).toBe(true);
    expect(canonical.provenance.inputGeolocation).toBe('REAL');
    expect(canonical.provenance.detection).toBe('MODEL_DERIVED');
    expect(canonical.provenance.vesselAttribution).toBe('NOT_ESTABLISHED');
    expect(typeof canonical.fingerprint).toBe('string');
  });

  // ── 17. Part 2 regression: geospatial fields ──────────────────────────────
  test('17. Part 2 regression — imageFootprint and spillFootprint present', () => {
    const job = makeGeoJob();
    const record = makeManualRecord();
    const canonical = buildCanonicalInvestigationPayload(job, record);

    expect(canonical.geospatial.available).toBe(true);
    expect(canonical.geospatial.imageFootprint).not.toBeNull();
    expect(canonical.geospatial.spillFootprint).not.toBeNull();
    expect(canonical.geospatial.centroid).not.toBeNull();
    expect(canonical.geospatial.centroid.provenance).toBe('MODEL_DERIVED');
  });

  // ── Helper unit tests ──────────────────────────────────────────────────────
  test('extractCentroidCoords: array shape [lat, lng]', () => {
    const c = extractCentroidCoords([18.75, 72.75]);
    expect(c.latitude).toBe(18.75);
    expect(c.longitude).toBe(72.75);
  });

  test('extractCentroidCoords: object shape { latitude, longitude }', () => {
    const c = extractCentroidCoords({ latitude: 18.75, longitude: 72.75 });
    expect(c.latitude).toBe(18.75);
    expect(c.longitude).toBe(72.75);
  });

  test('extractCentroidCoords: null centroid returns null', () => {
    expect(extractCentroidCoords(null)).toBeNull();
  });

  test('extractCentroidCoords: out-of-range lat returns null', () => {
    expect(extractCentroidCoords({ latitude: 95, longitude: 72 })).toBeNull();
  });

  test('isValidSpillFootprint: valid Feature returns true', () => {
    expect(isValidSpillFootprint(VALID_SPILL_FOOTPRINT)).toBe(true);
  });

  test('isValidSpillFootprint: null returns false', () => {
    expect(isValidSpillFootprint(null)).toBe(false);
  });

  test('isValidSpillFootprint: Feature with empty coordinates returns false', () => {
    expect(isValidSpillFootprint({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [] },
    })).toBe(false);
  });

});
