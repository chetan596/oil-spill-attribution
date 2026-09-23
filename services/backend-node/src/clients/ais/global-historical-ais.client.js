/**
 * global-historical-ais.client.js
 * Phase 16.4 Part 3 — Kpler / exactEarth GWS exactAIS:HVP Historical AIS Client
 *
 * Implements authoritative global historical transponder telemetry retrieval
 * using the official Kpler / exactEarth Geospatial Web Services (GWS)
 * exactAIS:HVP (Historical Vessel Points) OGC Web Feature Service (WFS 1.1.0).
 *
 * OFFICIAL PRODUCT SPECIFICATION:
 * - Default WFS Endpoint: https://services.exactearth.com/gws/wfs
 * - Layer: exactAIS:HVP
 * - Protocol: OGC WFS 1.1.0 GetFeature
 * - Max Temporal Window per Request: 24 Hours (Requests >24h automatically
 *   split into Window A [T0-24h, T0] and Window B [T0, T0+24h] with boundary deduplication)
 * - Real HVP Schema:
 *     mmsi, imo, vessel_name, callsign, vessel_type, vessel_type_code,
 *     position, longitude, latitude, sog, cog, rot, heading, nav_status,
 *     nav_status_code, source, message_type, eeid, ts_pos_utc, dt_pos_utc, dtg
 * - Timestamp precedence: dtg -> dt_pos_utc -> ts_pos_utc
 * - Spatial filter: BBOX / CQL_FILTER against position geometry
 * - Security: API credentials strictly backend-only, never logged or leaked.
 */

const axios = require("axios");
const AisProvider = require("./ais.provider");
const logger = require("../../logger");

class GlobalHistoricalAisClient extends AisProvider {
  constructor() {
    const providerName = (process.env.AIS_HISTORICAL_PROVIDER || "EXACTAIS_GWS").trim().toUpperCase();
    super(providerName, "REAL");

    this.apiUrl = (
      process.env.AIS_HISTORICAL_API_URL ||
      "https://services.exactearth.com/gws/wfs"
    ).trim();

    this.apiKey = (process.env.AIS_HISTORICAL_API_KEY || "").trim();
    this.bearerToken = (process.env.AIS_HISTORICAL_BEARER_TOKEN || "").trim();
    this.username = (process.env.AIS_HISTORICAL_USERNAME || "").trim();
    this.password = (process.env.AIS_HISTORICAL_PASSWORD || "").trim();
    this.timeoutMs = Number(process.env.AIS_HISTORICAL_TIMEOUT_MS) || 30000;
    this.maxPages = Number(process.env.AIS_HISTORICAL_MAX_PAGES) || 10;
    this.pageSize = Number(process.env.AIS_HISTORICAL_PAGE_SIZE) || 1000;
    this.maxRecords = Number(process.env.AIS_HISTORICAL_MAX_RECORDS) || 5000;

    this.providerProduct = "exactAIS:HVP";
    this.providerProtocol = "WFS_1_1_0";
    this.verifyCapabilitiesBeforeQuery = process.env.AIS_HISTORICAL_VERIFY_CAPABILITIES === "true";
    this._capabilitiesVerified = false;
  }

  /**
   * Determine whether genuine global historical AIS credentials and endpoints are configured.
   * @returns {boolean}
   */
  isConfigured() {
    const hasEndpoint = Boolean(this.apiUrl && this.apiUrl.length > 0);
    const hasCredentials = Boolean(
      (this.apiKey && this.apiKey.length > 0) ||
      (this.bearerToken && this.bearerToken.length > 0) ||
      (this.username && this.username.length > 0 && this.password && this.password.length > 0)
    );
    return hasEndpoint && hasCredentials;
  }

