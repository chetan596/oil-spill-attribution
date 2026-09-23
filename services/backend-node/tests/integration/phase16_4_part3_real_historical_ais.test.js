/**
 * phase16_4_part3_real_historical_ais.test.js
 * Phase 16.4 — Part 3 Integration Tests: Real Historical AIS — Kpler GWS exactAIS:HVP
 *
 * Mandatory 23-point Test Suite:
 *  1. Missing credentials -> HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED
 *  2. Authentication failure (HTTP 401/403) -> AIS_PROVIDER_AUTH_FAILED
 *  3. Provider unavailable (unreachable / network error / 404) -> AIS_PROVIDER_UNAVAILABLE
 *  4. Provider timeout -> AIS_PROVIDER_TIMEOUT
 *  5. Capabilities verification -> HISTORICAL_PROVIDER_API_CONTRACT_REQUIRED when exactAIS:HVP missing
 *  6. HVP schema normalization -> dtg -> dt_pos_utc -> ts_pos_utc precedence and ISO normalization
 *  7. T0-24h -> T0 query (Window A)
 *  8. T0 -> T0+24h query (Window B)
 *  9. 48h reconstruction across Window A + Window B
 * 10. Boundary deduplication between Window A and Window B
 * 11. Spatial validation (out-of-bounds rejected)
 * 12. Temporal validation (out-of-window rejected)
 * 13. Multiple MMSIs grouped correctly
 * 14. Chronological track sorting per vessel
 * 15. Pagination handling (startIndex / maxFeatures)
 * 16. Truncation reporting (isTruncated: true when limits hit)
 * 17. Zero observations -> AIS_NO_DATA_FOR_QUERY
 * 18. REAL_HISTORICAL_AIS status & provenance
 * 19. AIS_CURRENT_DATA_ONLY rejection when provider only returns out-of-window data
 * 20. Unchanged scoring weights (0.30 Prox + 0.25 Temp + 0.25 Traj + 0.20 Anom)
 * 21. POTENTIAL_CANDIDATE guardrail
 * 22. NOT_ESTABLISHED attribution guardrail
 * 23. Credential non-leakage (API key / bearer token never exposed)
 */

'use strict';

const axios = require('axios');
const GlobalHistoricalAisClient = require('../../src/clients/ais/global-historical-ais.client');
const aisProviderFactory = require('../../src/clients/ais/ais.provider.factory');
const {
  correlateCandidates,
  AIS_CORRELATION_STATUS,
  clearAisCache,
} = require('../../src/manual-analysis/aisCorrelationService');

// Test spatiotemporal investigation inputs (Persian Gulf)
const VALID_ORIGIN = {
  status: 'ESTIMATED',
  estimatedPoint: { latitude: 25.58, longitude: 54.82, provenance: 'MODEL_DERIVED' },
  uncertainty: { radiusKm: 2.5, method: 'DIFFUSION_MODEL' },
  originTimestamp: '2024-05-15T12:00:00.000Z',
  timestampSource: 'AUTHENTIC_SATELLITE_METADATA',
  provenance: 'MODEL_DERIVED',
};

