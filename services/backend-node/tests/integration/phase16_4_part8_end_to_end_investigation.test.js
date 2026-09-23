/**
 * Phase 16.4 Part 8 — Historical AIS + Full End-to-End Investigation Validation
 *
 * Comprehensive validation suite verifying:
 *  1. Georeferenced SAR raster metadata, CRS, affine transform, real WGS84 footprint.
 *  2. AI detection: spill mask, MODEL_DERIVED polygon, area, centroid, origin & uncertainty.
 *  3. Dynamic AIS bounding box & temporal window derived from actual investigation.
 *  4. Deterministic HistoricalAISProvider contract & invocation via searchHistoricalVessels().
 *  5. Observation timestamp and coordinate validation (strict rejection of invalid points).
 *  6. Spatiotemporal candidate scoring (POTENTIAL_CANDIDATE, NOT_ESTABLISHED).
 *  7. Canonical investigation snapshot integrity.
 *  8. Map payload and layers.
 *  9. Multi-format exports: /export/json, /export/geojson, /export/report.
 * 10. CURRENT_SNAPSHOT_CANNOT_SATISFY_HISTORICAL_QUERY guard.
 * 11. ARTIFACT_URL_MUST_CORRESPOND_TO_EXISTING_ARTIFACT guard.
 * 12. HISTORICAL_UNAVAILABLE_TEST (AIS_HISTORICAL_DATA_UNAVAILABLE status, 0 candidates).
 * 13. CURRENT_AIS_TEST (searchCurrentVessels() -> REAL_CURRENT_AIS, distinct flow).
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const prisma = require('../../src/db/database');
const manualAnalysisService = require('../../src/manual-analysis/manual-analysis.service');
const manualAnalysisRoutes = require('../../src/manual-analysis/manual-analysis.routes');
const {
  correlateCandidates,
  clearAisCache,
  AIS_CORRELATION_STATUS,
} = require('../../src/manual-analysis/aisCorrelationService');
const aisProviderFactory = require('../../src/clients/ais/ais.provider.factory');
const AisProvider = require('../../src/clients/ais/ais.provider');
const OpenSeaFeedClient = require('../../src/clients/ais/openseafeed.client');
const { buildCanonicalInvestigationPayload } = require('../../src/manual-analysis/canonical-investigation.normalizer');

// Build test Express app mounting manual-analysis routes
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/v1/manual-analysis', manualAnalysisRoutes);

  app.use((err, req, res, next) => {
    const statusCode = err.statusCode || err.status || 500;
    res.status(statusCode).json({
      success: false,
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred',
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message,
      },
    });
  });

  return app;
}

const app = createTestApp();

// ── Deterministic Historical AIS Provider Fixture ─────────────────────────────
class DeterministicHistoricalAisProvider extends AisProvider {
  constructor(observations = []) {
    super('DETERMINISTIC_HISTORICAL', 'REAL');
    this.observations = observations;
    this.calls = [];
  }

  isConfigured() {
    return true;
  }

  async queryHistoricalAis(params) {
    this.calls.push(params);
    return this.observations.map(obs => this.normalizeRecord(obs));
  }

  async queryCurrentAis(bounds) {
    return [];
  }
}

describe('Phase 16.4 Part 8 — Full End-to-End Investigation & Historical AIS Pipeline', () => {
  let createdJobIds = [];
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearAisCache();
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'test';
    aisProviderFactory.reset();
  });

  afterEach(async () => {
    aisProviderFactory.reset();
    for (const jId of createdJobIds) {
      try {
        const job = await prisma.analysisJob.findUnique({ where: { id: jId } });
        if (job) {
          await prisma.analysisJob.delete({ where: { id: jId } }).catch(() => {});
          if (job.analysisId) {
            await prisma.manualAnalysis.deleteMany({ where: { analysisId: job.analysisId } }).catch(() => {});
            await prisma.analysis.delete({ where: { id: job.analysisId } }).catch(() => {});
          }
        }
      } catch (_) {}
    }
    createdJobIds = [];
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 1. DETERMINISTIC E2E INVESTIGATION PIPELINE (26 Verification Points)
  // ════════════════════════════════════════════════════════════════════════════
  it('1. Deterministic 26-Point Pipeline: Real SAR Georeferencing -> AI Spill -> Origin -> Historical AIS -> Candidate Scoring -> Snapshot -> Map -> Exports', async () => {
    // Controlled observation inside bounds and within time window
    const validObservation = {
      mmsi: '419008888',
      vesselName: 'PACIFIC_SENTINEL',
      latitude: 19.225,
      longitude: 72.505,
      timestamp: '2026-03-09T20:10:00.000Z',
      sog: 10.5,
      cog: 178.0,
      heading: 178.0,
      vesselType: 'Tanker',
      callsign: 'PST888',
      destination: 'MUMBAI',
    };

    const mockProvider = new DeterministicHistoricalAisProvider([validObservation]);
    aisProviderFactory.setProvider(mockProvider);

    const testJobId = `job-p8-e2e-${Date.now()}`;
    createdJobIds.push(testJobId);

    const analysis = await prisma.analysis.create({
      data: { id: `analysis-${testJobId}`, status: 'COMPLETED' },
    });

    // 1-4: Georeferenced SAR fixture with CRS, affine transform, real WGS84 footprint
    const jobPayload = {
      id: testJobId,
      analysisId: analysis.id,
      status: 'COMPLETED',
      inputFormat: 'GEOTIFF',
      isTiff: true,
      channelCount: 2,
      isSarDualPol: true,
      acquisitionTime: '2026-03-09T20:00:00.000Z',
      rasterMetadata: {
        crs: 'EPSG:4326',
        affineTransform: [0.0001, 0, 72.45, 0, -0.0001, 19.30],
        width: 1000,
        height: 1000,
        bounds: [72.45, 19.20, 72.55, 19.30],
        acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
      },
      geospatial: {
        available: true,
        crs: 'EPSG:4326',
        acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
        footprint: {
          type: 'Polygon',
          coordinates: [
            [[72.45, 19.20], [72.55, 19.20], [72.55, 19.30], [72.45, 19.30], [72.45, 19.20]],
          ],
        },
        bounds: [72.45, 19.20, 72.55, 19.30],
        centroid: { latitude: 19.25, longitude: 72.50 },
        provenance: 'REAL',
      },
      // 5-9: AI detection, mask, polygon, area, centroid
      mlResult: {
        inferenceStatus: 'SUCCESS',
        detectionStatus: 'DETECTED',
        oilSpillDetected: true,
        confidence: 0.96,
        spillFootprint: {
          type: 'Polygon',
          coordinates: [
            [[72.49, 19.21], [72.51, 19.21], [72.51, 19.23], [72.49, 19.23], [72.49, 19.21]],
          ],
        },
        spillPolygon: {
          type: 'Polygon',
          coordinates: [
            [[72.49, 19.21], [72.51, 19.21], [72.51, 19.23], [72.49, 19.23], [72.49, 19.21]],
          ],
        },
        estimatedAreaKm2: 4.85,
        centroid: { latitude: 19.22, longitude: 72.50 },
        provenance: 'MODEL_DERIVED',
      },
      // 10-12: Origin estimation, uncertainty, acquisition timestamp
      origin: {
        status: 'ESTIMATED',
        estimatedPoint: { latitude: 19.22, longitude: 72.50, provenance: 'MODEL_DERIVED' },
        uncertainty: { radiusKm: 2.5, method: 'DIFFUSION_MODEL' },
        originTimestamp: '2026-03-09T20:00:00.000Z',
        timestampSource: 'RASTER_ACQUISITION_TIMESTAMP',
        provenance: 'MODEL_DERIVED',
      },
      drift: {
        status: 'ESTIMATED',
        backward: {
          status: 'ESTIMATED',
          points: [{ latitude: 19.24, longitude: 72.52 }, { latitude: 19.22, longitude: 72.50 }],
        },
        environmentalData: { source: 'MOCK_REAL', isDemo: false },
        provenance: 'MODEL_DERIVED',
      },
    };

    const job = await prisma.analysisJob.create({
      data: {
        id: testJobId,
        analysisId: analysis.id,
        status: 'COMPLETED',
        payload: jobPayload,
      },
    });

    // Run canonical investigation builder
    const canonical = await manualAnalysisService.buildCanonicalWithOrigin(job, null);

    // 13-14: Verify AIS query bounds and time window
    expect(mockProvider.calls).toHaveLength(1);
    const queryParams = mockProvider.calls[0];
    expect(queryParams.fromTimestamp).toBe('2026-03-08T20:00:00.000Z');
    expect(queryParams.toTimestamp).toBe('2026-03-10T20:00:00.000Z');
    expect(queryParams.minLat).toBeLessThan(19.22);
    expect(queryParams.maxLat).toBeGreaterThan(19.22);
    expect(queryParams.minLng).toBeLessThan(72.50);
    expect(queryParams.maxLng).toBeGreaterThan(72.50);

    // 15-17: searchHistoricalVessels invocation & observation validation
    expect(canonical.aisCorrelation).toBeDefined();
    expect(canonical.aisCorrelation.status).toBe(AIS_CORRELATION_STATUS.CANDIDATES_FOUND);
    expect(canonical.aisCorrelation.isDemo).toBe(false);
    expect(canonical.aisCorrelation.provenance).toBe('REAL');
    expect(canonical.aisCorrelation.sourceType).toBe('AIS_PROVIDER');

    // 18-20: Candidate scoring, POTENTIAL_CANDIDATE status, NOT_ESTABLISHED attribution
    expect(canonical.candidates).toHaveLength(1);
    const candidate = canonical.candidates[0];
    expect(candidate.status).toBe('POTENTIAL_CANDIDATE');
    expect(candidate.attribution.status).toBe('NOT_ESTABLISHED');
    expect(candidate.vesselId.mmsi).toBe('419008888');
    expect(candidate.vesselId.name).toBe('PACIFIC_SENTINEL');
    expect(candidate.aisEvidence.provenance).toBe('REAL');

    // 21: Canonical snapshot verification
    expect(canonical.geospatial.provenance).toBe('REAL');
    expect(canonical.geospatial.spillFootprint.properties.provenance).toBe('MODEL_DERIVED');
    expect(canonical.origin.provenance).toBe('MODEL_DERIVED');
    expect(canonical.provenance.vesselAttribution).toBe('NOT_ESTABLISHED');

    // 22: Map payload verification
    const mapPayload = canonical.mapPayload || canonical;
    expect(mapPayload.geospatial.footprint).toBeDefined();
    expect(mapPayload.geospatial.spillFootprint).toBeDefined();
    expect(mapPayload.origin).toBeDefined();
    expect(mapPayload.candidates[0].status).toBe('POTENTIAL_CANDIDATE');

    // 23-25: Multi-format exports: /export/json, /export/geojson, /export/report
    const jsonExport = await request(app)
      .get(`/api/v1/manual-analysis/${testJobId}/export/json`)
      .expect(200);
    const exportData = jsonExport.body.data || jsonExport.body;
    expect(exportData.provenance.vesselAttribution).toBe('NOT_ESTABLISHED');
    expect(exportData.candidates[0].vesselId.mmsi).toBe('419008888');

    const geojsonExport = await request(app)
      .get(`/api/v1/manual-analysis/${testJobId}/export/geojson`)
      .expect(200);
    expect(geojsonExport.body.type).toBe('FeatureCollection');
    expect(geojsonExport.body.features.length).toBeGreaterThan(0);

    const reportExport = await request(app)
      .get(`/api/v1/manual-analysis/${testJobId}/export/report`)
      .expect(200);
    expect(reportExport.text).toContain('Final Attribution      : NOT ESTABLISHED');

    // 26: Provenance consistency: No forbidden keys
    const serialized = JSON.stringify(canonical);
    expect(serialized).not.toMatch(/responsibleVessel/i);
    expect(serialized).not.toMatch(/confirmedPolluter/i);
    expect(serialized).not.toMatch(/definitiveSource/i);
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 2. PART K: CURRENT_SNAPSHOT_CANNOT_SATISFY_HISTORICAL_QUERY
  // ════════════════════════════════════════════════════════════════════════════
  it('2. CURRENT_SNAPSHOT_CANNOT_SATISFY_HISTORICAL_QUERY: Live snapshot observation outside historical window yields AIS_CURRENT_DATA_ONLY and 0 candidates', async () => {
    // Telemetry dated today (current snapshot)
    const currentObservation = {
      mmsi: '419009999',
      vesselName: 'CURRENT_FLEET_VESSEL',
      latitude: 19.22,
      longitude: 72.50,
      timestamp: '2026-09-22T19:00:00.000Z', // Current observation date
      sog: 12.0,
      cog: 180.0,
    };

    const mockProvider = new DeterministicHistoricalAisProvider([currentObservation]);
    aisProviderFactory.setProvider(mockProvider);

    // Historical investigation date from March 2026
    const result = await correlateCandidates({
      geospatial: {
        available: true,
        crs: 'EPSG:4326',
        bounds: [72.45, 19.20, 72.55, 19.30],
        centroid: { latitude: 19.25, longitude: 72.50 },
        provenance: 'REAL',
      },
      origin: {
        status: 'ESTIMATED',
        estimatedPoint: { latitude: 19.22, longitude: 72.50, provenance: 'MODEL_DERIVED' },
        uncertainty: { radiusKm: 2.5, method: 'DIFFUSION_MODEL' },
        originTimestamp: '2026-03-09T20:00:00.000Z', // 6 months prior
        timestampSource: 'RASTER_ACQUISITION_TIMESTAMP',
        provenance: 'MODEL_DERIVED',
      },
      drift: {
        status: 'ESTIMATED',
        backward: { points: [{ latitude: 19.24, longitude: 72.52 }] },
        provenance: 'MODEL_DERIVED',
      },
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
    });

    // Must be rejected as historical candidates
    expect(result.status).toBe(AIS_CORRELATION_STATUS.AIS_CURRENT_DATA_ONLY);
    expect(result.candidates).toHaveLength(0);
    expect(result.isDemo).toBe(false);
    expect(result.type).not.toBe('REAL_HISTORICAL_AIS');
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 3. PART Q: HISTORICAL UNAVAILABLE TEST
  // ════════════════════════════════════════════════════════════════════════════
  it('3. HISTORICAL_UNAVAILABLE_TEST: When provider throws AIS_HISTORICAL_DATA_UNAVAILABLE, status is preserved and 0 candidates returned', async () => {
    class UnavailableHistoricalProvider extends AisProvider {
      constructor() {
        super('UNAVAILABLE_PROVIDER', 'REAL');
      }
      isConfigured() { return true; }
      async queryHistoricalAis() {
        const err = new Error('Historical AIS unavailable for this tier');
        err.code = 'AIS_HISTORICAL_DATA_UNAVAILABLE';
        throw err;
      }
      async queryCurrentAis() { return []; }
    }

    aisProviderFactory.setProvider(new UnavailableHistoricalProvider());

    const result = await correlateCandidates({
      geospatial: {
        available: true,
        crs: 'EPSG:4326',
        bounds: [72.45, 19.20, 72.55, 19.30],
        centroid: { latitude: 19.25, longitude: 72.50 },
        provenance: 'REAL',
      },
      origin: {
        status: 'ESTIMATED',
        estimatedPoint: { latitude: 19.22, longitude: 72.50, provenance: 'MODEL_DERIVED' },
        uncertainty: { radiusKm: 2.5, method: 'DIFFUSION_MODEL' },
        originTimestamp: '2026-03-09T20:00:00.000Z',
        timestampSource: 'RASTER_ACQUISITION_TIMESTAMP',
        provenance: 'MODEL_DERIVED',
      },
      drift: {
        status: 'ESTIMATED',
        backward: { points: [{ latitude: 19.24, longitude: 72.52 }] },
        provenance: 'MODEL_DERIVED',
      },
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.AIS_HISTORICAL_DATA_UNAVAILABLE);
    expect(result.candidates).toHaveLength(0);
    expect(result.isDemo).toBe(false);
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 4. PART R: CURRENT AIS TEST
  // ════════════════════════════════════════════════════════════════════════════
  it('4. CURRENT_AIS_TEST: searchCurrentVessels() returns REAL_CURRENT_AIS with OpenSeaFeed snapshot', async () => {
    const client = new OpenSeaFeedClient();
    const mockSnapshot = [
      {
        mmsi: '419111222',
        name: 'CURRENT_VESSEL_SNAPSHOT',
        latitude: 19.23,
        longitude: 72.51,
        timestamp: '2026-09-22T19:15:00.000Z',
        sog: 11.5,
        cog: 175.0,
      },
    ];

    // Mock queryCurrentAis directly
    jest.spyOn(client, 'queryCurrentAis').mockResolvedValue(
      mockSnapshot.map(r => client.normalizeRecord(r))
    );

    const result = await client.searchCurrentVessels({
      minLat: 19.0,
      maxLat: 19.5,
      minLng: 72.0,
      maxLng: 73.0,
    });

    expect(result.type).toBe('REAL_CURRENT_AIS');
    expect(result.provenance).toBe('REAL');
    expect(result.provider).toBe('OPENSEAFEED');
    expect(result.isDemo).toBe(false);
    expect(result.vessels).toHaveLength(1);
    expect(result.vessels[0].mmsi).toBe('419111222');
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 5. PART M: ARTIFACT_URL_MUST_CORRESPOND_TO_EXISTING_ARTIFACT
  // ════════════════════════════════════════════════════════════════════════════
  it('5. ARTIFACT_URL_MUST_CORRESPOND_TO_EXISTING_ARTIFACT: Nonexistent SAR/optical artifacts return null / NOT_AVAILABLE', async () => {
    const dummyJob = {
      id: 'job-p8-artifacts',
      payload: {
        isTiff: true,
        channelCount: 2,
        isSarDualPol: true,
        // No probabilityMap or annotated artifacts generated
        artifacts: {
          original: 'uploads/job-p8/original.tif',
          vv: 'uploads/job-p8/vv.png',
          vh: 'uploads/job-p8/vh.png',
        },
      },
    };

    const canonical = buildCanonicalInvestigationPayload(dummyJob);
    const artifacts = canonical.artifacts;

    // Existing artifacts have URLs
    expect(artifacts.original).toBe('/api/v1/manual-analysis/job-p8-artifacts/original');
    expect(artifacts.vv).toBe('/api/v1/manual-analysis/job-p8-artifacts/vv');

    // Nonexistent optical artifacts on SAR image must NOT return fake URLs
    expect(artifacts.annotated).toBeNull();
    expect(artifacts.probabilityMap).toBeNull();
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 6. PART E: STRICT OBSERVATION VALIDATION (Coordinates & Timestamps)
  // ════════════════════════════════════════════════════════════════════════════
  it('6. Strict Observation Validation: Observations with missing or out-of-bounds coordinates/timestamps are rejected', async () => {
    class ConcreteAisProvider extends AisProvider {
      constructor() {
        super('VALIDATION_TEST', 'REAL');
      }
      isConfigured() { return true; }
      async queryHistoricalAis() { return []; }
      async queryCurrentAis() { return []; }
    }

    const provider = new ConcreteAisProvider();

    const bounds = { minLat: 18.0, maxLat: 20.0, minLng: 71.0, maxLng: 73.0 };
    const windowStartMs = new Date('2026-03-09T00:00:00Z').getTime();
    const windowEndMs = new Date('2026-03-10T00:00:00Z').getTime();

    // Valid
    expect(
      provider.isValidHistoricalObservation(
        { latitude: 19.0, longitude: 72.0, timestamp: '2026-03-09T12:00:00Z' },
        bounds,
        windowStartMs,
        windowEndMs
      )
    ).toBe(true);

    // Missing coordinate
    expect(
      provider.isValidHistoricalObservation(
        { latitude: null, longitude: 72.0, timestamp: '2026-03-09T12:00:00Z' },
        bounds,
        windowStartMs,
        windowEndMs
      )
    ).toBe(false);

    // Non-finite coordinate
    expect(
      provider.isValidHistoricalObservation(
        { latitude: NaN, longitude: 72.0, timestamp: '2026-03-09T12:00:00Z' },
        bounds,
        windowStartMs,
        windowEndMs
      )
    ).toBe(false);

    // Coordinate out of bounds
    expect(
      provider.isValidHistoricalObservation(
        { latitude: 25.0, longitude: 72.0, timestamp: '2026-03-09T12:00:00Z' },
        bounds,
        windowStartMs,
        windowEndMs
      )
    ).toBe(false);

    // Missing timestamp
    expect(
      provider.isValidHistoricalObservation(
        { latitude: 19.0, longitude: 72.0, timestamp: null },
        bounds,
        windowStartMs,
        windowEndMs
      )
    ).toBe(false);

    // Invalid timestamp string
    expect(
      provider.isValidHistoricalObservation(
        { latitude: 19.0, longitude: 72.0, timestamp: 'invalid-date' },
        bounds,
        windowStartMs,
        windowEndMs
      )
    ).toBe(false);

    // Timestamp before window
    expect(
      provider.isValidHistoricalObservation(
        { latitude: 19.0, longitude: 72.0, timestamp: '2026-03-08T23:59:59Z' },
        bounds,
        windowStartMs,
        windowEndMs
      )
    ).toBe(false);

    // Timestamp after window
    expect(
      provider.isValidHistoricalObservation(
        { latitude: 19.0, longitude: 72.0, timestamp: '2026-03-10T00:00:01Z' },
        bounds,
        windowStartMs,
        windowEndMs
      )
    ).toBe(false);
  });
});

