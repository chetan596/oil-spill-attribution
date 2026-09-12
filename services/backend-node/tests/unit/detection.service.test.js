const {
  runSarDetection,
  geojsonPolygonToWkt,
  computePolygonCentroid,
} = require("../../src/services/detection.service");

describe("DetectionService Integration Client", () => {
  describe("geojsonPolygonToWkt", () => {
    it("should convert a GeoJSON polygon to standard PostGIS WKT format", () => {
      const poly = {
        type: "Polygon",
        coordinates: [
          [
            [72.8, 18.9],
            [72.86, 18.9],
            [72.86, 18.94],
            [72.8, 18.94],
            [72.8, 18.9],
          ],
        ],
      };
      const wkt = geojsonPolygonToWkt(poly);
      expect(wkt).toBe(
        "POLYGON((72.8 18.9, 72.86 18.9, 72.86 18.94, 72.8 18.94, 72.8 18.9))"
      );
    });

    it("should return null for empty or malformed polygon", () => {
      expect(geojsonPolygonToWkt(null)).toBeNull();
      expect(geojsonPolygonToWkt({})).toBeNull();
      expect(geojsonPolygonToWkt({ coordinates: [] })).toBeNull();
    });
  });

  describe("computePolygonCentroid", () => {
    it("should compute average coordinates of the polygon boundary", () => {
      const poly = {
        type: "Polygon",
        coordinates: [
          [
            [72.0, 18.0],
            [74.0, 18.0],
            [74.0, 20.0],
            [72.0, 20.0],
          ],
        ],
      };
      const centroid = computePolygonCentroid(poly);
      expect(centroid.latitude).toBe(19.0);
      expect(centroid.longitude).toBe(73.0);
    });
  });

  describe("runSarDetection with DEMO_MODE fallback", () => {
    it("should return deterministic demonstration scenario when DEMO_MODE is true", async () => {
      const result = await runSarDetection({ sarSceneId: "demo-scene-001" });
      expect(result).toBeDefined();
      expect(result.detectionStatus).toBe("detected");
      expect(result.confidence).toBe(0.94);
      expect(result.areaKm2).toBe(4.73);
      expect(result.geomWkt).toContain("POLYGON");
      expect(result.processingMetadata.mode).toBe("demo_fallback");
    });
  });
});