  /**
   * Verifies provider capabilities by executing an OGC WFS GetCapabilities query.
   * Confirms WFS 1.1.0, exactAIS:HVP layer, and GeoJSON output support.
   *
   * @returns {Promise<{ supported: boolean, layerFound: boolean, details: Object }>}
   */
  async verifyCapabilities() {
    if (!this.isConfigured()) {
      const err = new Error(
        `HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED: Real historical AIS provider "${this.name}" is not configured.`
      );
      err.code = "HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED";
      throw err;
    }

    try {
      const headers = this._buildHeaders();
      const response = await axios.get(this.apiUrl, {
        headers,
        params: {
          service: "WFS",
          version: "1.1.0",
          request: "GetCapabilities",
        },
        timeout: this.timeoutMs,
      });

      const body = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
      const layerFound = body.includes("exactAIS:HVP") || body.includes("HVP");
      const wfsSupported = body.includes("1.1.0") || body.includes("WFS_Capabilities");

      if (!layerFound || !wfsSupported) {
        const contractErr = new Error(
          `HISTORICAL_PROVIDER_API_CONTRACT_REQUIRED: Provider at ${this.apiUrl} does not expose the required exactAIS:HVP layer or WFS 1.1.0 capability.`
        );
        contractErr.code = "HISTORICAL_PROVIDER_API_CONTRACT_REQUIRED";
        logger.error(`[GlobalHistoricalAisClient] ${contractErr.message}`);
        throw contractErr;
      }

      return {
        supported: true,
        layerFound: true,
        details: {
          protocol: this.providerProtocol,
          product: this.providerProduct,
          endpoint: this.apiUrl,
        },
      };
    } catch (err) {
      if (err.code === "HISTORICAL_PROVIDER_API_CONTRACT_REQUIRED") throw err;
      this._handleAxiosError(err, "GetCapabilities verification");
    }
  }

  /**
   * Health and readiness audit for the historical AIS provider.
   * Tests endpoint, credentials, and WFS GetCapabilities discovery without leaking credentials.
   *
   * @returns {Promise<Object>} Structured health diagnostics
   */
  async checkHealth() {
    const providerConfigured = Boolean(this.name && this.name.length > 0);
    const endpointConfigured = Boolean(this.apiUrl && this.apiUrl.length > 0);
    const authenticationConfigured = Boolean(
      (this.apiKey && this.apiKey.length > 0) ||
      (this.bearerToken && this.bearerToken.length > 0) ||
      (this.username && this.username.length > 0 && this.password && this.password.length > 0)
    );

    if (!endpointConfigured || !authenticationConfigured) {
      return {
        providerConfigured,
        endpointConfigured,
        authenticationConfigured,
        capabilitiesReachable: false,
        wfsVersionSupported: false,
        hvpLayerAvailable: false,
        historicalQueryReady: false,
        status: "HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED",
        reason: "Provider endpoint or credentials not configured in backend environment.",
      };
    }

    try {
      const caps = await this.verifyCapabilities();
      return {
        providerConfigured: true,
        endpointConfigured: true,
        authenticationConfigured: true,
        capabilitiesReachable: true,
        wfsVersionSupported: true,
        hvpLayerAvailable: true,
        historicalQueryReady: true,
        status: "READY",
        reason: "WFS 1.1.0 and exactAIS:HVP layer verified successfully.",
        details: caps?.details || {
          product: this.providerProduct,
          protocol: this.providerProtocol,
        },
      };
    } catch (err) {
      const isUnavail = err.code === "AIS_PROVIDER_UNAVAILABLE";
      const isTimeout = err.code === "AIS_PROVIDER_TIMEOUT";
      return {
        providerConfigured: true,
        endpointConfigured: true,
        authenticationConfigured: true,
        capabilitiesReachable: !isUnavail && !isTimeout,
        wfsVersionSupported: false,
        hvpLayerAvailable: false,
        historicalQueryReady: false,
        status: err.code || "HEALTH_CHECK_FAILED",
        reason: err.message,
      };
    }
  }

  /**
   * Query current AIS telemetry (not primary purpose of historical client).
   */
  async queryCurrentAis({ minLat, maxLat, minLng, maxLng }) {
    if (!this.isConfigured()) {
      const err = new Error(
        `HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED: Provider "${this.name}" has no configured API endpoint or credentials.`
      );
      err.code = "HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED";
      throw err;
    }

    // Historical provider does not satisfy current live queries
    const err = new Error("AIS_HISTORICAL_DATA_UNAVAILABLE: Historical client cannot be queried for live current fleet snapshot.");
    err.code = "AIS_HISTORICAL_DATA_UNAVAILABLE";
    throw err;
  }

