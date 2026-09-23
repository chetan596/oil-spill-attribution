/**
 * Phase 16.4 Part 5 — AIS Correlation + Potential Vessel Candidates Integration Tests
 *
 * Verifies historical AIS spatiotemporal correlation with model-derived estimated spill origin.
 *
 * Test Coverage:
 *  1. Valid inputs + demo vessels in range → status: CANDIDATES_FOUND
 *  2. Each candidate has status: "POTENTIAL_CANDIDATE"
 *  3. Candidate rank assigned by correlation score descending (rank 1, 2, ...)
 *  4. AIS outside demo temporal coverage → status: NO_CANDIDATES
 *  5. AIS outside demo geographic coverage → status: NO_CANDIDATES
 *  6. AIS search radius (50 km) is separate from origin uncertainty radius (2.5 km)
 *  7. Candidate with closest approach <= originUncertaintyKm has enteredOriginUncertaintyCorridor: true
 *  8. Candidate with closest approach > originUncertaintyKm has enteredOriginUncertaintyCorridor: false
 *  9. RASTER_ACQUISITION_TIMESTAMP preserved and documented in queryWindow
 * 10. ESTIMATION_TIME_PROXY limits temporal interpretation (sets temporalUncertainty: true)
 * 11. DEMO AIS can never become REAL: isDemo is true and source is "DEMO"
 * 12. Missing real provider when DEMO_MODE=false returns AIS_DATA_UNAVAILABLE
 * 13. Missing geospatial returns NOT_AVAILABLE
 * 14. Missing origin or origin.status !== "ESTIMATED" returns NOT_AVAILABLE
 * 15. Invalid origin coordinates returns NOT_AVAILABLE
 * 16. Missing temporal reference returns INSUFFICIENT_TEMPORAL_DATA
 * 17. Zero candidates in spatiotemporal window returns NO_CANDIDATES with explicit aisGapNotes
 * 18. AIS gaps: missing AIS observations not interpreted as vessel absence
 * 19. Repository exception returns status: FAILED with structured error reason
 * 20. Candidate ordering by correlation evidence score does NOT alter attribution status
 * 21. Every candidate has attribution.status: "NOT_ESTABLISHED"
 * 22. No forbidden keys (responsibleVessel, confirmedPolluter, definitiveSource, provenResponsibleVessel) generated anywhere
 * 23. Evidence metrics only (proximityScore, temporalScore, trajectoryScore, anomalyScore)
 * 24. Deterministic and idempotent caching returns identical result on repeated calls
 * 25. Part 1 regression: canonical contract remains valid with aisCorrelation
 * 26. Part 2 & Part 3 regression: spill footprint and origin estimation intact
 * 27. Part 4 regression: backward drift trajectory intact with aisCorrelation attached
 * 28. manualAnalysisService.buildCanonicalWithOrigin attaches valid aisCorrelation block
 */

'use strict';

const {
  correlateCandidates,
  AIS_CORRELATION_STATUS,
  clearAisCache,
} = require('../../src/manual-analysis/aisCorrelationService');

const manualAnalysisService = require('../../src/manual-analysis/manual-analysis.service');
const aisRepository = require('../../src/repositories/ais.repository');
const { buildCanonicalInvestigationPayload } = require('../../src/manual-analysis/canonical-investigation.normalizer');
const aisProviderFactory = require('../../src/clients/ais/ais.provider.factory');
const DemoAisClient = require('../../src/clients/ais/demo-ais.client');

// ── Shared test fixtures ──────────────────────────────────────────────────────
const VALID_BOUNDS = [72.0, 19.0, 73.0, 20.0];
const VALID_CRS = 'EPSG:4326';
const VALID_GEOSPATIAL = {
  available: true,
  crs: VALID_CRS,
  bounds: VALID_BOUNDS,
  centroid: { latitude: 19.22, longitude: 72.50, provenance: 'MODEL_DERIVED' },
};

