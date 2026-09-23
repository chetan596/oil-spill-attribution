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
    it("should return deterministic canonical baseline scenario for demo-scene-001", async () => {
      const result = await runSarDetection({ sarSceneId: "demo-scene-001" });
      expect(result).toBeDefined();
      expect(result.detectionStatus).toBe("detected");
      expect(result.confidence).toBe(0.94);
      expect(result.areaKm2).toBe(4.73);
      expect(result.latitude).toBe(18.921);
      expect(result.longitude).toBe(72.832);
      expect(result.geomWkt).toContain("POLYGON");
      expect(result.processingMetadata.mode).toBe("demo_fallback");
    });

    it("should return distinct deterministic scenario for demo-scene-002 (Gulf of Kutch)", async () => {
      const result = await runSarDetection({ sarSceneId: "demo-scene-002" });
      expect(result).toBeDefined();
      expect(result.detectionStatus).toBe("detected");
      expect(result.confidence).toBe(0.91);
      expect(result.areaKm2).toBe(2.85);
      expect(result.latitude).toBe(22.45);
      expect(result.longitude).toBe(69.21);
      expect(result.geomWkt).toContain("69.18");
    });

    it("should return distinct deterministic scenario for demo-scene-003 (Bay of Bengal)", async () => {
      const result = await runSarDetection({ sarSceneId: "demo-scene-003" });
      expect(result).toBeDefined();
      expect(result.confidence).toBe(0.89);
      expect(result.areaKm2).toBe(5.2);
      expect(result.latitude).toBe(20.15);
      expect(result.longitude).toBe(86.92);
      expect(result.geomWkt).toContain("86.88");
    });

    it("should ensure all demonstration scenario centroids are geographically distinct", async () => {
      const s1 = await runSarDetection({ sarSceneId: "demo-scene-001" });
      const s2 = await runSarDetection({ sarSceneId: "demo-scene-002" });
      const s3 = await runSarDetection({ sarSceneId: "demo-scene-003" });
      const s4 = await runSarDetection({ sarSceneId: "demo-scene-004" });

      expect(s1.latitude).not.toBe(s2.latitude);
      expect(s2.latitude).not.toBe(s3.latitude);
      expect(s3.latitude).not.toBe(s4.latitude);
      expect(s1.longitude).not.toBe(s2.longitude);
      expect(s2.longitude).not.toBe(s3.longitude);
      expect(s3.longitude).not.toBe(s4.longitude);
    });
  });

  describe("runSarDetection with REAL CDSE acquisitions", () => {
    it("should process target S1D product without falling back to demo-scene-001", async () => {
      const targetId = "S1D_IW_GRDH_1SDV_20260906T010237_20260906T010309_004450_0083F6_023C_COG.SAFE";
      const bbox = [70.999428, 17.158438, 73.746742, 19.474159];

      const result = await runSarDetection({
        sarSceneId: targetId,
        metadata: {
          productName: targetId,
          platform: "Sentinel-1D",
          acquisitionStart: "2026-09-06T01:02:37Z",
          polarization: "VV+VH",
          orbitDirection: "DESCENDING",
          bbox,
        },
      });

      expect(result).toBeDefined();
      expect(result.detectionStatus).toBe("unlabelled_live_scene");
      expect(result.processingMetadata.scenarioType).toBe("REAL_CDSE");
      expect(result.processingMetadata.satellite).toBe("Sentinel-1D");
      expect(result.processingMetadata.productName).toBe(targetId);
      expect(result.processingMetadata.vesselAttributionStatus).toBe("NOT_ESTABLISHED");
      expect(result.processingMetadata.driftOriginStatus).toBe("NOT_ESTABLISHED");
      expect(result.processingMetadata.mode).not.toBe("demo_fallback");
      expect(result.processingMetadata.scenarioId).toBeUndefined();

      // Check genuine centroid computed from real bbox
      const expectedLat = Number(((17.158438 + 19.474159) / 2).toFixed(6));
      const expectedLng = Number(((70.999428 + 73.746742) / 2).toFixed(6));
      expect(result.centroidLat).toBe(expectedLat);
      expect(result.centroidLng).toBe(expectedLng);
    });
  });
});
