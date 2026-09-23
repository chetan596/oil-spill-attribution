/**
 * ais.provider.js
 * Phase 16.4 Part 8 — AIS Provider Base Interface
 *
 * Abstract provider for historical and live/current AIS telemetry.
 * Enforces provider contract, observation validation, boundary filtering,
 * and strict separation between:
 *   - searchCurrentVessels()    -> REAL_CURRENT_AIS
 *   - searchHistoricalVessels() -> REAL_HISTORICAL_AIS
 *
 * CRITICAL VALIDATION RULES:
 * 1. normalizeRecord() NEVER fabricates timestamps (returns null if missing).
 * 2. Every historical observation MUST have a valid timestamp strictly within
 *    [fromTimestamp, toTimestamp] and coordinates within [minLat, maxLat, minLng, maxLng].
 * 3. Invalid or out-of-window observations are rejected.
 * 4. retrievedAt (retrieval time) != observation.timestamp (transponder transmission time).
 */

class AisProvider {
  /**
   * @param {string} name - Provider identifier (e.g. 'OPENSEAFEED', 'MARINETRAFFIC', 'AISSTREAM', 'DEMO')
   * @param {string} provenance - 'REAL' or 'DEMO'
   */
  constructor(name, provenance = "REAL") {
    if (new.target === AisProvider) {
      throw new TypeError("Cannot instantiate abstract class AisProvider directly");
    }
    this.name = name;
    this.provenance = provenance;
    this.isDemo = provenance === "DEMO";
  }

  get provider() {
    return this.name;
  }

  /**
   * Determine if the provider has valid API credentials configured in environment.
   * @returns {boolean}
   */
  isConfigured() {
    throw new Error("isConfigured() must be implemented by subclass");
  }

  /**
   * Query current AIS vessel telemetry (e.g. live snapshot) for a bounding box.
   *
   * @param {Object} query
   * @param {number} query.minLat
   * @param {number} query.maxLat
   * @param {number} query.minLng
   * @param {number} query.maxLng
   * @returns {Promise<Array<Object>>} Normalized AIS records
   */
  async queryCurrentAis({ minLat, maxLat, minLng, maxLng }) {
    throw new Error("queryCurrentAis() must be implemented by subclass");
  }

  /**
   * Query historical AIS vessel telemetry for a bounding box and time interval.
   *
   * @param {Object} query
   * @param {number} query.minLat
   * @param {number} query.maxLat
   * @param {number} query.minLng
   * @param {number} query.maxLng
   * @param {string|Date} query.fromTimestamp - Start of historical query window (ISO-8601)
   * @param {string|Date} query.toTimestamp - End of historical query window (ISO-8601)
   * @returns {Promise<Array<Object>>} Normalized AIS records
   */
  async queryHistoricalAis({ minLat, maxLat, minLng, maxLng, fromTimestamp, toTimestamp }) {
    throw new Error("queryHistoricalAis() must be implemented by subclass");
  }

  /**
   * Search current vessel positions within bounding box.
   * Returns envelope strictly typed as REAL_CURRENT_AIS (or DEMO).
   *
   * @param {Object} params
   * @returns {Promise<Object>}
   */
  async searchCurrentVessels({ minLat, maxLat, minLng, maxLng }) {
    const retrievedAt = new Date().toISOString();
    const records = await this.queryCurrentAis({ minLat, maxLat, minLng, maxLng });
    const normalized = Array.isArray(records) ? records : [];

    // Filter to spatial bounds and valid coordinates
    const validVessels = normalized.filter((r) => {
      if (r.latitude == null || !isFinite(r.latitude)) return false;
      if (r.longitude == null || !isFinite(r.longitude)) return false;
      return (
        r.latitude >= minLat &&
        r.latitude <= maxLat &&
        r.longitude >= minLng &&
        r.longitude <= maxLng
      );
    });

    return {
      type: this.isDemo ? "DEMO_CURRENT_AIS" : "REAL_CURRENT_AIS",
      provider: this.name,
      provenance: this.provenance,
      sourceType: "AIS_PROVIDER",
      isDemo: this.isDemo,
      retrievedAt,
      queryBounds: { minLat, maxLat, minLng, maxLng },
      vessels: validVessels,
    };
  }

