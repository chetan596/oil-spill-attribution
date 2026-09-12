const prisma = require("../db/database");
const { haversineDistance } = require("../scoring/haversine");

/**
 * AisRepository — persistence layer for AisTrack model.
 */
const aisRepository = {
  /**
   * Save multiple AIS track points for a vessel.
   * @param {string} vesselId
   * @param {string} mmsi
   * @param {Array<{ latitude, longitude, geomWkt?, timestamp, speedKnots?, headingDeg?, navStatus? }>} points
   */
  async saveTrackPoints(vesselId, mmsi, points) {
    const data = points.map((pt) => ({
      vesselId,
      mmsi:       String(mmsi),
      latitude:   Number(pt.latitude ?? pt.lat),
      longitude:  Number(pt.longitude ?? pt.lng),
      geomWkt:    pt.geomWkt || null,
      timestamp:  new Date(pt.timestamp),
      speedKnots: pt.speedKnots != null ? Number(pt.speedKnots) : (pt.SOG != null ? Number(pt.SOG) : null),
      headingDeg: pt.headingDeg != null ? Number(pt.headingDeg) : (pt.heading != null ? Number(pt.heading) : (pt.COG != null ? Number(pt.COG) : null)),
      navStatus:  pt.navStatus  || null,
    }));

    return prisma.aisTrack.createMany({ data, skipDuplicates: true });
  },

  /**
   * Get AIS track for an MMSI, optionally within a time window.
   * @param {string} mmsi
   * @param {Date} [startTime]
   * @param {Date} [endTime]
   */
  async findTrack(mmsi, startTime, endTime) {
    const where = { mmsi: String(mmsi) };
    if (startTime || endTime) {
      where.timestamp = {};
      if (startTime) where.timestamp.gte = new Date(startTime);
      if (endTime)   where.timestamp.lte = new Date(endTime);
    }

    return prisma.aisTrack.findMany({
      where,
      orderBy: { timestamp: "asc" },
    });
  },

  /**
   * Find nearest AIS track point for a vessel relative to a location.
   * @param {string} mmsi
   * @param {{ latitude: number, longitude: number }} location
   * @param {Date} [startTime]
   * @param {Date} [endTime]
   */
  async findNearestPoint(mmsi, location, startTime, endTime) {
    const track = await this.findTrack(mmsi, startTime, endTime);
    if (!track || track.length === 0) return null;

    let minDistanceKm = Infinity;
    let nearest = null;

    for (const pt of track) {
      const dist = haversineDistance(location.latitude, location.longitude, pt.latitude, pt.longitude);
      if (!isNaN(dist) && dist < minDistanceKm) {
        minDistanceKm = dist;
        nearest = { ...pt, distanceKm: dist };
      }
    }

    return nearest;
  },

  /**
   * Get track segment with optional linear interpolation between points.
   * @param {string} mmsi
   * @param {Date} startTime
   * @param {Date} endTime
   * @param {boolean} [interpolate=false]
   */
  async getTrackSegmentWithInterpolation(mmsi, startTime, endTime, interpolate = false) {
    const track = await this.findTrack(mmsi, startTime, endTime);
    if (!track || track.length <= 1 || !interpolate) {
      return track;
    }

    const interpolated = [];
    for (let i = 0; i < track.length - 1; i++) {
      const p1 = track[i];
      const p2 = track[i + 1];
      interpolated.push(p1);

      const t1 = new Date(p1.timestamp).getTime();
      const t2 = new Date(p2.timestamp).getTime();
      const dtMinutes = (t2 - t1) / (60 * 1000);

      // If gap is between 30 and 120 minutes, insert midpoint interpolation
      if (dtMinutes > 30 && dtMinutes <= 120) {
        const midTime = new Date(t1 + (t2 - t1) / 2);
        const midLat = (p1.latitude + p2.latitude) / 2;
        const midLng = (p1.longitude + p2.longitude) / 2;
        const midSpeed = p1.speedKnots != null && p2.speedKnots != null ? (p1.speedKnots + p2.speedKnots) / 2 : null;
        const midHeading = p1.headingDeg != null && p2.headingDeg != null ? (p1.headingDeg + p2.headingDeg) / 2 : null;

        interpolated.push({
          id: `interpolated-${p1.id}-${p2.id}`,
          vesselId: p1.vesselId,
          mmsi: p1.mmsi,
          latitude: Number(midLat.toFixed(5)),
          longitude: Number(midLng.toFixed(5)),
          geomWkt: null,
          timestamp: midTime,
          speedKnots: midSpeed != null ? Number(midSpeed.toFixed(1)) : null,
          headingDeg: midHeading != null ? Number(midHeading.toFixed(1)) : null,
          navStatus: p1.navStatus,
          isInterpolated: true,
        });
      }
    }
    interpolated.push(track[track.length - 1]);
    return interpolated;
  },

  /**
   * Find candidate vessels that passed within radiusKm of nearLocation within a time window.
   * Performs Haversine distance spatial filtering.
   *
   * @param {Date} startTime
   * @param {Date} endTime
   * @param {{ latitude: number, longitude: number }} [nearLocation]
   * @param {number} [radiusKm=50]
   */
  async findCandidatesInTimeWindow(startTime, endTime, nearLocation, radiusKm = 50) {
    const where = {};
    if (startTime || endTime) {
      where.timestamp = {};
      if (startTime) where.timestamp.gte = new Date(startTime);
      if (endTime)   where.timestamp.lte = new Date(endTime);
    }

    const allPointsInWindow = await prisma.aisTrack.findMany({
      where,
      include: { vessel: true },
      orderBy: { timestamp: "asc" },
    });

    if (!nearLocation || nearLocation.latitude == null || nearLocation.longitude == null) {
      // Return unique vessels if no spatial filter specified
      const seen = new Set();
      const candidates = [];
      for (const pt of allPointsInWindow) {
        if (!seen.has(pt.mmsi)) {
          seen.add(pt.mmsi);
          candidates.push({ vessel: pt.vessel, mmsi: pt.mmsi, samplePoint: pt });
        }
      }
      return candidates;
    }

    const originLat = Number(nearLocation.latitude);
    const originLng = Number(nearLocation.longitude);
    const effectiveRadius = Number(radiusKm) || 50;

    // Group track points by MMSI and evaluate min distance
    const vesselTracks = new Map();
    for (const pt of allPointsInWindow) {
      if (!vesselTracks.has(pt.mmsi)) {
        vesselTracks.set(pt.mmsi, { vessel: pt.vessel, points: [] });
      }
      vesselTracks.get(pt.mmsi).points.push(pt);
    }

    const candidates = [];
    for (const [mmsi, { vessel, points }] of vesselTracks.entries()) {
      let minDistanceKm = Infinity;
      let closestPoint = null;

      for (const pt of points) {
        const dist = haversineDistance(originLat, originLng, pt.latitude, pt.longitude);
        if (!isNaN(dist) && dist < minDistanceKm) {
          minDistanceKm = dist;
          closestPoint = pt;
        }
      }

      if (minDistanceKm <= effectiveRadius) {
        candidates.push({
          vessel,
          mmsi,
          minDistanceKm: Number(minDistanceKm.toFixed(4)),
          closestPoint,
          points,
        });
      }
    }

    return candidates.sort((a, b) => a.minDistanceKm - b.minDistanceKm);
  },
};

module.exports = aisRepository;
