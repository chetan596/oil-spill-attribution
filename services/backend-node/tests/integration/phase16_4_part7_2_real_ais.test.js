/**
 * phase16_4_part7_2_real_ais.test.js
 * Phase 16.4 Part 7.2 — Real Open AIS Telemetry & Zero Demo Fallback Tests
 *
 * Strict contract verification:
 *   1. AisProvider base class contract & timestamp preservation (never fabricate)
 *   2. AisProviderFactory default is OpenSeaFeed (no automatic fallback)
 *   3. Explicit AIS_PROVIDER selects corresponding provider
 *   4. OpenSeaFeedClient isConfigured() is true (free tier / anonymous allowed)
 *   5. OpenSeaFeedClient hasApiKey() reflects OPENSEAFEED_API_KEY
 *   6. DemoAisClient is blocked in production (NODE_ENV=production)
 *   7. AisProviderFactory rejects demo in production (AIS_DEMO_DISABLED_IN_PRODUCTION)
 *   8. Provider setProvider() override and reset() behavior
 *   9. Unconfigured real provider returns AIS_DATA_UNAVAILABLE + 0 candidates (no demo fallback)
 *  10. Real provider timeout returns AIS_PROVIDER_TIMEOUT + 0 candidates
 *  11. Real provider network failure returns AIS_PROVIDER_UNAVAILABLE + 0 candidates
 *  12. Real provider auth failure returns AIS_DATA_UNAVAILABLE + 0 candidates
 *  13. Real provider with zero vessels returns AIS_NO_DATA_FOR_QUERY + 0 candidates
 *  14. Real provider vessels returned have provenance: "REAL", isDemo: false, source: "OPENSEAFEED"
 *  15. Candidates are strictly POTENTIAL_CANDIDATE with attribution.status: NOT_ESTABLISHED
 *  16. Envelope contains retrievedAt, provider, sourceType="AIS_PROVIDER", queryWindow
 *  17. No forbidden attribution keys generated anywhere in result
 */

'use strict';

const axios = require('axios');
const AisProvider = require('../../src/clients/ais/ais.provider');
const OpenSeaFeedClient = require('../../src/clients/ais/openseafeed.client');
const MarineTrafficClient = require('../../src/clients/ais/marinetraffic.client');
const AisStreamClient = require('../../src/clients/ais/aisstream.client');
const DemoAisClient = require('../../src/clients/ais/demo-ais.client');
const aisProviderFactory = require('../../src/clients/ais/ais.provider.factory');
const {
  correlateCandidates,
  AIS_CORRELATION_STATUS,
  clearAisCache,
} = require('../../src/manual-analysis/aisCorrelationService');

jest.mock('axios');