  /**
   * Search historical vessel observations within bounding box and time interval.
   * Enforces temporal boundary validation: observations outside the requested
   * window or without a valid timestamp are rejected.
   *
   * @param {Object} params
   * @returns {Promise<Object>}
   */
  async searchHistoricalVessels({ minLat, maxLat, minLng, maxLng, fromTimestamp, toTimestamp }) {
    const retrievedAt = new Date().toISOString();
    const fromMs = new Date(fromTimestamp).getTime();
    const toMs = new Date(toTimestamp).getTime();

    if (isNaN(fromMs) || isNaN(toMs)) {
      const err = new Error("INSUFFICIENT_TEMPORAL_DATA: Invalid fromTimestamp or toTimestamp provided to searchHistoricalVessels");
      err.code = "INSUFFICIENT_TEMPORAL_DATA";
      throw err;
    }

    const fromIso = new Date(fromMs).toISOString();
    const toIso = new Date(toMs).toISOString();

    const records = await this.queryHistoricalAis({
      minLat,
      maxLat,
      minLng,
      maxLng,
      fromTimestamp: fromIso,
      toTimestamp: toIso,
    });

    const rawRecords = Array.isArray(records) ? records : [];

    // Enforce Section L: observation validation & diagnostic extraction
    const validRecords = [];
    let outOfWindowCount = 0;
    let actualMinMs = Infinity;
    let actualMaxMs = -Infinity;
    const uniqueMmsiSet = new Set();

    for (const rec of rawRecords) {
      const obsTime = rec.timestamp ? new Date(rec.timestamp).getTime() : NaN;
      if (!isNaN(obsTime)) {
        if (obsTime < actualMinMs) actualMinMs = obsTime;
        if (obsTime > actualMaxMs) actualMaxMs = obsTime;
      }

      if (this.isValidHistoricalObservation(rec, { minLat, maxLat, minLng, maxLng }, fromMs, toMs)) {
        validRecords.push(rec);
        if (rec.mmsi) uniqueMmsiSet.add(String(rec.mmsi));
      } else {
        if (!isNaN(obsTime) && (obsTime < fromMs || obsTime > toMs)) {
          outOfWindowCount++;
        }
      }
    }

    const isCurrentOnly = rawRecords.length > 0 && validRecords.length === 0 && outOfWindowCount > 0;

    const diagnostics = {
      requestedFrom: fromIso,
      requestedTo: toIso,
      actualMinTimestamp: isFinite(actualMinMs) ? new Date(actualMinMs).toISOString() : null,
      actualMaxTimestamp: isFinite(actualMaxMs) ? new Date(actualMaxMs).toISOString() : null,
      requestedBounds: { minLat, maxLat, minLng, maxLng },
      returnedObservationCount: rawRecords.length,
      validObservationCount: validRecords.length,
      rejectedObservationCount: rawRecords.length - validRecords.length,
      uniqueVesselCount: uniqueMmsiSet.size,
    };

    // Group valid observations by vessel MMSI and sort chronologically (Section K)
    const vesselMap = new Map();
    for (const rec of validRecords) {
      const mmsi = String(rec.mmsi);
      if (!vesselMap.has(mmsi)) {
        vesselMap.set(mmsi, {
          mmsi,
          imo: rec.imo || null,
          name: rec.vesselName || null,
          vesselName: rec.vesselName || null,
          vesselType: rec.vesselType || null,
          flag: rec.flag || null,
          callsign: rec.callsign || null,
          latitude: rec.latitude,
          longitude: rec.longitude,
          speedKnots: rec.sog,
          headingDeg: rec.cog || rec.heading,
          trackPoints: [],
        });
      }

      vesselMap.get(mmsi).trackPoints.push({
        latitude: rec.latitude,
        longitude: rec.longitude,
        timestamp: rec.timestamp,
        speedKnots: rec.sog,
        headingDeg: rec.cog || rec.heading,
        navStatus: rec.navigationStatus || null,
      });
    }

    // Chronologically sort track points for every vessel
    for (const v of vesselMap.values()) {
      v.trackPoints.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      if (v.trackPoints.length > 0) {
        const last = v.trackPoints[v.trackPoints.length - 1];
        v.latitude = last.latitude;
        v.longitude = last.longitude;
        v.speedKnots = last.speedKnots;
        v.headingDeg = last.headingDeg;
      }
    }

    const groupedVessels = Array.from(vesselMap.values());

    return {
      type: isCurrentOnly ? "AIS_CURRENT_DATA_ONLY" : (this.isDemo ? "DEMO_HISTORICAL_AIS" : "REAL_HISTORICAL_AIS"),
      status: isCurrentOnly ? "AIS_CURRENT_DATA_ONLY" : (validRecords.length > 0 ? "CANDIDATES_FOUND" : "AIS_NO_DATA_FOR_QUERY"),
      provider: this.name,
      provenance: this.provenance,
      sourceType: "AIS_PROVIDER",
      isDemo: this.isDemo,
      retrievedAt,
      queryWindow: {
        fromTimestamp: fromIso,
        toTimestamp: toIso,
      },
      queryBounds: { minLat, maxLat, minLng, maxLng },
      observations: validRecords,
      vessels: groupedVessels,
      totalObservationsEvaluated: rawRecords.length,
      outOfWindowObservationsCount: outOfWindowCount,
      diagnostics,
    };
  }

