/**
 * Trajectory Score Module — Geometric & Kinematic Path Alignment
 *
 * Evaluates the vessel trajectory kinematics:
 *   - CPA (Closest Point of Approach) distance
 *   - Heading consistency across the candidate track
 *   - Speed consistency across the candidate track
 *   - Time to origin
 *
 * IMPORTANT SCIENTIFIC NOTICE:
 * Trajectory alignment and speed anomalies reflect kinematic correlation
 * and movement patterns. They do NOT constitute proof of illegal discharge
 * or bilge dumping.
 */

const { haversineDistance } = require("./haversine");

/**
 * Compute sample standard deviation of an array of numbers.
 */
function computeStdDev(values) {
  if (!values || values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Calculate trajectory score and kinematic metrics.
 *
 * @param {Array<Object>} trackPoints - Array of ordered AIS track points
 * @param {{ latitude: number, longitude: number, originTimestamp?: string|Date }} spillOrigin
 * @returns {{
 *   score: number,
 *   cpaDistanceKm: number,
 *   headingConsistency: number,
 *   speedConsistency: number,
 *   timeToOriginHours: number|null,
 *   description: string
 * }}
 */
function calculateTrajectoryMatchScore(trackPoints, spillOrigin) {
  if (
    !Array.isArray(trackPoints) ||
    trackPoints.length === 0 ||
    !spillOrigin ||
    spillOrigin.latitude == null ||
    spillOrigin.longitude == null
  ) {
    return {
      score: 0.0,
      cpaDistanceKm: Infinity,
      headingConsistency: 0.0,
      speedConsistency: 0.0,
      timeToOriginHours: null,
      description: "Insufficient track points or missing spill origin.",
    };
  }

  const originLat = Number(spillOrigin.latitude);
  const originLng = Number(spillOrigin.longitude);
  const originTimeMs = spillOrigin.originTimestamp
    ? new Date(spillOrigin.originTimestamp).getTime()
    : null;

  let minDistanceKm = Infinity;
  let closestPoint = null;
  const headings = [];
  const speeds = [];

  for (const pt of trackPoints) {
    const lat = Number(pt.latitude ?? pt.lat);
    const lng = Number(pt.longitude ?? pt.lng);
    const dist = haversineDistance(originLat, originLng, lat, lng);

    if (!isNaN(dist) && dist < minDistanceKm) {
      minDistanceKm = dist;
      closestPoint = pt;
    }

    const heading = pt.headingDeg != null ? Number(pt.headingDeg) : (pt.heading != null ? Number(pt.heading) : (pt.COG != null ? Number(pt.COG) : null));
    if (heading != null && !isNaN(heading)) {
      headings.push(heading);
    }

    const speed = pt.speedKnots != null ? Number(pt.speedKnots) : (pt.SOG != null ? Number(pt.SOG) : null);
    if (speed != null && !isNaN(speed)) {
      speeds.push(speed);
    }
  }

  if (minDistanceKm === Infinity) {
    return {
      score: 0.0,
      cpaDistanceKm: Infinity,
      headingConsistency: 0.0,
      speedConsistency: 0.0,
      timeToOriginHours: null,
      description: "Invalid coordinates across track.",
    };
  }

  // Heading consistency: std dev of heading mapped to [0, 1]
  const headingStd = computeStdDev(headings);
  const headingConsistency = Number((1.0 / (1.0 + headingStd / 30.0)).toFixed(4));

  // Speed consistency: std dev of speed mapped to [0, 1]
  const speedStd = computeStdDev(speeds);
  const speedConsistency = Number((1.0 / (1.0 + speedStd / 5.0)).toFixed(4));

  // Time to origin hours
  let timeToOriginHours = null;
  if (closestPoint && originTimeMs && !isNaN(originTimeMs)) {
    const ptTimeMs = new Date(closestPoint.timestamp).getTime();
    if (!isNaN(ptTimeMs)) {
      timeToOriginHours = Number((Math.abs(ptTimeMs - originTimeMs) / (3600 * 1000)).toFixed(4));
    }
  }

  // CPA score component: exponential decay (scale = 20 km)
  const cpaScore = Math.exp(-minDistanceKm / 20.0);

  // Composite trajectory score
  const score = Number(
    (cpaScore * 0.50 + headingConsistency * 0.25 + speedConsistency * 0.25).toFixed(4)
  );

  return {
    score,
    cpaDistanceKm: Number(minDistanceKm.toFixed(4)),
    headingConsistency,
    speedConsistency,
    timeToOriginHours,
    description: "Modelled trajectory kinematics and closest point of approach correlation.",
  };
}

module.exports = {
  calculateTrajectoryMatchScore,
};