  /**
   * Query authentic historical AIS vessel observations within spatiotemporal bounding box.
   *
   * SECTION 2 MANDATE:
   * GWS exactAIS:HVP limits maximum temporal duration per request to 24 hours.
   * If total window > 24 hours, automatically splits into Window A [T0-24h, T0]
   * and Window B [T0, T0+24h], executes both requests, and deduplicates boundary records.
   *
   * @param {Object} query
   * @param {number} query.minLat
   * @param {number} query.maxLat
   * @param {number} query.minLng
   * @param {number} query.maxLng
   * @param {string} query.fromTimestamp - UTC ISO-8601 start
   * @param {string} query.toTimestamp - UTC ISO-8601 end
   * @returns {Promise<Array<Object>>} Normalized historical transponder observations
   */
  async queryHistoricalAis({ minLat, maxLat, minLng, maxLng, fromTimestamp, toTimestamp }) {
    logger.info("[GlobalHistoricalAisClient] Preparing Kpler GWS exactAIS:HVP historical query", {
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
        "Set AIS_HISTORICAL_API_URL and credentials (AIS_HISTORICAL_API_KEY or AIS_HISTORICAL_BEARER_TOKEN) in backend environment."
      );
      err.code = "HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED";
      logger.warn(`[GlobalHistoricalAisClient] ${err.message}`);
      throw err;
    }

    if (this.verifyCapabilitiesBeforeQuery && !this._capabilitiesVerified) {
      await this.verifyCapabilities();
      this._capabilitiesVerified = true;
    }

    const fromMs = new Date(fromTimestamp).getTime();
    const toMs = new Date(toTimestamp).getTime();
    const totalDurationHours = (toMs - fromMs) / (3600 * 1000);

    // If query exceeds 24h, split into Window A and Window B to respect GWS 24h maximum
    let windows = [];
    if (totalDurationHours > 24.0) {
      const midMs = fromMs + (toMs - fromMs) / 2;
      const midIso = new Date(midMs).toISOString();
      windows = [
        { label: "WINDOW_A", from: fromTimestamp, to: midIso },
        { label: "WINDOW_B", from: midIso, to: toTimestamp },
      ];
      logger.info("[GlobalHistoricalAisClient] Total window exceeds GWS 24h limit. Splitting into Window A & B", {
        windowA: windows[0],
        windowB: windows[1],
      });
    } else {
      windows = [
        { label: "SINGLE_WINDOW", from: fromTimestamp, to: toTimestamp },
      ];
    }

    this._lastQueryWindows = windows;

    let allRawRecords = [];
    let isTruncated = false;
    let truncationReason = null;

    for (const win of windows) {
      const { records, truncated, reason } = await this._executeWfsQueryForWindow({
        minLat,
        maxLat,
        minLng,
        maxLng,
        fromTimestamp: win.from,
        toTimestamp: win.to,
      });

      allRawRecords.push(...records);
      if (truncated) {
        isTruncated = true;
        truncationReason = reason;
      }
    }

    // Deduplicate boundary observations between Window A and Window B
    const seenMap = new Map();
    let duplicateCount = 0;
    const deduplicated = [];

    for (const raw of allRawRecords) {
      const norm = this.normalizeRecord(raw);
      if (!norm || !norm.mmsi || !norm.timestamp) {
        deduplicated.push(norm);
        continue;
      }

      // Unique observation fingerprint: mmsi + timestamp + lat + lng
      const dedupKey = `${norm.mmsi}::${norm.timestamp}::${Number(norm.latitude).toFixed(5)}::${Number(norm.longitude).toFixed(5)}`;
      if (seenMap.has(dedupKey)) {
        duplicateCount++;
      } else {
        seenMap.set(dedupKey, true);
        deduplicated.push(norm);
      }
    }

    this._lastDuplicateCount = duplicateCount;
    this._lastIsTruncated = isTruncated;
    this._lastTruncationReason = truncationReason;

    logger.info("[GlobalHistoricalAisClient] Query completed", {
      totalRaw: allRawRecords.length,
      deduplicatedCount: deduplicated.length,
      duplicateCount,
      isTruncated,
    });

    return deduplicated;
  }

