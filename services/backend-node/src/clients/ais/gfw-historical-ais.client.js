/**
 * gfw-historical-ais.client.js
 * Phase 16.4 — Global Fishing Watch (GFW) Historical AIS Client
 *
 * Implements authoritative historical AIS vessel presence retrieval using the
 * official Global Fishing Watch (GFW) 4Wings Report API.
 *
 * OFFICIAL PRODUCT SPECIFICATION:
 * - Default Gateway: https://gateway.api.globalfishingwatch.org/v3/4wings/report
 * - Dataset: public-global-presence:latest (resolves to public-global-presence:v4.0)
 * - Observation Level: VESSEL_PRESENCE (hourly presence in high-resolution grid cells)
 * - Temporal Resolution: HOURLY
 * - Spatial Resolution: HIGH (0.01-degree grid centers)
 *
 * CRITICAL SCIENTIFIC & ATTRIBUTION GUARDRAILS:
 * - Dataset provides aggregated vessel presence, NOT raw high-frequency AIS positions.
 * - ZERO fabrication of raw lat/lon coordinates.
 * - ZERO fabrication of vessel tracks or polylines (rawTracksAvailable: false).
 * - ZERO calculation of Closest Point of Approach (cpaAvailable: false).
 * - ZERO manufacture of COG, SOG, heading, or trajectory consistency.
 * - Identified vessels are strictly POTENTIAL_CANDIDATE.
 * - Final attribution state is strictly NOT_ESTABLISHED.
 * - API Token is strictly backend-only and NEVER leaked or logged.
 */

const axios = require("axios");
const AisProvider = require("./ais.provider");
const config = require("../../config/env");
const logger = require("../../logger");

class GfwHistoricalAisClient extends AisProvider {
  constructor(options = {}) {
    super("GLOBAL_FISHING_WATCH", "REAL");

    this.apiUrl = (
      options.apiUrl ||
      config.gfwApiUrl ||
      process.env.GFW_API_URL ||
      "https://gateway.api.globalfishingwatch.org"
    ).trim();

    this.apiToken = (
      options.apiToken !== undefined
        ? options.apiToken
        : (config.gfwApiToken ||
           process.env.GFW_API_TOKEN ||
           process.env.AIS_HISTORICAL_API_KEY ||
           "")
    ).trim();

    this.timeoutMs = Number(options.timeoutMs || process.env.AIS_HISTORICAL_TIMEOUT_MS) || 45000;
    this.providerProduct = options.providerProduct || "public-global-presence:latest";
    this.providerProtocol = "REST_4WINGS";
    this.observationLevel = "VESSEL_PRESENCE";
    this.temporalResolution = "HOURLY";
    this.spatialResolution = "HIGH";
  }

  get provider() {
    return this.name;
  }

  get maskedToken() {
    if (!this.apiToken) return "UNCONFIGURED";
    if (this.apiToken.length <= 8) return "***";
    return `${this.apiToken.slice(0, 8)}...${this.apiToken.slice(-4)}`;
  }

  /**
   * Determine whether genuine GFW API credentials and endpoint are configured.
   * @returns {boolean}
   */
  isConfigured() {
    return Boolean(this.apiUrl && this.apiUrl.length > 0 && this.apiToken && this.apiToken.length > 0);
  }

