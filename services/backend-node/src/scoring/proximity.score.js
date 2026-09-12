/**
 * Proximity Score Module — Spatial Correlation Heuristic
 *
 * Evaluates the spatial proximity of a vessel's track to the modelled spill origin.
 *
 * Formula:
 *   score = exp(-minDistanceKm / 15.0)
 *
 * Note: 15 km decay constant is a DEMONSTRATION HEURISTIC.
 */

const { haversineDistance } = require("./haversine");

const PROXIMITY_DECAY_SCALE_KM = 15.0;

/**
 * Calculate proximity score from minimum distance.
 *
 * @param {number} minDistanceKm
 * @returns {number} Score in [0, 1]
 */
function calculateProximityScoreFromDistance(minDistanceKm) {
  if (minDistanceKm == null || isNaN(minDistanceKm) || minDistanceKm < 0) {
    return 0.0;
  }
  const score = Math.exp(-minDistanceKm / PROXIMITY_DECAY_SCALE_KM);
  return Number(score.toFixed(4));
}

/**
 * Calculate proximity score from a vessel track and spill origin.
 *
 * @param {Array<Object>} trackPoints - Array of AIS track points { latitude, longitude, timestamp }
 * @param {{ latitude: number, longitude: number }} spillOrigin - Centroid / origin coordinates
 * @returns {{ score: number, minDistanceKm: number, closestPoint: Object|null, closestTimestamp: string|null }}
 */
function calculateProximityScore(trackPoints, spillOrigin) {
  // If trackPoints is a number (legacy scalar call), compute directly
  if (typeof trackPoints === "number") {
    const score = calculateProximityScoreFromDistance(trackPoints);
    return {
      score,
      minDistanceKm: trackPoints,
      closestPoint: null,
      closestTimestamp: null,
    };
  }

  if (
    !Array.isArray(trackPoints) ||
    trackPoints.length === 0 ||
    !spillOrigin ||
    spillOrigin.latitude == null ||
    spillOrigin.longitude == null
  ) {
    return {
      score: 0.0,
      minDistanceKm: Infinity,
      closestPoint: null,
      closestTimestamp: null,
    };
  }

  const originLat = Number(spillOrigin.latitude);
  const originLng = Number(spillOrigin.longitude);

  let minDistanceKm = Infinity;
  let closestPoint = null;

  for (const pt of trackPoints) {
    const ptLat = Number(pt.latitude ?? pt.lat);
    const ptLng = Number(pt.longitude ?? pt.lng);

    const dist = haversineDistance(originLat, originLng, ptLat, ptLng);
    if (!isNaN(dist) && dist < minDistanceKm) {
      minDistanceKm = dist;
      closestPoint = pt;
    }
  }

  if (minDistanceKm === Infinity) {
    return {
      score: 0.0,
      minDistanceKm: Infinity,
      closestPoint: null,
      closestTimestamp: null,
    };
  }

  const score = calculateProximityScoreFromDistance(minDistanceKm);

  return {
    score,
    minDistanceKm: Number(minDistanceKm.toFixed(4)),
    closestPoint: closestPoint
      ? {
          latitude: Number(closestPoint.latitude ?? closestPoint.lat),
          longitude: Number(closestPoint.longitude ?? closestPoint.lng),
          speedKnots: closestPoint.speedKnots != null ? Number(closestPoint.speedKnots) : (closestPoint.SOG != null ? Number(closestPoint.SOG) : null),
          headingDeg: closestPoint.headingDeg != null ? Number(closestPoint.headingDeg) : (closestPoint.heading != null ? Number(closestPoint.heading) : null),
        }
      : null,
    closestTimestamp: closestPoint ? new Date(closestPoint.timestamp).toISOString() : null,
  };
}

module.exports = {
  calculateProximityScore,
  calculateProximityScoreFromDistance,
  PROXIMITY_DECAY_SCALE_KM,
};
