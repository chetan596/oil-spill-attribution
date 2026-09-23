/**
 * demo-ais.client.js
 * Phase 16.4 Part 7.2 — Demo AIS Provider (DEVELOPMENT/TEST ONLY)
 *
 * Sourced exclusively from bundled demonstration transponder observations.
 *
 * PRODUCTION GUARD:
 *   - This provider CANNOT execute when NODE_ENV=production.
 *   - isConfigured() returns false in production environments.
 *   - The factory only instantiates this when AIS_DEMO_MODE=true AND
 *     NODE_ENV is NOT production.
 *   - This class may be injected directly into legacy integration tests
 *     via aisProviderFactory.setProvider(new DemoAisClient()).
 *
 * Provenance is ALWAYS: "DEMO" and isDemo: true.
 */

const AisProvider = require("./ais.provider");
const aisRepository = require("../../repositories/ais.repository");
const logger = require("../../logger");

class DemoAisClient extends AisProvider {
  constructor() {
    super("DEMO", "DEMO");
  }

  /**
   * Returns false in production — DemoAisClient must never operate in production.
   * @returns {boolean}
   */
  isConfigured() {
    const isProduction = (process.env.NODE_ENV || "").trim().toLowerCase() === "production";
    if (isProduction) {
      return false;
    }
    return true;
  }

  /**
   * Query current demonstration AIS telemetry within bounding box.
   */
  async queryCurrentAis({ minLat, maxLat, minLng, maxLng }) {
    const isProduction = (process.env.NODE_ENV || "").trim().toLowerCase() === "production";
    if (isProduction) {
      logger.error("[DemoAisClient] BLOCKED: attempted queryCurrentAis in production");
      throw new Error("AIS_DEMO_DISABLED_IN_PRODUCTION: Demo AIS cannot execute in production.");
    }

    // Return dummy observation from current time for test demonstration
    return [
      this.normalizeRecord({
        mmsi: "111222333",
        vesselName: "DEMO_CURRENT_VESSEL",
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        timestamp: new Date().toISOString(),
        sog: 10.5,
        cog: 90,
      }),
    ];
  }

  /**
   * Query demonstration AIS telemetry within search window.
   */
  async queryHistoricalAis({ minLat, maxLat, minLng, maxLng, fromTimestamp, toTimestamp }) {
    // Production safety — even if instantiated, refuse to return data in production
    const isProduction = (process.env.NODE_ENV || "").trim().toLowerCase() === "production";
    if (isProduction) {
      logger.error("[DemoAisClient] BLOCKED: attempted to query demo AIS data in production environment");
      throw new Error("AIS_DEMO_DISABLED_IN_PRODUCTION: Demo AIS cannot execute in production.");
    }

    logger.info("[DemoAisClient] Querying bundled demo AIS telemetry (DEVELOPMENT ONLY)", {
      minLat,
      maxLat,
      minLng,
      maxLng,
      fromTimestamp,
      toTimestamp,
    });

    const startTime = new Date(fromTimestamp);
    const endTime = new Date(toTimestamp);
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    const radiusKm = 50;

    const rawCandidates = await aisRepository.findCandidatesInTimeWindow(
      startTime,
      endTime,
      { latitude: centerLat, longitude: centerLng },
      radiusKm
    );

    // Return flat normalized records
    const records = [];
    for (const c of rawCandidates) {
      if (Array.isArray(c.trackPoints)) {
        for (const pt of c.trackPoints) {
          records.push(
            this.normalizeRecord({
              mmsi: c.mmsi,
              vesselName: c.vesselName || c.name,
              latitude: pt.latitude,
              longitude: pt.longitude,
              timestamp: pt.timestamp,
              sog: pt.speedKnots,
              cog: pt.headingDeg,
              heading: pt.headingDeg,
              vesselType: c.vesselType,
            })
          );
        }
      } else {
        records.push(
          this.normalizeRecord({
            mmsi: c.mmsi,
            vesselName: c.vesselName || c.name,
            latitude: c.latitude,
            longitude: c.longitude,
            timestamp: c.timestamp,
            sog: c.speedKnots,
            cog: c.headingDeg,
            heading: c.headingDeg,
            vesselType: c.vesselType,
          })
        );
      }
    }

    return records;
  }

  /**
   * Directly get raw candidate structures with track segments for existing scoring algorithms.
   */
  async getDemoCandidatesInWindow(startTime, endTime, centerLocation, searchRadiusKm) {
    // Production safety
    const isProduction = (process.env.NODE_ENV || "").trim().toLowerCase() === "production";
    if (isProduction) {
      logger.error("[DemoAisClient] BLOCKED: attempted getDemoCandidatesInWindow in production");
      return [];
    }

    return aisRepository.findCandidatesInTimeWindow(
      startTime,
      endTime,
      centerLocation,
      searchRadiusKm
    );
  }
}

module.exports = DemoAisClient;
