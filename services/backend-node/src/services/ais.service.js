const path = require("path");
const fs = require("fs");
const aisRepository = require("../repositories/ais.repository");
const vesselRepository = require("../repositories/vessel.repository");
const logger = require("../logger");

const DEFAULT_AIS_SEARCH_RADIUS_KM = 50;

/**
 * AisService — Business logic for AIS data ingestion, candidate queries, and track segments.
 */
const aisService = {
  DEFAULT_AIS_SEARCH_RADIUS_KM,

  /**
   * Ingest demonstration AIS dataset (vessels and track points) from bundled JSON.
   * Idempotent: safe to run multiple times without duplicating data.
   */
  async ingestDemoData() {
    logger.info("[AisService] Starting demonstration AIS dataset ingestion...");

    const vesselsPath = path.join(__dirname, "..", "data", "demo-vessels.json");
    const tracksPath = path.join(__dirname, "..", "data", "demo-ais-tracks.json");

    if (!fs.existsSync(vesselsPath) || !fs.existsSync(tracksPath)) {
      throw new Error(`Demo AIS dataset files not found at ${vesselsPath} or ${tracksPath}`);
    }

    const demoVessels = JSON.parse(fs.readFileSync(vesselsPath, "utf-8"));
    const demoTracks = JSON.parse(fs.readFileSync(tracksPath, "utf-8"));

    let upsertedVessels = 0;
    const vesselIdMap = new Map();

    for (const v of demoVessels) {
      const record = await vesselRepository.upsert({
        mmsi:       v.mmsi,
        imo:        v.imo,
        name:       v.name,
        flag:       v.flag,
        vesselType: v.vesselType || v.type,
        lengthM:    v.lengthM || v.length,
      });
      vesselIdMap.set(v.mmsi, record.id);
      upsertedVessels++;
    }

    // Group tracks by MMSI and save
    const tracksByMmsi = new Map();
    for (const pt of demoTracks) {
      if (!tracksByMmsi.has(pt.mmsi)) {
        tracksByMmsi.set(pt.mmsi, []);
      }
      tracksByMmsi.get(pt.mmsi).push(pt);
    }

    let insertedPoints = 0;
    for (const [mmsi, points] of tracksByMmsi.entries()) {
      const vesselId = vesselIdMap.get(mmsi);
      if (vesselId) {
        const res = await aisRepository.saveTrackPoints(vesselId, mmsi, points);
        insertedPoints += res.count;
      }
    }

    logger.info(`[AisService] Demo ingestion complete: ${upsertedVessels} vessels upserted, ${insertedPoints} track points processed.`);
    return {
      vesselsCount: upsertedVessels,
      trackPointsCount: insertedPoints,
      source: "demo",
    };
  },

  /**
   * Find candidate vessels near a spill origin within a temporal window and spatial radius.
   *
   * @param {{ latitude: number, longitude: number, originTimestamp?: string|Date }} spillOrigin
   * @param {number} [radiusKm=DEFAULT_AIS_SEARCH_RADIUS_KM] - Search radius in km
   * @param {number} [timeWindowHours=24] - Search window in hours around origin time
   */
  async findCandidatesNearSpill(
    spillOrigin,
    radiusKm = DEFAULT_AIS_SEARCH_RADIUS_KM,
    timeWindowHours = 24
  ) {
    if (!spillOrigin || spillOrigin.latitude == null || spillOrigin.longitude == null) {
      throw new Error("Invalid spill origin coordinates provided to findCandidatesNearSpill");
    }

    const effectiveRadius = Number(radiusKm) || DEFAULT_AIS_SEARCH_RADIUS_KM;
    const windowHours = Number(timeWindowHours) || 24;

    let startTime = null;
    let endTime = null;

    if (spillOrigin.originTimestamp) {
      const originMs = new Date(spillOrigin.originTimestamp).getTime();
      if (!isNaN(originMs)) {
        startTime = new Date(originMs - windowHours * 3600 * 1000);
        endTime = new Date(originMs + windowHours * 3600 * 1000);
      }
    }

    const candidates = await aisRepository.findCandidatesInTimeWindow(
      startTime,
      endTime,
      { latitude: Number(spillOrigin.latitude), longitude: Number(spillOrigin.longitude) },
      effectiveRadius
    );

    return {
      candidates,
      searchRadiusKm: effectiveRadius,
      timeWindowHours: windowHours,
      origin: {
        latitude: Number(spillOrigin.latitude),
        longitude: Number(spillOrigin.longitude),
        originTimestamp: spillOrigin.originTimestamp || null,
      },
    };
  },

  /**
   * Get track segment for a vessel by MMSI.
   *
   * @param {string} mmsi
   * @param {Date|string} [startTime]
   * @param {Date|string} [endTime]
   */
  async getTrackSegment(mmsi, startTime, endTime) {
    return aisRepository.findTrack(
      mmsi,
      startTime ? new Date(startTime) : undefined,
      endTime ? new Date(endTime) : undefined
    );
  },
};

module.exports = aisService;
