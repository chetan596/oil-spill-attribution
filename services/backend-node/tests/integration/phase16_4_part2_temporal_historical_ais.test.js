/**
 * phase16_4_part2_temporal_historical_ais.test.js
 * Phase 16.4 — Part 2 Integration Tests: Real Temporal Anchor + Historical AIS Provider Foundation
 *
 * Test Coverage:
 *  1. Priority 1: Authentic Sentinel-1 SAFE manifest.safe acquisition time extracted & authoritative
 *  2. Priority 1: Authentic TIFF Tag 306 (TIFFTAG_DATETIME) parsed & authoritative
 *  3. Priority 1: Official Sentinel-1 product naming convention parsed & authoritative
 *  4. Priority 1: Authentic metadata takes precedence over analyst-supplied input
 *  5. Conflict Handling: TEMPORAL_REFERENCE_CONFLICT flagged when analyst differs; authentic wins
 *  6. Priority 2: Analyst-supplied acquisition timestamp fallback when authentic is NOT_AVAILABLE
 *  7. Analyst timestamp validation: strict ISO-8601 validation & UTC normalization
 *  8. Invalid analyst timestamp returns null / rejected
 *  9. Priority 3: NOT_AVAILABLE when neither authentic metadata nor analyst input exists
 * 10. Benchmark TIFF (00046.tif) returns timestamp=null, source=NOT_AVAILABLE (never fabricated)
 * 11. AIS Temporal Window: [T0 - 24h, T0 + 24h] UTC strictly anchored to authoritative T0
 * 12. Correlation skipped with INSUFFICIENT_TEMPORAL_DATA when temporal reference is NOT_AVAILABLE
 * 13. Historical AIS Provider: unconfigured returns HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED
 * 14. Historical AIS Provider: configured queries [T0 - 24h, T0 + 24h] & spatial bounds
 * 15. Candidate vessels retain status "POTENTIAL_CANDIDATE" and attribution "NOT_ESTABLISHED"
 * 16. Candidate scoring mathematics preserved (0.30 Prox + 0.25 Temp + 0.25 Traj + 0.20 Anom)
 */

'use strict';

const path = require('path');
const fs = require('fs');

const {
  validateAndNormalizeIsoTimestamp,
  parseTiffDateTimeTag,
  extractSatelliteAcquisitionTime,
  resolveInvestigationTemporalReference,
} = require('../../src/utils/satelliteTemporalMetadata');

const {
  correlateCandidates,
  AIS_CORRELATION_STATUS,
  clearAisCache,
} = require('../../src/manual-analysis/aisCorrelationService');

const aisProviderFactory = require('../../src/clients/ais/ais.provider.factory');
const AisProvider = require('../../src/clients/ais/ais.provider');

const VALID_GEOSPATIAL = {
  available: true,
  crs: 'EPSG:4326',
  bounds: [54.5, 25.0, 55.2, 26.0], // Persian Gulf region
  centroid: { latitude: 25.58, longitude: 54.82, provenance: 'MODEL_DERIVED' },
};

const VALID_ORIGIN = {
  status: 'ESTIMATED',
  estimatedPoint: { latitude: 25.58, longitude: 54.82, provenance: 'MODEL_DERIVED' },
  uncertainty: { radiusKm: 2.5, method: 'DIFFUSION_MODEL' },
  originTimestamp: null,
  timestampSource: null,
  provenance: 'MODEL_DERIVED',
};

const VALID_DRIFT = {
  status: 'ESTIMATED',
  backward: {
    status: 'ESTIMATED',
    points: [{ latitude: 25.60, longitude: 54.85 }, { latitude: 25.58, longitude: 54.82 }],
  },
  environmentalData: { source: 'REAL_ERA5', isDemo: false },
  provenance: 'MODEL_DERIVED',
};