  /**
   * Health and readiness audit for Global Fishing Watch provider.
   * Verifies configuration and tests connectivity without exposing secrets.
   *
   * @returns {Promise<Object>} Structured health diagnostics
   */
  async checkHealth() {
    const configured = this.isConfigured();

    if (!configured) {
      return {
        provider: this.name,
        configured: false,
        authenticated: false,
        dataset: this.providerProduct,
        observationLevel: this.observationLevel,
        rawTracks: false,
        historicalCoverage: "SUPPORTED",
        historicalQueryReady: false,
        status: "HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED",
        reason: "GFW_API_TOKEN is not configured in backend environment.",
      };
    }

    try {
      // Probe gateway API connectivity using lightweight datasets endpoint with pagination bounds
      const headers = this._buildHeaders();
      const probeUrl = `${this.apiUrl}/v3/datasets`;
      await axios.get(probeUrl, {
        headers,
        params: { limit: 1, offset: 0 },
        timeout: Math.min(this.timeoutMs, 10000),
      });

      return {
        provider: this.name,
        configured: true,
        authenticated: true,
        dataset: this.providerProduct,
        observationLevel: this.observationLevel,
        rawTracks: false,
        historicalCoverage: "SUPPORTED",
        historicalQueryReady: true,
        status: "READY",
        reason: "Global Fishing Watch 4Wings API reachable and authenticated.",
        details: {
          product: this.providerProduct,
          protocol: this.providerProtocol,
          temporalResolution: this.temporalResolution,
          spatialResolution: this.spatialResolution,
          gateway: this.apiUrl,
        },
      };
    } catch (err) {
      const isAuthFailed = err.response && (err.response.status === 401 || err.response.status === 403);
      const isRateLimited = err.response && err.response.status === 429;
      const status = isAuthFailed
        ? "AIS_PROVIDER_AUTH_FAILED"
        : (isRateLimited ? "AIS_PROVIDER_RATE_LIMITED" : "AIS_PROVIDER_UNAVAILABLE");

      return {
        provider: this.name,
        configured: true,
        authenticated: !isAuthFailed,
        dataset: this.providerProduct,
        observationLevel: this.observationLevel,
        rawTracks: false,
        historicalCoverage: "SUPPORTED",
        historicalQueryReady: false,
        status,
        reason: isAuthFailed
          ? "Global Fishing Watch token authentication failed (HTTP 401/403)."
          : (isRateLimited
            ? "Global Fishing Watch rate limit reached (HTTP 429)."
            : `Global Fishing Watch service unreachable: ${err.message}`),
      };
    }
  }

  /**
   * Query current AIS telemetry (Historical client does not satisfy live fleet queries).
   */
  async queryCurrentAis() {
    const err = new Error("AIS_HISTORICAL_DATA_UNAVAILABLE: GFW historical client cannot be queried for live current fleet snapshot.");
    err.code = "AIS_HISTORICAL_DATA_UNAVAILABLE";
    throw err;
  }

