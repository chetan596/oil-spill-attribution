/**
 * Phase 16.4 Part 4 — Drift / Backtracking Integration Tests
 * Tests for unified spillOriginEstimationService and canonical drift integration
 *
 * Test Coverage:
 *  1. Valid geospatial + spill → drift executes (status: ESTIMATED)
 *  2. Backward trajectory returned
 *  3. Backward trajectory is valid GeoJSON Feature with LineString geometry
 *  4. Trajectory provenance is MODEL_DERIVED
 *  5. Origin endpoint strictly agrees with backward trajectory endpoint
 *  6. Missing geospatial → NOT_AVAILABLE
 *  7. Missing spill footprint → INSUFFICIENT_DATA
 *  8. Missing centroid → INSUFFICIENT_DATA
 *  9. Real acquisition timestamp preserved (RASTER_ACQUISITION_TIMESTAMP)
 * 10. Missing timestamp explicitly marked proxy (ESTIMATION_TIME_PROXY)
 * 11. DEMO environmental source explicitly labelled (DEMO)
 * 12. REAL environmental source preserved when present
 * 13. DEMO mode disabled + missing environment → ENVIRONMENTAL_DATA_UNAVAILABLE
 * 14. Engine failure → FAILED
 * 15. No fake trajectory on failure
 * 16. Forward trajectory returned when engine supports it
 * 17. Unsupported forward trajectory (hoursForward = 0) → NOT_AVAILABLE
 * 18. Uncertainty preserved
 * 19. Deterministic / cached repeated result
 * 20. AIS service not invoked
 * 21. Vessel attribution remains NOT_ESTABLISHED
 * 22. Part 1 regression: canonical contract remains valid
 * 23. Part 2 regression: image and spill footprints remain intact
 * 24. Part 3 regression: origin remains ESTIMATED
 */

'use strict';

const {
  estimateOriginAndDrift,
  estimateOrigin,
  ORIGIN_STATUS,
  DRIFT_STATUS,
  clearDriftCache,
} = require('../../src/manual-analysis/spillOriginEstimationService');

const { buildCanonicalInvestigationPayload } = require('../../src/manual-analysis/canonical-investigation.normalizer');
const driftService = require('../../src/services/drift.service');

// ── Shared test fixtures ──────────────────────────────────────────────────────
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