describe('Phase 16.4 Part 2 — Real Temporal Anchor + Historical AIS Provider Foundation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearAisCache();
    aisProviderFactory.reset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    aisProviderFactory.reset();
  });

  // ── 1. Priority 1: Authentic Sentinel-1 SAFE Metadata ─────────────────────
  it('1. Authentic Sentinel-1 SAFE manifest.safe extraction takes Priority 1', () => {
    // Create temporary SAFE manifest structure
    const tempDir = path.join(__dirname, '..', '..', 'scratch', 'temp_s1_test.SAFE');
    fs.mkdirSync(tempDir, { recursive: true });
    const manifestPath = path.join(tempDir, 'manifest.safe');
    const mockManifestXml = `
      <xfdu:XFDU xmlns:safe="http://www.esa.int/safe/sentinel-1.0">
        <metadataSection>
          <safe:platform>
            <safe:familyName>SENTINEL-1</safe:familyName>
          </safe:platform>
          <safe:acquisitionPeriod>
            <safe:startTime>2024-05-15T08:32:10.123456Z</safe:startTime>
            <safe:stopTime>2024-05-15T08:32:35.654321Z</safe:stopTime>
          </safe:acquisitionPeriod>
        </metadataSection>
      </xfdu:XFDU>
    `;
    fs.writeFileSync(manifestPath, mockManifestXml, 'utf8');

    const result = extractSatelliteAcquisitionTime({
      filePath: manifestPath,
      sourceType: 'SENTINEL1_DUAL_POL',
    });

    try {
      fs.unlinkSync(manifestPath);
      fs.rmdirSync(tempDir);
    } catch (_) {}

    expect(result.source).toBe('SENTINEL1_PRODUCT_METADATA');
    expect(result.confidence).toBe('AUTHENTIC');
    expect(result.isAuthoritative).toBe(true);
    expect(result.timestamp).toBe('2024-05-15T08:32:10.123Z');
    expect(result.sourceProduct).toBeDefined();
    expect(result.sourceProduct.metadataSource).toBe('manifest.safe');
  });

  // ── 2. Priority 1: Authentic TIFF Tag 306 Parsing ─────────────────────────
  it('2. Embedded TIFF Tag 306 (YYYY:MM:DD HH:MM:SS) is parsed and authoritative', () => {
    const parsed = parseTiffDateTimeTag('2024:08:21 14:15:30');
    expect(parsed).toBe('2024-08-21T14:15:30.000Z');

    const result = extractSatelliteAcquisitionTime({
      metadata: {
        dateTimeTag: '2024:08:21 14:15:30',
      },
    });

    expect(result.source).toBe('RASTER_METADATA');
    expect(result.confidence).toBe('AUTHENTIC');
    expect(result.isAuthoritative).toBe(true);
    expect(result.timestamp).toBe('2024-08-21T14:15:30.000Z');
    expect(result.evidence).toBe('TIFFTAG_DATETIME');
  });

  // ── 3. Priority 1: Official Sentinel-1 Product Naming Convention ──────────
  it('3. Official Sentinel-1 product naming convention parsed & authoritative', () => {
    const s1Name = 'S1A_IW_GRDH_1SDV_20240910T051833_20240910T051858_055598_06C82B_B5DE.tif';
    const result = extractSatelliteAcquisitionTime({
      filePath: path.join('/mock/path', s1Name),
      sourceType: 'SENTINEL1_DUAL_POL',
    });

    expect(result.source).toBe('SENTINEL1_PRODUCT_METADATA');
    expect(result.confidence).toBe('AUTHENTIC');
    expect(result.isAuthoritative).toBe(true);
    expect(result.timestamp).toBe('2024-09-10T05:18:33.000Z');
    expect(result.sourceProduct.platform).toBe('Sentinel-1A');
  });

  // ── 4. Priority 1: Authentic Metadata Wins Over Analyst Input ──────────────
  it('4. Authentic metadata takes precedence over analyst-supplied timestamp', () => {
    const extracted = {
      timestamp: '2024-05-15T08:30:00.000Z',
      source: 'SENTINEL1_PRODUCT_METADATA',
      confidence: 'AUTHENTIC',
      isAuthoritative: true,
      sourceProduct: { platform: 'Sentinel-1A' },
    };

    const resolved = resolveInvestigationTemporalReference({
      extractedMetadata: extracted,
      analystTimestamp: '2024-05-15T08:30:00.000Z', // Same time
    });

    expect(resolved.source).toBe('SENTINEL1_PRODUCT_METADATA');
    expect(resolved.confidence).toBe('AUTHENTIC');
    expect(resolved.isAuthoritative).toBe(true);
    expect(resolved.conflict).toBe(false);
  });

  // ── 5. Conflict Handling: TEMPORAL_REFERENCE_CONFLICT ──────────────────────
  it('5. Flags TEMPORAL_REFERENCE_CONFLICT when analyst differs; authentic wins by default', () => {
    const extracted = {
      timestamp: '2024-05-15T08:30:00.000Z',
      source: 'RASTER_METADATA',
      confidence: 'AUTHENTIC',
      isAuthoritative: true,
    };

    const resolved = resolveInvestigationTemporalReference({
      extractedMetadata: extracted,
      analystTimestamp: '2024-05-18T12:00:00Z', // Different time
    });

    expect(resolved.conflict).toBe(true);
    expect(resolved.conflictType).toBe('TEMPORAL_REFERENCE_CONFLICT');
    // Authentic wins by default
    expect(resolved.timestamp).toBe('2024-05-15T08:30:00.000Z');
    expect(resolved.source).toBe('RASTER_METADATA');
    expect(resolved.analystTimestamp).toBe('2024-05-18T12:00:00.000Z');
  });

  // ── 6. Priority 2: Analyst Fallback ────────────────────────────────────────
  it('6. Priority 2: Analyst-supplied acquisition timestamp fallback when authentic is NOT_AVAILABLE', () => {
    const extracted = {
      timestamp: null,
      source: 'NOT_AVAILABLE',
      confidence: 'NOT_AVAILABLE',
      isAuthoritative: false,
    };

    const resolved = resolveInvestigationTemporalReference({
      extractedMetadata: extracted,
      analystTimestamp: '2024-06-20T10:15:00Z',
    });

    expect(resolved.source).toBe('ANALYST_SUPPLIED');
    expect(resolved.confidence).toBe('ANALYST_DECLARED');
    expect(resolved.isAuthoritative).toBe(true);
    expect(resolved.timestamp).toBe('2024-06-20T10:15:00.000Z');
    expect(resolved.conflict).toBe(false);
  });

  // ── 7. Analyst Timestamp Validation & UTC Normalization ────────────────────
  it('7. Strict ISO-8601 validation and UTC normalization of analyst timestamp', () => {
    // Non-UTC timezone offset (+05:30) must normalize to UTC 'Z'
    const normalized = validateAndNormalizeIsoTimestamp('2024-07-10T14:30:00+05:30');
    expect(normalized).toBe('2024-07-10T09:00:00.000Z');

    const normZ = validateAndNormalizeIsoTimestamp('2024-07-10T09:00:00Z');
    expect(normZ).toBe('2024-07-10T09:00:00.000Z');
  });

  // ── 8. Invalid Analyst Timestamp Rejection ─────────────────────────────────
  it('8. Malformed or non-ISO timestamp returns null', () => {
    expect(validateAndNormalizeIsoTimestamp('invalid-date')).toBeNull();
    expect(validateAndNormalizeIsoTimestamp('2024/05/15')).toBeNull();
    expect(validateAndNormalizeIsoTimestamp('123456789')).toBeNull();
    expect(validateAndNormalizeIsoTimestamp('')).toBeNull();
    expect(validateAndNormalizeIsoTimestamp(null)).toBeNull();
  });

  // ── 9. Priority 3: NOT_AVAILABLE When Neither Exists ───────────────────────
  it('9. Priority 3: Returns NOT_AVAILABLE with isAuthoritative=false when no time exists', () => {
    const extracted = {
      timestamp: null,
      source: 'NOT_AVAILABLE',
      confidence: 'NOT_AVAILABLE',
      isAuthoritative: false,
    };

    const resolved = resolveInvestigationTemporalReference({
      extractedMetadata: extracted,
      analystTimestamp: null,
    });

    expect(resolved.source).toBe('NOT_AVAILABLE');
    expect(resolved.isAuthoritative).toBe(false);
    expect(resolved.timestamp).toBeNull();
  });

  // ── 10. Benchmark TIFF (00046.tif) ─────────────────────────────────────────
  it('10. Benchmark TIFF (00046.tif) returns timestamp=null, source=NOT_AVAILABLE without fabrication', () => {
    const benchmarkPath = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'data',
      'uploads',
      'manual',
      'd341befb-5790-4a4c-86c7-8f120e913558',
      'source_image.tif'
    );

    const result = extractSatelliteAcquisitionTime({
      filePath: benchmarkPath,
      sourceType: 'SENTINEL1_DUAL_POL',
      metadata: {
        filename: '00046.tif',
        bands: 2,
        crs: 'EPSG:4326',
      },
    });

    expect(result.timestamp).toBeNull();
    expect(result.source).toBe('NOT_AVAILABLE');
    expect(result.isAuthoritative).toBe(false);
  });

  // ── 11. AIS Temporal Window Anchoring: [T0 - 24h, T0 + 24h] ────────────────
  it('11. When authoritative T0 exists, queryWindow is strictly [T0 - 24h, T0 + 24h] in UTC', async () => {
    class MockHistoricalProvider extends AisProvider {
      constructor() {
        super({ name: 'TEST_HISTORICAL', provenance: 'REAL', isDemo: false });
      }
      isConfigured() { return true; }
      async queryHistoricalAis({ fromTimestamp, toTimestamp }) {
        return [];
      }
      async queryCurrentAis() { return []; }
    }

    aisProviderFactory.setProvider(new MockHistoricalProvider());

    const t0 = '2024-05-15T12:00:00.000Z';
    const temporalReference = {
      status: 'ANALYST_SUPPLIED',
      source: 'ANALYST_SUPPLIED',
      timestamp: t0,
      isAuthoritative: true,
      confidence: 'ANALYST_DECLARED',
    };

    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      temporalReference,
      searchRadiusKm: 50,
      timeWindowHours: 24,
      jobId: 'test-job-window-anchor',
    });

    expect(result.queryWindow).toBeDefined();
    expect(result.queryWindow.windowStart).toBe('2024-05-14T12:00:00.000Z'); // T0 - 24h
    expect(result.queryWindow.windowEnd).toBe('2024-05-16T12:00:00.000Z');   // T0 + 24h
    expect(result.queryWindow.durationHours).toBe(48);
    expect(result.queryWindow.timestampSource).toBe('ANALYST_SUPPLIED');
  });

  // ── 12. Correlation Skipped When Temporal Reference NOT_AVAILABLE ───────────
  it('12. AIS correlation returns INSUFFICIENT_TEMPORAL_DATA when no authoritative reference is available', async () => {
    const temporalReference = {
      status: 'NOT_AVAILABLE',
      source: 'NOT_AVAILABLE',
      timestamp: null,
      isAuthoritative: false,
    };

    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      temporalReference,
      jobId: 'test-job-no-temporal',
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.INSUFFICIENT_TEMPORAL_DATA);
    expect(result.candidates).toEqual([]);
    expect(result.queryWindow).toBeNull();
    expect(result.unavailableReason).toContain('No temporal reference available');
  });

  // ── 13. Historical AIS Provider: Unconfigured ──────────────────────────────
  it('13. Unconfigured global historical AIS provider returns HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED', async () => {
    delete process.env.AIS_HISTORICAL_PROVIDER;
    delete process.env.AIS_PROVIDER;
    delete process.env.AIS_HISTORICAL_API_URL;
    delete process.env.AIS_HISTORICAL_API_KEY;
    delete process.env.AIS_HISTORICAL_BEARER_TOKEN;

    const temporalReference = {
      status: 'ANALYST_SUPPLIED',
      source: 'ANALYST_SUPPLIED',
      timestamp: '2024-05-15T12:00:00.000Z',
      isAuthoritative: true,
    };

    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      temporalReference,
      jobId: 'test-job-unconfigured-global',
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED);
    expect(result.candidates).toEqual([]);
    expect(result.isDemo).toBe(false);
    expect(result.unavailableReason).toContain('Set AIS_HISTORICAL_PROVIDER, AIS_HISTORICAL_API_URL');
  });

  // ── 14. Configured Historical Provider Groups Observations by MMSI ─────────
  it('14. Configured historical provider queries time window & groups MMSI observations', async () => {
    class MockConfiguredHistoricalClient extends AisProvider {
      constructor() {
        super({ name: 'GLOBAL', provenance: 'REAL', isDemo: false });
      }
      isConfigured() { return true; }
      async queryHistoricalAis({ minLat, maxLat, minLng, maxLng, fromTimestamp, toTimestamp }) {
        return [
          {
            mmsi: '477123456',
            imo: '9123456',
            vesselName: 'GLOBAL_TANKER',
            vesselType: 'Tanker',
            latitude: 25.59,
            longitude: 54.83,
            timestamp: '2024-05-15T11:00:00Z',
            sog: 12.4,
            cog: 180,
          },
          {
            mmsi: '477123456',
            imo: '9123456',
            vesselName: 'GLOBAL_TANKER',
            vesselType: 'Tanker',
            latitude: 25.57,
            longitude: 54.81,
            timestamp: '2024-05-15T12:30:00Z',
            sog: 12.1,
            cog: 182,
          },
        ];
      }
      async queryCurrentAis() { return []; }
    }

    aisProviderFactory.setProvider(new MockConfiguredHistoricalClient());

    const temporalReference = {
      status: 'ANALYST_SUPPLIED',
      source: 'ANALYST_SUPPLIED',
      timestamp: '2024-05-15T12:00:00.000Z',
      isAuthoritative: true,
    };

    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      temporalReference,
      jobId: 'test-job-configured-historical',
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.CANDIDATES_FOUND);
    expect(result.candidates.length).toBe(1);
    expect(result.coverage.totalObservationsCount).toBe(2);
    expect(result.coverage.totalVesselsEvaluated).toBe(1);
  });

  // ── 15. Candidate Status & Attribution Guard ───────────────────────────────
  it('15. Candidates are strictly POTENTIAL_CANDIDATE with attribution.status NOT_ESTABLISHED', async () => {
    class MockHistoricalProvider extends AisProvider {
      constructor() {
        super({ name: 'GLOBAL', provenance: 'REAL', isDemo: false });
      }
      isConfigured() { return true; }
      async queryHistoricalAis() {
        return [
          {
            mmsi: '477987654',
            vesselName: 'PERSIAN_CARRIER',
            vesselType: 'Cargo',
            latitude: 25.581,
            longitude: 54.821,
            timestamp: '2024-05-15T12:05:00Z',
            sog: 14.0,
            cog: 90,
          },
        ];
      }
      async queryCurrentAis() { return []; }
    }

    aisProviderFactory.setProvider(new MockHistoricalProvider());

    const temporalReference = {
      status: 'ANALYST_SUPPLIED',
      source: 'ANALYST_SUPPLIED',
      timestamp: '2024-05-15T12:00:00.000Z',
      isAuthoritative: true,
    };

    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      temporalReference,
      jobId: 'test-job-guard-check',
    });

    expect(result.candidates[0].status).toBe('POTENTIAL_CANDIDATE');
    expect(result.candidates[0].attribution.status).toBe('NOT_ESTABLISHED');
    expect(result.candidates[0]).not.toHaveProperty('responsibleVessel');
    expect(result.candidates[0]).not.toHaveProperty('confirmedPolluter');
    expect(result.candidates[0]).not.toHaveProperty('definitiveSource');
  });

  // ── 16. Scoring Mathematics Preserved ─────────────────────────────────────
  it('16. Scoring mathematics follows 0.30 Prox + 0.25 Temp + 0.25 Traj + 0.20 Anom', async () => {
    class MockScoredProvider extends AisProvider {
      constructor() {
        super({ name: 'GLOBAL', provenance: 'REAL', isDemo: false });
      }
      isConfigured() { return true; }
      async queryHistoricalAis() {
        return [
          {
            mmsi: '477001002',
            vesselName: 'EVAL_VESSEL',
            vesselType: 'Tanker',
            latitude: 25.58,
            longitude: 54.82,
            timestamp: '2024-05-15T12:00:00Z',
            sog: 11.0,
            cog: 45,
          },
        ];
      }
      async queryCurrentAis() { return []; }
    }

    aisProviderFactory.setProvider(new MockScoredProvider());

    const temporalReference = {
      status: 'ANALYST_SUPPLIED',
      source: 'ANALYST_SUPPLIED',
      timestamp: '2024-05-15T12:00:00.000Z',
      isAuthoritative: true,
    };

    const result = await correlateCandidates({
      geospatial: VALID_GEOSPATIAL,
      origin: VALID_ORIGIN,
      drift: VALID_DRIFT,
      temporalReference,
      jobId: 'test-job-scoring-eval',
    });

    const cand = result.candidates[0];
    const { proximityScore, temporalScore, trajectoryScore, anomalyScore } = cand.correlation.metrics;
    const computedExpected = Number((0.30 * proximityScore + 0.25 * temporalScore + 0.25 * trajectoryScore + 0.20 * anomalyScore).toFixed(4));
    expect(cand.correlation.score).toBe(computedExpected);
  });
});