  /**
   * Query authentic historical AIS vessel presence within spatiotemporal AOI.
   *
   * @param {Object} query
   * @param {number} query.minLat
   * @param {number} query.maxLat
   * @param {number} query.minLng
   * @param {number} query.maxLng
   * @param {string} query.fromTimestamp - UTC ISO-8601 start
   * @param {string} query.toTimestamp - UTC ISO-8601 end
   * @param {Object} [query.aoiGeoJson] - Optional explicit GeoJSON polygon AOI
   * @returns {Promise<Array<Object>>} Normalized historical vessel presence records
   */
  async queryHistoricalAis(query = {}) {
    let { minLat, maxLat, minLng, maxLng, fromTimestamp, toTimestamp, startTime, endTime, aoiGeoJson, lat, lng, radiusKm } = query;
    fromTimestamp = fromTimestamp || startTime;
    toTimestamp = toTimestamp || endTime;

    if (minLat == null && lat != null) {
      const rKm = radiusKm || 50;
      const dLat = rKm / 111.0;
      const dLng = rKm / (111.0 * Math.cos(((lat || 0) * Math.PI) / 180));
      minLat = lat - dLat;
      maxLat = lat + dLat;
      minLng = (lng || 0) - dLng;
      maxLng = (lng || 0) + dLng;
    }

    logger.info("[GfwHistoricalAisClient] Preparing GFW 4Wings report historical presence query", {
      provider: this.name,
      product: this.providerProduct,
      minLat,
      maxLat,
      minLng,
      maxLng,
      fromTimestamp,
      toTimestamp,
      isConfigured: this.isConfigured(),
    });

    if (!this.isConfigured()) {
      const err = new Error(
        `HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED: Real historical AIS provider "${this.name}" is not configured. ` +
        "Set GFW_API_TOKEN in backend environment to enable Global Fishing Watch historical vessel presence retrieval."
      );
      err.code = "HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED";
      logger.warn(`[GfwHistoricalAisClient] ${err.message}`);
      throw err;
    }

    if (!fromTimestamp || !toTimestamp || typeof fromTimestamp !== "string" || typeof toTimestamp !== "string") {
      const err = new Error("fromTimestamp and toTimestamp are required ISO strings for historical AIS query");
      err.code = "AIS_INVALID_TEMPORAL_WINDOW";
      throw err;
    }

    // Resolve date-range for GFW 4Wings report (YYYY-MM-DD,YYYY-MM-DD)
    const startDate = fromTimestamp.slice(0, 10);
    const endDate = toTimestamp.slice(0, 10);
    const dateRangeStr = `${startDate},${endDate}`;

    // Resolve GeoJSON polygon: use caller-supplied AOI or build from bounding box
    const geojsonPayload = aoiGeoJson || this._createBboxGeoJson(minLat, maxLat, minLng, maxLng);

    const reportUrl = `${this.apiUrl}/v3/4wings/report`;
    const headers = this._buildHeaders();

    try {
      const response = await axios.post(
        reportUrl,
        { geojson: geojsonPayload },
        {
          params: {
            "datasets[0]": this.providerProduct,
            "temporal-resolution": this.temporalResolution,
            "spatial-resolution": this.spatialResolution,
            "date-range": dateRangeStr,
            format: "JSON",
          },
          headers,
          timeout: this.timeoutMs,
        }
      );

      const data = response.data || {};
      const entries = Array.isArray(data.entries) ? data.entries : [];
      let rawRecords = [];

      for (const entry of entries) {
        if (!entry || typeof entry !== "object") continue;
        for (const key of Object.keys(entry)) {
          if (Array.isArray(entry[key])) {
            rawRecords.push(...entry[key]);
          }
        }
      }

      logger.info("[GfwHistoricalAisClient] GFW 4Wings response received", {
        status: response.status,
        rawRecordsCount: rawRecords.length,
      });

      const normalized = rawRecords
        .map((raw) => this.normalizeRecord(raw))
        .filter(Boolean);

      return normalized;
    } catch (err) {
      this._handleAxiosError(err, "GFW 4Wings report historical query");
    }
  }