  /**
   * Section L — Verify individual AIS observation meets strict validity rules.
   *
   * @param {Object} rec
   * @param {Object} bounds { minLat, maxLat, minLng, maxLng }
   * @param {number} fromMs
   * @param {number} toMs
   * @returns {boolean}
   */
  isValidHistoricalObservation(rec, bounds, fromMs, toMs) {
    if (!rec) return false;

    // 1. MMSI if present must not be empty whitespace or zero
    if (rec.mmsi !== undefined && rec.mmsi !== null && (String(rec.mmsi).trim().length === 0 || String(rec.mmsi).trim() === "0" || String(rec.mmsi).trim() === "000000000")) {
      return false;
    }

    // 2 & 3. Latitude and longitude must exist and be finite numbers
    if (rec.latitude == null || !isFinite(rec.latitude)) return false;
    if (rec.longitude == null || !isFinite(rec.longitude)) return false;

    // 4. Inside requested geographic bounds
    if (
      rec.latitude < bounds.minLat ||
      rec.latitude > bounds.maxLat ||
      rec.longitude < bounds.minLng ||
      rec.longitude > bounds.maxLng
    ) {
      return false;
    }

    // 5. Timestamp must exist and be valid
    if (!rec.timestamp) return false;
    const obsTime = new Date(rec.timestamp).getTime();
    if (isNaN(obsTime)) return false;

    // 6. Must fall strictly inside requested temporal window
    if (obsTime < fromMs || obsTime > toMs) {
      return false;
    }

    return true;
  }

  /**
   * Normalize an AIS telemetry record to canonical Ocean Guard AI format.
   *
   * CRITICAL: Never fabricate a timestamp. If the raw record has no timestamp,
   * the normalized record gets timestamp: null.
   *
   * @param {Object} raw
   * @returns {Object} Normalized AIS record
   */
  normalizeRecord(raw) {
    const rawTimestamp = raw.timestamp || raw.TIMESTAMP || null;
    const parsedTimestamp = rawTimestamp ? new Date(rawTimestamp) : null;
    const isoTimestamp =
      parsedTimestamp && !isNaN(parsedTimestamp.getTime())
        ? parsedTimestamp.toISOString()
        : null;

    return {
      mmsi: String(raw.mmsi || raw.MMSI || ""),
      imo: raw.imo || raw.IMO ? String(raw.imo || raw.IMO) : null,
      vesselName: raw.vesselName || raw.vessel_name || raw.shipName || raw.name || null,
      latitude:
        raw.latitude != null
          ? Number(raw.latitude)
          : raw.lat != null
          ? Number(raw.lat)
          : null,
      longitude:
        raw.longitude != null
          ? Number(raw.longitude)
          : raw.lng != null
          ? Number(raw.lng)
          : raw.lon != null
          ? Number(raw.lon)
          : null,
      timestamp: isoTimestamp,
      sog:
        raw.sog != null
          ? Number(raw.sog)
          : raw.speedKnots != null
          ? Number(raw.speedKnots)
          : null,
      cog:
        raw.cog != null
          ? Number(raw.cog)
          : raw.courseDeg != null
          ? Number(raw.courseDeg)
          : null,
      heading:
        raw.heading != null
          ? Number(raw.heading)
          : raw.headingDeg != null
          ? Number(raw.headingDeg)
          : null,
      navigationStatus: raw.navigationStatus || raw.navStatus || raw.status || null,
      vesselType: raw.vesselType || raw.type || null,
      callsign: raw.callsign || raw.CALLSIGN || null,
      destination: raw.destination || raw.DESTINATION || null,
      source: this.name,
      sourceTimestamp: isoTimestamp,
      provenance: this.provenance,
    };
  }
}

module.exports = AisProvider;
