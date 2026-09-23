/**
 * aisstream.client.js
 * Phase 16.4 Part 7.1 — AISStream Real Provider Client
 *
 * Connects to AISStream provider API.
 * API key is stored strictly on the backend and NEVER exposed to frontend clients.
 */

const axios = require("axios");
const AisProvider = require("./ais.provider");
const logger = require("../../logger");

class AisStreamClient extends AisProvider {
  constructor() {
    super("AISSTREAM", "REAL");
    this.apiKey = process.env.AISSTREAM_API_KEY || process.env.AIS_API_KEY || null;
    this.baseUrl = process.env.AISSTREAM_BASE_URL || "https://api.aisstream.io/v1/historical";
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async queryHistoricalAis({ minLat, maxLat, minLng, maxLng, fromTimestamp, toTimestamp }) {
    if (!this.isConfigured()) {
      throw new Error("AISStream provider is not configured (missing AISSTREAM_API_KEY).");
    }

    logger.info("[AisStreamClient] Querying AISStream historical telemetry", {
      minLat,
      maxLat,
      minLng,
      maxLng,
      fromTimestamp,
      toTimestamp,
    });

    try {
      const response = await axios.post(
        this.baseUrl,
        {
          apiKey: this.apiKey,
          boundingBox: [[minLat, minLng], [maxLat, maxLng]],
          fromTime: fromTimestamp,
          toTime: toTimestamp,
        },
        { timeout: 15000 }
      );

      const positions = Array.isArray(response.data)
        ? response.data
        : (response.data?.positions || response.data?.data || []);

      return positions.map((p) => this.normalizeRecord(p));
    } catch (err) {
      logger.error("[AisStreamClient] Provider API request failed", {
        status: err.response?.status,
        message: err.message,
      });
      throw err;
    }
  }
}

module.exports = AisStreamClient;
