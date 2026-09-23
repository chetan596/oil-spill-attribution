/**
 * marinetraffic.client.js
 * Phase 16.4 Part 7.1 — MarineTraffic Real Historical AIS Provider
 *
 * Connects to MarineTraffic Historical Vessel Positions API.
 * API key is stored strictly on the backend and NEVER exposed to frontend clients.
 */

const axios = require("axios");
const AisProvider = require("./ais.provider");
const logger = require("../../logger");

class MarineTrafficClient extends AisProvider {
  constructor() {
    super("MARINETRAFFIC", "REAL");
    this.apiKey = process.env.AIS_API_KEY || process.env.MARINETRAFFIC_API_KEY || null;
    this.baseUrl = process.env.MARINETRAFFIC_BASE_URL || "https://services.marinetraffic.com/api/exportvesseltrack/v:3";
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * Query historical AIS vessel telemetry across bounding box and temporal window.
   */
  async queryHistoricalAis({ minLat, maxLat, minLng, maxLng, fromTimestamp, toTimestamp }) {
    if (!this.isConfigured()) {
      throw new Error("MarineTraffic AIS provider is not configured (missing AIS_API_KEY).");
    }

    const fromDate = new Date(fromTimestamp);
    const toDate = new Date(toTimestamp);
    const daysDiff = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / (24 * 3600 * 1000)));

    logger.info("[MarineTrafficClient] Querying historical AIS positions", {
      minLat,
      maxLat,
      minLng,
      maxLng,
      fromTimestamp,
      toTimestamp,
      daysDiff,
    });

    try {
      const response = await axios.get(this.baseUrl, {
        params: {
          key: this.apiKey,
          min_lat: minLat,
          max_lat: maxLat,
          min_lon: minLng,
          max_lon: maxLng,
          days: Math.min(daysDiff, 30),
          protocol: "jsono",
        },
        timeout: 15000,
      });

      const rows = Array.isArray(response.data)
        ? response.data
        : (response.data?.data || response.data?.DATA || []);

      return rows.map((r) => this.normalizeRecord(r));
    } catch (err) {
      logger.error("[MarineTrafficClient] Provider API request failed", {
        status: err.response?.status,
        message: err.message,
      });
      throw err;
    }
  }
}

module.exports = MarineTrafficClient;
