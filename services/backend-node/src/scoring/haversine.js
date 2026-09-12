/**
 * Haversine Distance Calculator — Pure Deterministic Great-Circle Distance
 *
 * Calculates the great-circle distance between two geographic coordinates
 * on Earth using the Haversine formula.
 */

const EARTH_RADIUS_KM = 6371.0;

/**
 * Convert degrees to radians.
 * @param {number} deg
 * @returns {number}
 */
function toRadians(deg) {
  return (deg * Math.PI) / 180.0;
}

/**
 * Calculate the great-circle distance between two coordinates in kilometers.
 *
 * @param {number} lat1 - Latitude of point 1 in degrees (-90 to 90)
 * @param {number} lng1 - Longitude of point 1 in degrees (-180 to 180)
 * @param {number} lat2 - Latitude of point 2 in degrees (-90 to 90)
 * @param {number} lng2 - Longitude of point 2 in degrees (-180 to 180)
 * @returns {number} Distance in kilometers, or NaN if input is invalid
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  // Validate presence and numeric type
  if (
    lat1 == null || lng1 == null || lat2 == null || lng2 == null ||
    typeof lat1 !== "number" || typeof lng1 !== "number" ||
    typeof lat2 !== "number" || typeof lng2 !== "number" ||
    isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)
  ) {
    return NaN;
  }

  // Validate geographic coordinate boundaries
  if (
    lat1 < -90 || lat1 > 90 ||
    lat2 < -90 || lat2 > 90 ||
    lng1 < -180 || lng1 > 180 ||
    lng2 < -180 || lng2 > 180
  ) {
    return NaN;
  }

  // If points are identical, distance is exactly 0
  if (lat1 === lat2 && lng1 === lng2) {
    return 0.0;
  }

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const radLat1 = toRadians(lat1);
  const radLat2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(radLat1) * Math.cos(radLat2) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  // Clamp 'a' to [0, 1] to avoid precision errors with asin / atan2
  const clampedA = Math.max(0, Math.min(1, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));

  return Number((EARTH_RADIUS_KM * c).toFixed(4));
}

module.exports = {
  haversineDistance,
  EARTH_RADIUS_KM,
};