  /**
   * Search historical vessels and group presence records by unique vessel.
   *
   * @param {Object} query
   * @returns {Promise<Object>} Standardized envelope containing presence records and vessel summaries
   */
  async searchHistoricalVessels({ minLat, maxLat, minLng, maxLng, fromTimestamp, toTimestamp, aoiGeoJson }) {
    const records = await this.queryHistoricalAis({
      minLat,
      maxLat,
      minLng,
      maxLng,
      fromTimestamp,
      toTimestamp,
      aoiGeoJson,
    });

    const retrievedAt = new Date().toISOString();

    if (!records || records.length === 0) {
      return {
        type: "REAL_HISTORICAL_AIS",
        status: "AIS_NO_DATA_FOR_QUERY",
        provider: this.name,
        providerProduct: this.providerProduct,
        providerProtocol: this.providerProtocol,
        dataset: this.providerProduct,
        observationLevel: this.observationLevel,
        rawTracksAvailable: false,
        cpaAvailable: false,
        temporalResolution: this.temporalResolution,
        spatialResolution: this.spatialResolution,
        observations: [],
        vessels: [],
        totalObservationsEvaluated: 0,
        uniqueVesselCount: 0,
        retrievedAt,
        diagnostics: {
          providerProduct: this.providerProduct,
          providerProtocol: this.providerProtocol,
          observationLevel: this.observationLevel,
          rawTracksAvailable: false,
          cpaAvailable: false,
          totalObservationsCount: 0,
          uniqueVesselCount: 0,
        },
      };
    }

    // Group presence records by vessel (MMSI)
    const vesselMap = new Map();

    for (const rec of records) {
      const mmsi = rec.mmsi;
      if (!mmsi) continue;

      if (!vesselMap.has(mmsi)) {
        vesselMap.set(mmsi, {
          mmsi,
          imo: rec.imo,
          name: rec.vesselName,
          vesselName: rec.vesselName,
          callsign: rec.callsign,
          flag: rec.flag,
          vesselType: rec.vesselType,
          vesselId: rec.vesselId,
          observationLevel: "VESSEL_PRESENCE",
          presenceHours: 0,
          presenceRecords: [],
          presenceCells: [],
          // Mandatory guardrail: DO NOT fabricate raw track points
          trackPoints: [],
          rawTracksAvailable: false,
          cpaAvailable: false,
        });
      }

      const vessel = vesselMap.get(mmsi);
      vessel.presenceHours += Number(rec.hours || 1);
      vessel.presenceRecords.push(rec);

      // Track distinct presence cells
      const cellLat = rec.gridCell?.latitude ?? rec.latitude;
      const cellLng = rec.gridCell?.longitude ?? rec.longitude;
      if (cellLat != null && cellLng != null) {
        vessel.presenceCells.push({
          latitude: cellLat,
          longitude: cellLng,
          hours: rec.hours,
          date: rec.date,
          timestamp: rec.timestamp,
        });
      }
    }

    const vessels = Array.from(vesselMap.values());

    return {
      type: "REAL_HISTORICAL_AIS",
      status: "SUCCESS",
      provider: this.name,
      providerProduct: this.providerProduct,
      providerProtocol: this.providerProtocol,
      dataset: this.providerProduct,
      observationLevel: this.observationLevel,
      rawTracksAvailable: false,
      cpaAvailable: false,
      temporalResolution: this.temporalResolution,
      spatialResolution: this.spatialResolution,
      observations: records,
      vessels,
      totalObservationsEvaluated: records.length,
      uniqueVesselCount: vessels.length,
      retrievedAt,
      diagnostics: {
        providerProduct: this.providerProduct,
        providerProtocol: this.providerProtocol,
        observationLevel: this.observationLevel,
        rawTracksAvailable: false,
        cpaAvailable: false,
        totalObservationsCount: records.length,
        uniqueVesselCount: vessels.length,
      },
    };
  }

  /**
   * Normalize an authentic GFW 4Wings presence record into canonical format.
   * Strictly preserves VESSEL_PRESENCE semantics without manufacturing raw trajectories.
   *
   * @param {Object} raw
   * @returns {Object} Normalized canonical presence record
   */
  normalizeRecord(raw) {
    if (!raw) return null;

    const lat = raw.lat != null && isFinite(Number(raw.lat)) ? Number(raw.lat) : null;
    const lon = raw.lon != null && isFinite(Number(raw.lon)) ? Number(raw.lon) : null;

    let isoTimestamp = null;
    if (raw.date && typeof raw.date === "string") {
      const cleanDate = raw.date.includes("T") ? raw.date : raw.date.replace(" ", "T") + ":00Z";
      const parsed = new Date(cleanDate);
      if (!isNaN(parsed.getTime())) {
        isoTimestamp = parsed.toISOString();
      }
    } else if (raw.entryTimestamp) {
      const parsed = new Date(raw.entryTimestamp);
      if (!isNaN(parsed.getTime())) {
        isoTimestamp = parsed.toISOString();
      }
    }

    const mmsi = String(raw.mmsi || "").trim();

    return {
      mmsi,
      imo: raw.imo ? String(raw.imo).trim() : null,
      vesselName: (raw.shipName || raw.shipname || raw.ship_name || raw.vesselName || raw.vessel_name || raw.name || "").trim() || null,
      callsign: (raw.callsign || "").trim() || null,
      flag: (raw.flag || "").trim() || null,
      vesselType: raw.vesselType || raw.geartype || null,
      vesselId: raw.vesselId || null,
      observationLevel: "VESSEL_PRESENCE",
      hours: Number(raw.hours || 1),
      date: raw.date || null,
      gridCell: {
        latitude: lat,
        longitude: lon,
      },
      latitude: lat,
      longitude: lon,
      // Mandatory guardrail: Trajectory fields are NOT available in GFW presence data
      sog: null,
      cog: null,
      rot: null,
      heading: null,
      speedKnots: null,
      headingDeg: null,
      navStatus: null,
      entryTimestamp: raw.entryTimestamp || null,
      exitTimestamp: raw.exitTimestamp || null,
      firstTransmissionDate: raw.firstTransmissionDate || null,
      lastTransmissionDate: raw.lastTransmissionDate || null,
      timestamp: isoTimestamp,
      timestampSource: "GFW_HOURLY_PRESENCE",
      source: this.name,
      provenance: "REAL",
    };
  }

