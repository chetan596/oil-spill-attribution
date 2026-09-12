/**
 * Geometry Utility Functions for Spatial Data in WKT / GeoJSON format.
 *
 * NOTE on Coordinate Ordering:
 * - WKT & GeoJSON standard format: [longitude, latitude] (X, Y)
 * - Leaflet format: [latitude, longitude] (Y, X)
 */

/**
 * Parse WKT POLYGON into Leaflet coordinates array [[lat, lng], [lat, lng], ...]
 * @param {string} wkt - e.g. "POLYGON((72.800 18.900, 72.860 18.900, ...))"
 * @returns {Array<[number, number]>} Array of [lat, lng] points
 */
export function parseWktPolygon(wkt) {
  if (!wkt || typeof wkt !== 'string') return [];

  try {
    const match = wkt.match(/\(\((.*?)\)\)/);
    if (!match || !match[1]) return [];

    const coordinatePairs = match[1].split(',');
    const latLngs = coordinatePairs
      .map((pair) => {
        const parts = pair.trim().split(/\s+/);
        if (parts.length < 2) return null;
        const lng = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        if (isNaN(lat) || isNaN(lng)) return null;
        // Leaflet expects [latitude, longitude]
        return [lat, lng];
      })
      .filter(Boolean);

    return latLngs;
  } catch (err) {
    console.warn('Failed to parse WKT Polygon:', wkt, err);
    return [];
  }
}

/**
 * Parse WKT POINT into Leaflet [lat, lng]
 * @param {string} wkt - e.g. "POINT(72.832 18.921)"
 * @returns {[number, number]|null} [lat, lng]
 */
export function parseWktPoint(wkt) {
  if (!wkt || typeof wkt !== 'string') return null;

  try {
    const match = wkt.match(/POINT\s*\((.*?)\)/i);
    if (!match || !match[1]) return null;

    const parts = match[1].trim().split(/\s+/);
    if (parts.length < 2) return null;
    const lng = parseFloat(parts[0]);
    const lat = parseFloat(parts[1]);
    if (isNaN(lat) || isNaN(lng)) return null;

    return [lat, lng];
  } catch (err) {
    console.warn('Failed to parse WKT Point:', wkt, err);
    return null;
  }
}

/**
 * Compute bounding box [ [minLat, minLng], [maxLat, maxLng] ] for a set of [lat, lng] points.
 * @param {Array<[number, number]>} points
 * @returns {[[number, number], [number, number]]|null}
 */
export function calculateBounds(points) {
  if (!points || points.length === 0) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const [lat, lng] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  if (minLat === Infinity) return null;
  return [[minLat, minLng], [maxLat, maxLng]];
}
