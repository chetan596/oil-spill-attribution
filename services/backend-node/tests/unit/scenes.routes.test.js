const request = require("supertest");
const express = require("express");
const scenesRoutes = require("../../src/routes/scenes.routes");

const app = express();
app.use(express.json());
app.use("/api/v1/scenes", scenesRoutes);

describe("Scenes Routes & SAR Preview", () => {
  it("should return demonstration metadata for demo-scene-001 when ML service is mocked/offline", async () => {
    const res = await request(app).get("/api/v1/scenes/demo-scene-001/sar-metadata");
    expect(res.status).toBe(200);
    expect(res.body.sceneId).toBe("demo-scene-001");
    expect(res.body.sourceClassification).toBe("DEMONSTRATION_SYNTHETIC_SAR");
    expect(res.body.previewAvailable).toBe(true);
    expect(res.body.boundsCompatibility).toBeDefined();
    expect(res.body.detectionModel).toBe("unet-dual-pol-sar-v2");
    expect(res.body.threshold).toBe(0.35);
    expect(res.body.bands).toEqual(["VV"]);
  });

  it("should return demonstration metadata for demo-scene-002 independently", async () => {
    const res = await request(app).get("/api/v1/scenes/demo-scene-002/sar-metadata");
    expect(res.status).toBe(200);
    expect(res.body.sceneId).toBe("demo-scene-002");
    expect(res.body.sourceClassification).toBe("DEMONSTRATION_SYNTHETIC_SAR");
    expect(res.body.previewAvailable).toBe(true);
  });

  it("should serve VV and mask preview for demo-scene-001 and reject unavailable VH channel", async () => {
    const vvRes = await request(app).get("/api/v1/scenes/demo-scene-001/sar-preview?channel=vv");
    expect(vvRes.status).toBe(200);
    expect(vvRes.headers["content-type"]).toContain("image/png");

    const maskRes = await request(app).get("/api/v1/scenes/demo-scene-001/sar-preview?channel=mask");
    expect(maskRes.status).toBe(200);
    expect(maskRes.headers["content-type"]).toContain("image/png");

    const vhRes = await request(app).get("/api/v1/scenes/demo-scene-001/sar-preview?channel=vh");
    expect(vhRes.status).toBe(404);
    expect(vhRes.body.errorCode).toBe("CHANNEL_UNAVAILABLE");
    expect(vhRes.body.error).toContain("VH raster unavailable for this synthetic scenario");
  });

  it("should return 404 for unknown scene without demo scenario", async () => {
    const res = await request(app).get("/api/v1/scenes/unknown-scene-999/sar-metadata");
    expect(res.status).toBe(404);
    expect(res.body.previewAvailable).toBe(false);
  });

  it("should return positive validation scene metadata and metrics for real_part1_oil_00000", async () => {
    const res = await request(app).get("/api/v1/scenes/real_part1_oil_00000/sar-metadata");
    expect(res.status).toBe(200);
    expect(res.body.sceneId).toBe("real_part1_oil_00000");
    expect(res.body.datasetPart).toContain("Part I");
    expect(res.body.filename).toBe("00000.tif");
    expect(res.body.detectionModel).toBe("unet-dual-pol-sar-v2");
    expect(res.body.threshold).toBe(0.35);
    expect(res.body.groundTruthAvailable).toBe(true);
    expect(res.body.groundTruthPixelCount).toBe(14539);
    expect(res.body.groundTruthAreaKm2).toBe(0.8303);
    expect(res.body.predictedAreaKm2).toBe(0.3934);
    expect(res.body.validationMetrics).toBeDefined();
    expect(res.body.validationMetrics.iou).toBe(0.0);
    expect(res.body.validationMetrics.dice).toBe(0.0);
    expect(res.body.validationMetrics.precision).toBe(0.0);
    expect(res.body.validationMetrics.recall).toBe(0.0);
    expect(res.body.provenanceRecord).toBeDefined();
    expect(res.body.provenanceRecord.dataset).toBe("Sentinel-1 SAR Oil Spill Dataset");
    expect(res.body.provenanceRecord.datasetPart).toBe("Part I");
  });
});