  /**
   * Constructs authorization headers safely without leaking secrets.
   * @private
   */
  _buildHeaders() {
    const headers = {
      "Accept": "application/json",
      "User-Agent": "OceanGuardAI/1.0 (SIH26143)",
    };

    if (this.apiToken) {
      headers["Authorization"] = `Bearer ${this.apiToken}`;
    }

    return headers;
  }

  /**
   * Helper to build a closed GeoJSON polygon from a bounding box.
   * @private
   */
  _createBboxGeoJson(minLat, maxLat, minLng, maxLng) {
    return {
      type: "Polygon",
      coordinates: [[
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat],
      ]],
    };
  }

  /**
   * Translates network / HTTP errors into canonical domain errors without leaking secrets.
   * @private
   */
  _handleAxiosError(err, opName) {
    if (
      err.code === "HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED" ||
      err.code === "AIS_HISTORICAL_DATA_UNAVAILABLE" ||
      err.code === "AIS_INVALID_TEMPORAL_WINDOW"
    ) {
      throw err;
    }

    if (
      err.name === "AbortError" ||
      err.code === "ECONNABORTED" ||
      err.message?.includes("timeout") ||
      err.message?.includes("aborted")
    ) {
      const timeoutErr = new Error(`GFW historical AIS request timed out during ${opName}.`);
      timeoutErr.code = "AIS_PROVIDER_TIMEOUT";
      throw timeoutErr;
    }

    if (err.response) {
      const status = err.response.status;
      if (status === 401) {
        const authErr = new Error(`GFW API authentication failed (HTTP 401). Check GFW_API_TOKEN.`);
        authErr.code = "AIS_PROVIDER_AUTH_FAILED";
        throw authErr;
      }
      if (status === 403) {
        const accessErr = new Error(`GFW API access denied (HTTP 403). Check GFW_API_TOKEN permissions.`);
        accessErr.code = "AIS_PROVIDER_ACCESS_DENIED";
        throw accessErr;
      }
      if (status === 429) {
        const rateLimitErr = new Error(`Global Fishing Watch API rate limit reached (HTTP 429).`);
        rateLimitErr.code = "AIS_PROVIDER_RATE_LIMITED";
        throw rateLimitErr;
      }
      if (status === 404) {
        const notFoundErr = new Error(`Global Fishing Watch query endpoint not found (HTTP 404).`);
        notFoundErr.code = "AIS_PROVIDER_UNAVAILABLE";
        throw notFoundErr;
      }
      if (status >= 500) {
        const serverErr = new Error(`Global Fishing Watch upstream service error (HTTP ${status}).`);
        serverErr.code = "AIS_PROVIDER_SERVER_ERROR";
        throw serverErr;
      }
    }

    if (err.code === "ENOTFOUND" || err.code === "ECONNREFUSED" || err.code === "ECONNRESET") {
      const netErr = new Error(`Global Fishing Watch service unreachable at ${this.apiUrl}.`);
      netErr.code = "AIS_PROVIDER_UNAVAILABLE";
      throw netErr;
    }

    logger.error(`[GfwHistoricalAisClient] Request failed during ${opName}`, {
      status: err.response?.status,
      message: err.message,
      code: err.code,
    });
    throw err;
  }
}

module.exports = GfwHistoricalAisClient;