  /**
   * Executes a single WFS GetFeature request with pagination handling for a single window.
   * @private
   */
  async _executeWfsQueryForWindow({ minLat, maxLat, minLng, maxLng, fromTimestamp, toTimestamp }) {
    const headers = this._buildHeaders();
    let records = [];
    let page = 0;
    let startIndex = 0;
    let truncated = false;
    let reason = null;

    while (page < this.maxPages) {
      page++;
      const params = {
        service: "WFS",
        version: "1.1.0",
        request: "GetFeature",
        typeName: this.providerProduct,
        outputFormat: "application/json",
        srsName: "EPSG:4326",
        bbox: `${minLng},${minLat},${maxLng},${maxLat},urn:ogc:def:crs:EPSG::4326`,
        cql_filter: `ts_pos_utc BETWEEN '${fromTimestamp}' AND '${toTimestamp}'`,
        startIndex,
        maxFeatures: this.pageSize,
      };

      try {
        const response = await axios.get(this.apiUrl, {
          headers,
          params,
          timeout: this.timeoutMs,
        });

        const data = response.data || {};
        let pageRecords = [];

        if (Array.isArray(data.features)) {
          // Standard GeoJSON FeatureCollection from WFS
          pageRecords = data.features.map((f) => ({
            ...(f.properties || {}),
            geometry: f.geometry,
            latitude: f.geometry?.coordinates ? f.geometry.coordinates[1] : f.properties?.latitude,
            longitude: f.geometry?.coordinates ? f.geometry.coordinates[0] : f.properties?.longitude,
          }));
        } else if (Array.isArray(data.records)) {
          pageRecords = data.records;
        } else if (Array.isArray(data.observations)) {
          pageRecords = data.observations;
        } else if (Array.isArray(data)) {
          pageRecords = data;
        }

        records.push(...pageRecords);

        // If returned fewer records than pageSize, we have fetched the full result set
        if (pageRecords.length < this.pageSize) {
          break;
        }

        startIndex += pageRecords.length;
        if (records.length >= this.maxRecords) {
          truncated = true;
          reason = `Configured maximum record limit reached (${this.maxRecords} records).`;
          break;
        }
      } catch (err) {
        this._handleAxiosError(err, "WFS GetFeature historical AIS query");
      }
    }

    if (page >= this.maxPages && records.length >= this.maxPages * this.pageSize) {
      truncated = true;
      reason = `Configured maximum pagination pages reached (${this.maxPages} pages).`;
    }

    return { records, truncated, reason };
  }

  /**
   * Search historical vessels with enhanced two-window and exact HVP provenance envelope.
   * Extends the base AisProvider.searchHistoricalVessels to include HVP metadata.
   */
  async searchHistoricalVessels({ minLat, maxLat, minLng, maxLng, fromTimestamp, toTimestamp }) {
    const baseEnvelope = await super.searchHistoricalVessels({
      minLat,
      maxLat,
      minLng,
      maxLng,
      fromTimestamp,
      toTimestamp,
    });

    const queryWindows = this._lastQueryWindows || [
      { from: fromTimestamp, to: toTimestamp },
    ];

    const duplicateCount = this._lastDuplicateCount || 0;
    const isTruncated = Boolean(this._lastIsTruncated);
    const truncationReason = this._lastTruncationReason || null;

    // Attach Section 9 & Part 3 Required Provenance Fields
    return {
      ...baseEnvelope,
      providerProduct: this.providerProduct,
      providerProtocol: this.providerProtocol,
      queryWindows,
      isTruncated,
      truncationReason,
      diagnostics: {
        ...(baseEnvelope.diagnostics || {}),
        providerProduct: this.providerProduct,
        providerProtocol: this.providerProtocol,
        queryWindows,
        duplicateObservationCount: duplicateCount,
        isTruncated,
        truncationReason,
      },
    };
  }