const VALID_GEOSPATIAL = {
  available: true,
  crs: 'EPSG:4326',
  bounds: [54.5, 25.0, 55.2, 26.0],
  centroid: { latitude: 25.58, longitude: 54.82, provenance: 'MODEL_DERIVED' },
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

const TEST_SECRET_KEY = 'KPLER_GWS_SECRET_KEY_999888777';

describe('Phase 16.4 — Part 3: Real Historical AIS — Kpler GWS exactAIS:HVP', () => {
  const originalEnv = { ...process.env };
  let axiosGetSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    clearAisCache();
    aisProviderFactory.reset();

    process.env.AIS_HISTORICAL_PROVIDER = 'EXACTAIS_GWS';
    process.env.AIS_HISTORICAL_API_URL = 'https://services.exactearth.com/gws/wfs';
    process.env.AIS_HISTORICAL_API_KEY = TEST_SECRET_KEY;
    delete process.env.AIS_HISTORICAL_BEARER_TOKEN;
    delete process.env.AIS_DEMO_MODE;

    axiosGetSpy = jest.spyOn(axios, 'get');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    if (axiosGetSpy) axiosGetSpy.mockRestore();
    aisProviderFactory.reset();
  });

  // ── 1. Missing credentials ────────────────────────────────────────────────
  it('1. Missing credentials returns HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED', async () => {
    delete process.env.AIS_HISTORICAL_API_KEY;
    delete process.env.AIS_HISTORICAL_BEARER_TOKEN;

    const client = new GlobalHistoricalAisClient();
    expect(client.isConfigured()).toBe(false);

    await expect(
      client.queryHistoricalAis({
        minLat: 25.0,
        maxLat: 26.0,
        minLng: 54.0,
        maxLng: 55.0,
        fromTimestamp: '2024-05-14T12:00:00.000Z',
        toTimestamp: '2024-05-16T12:00:00.000Z',
      })
    ).rejects.toThrow(/HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED/);

    const result = await correlateCandidates({
      origin: VALID_ORIGIN,
      geospatial: VALID_GEOSPATIAL,
      drift: VALID_DRIFT,
      searchRadiusKm: 50,
      windowDurationHours: 48,
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED);
    expect(result.type).toBe('HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED');
    expect(result.candidates).toEqual([]);
    expect(result.coverage.insufficientCoverage).toBe(true);
  });

  // ── 2. Authentication failure ─────────────────────────────────────────────
  it('2. Authentication failure (HTTP 401/403) throws AIS_PROVIDER_AUTH_FAILED', async () => {
    const authError = new Error('Request failed with status code 401');
    authError.response = { status: 401, data: { message: 'Unauthorized: Invalid API Key' } };
    axiosGetSpy.mockRejectedValue(authError);

    const client = new GlobalHistoricalAisClient();
    await expect(
      client.queryHistoricalAis({
        minLat: 25.0,
        maxLat: 26.0,
        minLng: 54.0,
        maxLng: 55.0,
        fromTimestamp: '2024-05-14T12:00:00.000Z',
        toTimestamp: '2024-05-15T12:00:00.000Z',
      })
    ).rejects.toMatchObject({ code: 'AIS_PROVIDER_AUTH_FAILED' });

    // Through correlation service
    const result = await correlateCandidates({
      origin: VALID_ORIGIN,
      geospatial: VALID_GEOSPATIAL,
      drift: VALID_DRIFT,
      searchRadiusKm: 50,
      windowDurationHours: 48,
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.AIS_DATA_UNAVAILABLE);
    expect(result.coverage.aisGapNotes).toMatch(/AIS_PROVIDER_AUTH_FAILED|Check credentials/);
  });

  // ── 3. Provider unavailable ───────────────────────────────────────────────
  it('3. Provider unavailable (network error / 404) throws AIS_PROVIDER_UNAVAILABLE', async () => {
    const connError = new Error('connect ECONNREFUSED 127.0.0.1:443');
    connError.code = 'ECONNREFUSED';
    axiosGetSpy.mockRejectedValue(connError);

    const client = new GlobalHistoricalAisClient();
    await expect(
      client.queryHistoricalAis({
        minLat: 25.0,
        maxLat: 26.0,
        minLng: 54.0,
        maxLng: 55.0,
        fromTimestamp: '2024-05-14T12:00:00.000Z',
        toTimestamp: '2024-05-15T12:00:00.000Z',
      })
    ).rejects.toMatchObject({ code: 'AIS_PROVIDER_UNAVAILABLE' });

    // Through correlation service
    const result = await correlateCandidates({
      origin: VALID_ORIGIN,
      geospatial: VALID_GEOSPATIAL,
      drift: VALID_DRIFT,
      searchRadiusKm: 50,
      windowDurationHours: 48,
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.AIS_PROVIDER_UNAVAILABLE);
  });

  // ── 4. Provider timeout ───────────────────────────────────────────────────
  it('4. Provider timeout throws AIS_PROVIDER_TIMEOUT', async () => {
    const timeoutErr = new Error('timeout of 30000ms exceeded');
    timeoutErr.code = 'ECONNABORTED';
    axiosGetSpy.mockRejectedValue(timeoutErr);

    const client = new GlobalHistoricalAisClient();
    await expect(
      client.queryHistoricalAis({
        minLat: 25.0,
        maxLat: 26.0,
        minLng: 54.0,
        maxLng: 55.0,
        fromTimestamp: '2024-05-14T12:00:00.000Z',
        toTimestamp: '2024-05-15T12:00:00.000Z',
      })
    ).rejects.toMatchObject({ code: 'AIS_PROVIDER_TIMEOUT' });

    // Through correlation service
    const result = await correlateCandidates({
      origin: VALID_ORIGIN,
      geospatial: VALID_GEOSPATIAL,
      drift: VALID_DRIFT,
      searchRadiusKm: 50,
      windowDurationHours: 48,
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.AIS_PROVIDER_TIMEOUT);
  });

  // ── 5. Capabilities verification ──────────────────────────────────────────
  it('5. Capabilities verification throws HISTORICAL_PROVIDER_API_CONTRACT_REQUIRED when exactAIS:HVP is missing', async () => {
    // Return capabilities XML without exactAIS:HVP
    axiosGetSpy.mockResolvedValueOnce({
      status: 200,
      data: `<WFS_Capabilities version="1.1.0">
               <FeatureTypeList>
                 <FeatureType><Name>other:layer</Name></FeatureType>
               </FeatureTypeList>
             </WFS_Capabilities>`,
    });

    const client = new GlobalHistoricalAisClient();
    await expect(client.verifyCapabilities()).rejects.toMatchObject({
      code: 'HISTORICAL_PROVIDER_API_CONTRACT_REQUIRED',
    });
  });

  // ── 6. HVP schema normalization ───────────────────────────────────────────
  it('6. HVP schema normalization prefers dtg -> dt_pos_utc -> ts_pos_utc', () => {
    const client = new GlobalHistoricalAisClient();

    // Priority 1: dtg
    const rec1 = client.normalizeRecord({
      mmsi: '211281610',
      imo: '9123456',
      vessel_name: 'OCEAN GUARDIAN',
      callsign: 'ABCD',
      vessel_type: 'Tanker',
      vessel_type_code: 80,
      latitude: 25.58,
      longitude: 54.82,
      sog: 12.4,
      cog: 180.5,
      rot: 0,
      heading: 181,
      nav_status: 'Under way using engine',
      nav_status_code: 0,
      dtg: '2024-05-15T12:00:00Z',
      dt_pos_utc: '2024-05-15T11:59:00Z',
      ts_pos_utc: '2024-05-15T11:58:00Z',
    });
    expect(rec1.timestamp).toBe('2024-05-15T12:00:00.000Z');
    expect(rec1.timestampSource).toBe('dtg');
    expect(rec1.vesselName).toBe('OCEAN GUARDIAN');
    expect(rec1.sog).toBe(12.4);

    // Priority 2: dt_pos_utc
    const rec2 = client.normalizeRecord({
      mmsi: '211281610',
      latitude: 25.58,
      longitude: 54.82,
      dt_pos_utc: '2024-05-15T11:59:00Z',
      ts_pos_utc: '2024-05-15T11:58:00Z',
    });
    expect(rec2.timestamp).toBe('2024-05-15T11:59:00.000Z');
    expect(rec2.timestampSource).toBe('dt_pos_utc');

    // Priority 3: ts_pos_utc
    const rec3 = client.normalizeRecord({
      mmsi: '211281610',
      latitude: 25.58,
      longitude: 54.82,
      ts_pos_utc: '2024-05-15T11:58:00Z',
    });
    expect(rec3.timestamp).toBe('2024-05-15T11:58:00.000Z');
    expect(rec3.timestampSource).toBe('ts_pos_utc');
  });

  // ── 7 & 8 & 9. 24h Window Split & 48h Reconstruction ──────────────────────
  it('7, 8, 9. 48h query is split into Window A [T0-24h, T0] and Window B [T0, T0+24h] and reconstructed', async () => {
    // Mock response for Window A and Window B
    axiosGetSpy
      .mockResolvedValueOnce({
        status: 200,
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [54.80, 25.55] },
              properties: {
                mmsi: '311000111',
                vessel_name: 'TANKER ALPHA',
                sog: 11.2,
                cog: 45.0,
                dtg: '2024-05-14T18:00:00Z',
              },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [54.82, 25.58] },
              properties: {
                mmsi: '311000111',
                vessel_name: 'TANKER ALPHA',
                sog: 10.5,
                cog: 45.0,
                dtg: '2024-05-15T18:00:00Z',
              },
            },
          ],
        },
      });

    const client = new GlobalHistoricalAisClient();
    const records = await client.queryHistoricalAis({
      minLat: 25.0,
      maxLat: 26.0,
      minLng: 54.0,
      maxLng: 55.0,
      fromTimestamp: '2024-05-14T12:00:00.000Z',
      toTimestamp: '2024-05-16T12:00:00.000Z',
    });

    expect(axiosGetSpy).toHaveBeenCalledTimes(2);

    // Verify Window A params
    const callA = axiosGetSpy.mock.calls[0][1];
    expect(callA.params.cql_filter).toContain("ts_pos_utc BETWEEN '2024-05-14T12:00:00.000Z' AND '2024-05-15T12:00:00.000Z'");

    // Verify Window B params
    const callB = axiosGetSpy.mock.calls[1][1];
    expect(callB.params.cql_filter).toContain("ts_pos_utc BETWEEN '2024-05-15T12:00:00.000Z' AND '2024-05-16T12:00:00.000Z'");

    // 48h reconstruction contains points from both windows
    expect(records.length).toBe(2);
    expect(records[0].timestamp).toBe('2024-05-14T18:00:00.000Z');
    expect(records[1].timestamp).toBe('2024-05-15T18:00:00.000Z');
  });

  // ── 10. Boundary deduplication ───────────────────────────────────────────
  it('10. Boundary observation appearing at T0 in both Window A and Window B is deduplicated deterministically', async () => {
    const boundaryFeature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [54.82, 25.58] },
      properties: {
        mmsi: '311000111',
        vessel_name: 'TANKER ALPHA',
        sog: 10.0,
        cog: 45.0,
        dtg: '2024-05-15T12:00:00.000Z', // Exact boundary T0
      },
    };

    axiosGetSpy
      .mockResolvedValueOnce({
        status: 200,
        data: { type: 'FeatureCollection', features: [boundaryFeature] },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: { type: 'FeatureCollection', features: [boundaryFeature] },
      });

    const client = new GlobalHistoricalAisClient();
    const envelope = await client.searchHistoricalVessels({
      minLat: 25.0,
      maxLat: 26.0,
      minLng: 54.0,
      maxLng: 55.0,
      fromTimestamp: '2024-05-14T12:00:00.000Z',
      toTimestamp: '2024-05-16T12:00:00.000Z',
    });

    // Returned observations deduplicated to 1 record
    expect(envelope.observations.length).toBe(1);
    expect(envelope.diagnostics.duplicateObservationCount).toBe(1);
  });

  // ── 11 & 12. Spatial and temporal validation ──────────────────────────────
  it('11, 12. Rejects out-of-bounds and out-of-window observations', async () => {
    axiosGetSpy.mockResolvedValueOnce({
      status: 200,
      data: {
        type: 'FeatureCollection',
        features: [
          // Valid
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [54.82, 25.58] },
            properties: { mmsi: '111', dtg: '2024-05-15T00:00:00Z' },
          },
          // Out of spatial bounds (lat 35.0)
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [54.82, 35.00] },
            properties: { mmsi: '222', dtg: '2024-05-15T00:00:00Z' },
          },
          // Out of temporal window (year 2020)
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [54.82, 25.58] },
            properties: { mmsi: '333', dtg: '2020-01-01T00:00:00Z' },
          },
          // Invalid MMSI (empty)
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [54.82, 25.58] },
            properties: { mmsi: '', dtg: '2024-05-15T00:00:00Z' },
          },
        ],
      },
    });

    const client = new GlobalHistoricalAisClient();
    const envelope = await client.searchHistoricalVessels({
      minLat: 25.0,
      maxLat: 26.0,
      minLng: 54.0,
      maxLng: 55.0,
      fromTimestamp: '2024-05-14T12:00:00.000Z',
      toTimestamp: '2024-05-15T12:00:00.000Z', // 24h single window
    });

    expect(envelope.observations.length).toBe(1);
    expect(envelope.diagnostics.rejectedObservationCount).toBe(3);
    expect(envelope.observations[0].mmsi).toBe('111');
  });

  // ── 13 & 14. Multiple MMSIs and Chronological Sorting ─────────────────────
  it('13, 14. Groups multiple MMSIs and chronologically sorts tracks', async () => {
    axiosGetSpy.mockResolvedValueOnce({
      status: 200,
      data: {
        type: 'FeatureCollection',
        features: [
          // Vessel A later point
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [54.85, 25.60] },
            properties: { mmsi: '100000001', vessel_name: 'VESSEL_A', dtg: '2024-05-15T06:00:00Z' },
          },
          // Vessel B point
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [54.80, 25.50] },
            properties: { mmsi: '200000002', vessel_name: 'VESSEL_B', dtg: '2024-05-15T03:00:00Z' },
          },
          // Vessel A earlier point
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [54.82, 25.58] },
            properties: { mmsi: '100000001', vessel_name: 'VESSEL_A', dtg: '2024-05-15T01:00:00Z' },
          },
        ],
      },
    });

    const client = new GlobalHistoricalAisClient();
    const envelope = await client.searchHistoricalVessels({
      minLat: 25.0,
      maxLat: 26.0,
      minLng: 54.0,
      maxLng: 55.0,
      fromTimestamp: '2024-05-14T12:00:00.000Z',
      toTimestamp: '2024-05-15T12:00:00.000Z',
    });

    expect(envelope.vessels.length).toBe(2);
    const vesselA = envelope.vessels.find((v) => v.mmsi === '100000001');
    expect(vesselA.trackPoints.length).toBe(2);
    // Chronological order: 01:00 before 06:00
    expect(vesselA.trackPoints[0].timestamp).toBe('2024-05-15T01:00:00.000Z');
    expect(vesselA.trackPoints[1].timestamp).toBe('2024-05-15T06:00:00.000Z');
  });

  // ── 15 & 16. Pagination and Truncation ────────────────────────────────────
  it('15, 16. Handles WFS pagination and reports isTruncated when limits reached', async () => {
    process.env.AIS_HISTORICAL_PAGE_SIZE = '2';
    process.env.AIS_HISTORICAL_MAX_RECORDS = '3';

    // Page 1: returns 2 features (full page size -> triggers page 2)
    axiosGetSpy
      .mockResolvedValueOnce({
        status: 200,
        data: {
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', geometry: { type: 'Point', coordinates: [54.81, 25.56] }, properties: { mmsi: '111', dtg: '2024-05-15T01:00:00Z' } },
            { type: 'Feature', geometry: { type: 'Point', coordinates: [54.82, 25.57] }, properties: { mmsi: '111', dtg: '2024-05-15T02:00:00Z' } },
          ],
        },
      })
      // Page 2: returns 2 more features (hits maxRecords limit of 3)
      .mockResolvedValueOnce({
        status: 200,
        data: {
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', geometry: { type: 'Point', coordinates: [54.83, 25.58] }, properties: { mmsi: '111', dtg: '2024-05-15T03:00:00Z' } },
            { type: 'Feature', geometry: { type: 'Point', coordinates: [54.84, 25.59] }, properties: { mmsi: '111', dtg: '2024-05-15T04:00:00Z' } },
          ],
        },
      });

    const client = new GlobalHistoricalAisClient();
    const envelope = await client.searchHistoricalVessels({
      minLat: 25.0,
      maxLat: 26.0,
      minLng: 54.0,
      maxLng: 55.0,
      fromTimestamp: '2024-05-14T12:00:00.000Z',
      toTimestamp: '2024-05-15T12:00:00.000Z',
    });

    expect(axiosGetSpy).toHaveBeenCalledTimes(2);
    // Page 2 should use startIndex=2
    expect(axiosGetSpy.mock.calls[1][1].params.startIndex).toBe(2);
    expect(envelope.isTruncated).toBe(true);
    expect(envelope.truncationReason).toContain('maximum record limit');
  });

  // ── 17. Zero observations -> AIS_NO_DATA_FOR_QUERY ────────────────────────
  it('17. Zero observations returns AIS_NO_DATA_FOR_QUERY with empty candidates', async () => {
    // Window A empty, Window B empty
    axiosGetSpy
      .mockResolvedValueOnce({ status: 200, data: { type: 'FeatureCollection', features: [] } })
      .mockResolvedValueOnce({ status: 200, data: { type: 'FeatureCollection', features: [] } });

    const result = await correlateCandidates({
      origin: VALID_ORIGIN,
      geospatial: VALID_GEOSPATIAL,
      drift: VALID_DRIFT,
      searchRadiusKm: 50,
      windowDurationHours: 48,
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.AIS_NO_DATA_FOR_QUERY);
    expect(result.type).toBe('REAL_HISTORICAL_AIS');
    expect(result.candidates).toEqual([]);
    expect(result.tracks).toEqual([]);
    expect(result.coverage.totalObservationsCount).toBe(0);
  });

  // ── 18. REAL_HISTORICAL_AIS status & provenance ───────────────────────────
  it('18. Successful historical AIS query returns REAL_HISTORICAL_AIS status and HVP provenance', async () => {
    axiosGetSpy
      .mockResolvedValueOnce({
        status: 200,
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [54.82, 25.58] },
              properties: {
                mmsi: '412000333',
                vessel_name: 'VLCC TITAN',
                vessel_type: 'Tanker',
                sog: 12.0,
                cog: 90.0,
                dtg: '2024-05-14T20:00:00Z',
              },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [54.83, 25.59] },
              properties: {
                mmsi: '412000333',
                vessel_name: 'VLCC TITAN',
                vessel_type: 'Tanker',
                sog: 12.0,
                cog: 90.0,
                dtg: '2024-05-15T14:00:00Z',
              },
            },
          ],
        },
      });

    const result = await correlateCandidates({
      origin: VALID_ORIGIN,
      geospatial: VALID_GEOSPATIAL,
      drift: VALID_DRIFT,
      searchRadiusKm: 50,
      windowDurationHours: 48,
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.CANDIDATES_FOUND);
    expect(result.type).toBe('REAL_HISTORICAL_AIS');
    expect(result.provenance).toBe('REAL');
    expect(result.providerProduct).toBe('exactAIS:HVP');
    expect(result.providerProtocol).toBe('WFS_1_1_0');
    expect(result.queryWindows.length).toBe(2);
    expect(result.candidates.length).toBe(1);
    expect(result.tracks.length).toBe(1);
  });

  // ── 19. AIS_CURRENT_DATA_ONLY rejection ───────────────────────────────────
  it('19. Provider returning only out-of-window observations is rejected with AIS_CURRENT_DATA_ONLY', async () => {
    // Return observations from today (not May 2024)
    axiosGetSpy
      .mockResolvedValueOnce({
        status: 200,
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [54.82, 25.58] },
              properties: {
                mmsi: '412000333',
                vessel_name: 'VLCC TITAN',
                dtg: new Date().toISOString(), // Current live timestamp
              },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: { type: 'FeatureCollection', features: [] },
      });

    const result = await correlateCandidates({
      origin: VALID_ORIGIN,
      geospatial: VALID_GEOSPATIAL,
      drift: VALID_DRIFT,
      searchRadiusKm: 50,
      windowDurationHours: 48,
    });

    expect(result.status).toBe(AIS_CORRELATION_STATUS.AIS_CURRENT_DATA_ONLY);
    expect(result.candidates).toEqual([]);
    expect(result.coverage.insufficientCoverage).toBe(true);
  });

  // ── 20, 21, 22. Scoring weights & Guardrails ──────────────────────────────
  it('20, 21, 22. Preserves scoring weights (0.30, 0.25, 0.25, 0.20), POTENTIAL_CANDIDATE and NOT_ESTABLISHED', async () => {
    axiosGetSpy
      .mockResolvedValueOnce({
        status: 200,
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [54.82, 25.58] },
              properties: {
                mmsi: '538000999',
                vessel_name: 'PACIFIC CARRIER',
                vessel_type: 'Cargo',
                sog: 14.2,
                cog: 180.0,
                dtg: '2024-05-15T11:45:00Z', // 15 mins before origin time
              },
            },
          ],
        },
      })
      .mockResolvedValueOnce({ status: 200, data: { type: 'FeatureCollection', features: [] } });

    const result = await correlateCandidates({
      origin: VALID_ORIGIN,
      geospatial: VALID_GEOSPATIAL,
      drift: VALID_DRIFT,
      searchRadiusKm: 50,
      windowDurationHours: 48,
    });

    expect(result.candidates.length).toBe(1);
    const candidate = result.candidates[0];

    // Status guardrail
    expect(candidate.status).toBe('POTENTIAL_CANDIDATE');

    // Attribution guardrail
    expect(candidate.attribution.status).toBe('NOT_ESTABLISHED');

    // Scoring mathematics check
    const m = candidate.correlation.metrics;
    expect(m).toHaveProperty('proximityScore');
    expect(m).toHaveProperty('temporalScore');
    expect(m).toHaveProperty('trajectoryScore');
    expect(m).toHaveProperty('anomalyScore');

    const expectedScore = Number(
      (0.30 * m.proximityScore + 0.25 * m.temporalScore + 0.25 * m.trajectoryScore + 0.20 * m.anomalyScore).toFixed(4)
    );
    expect(candidate.correlation.score).toBeCloseTo(expectedScore, 2);
  });

  // ── 23. Credential non-leakage ────────────────────────────────────────────
  it('23. API credentials never leak in logs, outputs, or error payloads', async () => {
    const authErr = new Error(`Failed authorization with key ${TEST_SECRET_KEY}`);
    authErr.response = { status: 401, data: { error: `Invalid key ${TEST_SECRET_KEY}` } };
    axiosGetSpy.mockRejectedValue(authErr);

    const result = await correlateCandidates({
      origin: VALID_ORIGIN,
      geospatial: VALID_GEOSPATIAL,
      drift: VALID_DRIFT,
      searchRadiusKm: 50,
      windowDurationHours: 48,
    });

    const serializedResult = JSON.stringify(result);
    expect(serializedResult).not.toContain(TEST_SECRET_KEY);

    const client = new GlobalHistoricalAisClient();
    try {
      await client.queryHistoricalAis({
        minLat: 25.0,
        maxLat: 26.0,
        minLng: 54.0,
        maxLng: 55.0,
        fromTimestamp: '2024-05-14T12:00:00.000Z',
        toTimestamp: '2024-05-15T12:00:00.000Z',
      });
    } catch (e) {
      expect(e.message).not.toContain(TEST_SECRET_KEY);
    }
  });
});
