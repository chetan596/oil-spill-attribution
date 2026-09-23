/**
 * openseafeed.client.js
 * Phase 16.4 Part 8 — OpenSeaFeed Real AIS Provider
 *
 * Backend-only integration with OpenSeaFeed (https://openseafeed.com/).
 * OpenSeaFeed is a community-owned, open-source AIS network.
 *
 * API Capabilities (verified from official docs & upstream source):
 *   - GET /v1/snapshot   — Full fleet CURRENT state (REST, 1-10 min freshness)
 *   - wss /v1/stream     — Live WebSocket, aisstream.io-compatible
 *   - wss /v1/ingest     — Feed contribution
 *   - GET /v1/stations   — Coverage stats
 *   - History is archived to ClickHouse internally, but NO public REST historical
 *     endpoint is currently documented or exposed in the public API.
 *
 * SEPARATION OF SNAPSHOT AND HISTORICAL AIS:
 *   - searchCurrentVessels() / queryCurrentAis() queries /v1/snapshot and returns
 *     current vessel positions as REAL_CURRENT_AIS.
 *   - searchHistoricalVessels() / queryHistoricalAis() requires a dedicated historical
 *     API. When none is configured, it explicitly throws/returns AIS_HISTORICAL_DATA_UNAVAILABLE.
 *   - NEVER substitutes /v1/snapshot for a historical query.
 */

const axios = require("axios");
const AisProvider = require("./ais.provider");
const logger = require("../../logger");

class OpenSeaFeedClient extends AisProvider {
  constructor() {
    super("OPENSEAFEED", "REAL");
    this.apiKey = process.env.OPENSEAFEED_API_KEY || null;
    this.baseUrl = process.env.OPENSEAFEED_BASE_URL || "https://stream.openseafeed.com";
    this.historicalUrl = process.env.OPENSEAFEED_HISTORICAL_URL || null;
  }

  /**
   * OpenSeaFeed is configured for current telemetry (free tier requires no key).
   * @returns {boolean}
   */
  isConfigured() {
    return true;
  }

  /**
   * Whether this provider has an API key configured.
   * @returns {boolean}
   */
  hasApiKey() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * Whether this environment has a configured historical endpoint for OpenSeaFeed.
   * @returns {boolean}
   */
  hasHistoricalAccess() {
    return Boolean(this.historicalUrl && this.historicalUrl.trim().length > 0);
  }

  /**
   * Query CURRENT fleet snapshot from OpenSeaFeed.
   *
   * @param {Object} query
   * @param {number} query.minLat
   * @param {number} query.maxLat
   * @param {number} query.minLng
   * @param {number} query.maxLng
   * @returns {Promise<Array<Object>>} Normalized AIS records
   */
  async queryCurrentAis({ minLat, maxLat, minLng, maxLng }) {
    logger.info("[OpenSeaFeedClient] Querying current fleet snapshot", {
      minLat,
      maxLat,
      minLng,
      maxLng,
      hasApiKey: this.hasApiKey(),
    });

    try {
      const headers = {};
      if (this.hasApiKey()) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      const response = await axios.get(`${this.baseUrl}/v1/snapshot`, {
        headers,
        timeout: 15000,
      });

      const allVessels = Array.isArray(response.data)
        ? response.data
        : (response.data?.vessels || response.data?.data || response.data?.features || []);

      const inArea = allVessels.filter((v) => {
        const lat = Number(v.latitude ?? v.lat ?? v.LAT);
        const lng = Number(v.longitude ?? v.lng ?? v.lon ?? v.LON);
        if (isNaN(lat) || isNaN(lng)) return false;
        return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
      });

      logger.info("[OpenSeaFeedClient] Snapshot filtered to bounding box", {
        totalVessels: allVessels.length,
        inBoundingBox: inArea.length,
      });

      return inArea.map((v) => this.normalizeRecord(v));
    } catch (err) {
      this._handleAxiosError(err, "current fleet snapshot");
    }
  }

  /**
   * Query HISTORICAL vessel observations from OpenSeaFeed.
   *
   * CRITICAL ARCHITECTURAL RULE:
   * Do NOT call /v1/snapshot here. A snapshot is NOT historical AIS.
   * If a dedicated historical endpoint is configured (OPENSEAFEED_HISTORICAL_URL),
   * query it. Otherwise, throw AIS_HISTORICAL_DATA_UNAVAILABLE.
   *
   * @param {Object} query
   * @param {number} query.minLat
   * @param {number} query.maxLat
   * @param {number} query.minLng
   * @param {number} query.maxLng
   * @param {string} query.fromTimestamp
   * @param {string} query.toTimestamp
   * @returns {Promise<Array<Object>>} Normalized historical AIS records
   */
  async queryHistoricalAis({ minLat, maxLat, minLng, maxLng, fromTimestamp, toTimestamp }) {
    logger.info("[OpenSeaFeedClient] Historical AIS query requested", {
      minLat,
      maxLat,
      minLng,
      maxLng,
      fromTimestamp,
      toTimestamp,
      hasHistoricalUrl: this.hasHistoricalAccess(),
    });

    if (!this.hasHistoricalAccess()) {
      const err = new Error(
        "AIS_HISTORICAL_DATA_UNAVAILABLE: OpenSeaFeed does not provide a public REST historical query endpoint " +
        "for this query/tier/environment. Live fleet snapshots cannot be substituted for historical investigations."
      );
      err.code = "AIS_HISTORICAL_DATA_UNAVAILABLE";
      logger.warn(`[OpenSeaFeedClient] ${err.message}`);
      throw err;
    }

    try {
      const headers = {};
      if (this.hasApiKey()) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      const response = await axios.get(this.historicalUrl, {
        headers,
        params: { minLat, maxLat, minLng, maxLng, from: fromTimestamp, to: toTimestamp },
        timeout: 15000,
      });

      const vessels = Array.isArray(response.data)
        ? response.data
        : (response.data?.vessels || response.data?.records || []);

      return vessels.map((v) => this.normalizeRecord(v));
    } catch (err) {
      this._handleAxiosError(err, "historical query");
    }
  }

  _handleAxiosError(err, opName) {
    if (err.code === "AIS_HISTORICAL_DATA_UNAVAILABLE") {
      throw err;
    }

    if (err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
      const timeoutErr = new Error(`OpenSeaFeed ${opName} request timed out: ${err.message}`);
      timeoutErr.code = "AIS_PROVIDER_TIMEOUT";
      throw timeoutErr;
    }

    if (err.response) {
      const statusCode = err.response.status;
      if (statusCode === 401 || statusCode === 403) {
        const authErr = new Error(`OpenSeaFeed ${opName} authentication failed (HTTP ${statusCode})`);
        authErr.code = "AIS_PROVIDER_AUTH_FAILED";
        throw authErr;
      }
    }

    if (err.code === "ENOTFOUND" || err.code === "ECONNREFUSED" || err.code === "ECONNRESET") {
      const netErr = new Error(`OpenSeaFeed ${opName} unreachable: ${err.message}`);
      netErr.code = "AIS_PROVIDER_UNAVAILABLE";
      throw netErr;
    }

    logger.error(`[OpenSeaFeedClient] Provider API request failed during ${opName}`, {
      status: err.response?.status,
      message: err.message,
      code: err.code,
    });
    throw err;
  }
}

module.exports = OpenSeaFeedClient;