const VALID_ORIGIN = {
  status: 'ESTIMATED',
  estimatedPoint: { latitude: 19.22, longitude: 72.50, provenance: 'MODEL_DERIVED' },
  uncertainty: { radiusKm: 2.5, method: 'DIFFUSION_MODEL' },
  originTimestamp: '2026-03-09T20:00:00.000Z',
  timestampSource: 'RASTER_ACQUISITION_TIMESTAMP',
  provenance: 'MODEL_DERIVED',
};

const VALID_DRIFT = {
  status: 'ESTIMATED',
  backward: {
    status: 'ESTIMATED',
    points: [{ latitude: 19.25, longitude: 72.55 }, { latitude: 19.22, longitude: 72.50 }],
  },
  environmentalData: { source: 'DEMO', isDemo: true },
  provenance: 'MODEL_DERIVED',
};

describe('Phase 16.4 Part 5 — AIS Correlation + Potential Vessel Candidates', () => {
  jest.setTimeout(15000);

  beforeEach(() => {
    clearAisCache();
    // Phase 16.4 Part 7.2: Explicitly inject DemoAisClient for legacy Part 5 tests.
    // The factory no longer auto-falls back to demo.
    process.env.NODE_ENV = 'test';
    process.env.AIS_DEMO_MODE = 'true';
    aisProviderFactory.setProvider(new DemoAisClient());
  });

  afterEach(() => {
    delete process.env.AIS_DEMO_MODE;
    aisProviderFactory.reset();
  });

  it('1. Valid inputs + demo vessels in range → status: CANDIDATES_FOUND', async () => {
    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
      searchRadiusKm: 50,
      jobId: 'test-job-cand-found',
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.CANDIDATES_FOUND);
    expect(Array.isArray(result.candidates)).toBe(true);
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it('2. Each candidate has status: "POTENTIAL_CANDIDATE"', async () => {
    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
      searchRadiusKm: 50,
      jobId: 'test-job-cand-status',
    });

    expect(result.candidates.length).toBeGreaterThan(0);
    result.candidates.forEach((cand) => {
      expect(cand.status).toBe('POTENTIAL_CANDIDATE');
    });
  });

  it('3. Candidate rank assigned by correlation score descending (rank 1, 2, ...)', async () => {
    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
      searchRadiusKm: 50,
      jobId: 'test-job-cand-ranking',
    });

    expect(result.candidates.length).toBeGreaterThan(1);
    for (let i = 0; i < result.candidates.length; i++) {
      expect(result.candidates[i].rank).toBe(i + 1);
      if (i > 0) {
        expect(result.candidates[i - 1].correlation.score).toBeGreaterThanOrEqual(
          result.candidates[i].correlation.score
        );
      }
    }
  });

  it('4. AIS outside demo temporal coverage → status: NO_CANDIDATES', async () => {
    // 2025-01-01 is well outside March 2026 demo coverage
    const origin2025 = {
      ...VALID_ORIGIN,
      originTimestamp: '2025-01-01T12:00:00.000Z',
    };

    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: origin2025,
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2025-01-01T12:00:00.000Z',
      searchRadiusKm: 50,
      jobId: 'test-job-outside-time',
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.NO_CANDIDATES);
    expect(result.candidates).toEqual([]);
  });

  it('5. AIS outside demo geographic coverage → status: NO_CANDIDATES', async () => {
    // North Atlantic location (lat 45.0, lng -30.0) far outside Arabian Sea
    const originAtlantic = {
      ...VALID_ORIGIN,
      estimatedPoint: { latitude: 45.0, longitude: -30.0, provenance: 'MODEL_DERIVED' },
    };

    const result = await correlateCandidates({
      geospatial: { ...VALID_GEOSPATIAL, bounds: [-30.5, 44.5, -29.5, 45.5] },
      origin: originAtlantic,
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
      searchRadiusKm: 50,
      jobId: 'test-job-outside-geo',
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.NO_CANDIDATES);
    expect(result.candidates).toEqual([]);
  });

  it('6. AIS search radius (50 km) is separate from origin uncertainty radius (2.5 km)', async () => {
    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
      searchRadiusKm: 50,
      jobId: 'test-job-radius-sep',
    });

    expect(result.coverage.searchRadiusKm).toBe(50);
    expect(result.originReference.uncertaintyRadiusKm).toBe(2.5);
    expect(result.coverage.searchRadiusKm).not.toBe(result.originReference.uncertaintyRadiusKm);
  });

  it('7. Candidate with closest approach <= originUncertaintyKm has enteredOriginUncertaintyCorridor: true', async () => {
    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: {
        ...VALID_ORIGIN,
        uncertainty: { radiusKm: 100.0 }, // Large uncertainty corridor encompassing candidates
      },
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
      searchRadiusKm: 50,
      jobId: 'test-job-corridor-true',
    });

    expect(result.candidates.length).toBeGreaterThan(0);
    const first = result.candidates[0];
    expect(first.correlation.closestApproachKm).toBeLessThanOrEqual(100.0);
    expect(first.correlation.enteredOriginUncertaintyCorridor).toBe(true);
  });

  it('8. Candidate with closest approach > originUncertaintyKm has enteredOriginUncertaintyCorridor: false', async () => {
    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: {
        ...VALID_ORIGIN,
        uncertainty: { radiusKm: 0.001 }, // Tiny uncertainty corridor: 1 meter
      },
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
      searchRadiusKm: 50,
      jobId: 'test-job-corridor-false',
    });

    expect(result.candidates.length).toBeGreaterThan(0);
    result.candidates.forEach((cand) => {
      expect(cand.correlation.enteredOriginUncertaintyCorridor).toBe(false);
    });
  });

  it('9. RASTER_ACQUISITION_TIMESTAMP preserved and documented in queryWindow', async () => {
    const acqTime = '2026-03-12T10:00:00.000Z';
    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      acquisitionTimestamp: acqTime,
      searchRadiusKm: 50,
      jobId: 'test-job-acq-time',
    });

    expect(result.queryWindow.timestampSource).toBe('RASTER_ACQUISITION_TIMESTAMP');
    expect(result.queryWindow.temporalUncertainty).toBe(false);
    expect(result.queryWindow.temporalNote).toContain('verified raster acquisition timestamp');
  });

  it('10. ESTIMATION_TIME_PROXY limits temporal interpretation (sets temporalUncertainty: true)', async () => {
    const originProxy = {
      ...VALID_ORIGIN,
      timestampSource: 'ESTIMATION_TIME_PROXY',
    };

    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: originProxy,
      drift: VALID_DRIFT,
      acquisitionTimestamp: null, // No raster acquisition timestamp
      searchRadiusKm: 50,
      jobId: 'test-job-proxy-time',
    });

    expect(result.queryWindow.timestampSource).toBe('ESTIMATION_TIME_PROXY');
    expect(result.queryWindow.temporalUncertainty).toBe(true);
    expect(result.queryWindow.temporalNote).toContain('limited by timestamp uncertainty');
  });

  it('11. DEMO AIS can never become REAL: isDemo is true and source is "DEMO"', async () => {
    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
      searchRadiusKm: 50,
      jobId: 'test-job-demo-isolation',
    });

    expect(result.source).toBe('DEMO');
    expect(result.isDemo).toBe(true);
    expect(result.provenance).toBe('DEMO');
    result.candidates.forEach((cand) => {
      expect(cand.aisEvidence.source).toBe('DEMO');
      expect(cand.aisEvidence.provenance).toBe('DEMO');
    });
  });

  it('12. Real provider unconfigured when demo not injected returns AIS_DATA_UNAVAILABLE', async () => {
    // Phase 16.4 Part 7.2: Reset the demo provider override.
    // Default provider (OpenSeaFeed) will be used but it will get a network
    // error or timeout in test, so we mock isConfigured() = false.
    const unconfiguredProvider = {
      name: 'OPENSEAFEED',
      provenance: 'REAL',
      isDemo: false,
      isConfigured: () => false,
      queryHistoricalAis: async () => [],
    };
    aisProviderFactory.setProvider(unconfiguredProvider);

    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
      searchRadiusKm: 50,
      jobId: 'test-job-no-demo-mode',
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.AIS_DATA_UNAVAILABLE);
    expect(result.isDemo).toBe(false);
    expect(result.candidates).toEqual([]);
    expect(result.unavailableReason).toContain('is not configured');

    // Restore demo provider for subsequent tests
    aisProviderFactory.setProvider(new DemoAisClient());
  });

  it('13. Missing geospatial returns NOT_AVAILABLE', async () => {
    const result = await correlateCandidates({
      geospatial: null,
      origin: VALID_ORIGIN,
      jobId: 'test-job-no-geo',
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.NOT_AVAILABLE);
    expect(result.candidates).toEqual([]);
    expect(result.unavailableReason).toContain('no valid geospatial reference');
  });

  it('14. Missing origin or origin.status !== "ESTIMATED" returns NOT_AVAILABLE', async () => {
    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: { status: 'NOT_AVAILABLE' },
      jobId: 'test-job-no-origin',
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.NOT_AVAILABLE);
    expect(result.candidates).toEqual([]);
  });

  it('15. Invalid origin coordinates returns NOT_AVAILABLE', async () => {
    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: {
        status: 'ESTIMATED',
        estimatedPoint: { latitude: 'invalid', longitude: NaN },
      },
      jobId: 'test-job-bad-coords',
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.NOT_AVAILABLE);
    expect(result.unavailableReason).toContain('invalid coordinates');
  });

  it('16. Missing temporal reference returns INSUFFICIENT_TEMPORAL_DATA', async () => {
    const originNoTime = {
      status: 'ESTIMATED',
      estimatedPoint: { latitude: 18.942, longitude: 72.462 },
      uncertainty: { radiusKm: 2.5 },
      originTimestamp: null,
    };

    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: originNoTime,
      drift: null,
      acquisitionTimestamp: null,
      jobId: 'test-job-no-time',
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.INSUFFICIENT_TEMPORAL_DATA);
    expect(result.candidates).toEqual([]);
    expect(result.unavailableReason).toContain('No temporal reference');
  });

  it('17. Zero candidates in spatiotemporal window returns NO_CANDIDATES with explicit aisGapNotes', async () => {
    const spy = jest.spyOn(aisRepository, 'findCandidatesInTimeWindow').mockResolvedValueOnce([]);

    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
      searchRadiusKm: 50,
      jobId: 'test-job-mock-zero',
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.NO_CANDIDATES);
    expect(result.coverage.aisGapNotes).toContain('No AIS transponder signals recorded');
    spy.mockRestore();
  });

  it('18. AIS gaps: missing AIS observations not interpreted as vessel absence', async () => {
    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
      searchRadiusKm: 50,
      jobId: 'test-job-gap-notes',
    });

    expect(result.coverage.aisGapNotes).toBeDefined();
    expect(result.coverage.insufficientCoverage).toBe(false);
  });

  it('19. Repository exception returns status: FAILED with structured error reason', async () => {
    const spy = jest.spyOn(aisRepository, 'findCandidatesInTimeWindow').mockRejectedValueOnce(
      new Error('DB Connection Timeout')
    );

    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
      jobId: 'test-job-db-fail',
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.FAILED);
    expect(result.unavailableReason).toContain('DB Connection Timeout');
    spy.mockRestore();
  });

  it('20. Candidate ordering by correlation evidence score does NOT alter attribution status', async () => {
    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
      searchRadiusKm: 50,
      jobId: 'test-job-ranking-guardrail',
    });

    expect(result.candidates.length).toBeGreaterThan(0);
    // Rank 1 candidate must STILL have attribution.status === "NOT_ESTABLISHED"
    expect(result.candidates[0].rank).toBe(1);
    expect(result.candidates[0].attribution.status).toBe('NOT_ESTABLISHED');
    expect(result.candidates[0].status).toBe('POTENTIAL_CANDIDATE');
  });

  it('21. Every candidate has attribution.status: "NOT_ESTABLISHED"', async () => {
    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
      searchRadiusKm: 50,
      jobId: 'test-job-cand-attrib',
    });

    result.candidates.forEach((cand) => {
      expect(cand.attribution).toBeDefined();
      expect(cand.attribution.status).toBe('NOT_ESTABLISHED');
    });
  });

  it('22. No forbidden keys (responsibleVessel, confirmedPolluter, definitiveSource, provenResponsibleVessel) generated anywhere', async () => {
    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
      searchRadiusKm: 50,
      jobId: 'test-job-forbidden-keys',
    });

    const FORBIDDEN_KEYS = [
      'responsibleVessel',
      'confirmedPolluter',
      'definitiveSource',
      'provenResponsibleVessel',
      'polluterProbability',
    ];

    FORBIDDEN_KEYS.forEach((key) => {
      expect(result[key]).toBeUndefined();
    });

    result.candidates.forEach((cand) => {
      FORBIDDEN_KEYS.forEach((key) => {
        expect(cand[key]).toBeUndefined();
      });
    });
  });

  it('23. Evidence metrics only (proximityScore, temporalScore, trajectoryScore, anomalyScore)', async () => {
    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
      searchRadiusKm: 50,
      jobId: 'test-job-metrics-check',
    });

    expect(result.candidates.length).toBeGreaterThan(0);
    const metrics = result.candidates[0].correlation.metrics;
    expect(metrics).toBeDefined();
    expect(typeof metrics.proximityScore).toBe('number');
    expect(typeof metrics.temporalScore).toBe('number');
    expect(typeof metrics.trajectoryScore).toBe('number');
    expect(typeof metrics.anomalyScore).toBe('number');

    // Scores must be bounded [0, 1]
    expect(metrics.proximityScore).toBeGreaterThanOrEqual(0);
    expect(metrics.proximityScore).toBeLessThanOrEqual(1);
    expect(metrics.temporalScore).toBeGreaterThanOrEqual(0);
    expect(metrics.temporalScore).toBeLessThanOrEqual(1);
  });

  it('24. Deterministic and idempotent caching returns identical result on repeated calls', async () => {
    const call1 = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
      searchRadiusKm: 50,
      jobId: 'test-job-cache',
    });

    const call2 = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
      searchRadiusKm: 50,
      jobId: 'test-job-cache',
    });

    expect(call1).toBe(call2); // exact object reference from in-memory cache
  });

  it('25. Part 1 regression: canonical contract remains valid with aisCorrelation', async () => {
    const dummyJob = {
      id: 'job-part1-compat',
      status: 'COMPLETED',
      payload: {
        filename: 'sentinel1_test.tif',
        isTiff: true,
        sourceType: 'SENTINEL1_DUAL_POL',
        geospatial: {
          available: true,
          crs: VALID_CRS,
          bounds: VALID_BOUNDS,
          centroid: { latitude: 18.95, longitude: 72.82 },
          acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
        },
        mlResult: {
          oilSpillDetected: true,
          confidence: 0.94,
          geometry: {
            features: [
              {
                type: 'Feature',
                geometry: {
                  type: 'Polygon',
                  coordinates: [[[72.8, 18.9], [72.9, 18.9], [72.9, 19.0], [72.8, 19.0], [72.8, 18.9]]],
                },
                properties: { featureType: 'OIL_SPILL_POLYGON' },
              },
            ],
          },
        },
      },
    };

    const canonical = await manualAnalysisService.buildCanonicalWithOrigin(dummyJob);
    expect(canonical.jobId).toBe('job-part1-compat');
    expect(canonical.status).toBe('COMPLETED');
    expect(canonical.fingerprint).toBeDefined();
    expect(canonical.provenance.vesselAttribution).toBe('NOT_ESTABLISHED');
    expect(canonical.aisCorrelation).toBeDefined();
  });

  it('26. Part 2 & Part 3 regression: spill footprint and origin estimation intact', async () => {
    const dummyJob = {
      id: 'job-part2-part3-compat',
      status: 'COMPLETED',
      payload: {
        filename: 'sentinel1_test.tif',
        isTiff: true,
        sourceType: 'SENTINEL1_DUAL_POL',
        geospatial: {
          available: true,
          crs: VALID_CRS,
          bounds: VALID_BOUNDS,
          centroid: { latitude: 18.95, longitude: 72.82 },
          acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
        },
        mlResult: {
          oilSpillDetected: true,
          confidence: 0.94,
          geometry: {
            features: [
              {
                type: 'Feature',
                geometry: {
                  type: 'Polygon',
                  coordinates: [[[72.8, 18.9], [72.9, 18.9], [72.9, 19.0], [72.8, 19.0], [72.8, 18.9]]],
                },
                properties: { featureType: 'OIL_SPILL_POLYGON' },
              },
            ],
          },
        },
      },
    };

    const canonical = await manualAnalysisService.buildCanonicalWithOrigin(dummyJob);
    expect(canonical.geospatial.spillFootprint).toBeDefined();
    expect(canonical.origin.status).toBe('ESTIMATED');
    expect(canonical.origin.estimatedPoint).toBeDefined();
  });

  it('27. Part 4 regression: backward drift trajectory intact with aisCorrelation attached', async () => {
    const dummyJob = {
      id: 'job-part4-compat',
      status: 'COMPLETED',
      payload: {
        filename: 'sentinel1_test.tif',
        isTiff: true,
        sourceType: 'SENTINEL1_DUAL_POL',
        geospatial: {
          available: true,
          crs: VALID_CRS,
          bounds: VALID_BOUNDS,
          centroid: { latitude: 18.95, longitude: 72.82 },
          acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
        },
        mlResult: {
          oilSpillDetected: true,
          confidence: 0.94,
          geometry: {
            features: [
              {
                type: 'Feature',
                geometry: {
                  type: 'Polygon',
                  coordinates: [[[72.8, 18.9], [72.9, 18.9], [72.9, 19.0], [72.8, 19.0], [72.8, 18.9]]],
                },
                properties: { featureType: 'OIL_SPILL_POLYGON' },
              },
            ],
          },
        },
      },
    };

    const canonical = await manualAnalysisService.buildCanonicalWithOrigin(dummyJob);
    expect(canonical.drift.status).toBe('ESTIMATED');
    expect(canonical.drift.backward.trajectory).toBeDefined();
    expect(canonical.aisCorrelation).toBeDefined();
  });

  it('28. manualAnalysisService.buildCanonicalWithOrigin attaches valid aisCorrelation block', async () => {
    const dummyJob = {
      id: 'job-ais-e2e',
      status: 'COMPLETED',
      payload: {
        filename: 'sentinel1_test.tif',
        isTiff: true,
        sourceType: 'SENTINEL1_DUAL_POL',
        geospatial: {
          available: true,
          crs: VALID_CRS,
          bounds: VALID_BOUNDS,
          centroid: { latitude: 19.22, longitude: 72.50 },
          acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
        },
        mlResult: {
          oilSpillDetected: true,
          confidence: 0.94,
          geometry: {
            features: [
              {
                type: 'Feature',
                geometry: {
                  type: 'Polygon',
                  coordinates: [[[72.8, 18.9], [72.9, 18.9], [72.9, 19.0], [72.8, 19.0], [72.8, 18.9]]],
                },
                properties: { featureType: 'OIL_SPILL_POLYGON' },
              },
            ],
          },
        },
      },
    };

    const canonical = await manualAnalysisService.buildCanonicalWithOrigin(dummyJob);
    expect(canonical.aisCorrelation.status).toBe(AIS_CORRELATION_STATUS.CANDIDATES_FOUND);
    expect(canonical.provenance.vesselAttribution).toBe('NOT_ESTABLISHED');
    expect(canonical.aisCorrelation.candidates[0].status).toBe('POTENTIAL_CANDIDATE');
    expect(canonical.aisCorrelation.candidates[0].attribution.status).toBe('NOT_ESTABLISHED');
  });
});
