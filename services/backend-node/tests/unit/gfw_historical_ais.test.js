/**
 * GFW Historical AIS Unit Test Suite — Phase 16.4
 *
 * Comprehensive tests for Global Fishing Watch (GFW) historical AIS client,
 * provider factory, health diagnostics, and correlation guardrails:
 * 1. Configuration & Initialisation (API token, URL, headers)
 * 2. Error Mappings (401, 403, 429, 500, timeout)
 * 3. 4Wings Report Parsing & Aggregation
 * 4. Provider Factory Resolution & EXACTAIS_GWS Preservation
 * 5. Correlation Guardrails for GFW Vessel Presence
 * 6. Security & Token Confidentiality
 * 7. Health Check Diagnostics
 */

const axios = require('axios');
const GfwHistoricalAisClient = require('../../src/clients/ais/gfw-historical-ais.client');
const aisProviderFactory = require('../../src/clients/ais/ais.provider.factory');
const GlobalHistoricalAisClient = require('../../src/clients/ais/global-historical-ais.client');
const { correlateCandidates, AIS_CORRELATION_STATUS } = require('../../src/manual-analysis/aisCorrelationService');

describe('Phase 16.4 — GFW Historical AIS Provider Test Suite', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('1. Configuration & Initialisation', () => {
    it('1.1 should instantiate successfully with valid token and custom options', () => {
      const client = new GfwHistoricalAisClient({
        apiUrl: 'https://gateway.api.globalfishingwatch.org',
        apiToken: 'test-gfw-token-abc-123',
      });

      expect(client.provider).toBe('GLOBAL_FISHING_WATCH');
      expect(client.name).toBe('GLOBAL_FISHING_WATCH');
      expect(client.observationLevel).toBe('VESSEL_PRESENCE');
      expect(client.isConfigured()).toBe(true);
    });

    it('1.2 should report isConfigured() as false when token is missing', () => {
      const client = new GfwHistoricalAisClient({
        apiUrl: 'https://gateway.api.globalfishingwatch.org',
        apiToken: '',
      });

      expect(client.isConfigured()).toBe(false);
    });

    it('1.3 should reject queryHistoricalAis when not configured', async () => {
      const client = new GfwHistoricalAisClient({
        apiUrl: 'https://gateway.api.globalfishingwatch.org',
        apiToken: '',
      });

      await expect(
        client.queryHistoricalAis({
          lat: 25.7,
          lng: 54.3,
          radiusKm: 50,
          fromTimestamp: '2019-09-08T00:00:00Z',
          toTimestamp: '2019-09-10T00:00:00Z',
        })
      ).rejects.toMatchObject({
        code: 'HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED',
      });
    });

    it('1.4 should reject queryHistoricalAis when temporal window is missing or invalid', async () => {
      const client = new GfwHistoricalAisClient({
        apiUrl: 'https://gateway.api.globalfishingwatch.org',
        apiToken: 'valid-token',
      });

      await expect(
        client.queryHistoricalAis({
          lat: 25.7,
          lng: 54.3,
          radiusKm: 50,
          fromTimestamp: null,
          toTimestamp: null,
        })
      ).rejects.toMatchObject({
        code: 'AIS_INVALID_TEMPORAL_WINDOW',
      });
    });
  });

  describe('2. Error Status Code Mappings', () => {
    it('2.1 should map 401 Unauthorized to AIS_PROVIDER_AUTH_FAILED and mask token', async () => {
      const secretToken = 'secret-token-xyz-12345';
      const client = new GfwHistoricalAisClient({
        apiUrl: 'https://gateway.api.globalfishingwatch.org',
        apiToken: secretToken,
      });

      const error401 = new Error('Request failed with status code 401');
      error401.response = { status: 401, data: { messages: ['Invalid authorization token'] } };

      jest.spyOn(axios, 'post').mockRejectedValueOnce(error401);

      try {
        await client.queryHistoricalAis({
          lat: 25.7,
          lng: 54.3,
          radiusKm: 50,
          fromTimestamp: '2019-09-08T00:00:00Z',
          toTimestamp: '2019-09-10T00:00:00Z',
        });
        throw new Error('Should have failed');
      } catch (err) {
        expect(err.code).toBe('AIS_PROVIDER_AUTH_FAILED');
        expect(err.message).toContain('GFW API authentication failed');
        // Ensure secret token is NOT leaked in error
        expect(err.message).not.toContain(secretToken);
        expect(JSON.stringify(err)).not.toContain(secretToken);
      } finally {
        axios.post.mockRestore();
      }
    });

    it('2.2 should map 403 Forbidden to AIS_PROVIDER_ACCESS_DENIED', async () => {
      const client = new GfwHistoricalAisClient({
        apiUrl: 'https://gateway.api.globalfishingwatch.org',
        apiToken: 'test-token',
      });

      const error403 = new Error('Request failed with status code 403');
      error403.response = { status: 403, data: 'Access forbidden for dataset' };

      jest.spyOn(axios, 'post').mockRejectedValueOnce(error403);

      try {
        await client.queryHistoricalAis({
          lat: 25.7,
          lng: 54.3,
          radiusKm: 50,
          fromTimestamp: '2019-09-08T00:00:00Z',
          toTimestamp: '2019-09-10T00:00:00Z',
        });
        throw new Error('Should have failed');
      } catch (err) {
        expect(err.code).toBe('AIS_PROVIDER_ACCESS_DENIED');
      } finally {
        axios.post.mockRestore();
      }
    });

    it('2.3 should map 429 to AIS_PROVIDER_RATE_LIMITED', async () => {
      const client = new GfwHistoricalAisClient({
        apiUrl: 'https://gateway.api.globalfishingwatch.org',
        apiToken: 'test-token',
      });

      const error429 = new Error('Request failed with status code 429');
      error429.response = { status: 429, data: 'Rate limit exceeded' };

      jest.spyOn(axios, 'post').mockRejectedValueOnce(error429);

      try {
        await client.queryHistoricalAis({
          lat: 25.7,
          lng: 54.3,
          radiusKm: 50,
          fromTimestamp: '2019-09-08T00:00:00Z',
          toTimestamp: '2019-09-10T00:00:00Z',
        });
        throw new Error('Should have failed');
      } catch (err) {
        expect(err.code).toBe('AIS_PROVIDER_RATE_LIMITED');
      } finally {
        axios.post.mockRestore();
      }
    });

    it('2.4 should map 500 to AIS_PROVIDER_SERVER_ERROR', async () => {
      const client = new GfwHistoricalAisClient({
        apiUrl: 'https://gateway.api.globalfishingwatch.org',
        apiToken: 'test-token',
      });

      const error500 = new Error('Request failed with status code 500');
      error500.response = { status: 500, data: 'Internal Server Error' };

      jest.spyOn(axios, 'post').mockRejectedValueOnce(error500);

      try {
        await client.queryHistoricalAis({
          lat: 25.7,
          lng: 54.3,
          radiusKm: 50,
          fromTimestamp: '2019-09-08T00:00:00Z',
          toTimestamp: '2019-09-10T00:00:00Z',
        });
        throw new Error('Should have failed');
      } catch (err) {
        expect(err.code).toBe('AIS_PROVIDER_SERVER_ERROR');
      } finally {
        axios.post.mockRestore();
      }
    });

    it('2.5 should map AbortError / timeout to AIS_PROVIDER_TIMEOUT', async () => {
      const client = new GfwHistoricalAisClient({
        apiUrl: 'https://gateway.api.globalfishingwatch.org',
        apiToken: 'test-token',
      });

      const timeoutError = new Error('timeout of 45000ms exceeded');
      timeoutError.code = 'ECONNABORTED';

      jest.spyOn(axios, 'post').mockRejectedValueOnce(timeoutError);

      try {
        await client.queryHistoricalAis({
          lat: 25.7,
          lng: 54.3,
          radiusKm: 50,
          fromTimestamp: '2019-09-08T00:00:00Z',
          toTimestamp: '2019-09-10T00:00:00Z',
        });
        throw new Error('Should have failed');
      } catch (err) {
        expect(err.code).toBe('AIS_PROVIDER_TIMEOUT');
      } finally {
        axios.post.mockRestore();
      }
    });
  });

  describe('3. Response Parsing & Normalization', () => {
    it('3.1 should parse GFW 4Wings report response entries into aggregated vessels', async () => {
      const client = new GfwHistoricalAisClient({
        apiUrl: 'https://gateway.api.globalfishingwatch.org',
        apiToken: 'test-token',
      });

      const mockGfwResponse = {
        data: {
          entries: [
            {
              'public-global-presence:v4.0': [
                {
                  mmsi: '477995400',
                  shipname: 'PACIFIC RUBY',
                  imo: '9427380',
                  callsign: 'VRHN4',
                  flag: 'HKG',
                  vesselType: 'cargo',
                  hours: 4,
                  lat: 25.71,
                  lon: 54.29,
                  date: '2019-09-09T03:00:00.000Z',
                },
                {
                  mmsi: '477995400',
                  shipname: 'PACIFIC RUBY',
                  imo: '9427380',
                  callsign: 'VRHN4',
                  flag: 'HKG',
                  vesselType: 'cargo',
                  hours: 2,
                  lat: 25.72,
                  lon: 54.30,
                  date: '2019-09-09T04:00:00.000Z',
                },
                {
                  mmsi: '352001000',
                  shipname: 'EVER FORTUNE',
                  imo: '9850886',
                  flag: 'PAN',
                  vesselType: 'container',
                  hours: 3,
                  lat: 25.80,
                  lon: 54.40,
                  date: '2019-09-09T02:00:00.000Z',
                },
              ],
            },
          ],
        },
      };

      jest.spyOn(axios, 'post').mockResolvedValueOnce(mockGfwResponse);

      const envelope = await client.searchHistoricalVessels({
        minLat: 25.0,
        maxLat: 26.0,
        minLng: 54.0,
        maxLng: 55.0,
        fromTimestamp: '2019-09-08T00:00:00Z',
        toTimestamp: '2019-09-10T00:00:00Z',
      });

      axios.post.mockRestore();

      expect(envelope.status).toBe('SUCCESS');
      expect(envelope.provider).toBe('GLOBAL_FISHING_WATCH');
      expect(envelope.observationLevel).toBe('VESSEL_PRESENCE');
      expect(envelope.rawTracksAvailable).toBe(false);
      expect(envelope.cpaAvailable).toBe(false);
      expect(envelope.uniqueVesselCount).toBe(2);
      expect(envelope.vessels).toHaveLength(2);

      // Check PACIFIC RUBY aggregation
      const pacific = envelope.vessels.find((v) => v.mmsi === '477995400');
      expect(pacific).toBeDefined();
      expect(pacific.vesselName).toBe('PACIFIC RUBY');
      expect(pacific.imo).toBe('9427380');
      expect(pacific.presenceHours).toBe(6);
      expect(pacific.presenceCells).toHaveLength(2);
      // Guardrails
      expect(pacific.trackPoints).toEqual([]);
      expect(pacific.rawTracksAvailable).toBe(false);
      expect(pacific.cpaAvailable).toBe(false);
    });

    it('3.2 should handle empty entries array with zero vessels and AIS_NO_DATA_FOR_QUERY', async () => {
      const client = new GfwHistoricalAisClient({
        apiUrl: 'https://gateway.api.globalfishingwatch.org',
        apiToken: 'test-token',
      });

      jest.spyOn(axios, 'post').mockResolvedValueOnce({
        data: { entries: [{ 'public-global-presence:v4.0': [] }] },
      });

      const envelope = await client.searchHistoricalVessels({
        minLat: 25.0,
        maxLat: 26.0,
        minLng: 54.0,
        maxLng: 55.0,
        fromTimestamp: '2019-09-08T00:00:00Z',
        toTimestamp: '2019-09-10T00:00:00Z',
      });

      axios.post.mockRestore();

      expect(envelope.status).toBe('AIS_NO_DATA_FOR_QUERY');
      expect(envelope.uniqueVesselCount).toBe(0);
      expect(envelope.vessels).toHaveLength(0);
      expect(envelope.observationLevel).toBe('VESSEL_PRESENCE');
      expect(envelope.cpaAvailable).toBe(false);
    });
  });

  describe('4. Factory Resolution & Provider Preservation', () => {
    it('4.1 should return GfwHistoricalAisClient by default when GFW_API_TOKEN is present', () => {
      process.env.GFW_API_TOKEN = 'test-token-active';
      delete process.env.AIS_HISTORICAL_PROVIDER;

      const provider = aisProviderFactory.getHistoricalAisProvider();
      expect(provider).toBeInstanceOf(GfwHistoricalAisClient);
      expect(provider.provider).toBe('GLOBAL_FISHING_WATCH');
    });

    it('4.2 should return GlobalHistoricalAisClient when explicitly requested, preserving EXACTAIS_GWS', () => {
      process.env.GFW_API_TOKEN = 'test-token-active';

      const provider = aisProviderFactory.getHistoricalAisProvider('EXACTAIS_GWS');
      expect(provider).toBeInstanceOf(GlobalHistoricalAisClient);
      expect(provider.provider).toBe('EXACTAIS_GWS');
    });

    it('4.3 should return GfwHistoricalAisClient when explicitly requested as GLOBAL_FISHING_WATCH or GFW', () => {
      process.env.GFW_API_TOKEN = 'test-token-active';

      const provider1 = aisProviderFactory.getHistoricalAisProvider('GLOBAL_FISHING_WATCH');
      expect(provider1).toBeInstanceOf(GfwHistoricalAisClient);

      const provider2 = aisProviderFactory.getHistoricalAisProvider('GFW');
      expect(provider2).toBeInstanceOf(GfwHistoricalAisClient);
    });
  });

  describe('5. Correlation Guardrails for GFW Vessel Presence', () => {
    const canonicalGeospatial = {
      available: true,
      bounds: [
        [25.6, 54.1],
        [25.8, 54.4],
      ],
      pixelSize: [10, 10],
    };

    const canonicalOrigin = {
      status: 'ESTIMATED',
      estimatedPoint: { latitude: 25.706783, longitude: 54.288716 },
      uncertainty: { radiusKm: 2.5 },
      releaseTimeRange: {
        earliest: '2019-09-09T01:51:25Z',
        latest: '2019-09-09T03:51:25Z',
      },
    };

    const mockGfwVessels = [
      {
        mmsi: '477995400',
        shipname: 'PACIFIC RUBY',
        imo: '9427380',
        vesselType: 'cargo',
        flag: 'HKG',
        hours: 5,
        lat: 25.71,
        lon: 54.29,
        date: '2019-09-09T03:00:00.000Z',
      },
      {
        mmsi: '215123000',
        shipname: 'DISTANT VOYAGER',
        imo: '9123456',
        vesselType: 'tanker',
        flag: 'MLT',
        hours: 1,
        lat: 26.10,
        lon: 54.80,
        date: '2019-09-08T12:00:00.000Z',
      },
    ];

    it('5.1 should score presence cells and produce POTENTIAL_CANDIDATE candidates without CPA', async () => {
      const mockProvider = new GfwHistoricalAisClient({
        apiUrl: 'https://gateway.api.globalfishingwatch.org',
        apiToken: 'test-token',
      });

      jest.spyOn(axios, 'post').mockResolvedValueOnce({
        data: {
          entries: [{ 'public-global-presence:v4.0': mockGfwVessels }],
        },
      });

      const result = await correlateCandidates({
        geospatial: canonicalGeospatial,
        origin: canonicalOrigin,
        acquisitionTimestamp: '2019-09-09T03:51:25.000Z',
        searchRadiusKm: 50,
        jobId: 'test-job-gfw-guardrails',
        bypassCache: true,
        providerOverride: mockProvider,
      });

      axios.post.mockRestore();

      expect(result.status).toBe(AIS_CORRELATION_STATUS.CANDIDATES_FOUND);
      expect(result.observationLevel).toBe('VESSEL_PRESENCE');
      expect(result.candidates.length).toBeGreaterThan(0);

      const topCandidate = result.candidates[0];
      expect(topCandidate.vesselId.mmsi).toBe('477995400');
      expect(topCandidate.status).toBe('POTENTIAL_CANDIDATE');
      expect(topCandidate.observationLevel).toBe('VESSEL_PRESENCE');

      // MANDATORY GUARDRAIL 4: Never calculate CPA from GFW presence cells
      expect(topCandidate.correlation.cpaAvailable).toBe(false);
      expect(topCandidate.correlation.closestApproachKm).toBeNull();
      expect(topCandidate.correlation.closestApproachTimestamp).toBeNull();
      expect(topCandidate.correlation.rawTracksAvailable).toBe(false);
      expect(topCandidate.correlation.headingAvailable).toBe(false);
      expect(topCandidate.correlation.speedAvailable).toBe(false);

      // MANDATORY GUARDRAIL 7: Attribution remains strictly NOT_ESTABLISHED
      expect(topCandidate.attribution.status).toBe('NOT_ESTABLISHED');
      expect(topCandidate.attribution.label).toBe('ATTRIBUTION: NOT ESTABLISHED');
      expect(topCandidate.attribution.scientificNotice).toContain('NOT establish legal or factual responsibility');
    });

    it('5.2 should set rawTracksAvailable to false and cpaAvailable to false on all candidates', async () => {
      const mockProvider = new GfwHistoricalAisClient({
        apiUrl: 'https://gateway.api.globalfishingwatch.org',
        apiToken: 'test-token',
      });

      jest.spyOn(axios, 'post').mockResolvedValueOnce({
        data: {
          entries: [{ 'public-global-presence:v4.0': mockGfwVessels }],
        },
      });

      const result = await correlateCandidates({
        geospatial: canonicalGeospatial,
        origin: canonicalOrigin,
        acquisitionTimestamp: '2019-09-09T03:51:25.000Z',
        searchRadiusKm: 50,
        jobId: 'test-job-gfw-tracks-guard',
        bypassCache: true,
        providerOverride: mockProvider,
      });

      axios.post.mockRestore();

      result.candidates.forEach((cand) => {
        expect(cand.correlation.cpaAvailable).toBe(false);
        expect(cand.correlation.rawTracksAvailable).toBe(false);
        expect(cand.attribution.status).toBe('NOT_ESTABLISHED');
        expect(cand.trackPoints || []).toHaveLength(0);
      });
    });
  });

  describe('6. Security & Token Confidentiality', () => {
    it('6.1 should never include GFW_API_TOKEN in error objects or strings', async () => {
      const secretToken = 'gfw-top-secret-token-do-not-leak';
      const client = new GfwHistoricalAisClient({
        apiUrl: 'https://gateway.api.globalfishingwatch.org',
        apiToken: secretToken,
      });

      const netError = new Error('getaddrinfo ENOTFOUND gateway.api.globalfishingwatch.org');
      netError.code = 'ENOTFOUND';

      jest.spyOn(axios, 'post').mockRejectedValueOnce(netError);

      try {
        await client.queryHistoricalAis({
          lat: 25.7,
          lng: 54.3,
          radiusKm: 50,
          fromTimestamp: '2019-09-08T00:00:00Z',
          toTimestamp: '2019-09-10T00:00:00Z',
        });
      } catch (err) {
        expect(err.message).not.toContain(secretToken);
        expect(JSON.stringify(err)).not.toContain(secretToken);
      } finally {
        axios.post.mockRestore();
      }
    });

    it('6.2 should mask token in client.maskedToken', () => {
      const client = new GfwHistoricalAisClient({
        apiUrl: 'https://gateway.api.globalfishingwatch.org',
        apiToken: 'gfw_live_token_1234567890abcdef',
      });

      expect(client.maskedToken).not.toBe('gfw_live_token_1234567890abcdef');
      expect(client.maskedToken).toMatch(/^gfw_live\.\.\.[a-f0-9]+$/);
    });
  });

  describe('7. Health Diagnostics', () => {
    it('7.1 should return structured unconfigured health report when token is absent', async () => {
      const client = new GfwHistoricalAisClient({
        apiUrl: 'https://gateway.api.globalfishingwatch.org',
        apiToken: '',
      });

      const health = await client.checkHealth();

      expect(health.provider).toBe('GLOBAL_FISHING_WATCH');
      expect(health.configured).toBe(false);
      expect(health.authenticated).toBe(false);
      expect(health.observationLevel).toBe('VESSEL_PRESENCE');
      expect(health.rawTracks).toBe(false);
      expect(health.historicalCoverage).toBe('SUPPORTED');
    });

    it('7.2 should return authenticated: true when datasets test probe succeeds', async () => {
      const client = new GfwHistoricalAisClient({
        apiUrl: 'https://gateway.api.globalfishingwatch.org',
        apiToken: 'valid-test-token',
      });

      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: { entries: [{ id: 'public-global-presence:latest' }] },
      });

      const health = await client.checkHealth();
      axios.get.mockRestore();

      expect(health.provider).toBe('GLOBAL_FISHING_WATCH');
      expect(health.configured).toBe(true);
      expect(health.authenticated).toBe(true);
      expect(health.observationLevel).toBe('VESSEL_PRESENCE');
      expect(health.rawTracks).toBe(false);
    });
  });
});