function makeGeoJob(overrides = {}) {
  return {
    id: 'test-part4-job-' + Math.random().toString(36).slice(2, 8),
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
    id: 'mr-part4-' + Math.random().toString(36).slice(2, 8),
    jobId: 'job-part4-' + Math.random().toString(36).slice(2, 8),
    analysisId: 'analysis-part4-' + Math.random().toString(36).slice(2, 8),
    originalFilename: 'sentinel1_test.tif',
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

describe('Phase 16.4 Part 4 — Drift / Backtracking Integration Tests', () => {
  beforeEach(() => {
    clearDriftCache();
  });

  // ── 1. Valid geospatial + spill → drift executes ───────────────────────────
  test('1. Valid geospatial + spill footprint executes drift simulation (status: ESTIMATED)', async () => {
    const { drift, origin } = await estimateOriginAndDrift({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      jobId: 'test-exec-drift',
    });

    expect(drift.status).toBe(DRIFT_STATUS.ESTIMATED);
    expect(origin.status).toBe(ORIGIN_STATUS.ESTIMATED);
  });

  // ── 2. Backward trajectory returned ───────────────────────────────────────
  test('2. Backward trajectory is returned with non-empty path points', async () => {
    const { drift } = await estimateOriginAndDrift({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      hoursBack: 24,
      jobId: 'test-bwd-return',
    });

    expect(drift.backward).toBeDefined();
    expect(drift.backward.hours).toBe(24);
    expect(Array.isArray(drift.backward.points)).toBe(true);
    expect(drift.backward.points.length).toBeGreaterThan(1);
  });

  // ── 3. Backward trajectory is GeoJSON LineString Feature ───────────────────
  test('3. Backward trajectory is valid GeoJSON Feature with LineString geometry', async () => {
    const { drift } = await estimateOriginAndDrift({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      jobId: 'test-bwd-geojson',
    });

    const trajectory = drift.backward.trajectory;
    expect(trajectory).toBeDefined();
    expect(trajectory.type).toBe('Feature');
    expect(trajectory.geometry).toBeDefined();
    expect(trajectory.geometry.type).toBe('LineString');
    expect(Array.isArray(trajectory.geometry.coordinates)).toBe(true);
    expect(trajectory.geometry.coordinates.length).toBeGreaterThan(1);

    // Each coordinate must be [lng, lat]
    const [firstLng, firstLat] = trajectory.geometry.coordinates[0];
    expect(typeof firstLng).toBe('number');
    expect(typeof firstLat).toBe('number');
  });

  // ── 4. Trajectory provenance MODEL_DERIVED ────────────────────────────────
  test('4. Trajectory provenance is strictly MODEL_DERIVED', async () => {
    const { drift } = await estimateOriginAndDrift({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      jobId: 'test-traj-provenance',
    });

    expect(drift.provenance).toBe('MODEL_DERIVED');
    expect(drift.backward.trajectory.properties.provenance).toBe('MODEL_DERIVED');
  });

  // ── 5. Origin endpoint agrees with backward trajectory endpoint ───────────
  test('5. Origin endpoint strictly agrees with backward trajectory terminal point (same execution)', async () => {
    const { origin, drift } = await estimateOriginAndDrift({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      jobId: 'test-endpoint-consistency',
    });

    expect(origin.estimatedPoint).toBeDefined();
    expect(drift.backward.endPoint).toBeDefined();

    // Must match within floating precision
    expect(Math.abs(origin.estimatedPoint.latitude - drift.backward.endPoint.latitude)).toBeLessThan(1e-5);
    expect(Math.abs(origin.estimatedPoint.longitude - drift.backward.endPoint.longitude)).toBeLessThan(1e-5);
  });

  // ── 6. Missing geospatial → NOT_AVAILABLE ─────────────────────────────────
  test('6. Missing geospatial produces drift.status = NOT_AVAILABLE and null trajectories', async () => {
    const { drift } = await estimateOriginAndDrift({
      geospatial: { available: false },
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      jobId: 'test-geo-gate',
    });

    expect(drift.status).toBe(DRIFT_STATUS.NOT_AVAILABLE);
    expect(drift.backward).toBeNull();
    expect(drift.forward).toBeNull();
  });

  // ── 7. Missing spill footprint → INSUFFICIENT_DATA ─────────────────────────
  test('7. Missing spill footprint produces drift.status = INSUFFICIENT_DATA', async () => {
    const { drift } = await estimateOriginAndDrift({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: null,
      centroid: VALID_CENTROID,
      jobId: 'test-spill-gate',
    });

    expect(drift.status).toBe(DRIFT_STATUS.INSUFFICIENT_DATA);
    expect(drift.backward).toBeNull();
    expect(drift.forward).toBeNull();
  });

  // ── 8. Missing centroid → INSUFFICIENT_DATA ────────────────────────────────
  test('8. Missing centroid produces drift.status = INSUFFICIENT_DATA', async () => {
    const { drift } = await estimateOriginAndDrift({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: null,
      jobId: 'test-centroid-gate',
    });

    expect(drift.status).toBe(DRIFT_STATUS.INSUFFICIENT_DATA);
    expect(drift.backward).toBeNull();
  });

  // ── 9. Real acquisition timestamp preserved ────────────────────────────────
  test('9. Real acquisition timestamp is preserved and labelled RASTER_ACQUISITION_TIMESTAMP', async () => {
    const testTimestamp = '2026-03-15T06:30:00.000Z';
    const { drift } = await estimateOriginAndDrift({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      acquisitionTimestamp: testTimestamp,
      jobId: 'test-acq-time',
    });

    expect(drift.timestampSource).toBe('RASTER_ACQUISITION_TIMESTAMP');
    expect(drift.environmentalData.timestamp).toBe(testTimestamp);
  });

  // ── 10. Missing timestamp marked proxy ─────────────────────────────────────
  test('10. Missing timestamp is explicitly marked ESTIMATION_TIME_PROXY', async () => {
    const { drift } = await estimateOriginAndDrift({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      acquisitionTimestamp: null,
      jobId: 'test-proxy-time',
    });

    expect(drift.timestampSource).toBe('ESTIMATION_TIME_PROXY');
  });

  // ── 11. DEMO environmental source explicitly labelled ──────────────────────
  test('11. DEMO environmental source is explicitly labelled DEMO and isDemo === true', async () => {
    const { drift } = await estimateOriginAndDrift({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      jobId: 'test-demo-env',
    });

    expect(drift.environmentalData.source).toBe('DEMO');
    expect(drift.environmentalData.isDemo).toBe(true);
  });

  // ── 12. REAL environmental source preserved ────────────────────────────────
  test('12. REAL environmental source is preserved when returned by engine', async () => {
    const spy = jest.spyOn(driftService, 'runDriftSimulation').mockResolvedValueOnce({
      status: 'success',
      engine: 'COPERNICUS_GLO_PHY_001_024',
      originLat: 18.9,
      originLng: 72.5,
      backwardPath: [
        { lat: 18.75, lng: 72.75, timestamp: '2026-03-15T06:00:00Z', phase: 'backward', uncertaintyRadiusKm: 0.5 },
        { lat: 18.9, lng: 72.5, timestamp: '2026-03-14T06:00:00Z', phase: 'backward', uncertaintyRadiusKm: 2.5 },
      ],
      forwardPath: [],
      simulationMeta: {
        environmental: {
          source: 'real',
          scenario_name: 'Copernicus CMEMS Reanalysis',
          wind: { speed_kts: 15.0, direction_from_deg: 320 },
          current: { speed_kts: 1.1, direction_towards_deg: 140 },
        },
      },
    });

    const { drift } = await estimateOriginAndDrift({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      jobId: 'test-real-env',
      bypassCache: true,
    });

    expect(drift.environmentalData.source).toBe('REAL');
    expect(drift.environmentalData.isDemo).toBe(false);
    spy.mockRestore();
  });

  // ── 13. DEMO mode disabled + missing environment → unavailable ────────────
  test('13. When DEMO_MODE is disabled and engine fails, status is ENVIRONMENTAL_DATA_UNAVAILABLE', async () => {
    const originalDemoMode = process.env.DEMO_MODE;
    process.env.DEMO_MODE = 'false';

    const spy = jest.spyOn(driftService, 'runDriftSimulation').mockRejectedValueOnce(
      new Error('Environmental data pipeline unavailable')
    );

    const { drift } = await estimateOriginAndDrift({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      jobId: 'test-no-demo-fail',
      bypassCache: true,
    });

    expect(drift.status).toBe(DRIFT_STATUS.ENVIRONMENTAL_DATA_UNAVAILABLE);
    expect(drift.backward).toBeNull();
    expect(drift.forward).toBeNull();

    spy.mockRestore();
    process.env.DEMO_MODE = originalDemoMode;
  });

  // ── 14. Engine failure → FAILED ───────────────────────────────────────────
  test('14. Unhandled drift engine failure returns status = FAILED with structured reason', async () => {
    const originalDemoMode = process.env.DEMO_MODE;
    process.env.DEMO_MODE = 'true';

    const spy = jest.spyOn(driftService, 'runDriftSimulation').mockRejectedValueOnce(
      new Error('Lagrangian hydrodynamic solver panic')
    );

    const { drift, origin } = await estimateOriginAndDrift({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      jobId: 'test-engine-panic',
      bypassCache: true,
    });

    expect(drift.status).toBe(DRIFT_STATUS.FAILED);
    expect(origin.status).toBe(ORIGIN_STATUS.FAILED);
    expect(drift.unavailableReason).toMatch(/solver panic/);

    spy.mockRestore();
    process.env.DEMO_MODE = originalDemoMode;
  });

  // ── 15. No fake trajectory on failure ─────────────────────────────────────
  test('15. No fake or synthetic trajectory is generated on engine failure', async () => {
    const spy = jest.spyOn(driftService, 'runDriftSimulation').mockRejectedValueOnce(
      new Error('Numerical singularity')
    );

    const { drift } = await estimateOriginAndDrift({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      jobId: 'test-no-fake',
      bypassCache: true,
    });

    expect(drift.backward).toBeNull();
    expect(drift.forward).toBeNull();
    expect(drift.uncertainty).toBeNull();

    spy.mockRestore();
  });

  // ── 16. Forward trajectory when supported ─────────────────────────────────
  test('16. Forward trajectory returned with status = ESTIMATED when hoursForward > 0', async () => {
    const { drift } = await estimateOriginAndDrift({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      hoursForward: 6,
      jobId: 'test-forward-supported',
    });

    expect(drift.forward).toBeDefined();
    expect(drift.forward.status).toBe('ESTIMATED');
    expect(drift.forward.hours).toBe(6);
    expect(drift.forward.trajectory).toBeDefined();
    expect(drift.forward.trajectory.type).toBe('Feature');
    expect(drift.forward.trajectory.geometry.type).toBe('LineString');
  });

  // ── 17. Unsupported forward trajectory (hoursForward = 0) → NOT_AVAILABLE ──
  test('17. When forward trajectory is unsupported (hoursForward = 0), forward.status = NOT_AVAILABLE', async () => {
    const { drift } = await estimateOriginAndDrift({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      hoursForward: 0,
      jobId: 'test-forward-disabled',
      bypassCache: true,
    });

    expect(drift.forward.status).toBe('NOT_AVAILABLE');
    expect(drift.forward.trajectory).toBeNull();
    expect(drift.forward.feature).toBeNull();
  });

  // ── 18. Uncertainty preserved ─────────────────────────────────────────────
  test('18. Uncertainty radius is preserved from simulation results', async () => {
    const { drift, origin } = await estimateOriginAndDrift({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      jobId: 'test-uncertainty',
    });

    expect(drift.uncertainty).toBeDefined();
    expect(typeof drift.uncertainty.radiusKm).toBe('number');
    expect(drift.uncertainty.radiusKm).toBeGreaterThan(0);
    expect(origin.uncertainty.radiusKm).toBe(drift.uncertainty.radiusKm);
  });

  // ── 19. Deterministic / cached repeated result ────────────────────────────
  test('19. Repeated estimation requests return deterministic, identical results', async () => {
    const res1 = await estimateOriginAndDrift({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      jobId: 'test-idempotent',
    });

    const res2 = await estimateOriginAndDrift({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      jobId: 'test-idempotent',
    });

    expect(res1.origin.estimatedPoint).toEqual(res2.origin.estimatedPoint);
    expect(res1.drift.backward.trajectory.geometry.coordinates).toEqual(
      res2.drift.backward.trajectory.geometry.coordinates
    );
  });

  // ── 20. AIS service not invoked ───────────────────────────────────────────
  test('20. AIS service is never invoked during drift estimation', async () => {
    let aisCalled = false;
    let aisService;
    try {
      aisService = require('../../src/services/ais.service');
      jest.spyOn(aisService, 'queryAisPositions').mockImplementation(() => {
        aisCalled = true;
        return Promise.resolve([]);
      });
    } catch (_) {}

    await estimateOriginAndDrift({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      jobId: 'test-ais-isolation',
    });

    expect(aisCalled).toBe(false);
  });

  // ── 21. Vessel attribution remains NOT_ESTABLISHED ────────────────────────
  test('21. Vessel attribution in canonical provenance remains NOT_ESTABLISHED', async () => {
    const job = makeGeoJob();
    const manualRec = makeManualRecord();
    const canonical = buildCanonicalInvestigationPayload(job, manualRec);

    expect(canonical.provenance.vesselAttribution).toBe('NOT_ESTABLISHED');
    expect(canonical.provenance.oilType).toBe('NOT_ESTABLISHED');
  });

  // ── 22. Part 1 regression: canonical contract remains valid ───────────────
  test('22. Phase 16.4 Part 1 canonical investigation contract remains valid', () => {
    const job = makeGeoJob();
    const manualRec = makeManualRecord();
    const canonical = buildCanonicalInvestigationPayload(job, manualRec);

    expect(canonical.jobId).toBe(job.id);
    expect(canonical.status).toBe('COMPLETED');
    expect(canonical.input).toBeDefined();
    expect(canonical.model).toBeDefined();
    expect(canonical.detection).toBeDefined();
    expect(canonical.geospatial).toBeDefined();
    expect(canonical.provenance).toBeDefined();
    expect(canonical.fingerprint).toBeDefined();
  });

  // ── 23. Part 2 regression: image & spill footprints remain intact ─────────
  test('23. Phase 16.4 Part 2 imageFootprint (REAL) and spillFootprint (MODEL_DERIVED) intact', () => {
    const job = makeGeoJob();
    const manualRec = makeManualRecord();
    const canonical = buildCanonicalInvestigationPayload(job, manualRec);

    expect(canonical.geospatial.imageFootprint.properties.provenance).toBe('REAL');
    expect(canonical.geospatial.spillFootprint.properties.provenance).toBe('MODEL_DERIVED');
  });

  // ── 24. Part 3 regression: estimateOrigin backwards compatibility ──────────
  test('24. Phase 16.4 Part 3 estimateOrigin helper returns ESTIMATED origin block', async () => {
    const origin = await estimateOrigin({
      geospatial: VALID_GEOSPATIAL,
      spillFootprint: VALID_SPILL_FOOTPRINT,
      centroid: VALID_CENTROID,
      jobId: 'test-part3-compat',
    });

    expect(origin.status).toBe(ORIGIN_STATUS.ESTIMATED);
    expect(origin.provenance).toBe('MODEL_DERIVED');
    expect(origin.estimatedPoint).toBeDefined();
  });
});