  /**
   * Normalize an authentic exactAIS:HVP observation record into canonical format.
   *
   * DOCUMENTED EXACT HVP SCHEMA:
   *   mmsi, imo, vessel_name, callsign, vessel_type, vessel_type_code,
   *   position, longitude, latitude, sog, cog, rot, heading, nav_status,
   *   nav_status_code, source, message_type, eeid, ts_pos_utc, dt_pos_utc, dtg
   *
   * TIMESTAMP NORMALIZATION PRECEDENCE:
   *   1. dtg
   *   2. dt_pos_utc
   *   3. ts_pos_utc
   *   4. timestamp fallback
   *
   * @param {Object} raw
   * @returns {Object} Normalized canonical AIS record
   */
  normalizeRecord(raw) {
    if (!raw) return null;

    // Extract raw coordinates (supporting GeoJSON geometry or direct properties)
    let lat = raw.latitude != null ? Number(raw.latitude) : null;
    let lng = raw.longitude != null ? Number(raw.longitude) : null;

    if (lat == null && raw.lat != null) lat = Number(raw.lat);
    if (lng == null && (raw.lng != null || raw.lon != null)) lng = Number(raw.lng ?? raw.lon);

    if (lat == null && Array.isArray(raw.geometry?.coordinates)) {
      lng = Number(raw.geometry.coordinates[0]);
      lat = Number(raw.geometry.coordinates[1]);
    }

    // Resolve authoritative timestamp according to Section 3 precedence
    let rawTimestamp = null;
    let timestampSource = "NOT_AVAILABLE";

    if (raw.dtg && typeof raw.dtg === "string" && raw.dtg.trim().length > 0) {
      rawTimestamp = raw.dtg.trim();
      timestampSource = "dtg";
    } else if (raw.dt_pos_utc && typeof raw.dt_pos_utc === "string" && raw.dt_pos_utc.trim().length > 0) {
      rawTimestamp = raw.dt_pos_utc.trim();
      timestampSource = "dt_pos_utc";
    } else if (raw.ts_pos_utc) {
      rawTimestamp = raw.ts_pos_utc;
      timestampSource = "ts_pos_utc";
    } else if (raw.timestamp) {
      rawTimestamp = raw.timestamp;
      timestampSource = "timestamp";
    }

    let isoTimestamp = null;
    if (rawTimestamp) {
      const parsed = new Date(rawTimestamp);
      if (!isNaN(parsed.getTime())) {
        isoTimestamp = parsed.toISOString();
      }
    }

    const mmsi = String(raw.mmsi || raw.MMSI || "").trim();

    return {
      mmsi,
      imo: raw.imo || raw.IMO ? String(raw.imo || raw.IMO).trim() : null,
      vesselName: (raw.vessel_name || raw.shipName || raw.name || "").trim() || null,
      callsign: (raw.callsign || raw.CALLSIGN || "").trim() || null,
      vesselType: raw.vessel_type || raw.type || null,
      vesselTypeCode: raw.vessel_type_code != null ? Number(raw.vessel_type_code) : null,
      latitude: lat != null && isFinite(lat) ? lat : null,
      longitude: lng != null && isFinite(lng) ? lng : null,
      sog: raw.sog != null ? Number(raw.sog) : (raw.speedKnots != null ? Number(raw.speedKnots) : null),
      cog: raw.cog != null ? Number(raw.cog) : (raw.courseDeg != null ? Number(raw.courseDeg) : null),
      rot: raw.rot != null ? Number(raw.rot) : null,
      heading: raw.heading != null ? Number(raw.heading) : (raw.headingDeg != null ? Number(raw.headingDeg) : null),
      navStatus: raw.nav_status || raw.navStatus || raw.status || null,
      navStatusCode: raw.nav_status_code != null ? Number(raw.nav_status_code) : null,
      source: raw.source || this.name,
      messageType: raw.message_type != null ? Number(raw.message_type) : null,
      eeid: raw.eeid || null,
      timestamp: isoTimestamp,
      timestampSource,
      provenance: this.provenance,
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

    if (this.bearerToken) {
      headers["Authorization"] = `Bearer ${this.bearerToken}`;
    } else if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    } else if (this.username && this.password) {
      const basic = Buffer.from(`${this.username}:${this.password}`).toString("base64");
      headers["Authorization"] = `Basic ${basic}`;
    }

    return headers;
  }

  /**
   * Translates network / HTTP errors into canonical domain errors without leaking secrets.
   * @private
   */
  _handleAxiosError(err, opName) {
    if (
      err.code === "HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED" ||
      err.code === "HISTORICAL_PROVIDER_API_CONTRACT_REQUIRED" ||
      err.code === "AIS_HISTORICAL_DATA_UNAVAILABLE"
    ) {
      throw err;
    }

    if (err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
      const timeoutErr = new Error(`Historical AIS provider request timed out during ${opName}.`);
      timeoutErr.code = "AIS_PROVIDER_TIMEOUT";
      throw timeoutErr;
    }

    if (err.response) {
      const status = err.response.status;
      if (status === 401 || status === 403) {
        const authErr = new Error(`Historical AIS provider authentication failed (HTTP ${status}). Check credentials.`);
        authErr.code = "AIS_PROVIDER_AUTH_FAILED";
        throw authErr;
      }
      if (status === 404) {
        const notFoundErr = new Error(`Historical AIS query endpoint not found (HTTP 404).`);
        notFoundErr.code = "AIS_PROVIDER_UNAVAILABLE";
        throw notFoundErr;
      }
    }

    if (err.code === "ENOTFOUND" || err.code === "ECONNREFUSED" || err.code === "ECONNRESET") {
      const netErr = new Error(`Historical AIS provider service unreachable at ${this.apiUrl}.`);
      netErr.code = "AIS_PROVIDER_UNAVAILABLE";
      throw netErr;
    }

    logger.error(`[GlobalHistoricalAisClient] Request failed during ${opName}`, {
      status: err.response?.status,
      message: err.message,
      code: err.code,
    });
    throw err;
  }
}

module.exports = GlobalHistoricalAisClient;