const VALID_GEOSPATIAL = {
  available: true,
  crs: 'EPSG:4326',
  bounds: [72.0, 19.0, 73.0, 20.0],
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

describe('Phase 16.4 Part 7.2 — Real Open AIS Telemetry & Zero Demo Fallback', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearAisCache();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.AIS_HISTORICAL_PROVIDER;
    delete process.env.GFW_API_TOKEN;
    process.env.NODE_ENV = 'test';
    process.env.OPENSEAFEED_HISTORICAL_URL = 'https://stream.openseafeed.com/v1/history';
    aisProviderFactory.reset();
  });

  afterAll(() => {
    process.env = originalEnv;
    aisProviderFactory.reset();
  });

  // ── Contract 1: Base Provider Contract ─────────────────────────────────────
  it('1. AisProvider normalizeRecord never fabricates timestamps if missing from raw data', () => {
    class TestProvider extends AisProvider {
      constructor() {
        super('TEST_REAL', 'REAL');
      }
      isConfigured() { return true; }
    }

    const provider = new TestProvider();
    const rawNoTime = {
      mmsi: '123456789',
      vesselName: 'Pacific Echo',
      latitude: 19.25,
      longitude: 72.50,
      sog: 12.4,
      cog: 180,
    };

    const normalized = provider.normalizeRecord(rawNoTime);
    expect(normalized.mmsi).toBe('123456789');
    expect(normalized.timestamp).toBeNull();
    expect(normalized.sourceTimestamp).toBeNull();
    expect(normalized.provenance).toBe('REAL');
    expect(normalized.source).toBe('TEST_REAL');

    const rawWithTime = {
      ...rawNoTime,
      timestamp: '2026-03-09T20:15:00.000Z',
    };
    const normWithTime = provider.normalizeRecord(rawWithTime);
    expect(normWithTime.timestamp).toBe('2026-03-09T20:15:00.000Z');
  });

  // ── Contract 2: AisProviderFactory Default is OpenSeaFeed ──────────────────
  it('2. AisProviderFactory selects OpenSeaFeed by default when AIS_PROVIDER is unset', () => {
    delete process.env.AIS_PROVIDER;
    delete process.env.AIS_DEMO_MODE;
    const provider = aisProviderFactory.getAisProvider();
    expect(provider).toBeInstanceOf(OpenSeaFeedClient);
    expect(provider.name).toBe('OPENSEAFEED');
    expect(provider.provenance).toBe('REAL');
    expect(provider.isDemo).toBe(false);
  });

  // ── Contract 3: Explicit AIS_PROVIDER Selection ────────────────────────────
  it('3. Explicit AIS_PROVIDER selects corresponding provider with no fallback', () => {
    process.env.AIS_PROVIDER = 'marinetraffic';
    const mt = aisProviderFactory.getAisProvider();
    expect(mt).toBeInstanceOf(MarineTrafficClient);
    expect(mt.name).toBe('MARINETRAFFIC');

    process.env.AIS_PROVIDER = 'aisstream';
    const as = aisProviderFactory.getAisProvider();
    expect(as).toBeInstanceOf(AisStreamClient);
    expect(as.name).toBe('AISSTREAM');

    process.env.AIS_PROVIDER = 'openseafeed';
    const osf = aisProviderFactory.getAisProvider();
    expect(osf).toBeInstanceOf(OpenSeaFeedClient);
    expect(osf.name).toBe('OPENSEAFEED');
  });

  // ── Contract 4 & 5: OpenSeaFeed Configuration & Key Handling ───────────────
  it('4. OpenSeaFeed is configured without API key (free tier anonymous snapshot)', () => {
    delete process.env.OPENSEAFEED_API_KEY;
    const osf = new OpenSeaFeedClient();
    expect(osf.isConfigured()).toBe(true);
    expect(osf.hasApiKey()).toBe(false);
  });

  it('5. OpenSeaFeed reflects OPENSEAFEED_API_KEY when provided', () => {
    process.env.OPENSEAFEED_API_KEY = 'osf_live_secret123';
    const osf = new OpenSeaFeedClient();
    expect(osf.isConfigured()).toBe(true);
    expect(osf.hasApiKey()).toBe(true);
  });

  // ── Contract 6: DemoAisClient Blocked in Production ────────────────────────
  it('6. DemoAisClient isConfigured() returns false and queryHistoricalAis throws in production', async () => {
    process.env.NODE_ENV = 'production';
    const demoClient = new DemoAisClient();
    expect(demoClient.isConfigured()).toBe(false);

    await expect(
      demoClient.queryHistoricalAis({
        minLat: 19,
        maxLat: 20,
        minLng: 72,
        maxLng: 73,
        fromTimestamp: '2026-03-09T00:00:00Z',
        toTimestamp: '2026-03-10T00:00:00Z',
      })
    ).rejects.toThrow(/AIS_DEMO_DISABLED_IN_PRODUCTION/);
  });

  // ── Contract 7: Factory Blocks Demo in Production ──────────────────────────
  it('7. AisProviderFactory throws AIS_DEMO_DISABLED_IN_PRODUCTION in production', () => {
    process.env.NODE_ENV = 'production';

    process.env.AIS_DEMO_MODE = 'true';
    expect(() => aisProviderFactory.getAisProvider()).toThrow(/AIS_DEMO_DISABLED_IN_PRODUCTION/);

    process.env.AIS_DEMO_MODE = 'false';
    process.env.AIS_PROVIDER = 'demo';
    expect(() => aisProviderFactory.getAisProvider()).toThrow(/AIS_DEMO_DISABLED_IN_PRODUCTION/);
  });

  // ── Contract 8: Provider Override and Reset ────────────────────────────────
  it('8. AisProviderFactory setProvider override works for test injection and reset restores env', () => {
    const mockProvider = {
      name: 'MOCK_CUSTOM',
      provenance: 'REAL',
      isDemo: false,
      isConfigured: () => true,
      queryHistoricalAis: jest.fn().mockResolvedValue([]),
    };

    aisProviderFactory.setProvider(mockProvider);
    expect(aisProviderFactory.getAisProvider()).toBe(mockProvider);

    aisProviderFactory.reset();
    delete process.env.AIS_PROVIDER;
    delete process.env.AIS_DEMO_MODE;
    expect(aisProviderFactory.getAisProvider()).toBeInstanceOf(OpenSeaFeedClient);
  });

  // ── Contract 9: Unconfigured Real Provider Returns AIS_DATA_UNAVAILABLE ───
  it('9. Unconfigured real provider (MarineTraffic without key) returns AIS_DATA_UNAVAILABLE with 0 candidates', async () => {
    process.env.AIS_PROVIDER = 'marinetraffic';
    delete process.env.MARINETRAFFIC_API_KEY;

    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.AIS_DATA_UNAVAILABLE);
    expect(result.candidates).toHaveLength(0);
    expect(result.isDemo).toBe(false);
    expect(result.provenance).toBe('NOT_AVAILABLE');
    expect(result.provider).toBe('MARINETRAFFIC');
  });

  // ── Contract 10: Provider Timeout Returns AIS_PROVIDER_TIMEOUT ────────────
  it('10. Provider network timeout returns AIS_PROVIDER_TIMEOUT with zero candidates', async () => {
    const timeoutErr = new Error('timeout of 15000ms exceeded');
    timeoutErr.code = 'ECONNABORTED';
    axios.get.mockRejectedValue(timeoutErr);

    process.env.AIS_PROVIDER = 'openseafeed';
    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.AIS_PROVIDER_TIMEOUT);
    expect(result.candidates).toHaveLength(0);
    expect(result.isDemo).toBe(false);
    expect(result.coverage.totalVesselsEvaluated).toBe(0);
  });

  // ── Contract 11: Provider Unreachable Returns AIS_PROVIDER_UNAVAILABLE ─────
  it('11. Provider network unreachable (ENOTFOUND) returns AIS_PROVIDER_UNAVAILABLE with 0 candidates', async () => {
    const netErr = new Error('getaddrinfo ENOTFOUND stream.openseafeed.com');
    netErr.code = 'ENOTFOUND';
    axios.get.mockRejectedValue(netErr);

    process.env.AIS_PROVIDER = 'openseafeed';
    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.AIS_PROVIDER_UNAVAILABLE);
    expect(result.candidates).toHaveLength(0);
    expect(result.isDemo).toBe(false);
  });

  // ── Contract 12: Provider Auth Failure Returns AIS_DATA_UNAVAILABLE ────────
  it('12. Provider authentication failure (HTTP 401) returns AIS_DATA_UNAVAILABLE with 0 candidates', async () => {
    const authErr = new Error('Request failed with status code 401');
    authErr.response = { status: 401 };
    axios.get.mockRejectedValue(authErr);

    process.env.AIS_PROVIDER = 'openseafeed';
    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.AIS_DATA_UNAVAILABLE);
    expect(result.candidates).toHaveLength(0);
    expect(result.isDemo).toBe(false);
  });

  // ── Contract 13: Zero Vessels Found Returns AIS_NO_DATA_FOR_QUERY ─────────
  it('13. Real provider query returning 0 vessels in bounding box returns AIS_NO_DATA_FOR_QUERY', async () => {
    axios.get.mockResolvedValue({
      status: 200,
      data: [
        // Vessel far away outside bounding box
        {
          mmsi: '999999999',
          latitude: 51.5074,
          longitude: -0.1278,
          timestamp: '2026-03-09T20:00:00.000Z',
          speedKnots: 10,
        },
      ],
    });

    process.env.AIS_PROVIDER = 'openseafeed';
    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.AIS_NO_DATA_FOR_QUERY);
    expect(result.candidates).toHaveLength(0);
    expect(result.isDemo).toBe(false);
    expect(result.provenance).toBe('REAL');
    expect(result.source).toBe('OPENSEAFEED');
    expect(result.coverage.totalVesselsEvaluated).toBe(0);
  });

  // ── Contract 14: Real Provider Candidates Have REAL Provenance ─────────────
  it('14. Successful OpenSeaFeed query returns candidates with provenance="REAL", isDemo=false, source="OPENSEAFEED"', async () => {
    axios.get.mockResolvedValue({
      status: 200,
      data: [
        {
          mmsi: '419001234',
          name: 'OCEAN_TRADER_REAL',
          latitude: 19.23,
          longitude: 72.51,
          timestamp: '2026-03-09T20:05:00.000Z',
          sog: 11.2,
          cog: 175.0,
          heading: 175.0,
          vesselType: 'Cargo',
          callsign: 'VT9876',
          destination: 'MUMBAI',
        },
      ],
    });

    process.env.AIS_PROVIDER = 'openseafeed';
    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.CANDIDATES_FOUND);
    expect(result.candidates).toHaveLength(1);
    expect(result.isDemo).toBe(false);
    expect(result.provenance).toBe('REAL');
    expect(result.source).toBe('OPENSEAFEED');

    const candidate = result.candidates[0];
    expect(candidate.vesselId.mmsi).toBe('419001234');
    expect(candidate.vesselId.name).toBe('OCEAN_TRADER_REAL');
    expect(candidate.aisEvidence.provenance).toBe('REAL');
    expect(candidate.aisEvidence.source).toBe('OPENSEAFEED');
  });

  // ── Contract 15: Attribution Status Strictly NOT_ESTABLISHED ───────────────
  it('15. All candidates are strictly POTENTIAL_CANDIDATE with attribution.status: "NOT_ESTABLISHED"', async () => {
    axios.get.mockResolvedValue({
      status: 200,
      data: [
        {
          mmsi: '419001234',
          name: 'OCEAN_TRADER_REAL',
          latitude: 19.22,
          longitude: 72.50,
          timestamp: '2026-03-09T20:00:00.000Z',
          sog: 12.0,
          cog: 180.0,
        },
      ],
    });

    process.env.AIS_PROVIDER = 'openseafeed';
    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
    });

    expect(result.candidates[0].status).toBe('POTENTIAL_CANDIDATE');
    expect(result.candidates[0].attribution.status).toBe('NOT_ESTABLISHED');
  });

  // ── Contract 16: Result Envelope Verification ─────────────────────────────
  it('16. Envelope contains retrievedAt, provider, sourceType="AIS_PROVIDER", queryWindow', async () => {
    axios.get.mockResolvedValue({
      status: 200,
      data: [],
    });

    process.env.AIS_PROVIDER = 'openseafeed';
    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
    });

    expect(result).toHaveProperty('retrievedAt');
    expect(result.provider).toBe('OPENSEAFEED');
    expect(result.sourceType).toBe('AIS_PROVIDER');
    expect(result.queryWindow).toHaveProperty('windowStart');
    expect(result.queryWindow).toHaveProperty('windowEnd');
    expect(result.originReference).toHaveProperty('latitude');
    expect(result.originReference).toHaveProperty('longitude');
  });

  // ── Contract 17: Forbidden Keys Never Generated ────────────────────────────
  it('17. Forbidden attribution keys are NEVER generated anywhere in correlation output', async () => {
    axios.get.mockResolvedValue({
      status: 200,
      data: [
        {
          mmsi: '419001234',
          name: 'TEST_VESSEL',
          latitude: 19.22,
          longitude: 72.50,
          timestamp: '2026-03-09T20:00:00.000Z',
          sog: 12.0,
          cog: 180.0,
        },
      ],
    });

    process.env.AIS_PROVIDER = 'openseafeed';
    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
    });

    const serialized = JSON.stringify(result);
    const forbiddenPatterns = [
      /responsibleVessel/i,
      /confirmedPolluter/i,
      /definitiveSource/i,
      /provenResponsibleVessel/i,
      /guiltyParty/i,
    ];

    for (const pattern of forbiddenPatterns) {
      expect(pattern.test(serialized)).toBe(false);
    }
  });

  // ── Contract 18: Unconfigured Historical URL Returns AIS_HISTORICAL_DATA_UNAVAILABLE
  it('18. Unconfigured OPENSEAFEED_HISTORICAL_URL returns AIS_HISTORICAL_DATA_UNAVAILABLE with 0 candidates', async () => {
    delete process.env.OPENSEAFEED_HISTORICAL_URL;
    process.env.AIS_PROVIDER = 'openseafeed';

    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      acquisitionTimestamp: '2026-03-09T20:00:00.000Z',
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.AIS_HISTORICAL_DATA_UNAVAILABLE);
    expect(result.candidates).toHaveLength(0);
    expect(result.isDemo).toBe(false);
  });
});

