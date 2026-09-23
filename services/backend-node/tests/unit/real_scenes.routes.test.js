const request = require("supertest");
const express = require("express");
const realScenesRoutes = require("../../src/routes/real-scenes.routes");

const app = express();
app.use(express.json());
app.use("/api/v1/real-scenes", realScenesRoutes);

describe("Real Scenes Routes & CDSE Diagnostics", () => {
  it("GET /api/v1/real-scenes should list available authenticated CDSE scenes", async () => {
    const res = await request(app).get("/api/v1/real-scenes");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(1);
    expect(res.body.data[0].id).toBe("cdse-s1a-mumbai-20240218");
    expect(res.body.data[0].isRealScene).toBe(true);
    expect(res.body.data[0].productUuid).toBe("3f5c4ba1-ed70-4065-91b9-2bbeb7ebfb79");
    expect(res.body.data[0].sourceProvider).toBe("Copernicus Data Space Ecosystem (CDSE)");
  });

  it("GET /api/v1/real-scenes/:sceneId should return scene details", async () => {
    const res = await request(app).get("/api/v1/real-scenes/cdse-s1a-mumbai-20240218");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.satellite).toBe("Sentinel-1A");
    expect(res.body.data.polarization).toBe("VV+VH");
    expect(res.body.data.passDirection).toBe("Descending");
    expect(res.body.data.groundTruthAvailable).toBe(false);
    expect(res.body.data.vesselAttributionEstablished).toBe(false);
    expect(res.body.data.driftOriginEstablished).toBe(false);
  });

  it("GET /api/v1/real-scenes/:sceneId/sar-metadata should return authentic provenance and calibrated dB statistics", async () => {
    const res = await request(app).get("/api/v1/real-scenes/cdse-s1a-mumbai-20240218/sar-metadata");
    expect(res.status).toBe(200);
    expect(res.body.sceneId).toBe("cdse-s1a-mumbai-20240218");
    expect(res.body.scenarioType).toBe("REAL_CDSE");
    expect(res.body.isRealScene).toBe(true);
    expect(res.body.sourceClassification).toBe("AUTHENTICATED_CDSE_SOURCE");
    expect(res.body.productUuid).toBe("3f5c4ba1-ed70-4065-91b9-2bbeb7ebfb79");
    expect(res.body.bounds).toBeDefined();
    expect(res.body.bounds.left).toBeCloseTo(72.716985, 4);
    expect(res.body.bounds.bottom).toBeCloseTo(18.965879, 4);
    expect(res.body.calibration.standard).toContain("ESA Sentinel-1 Radiometric Calibration");
    expect(res.body.calibratedDbStats.vv.mean_db).toBeDefined();
    expect(res.body.groundTruthAvailable).toBe(false);
    expect(res.body.vesselAttributionEstablished).toBe(false);
    expect(res.body.driftOriginEstablished).toBe(false);
  });

  it("GET /api/v1/real-scenes/:sceneId/diagnostics should return verified model response diagnostics and real MetOcean data", async () => {
    const res = await request(app).get("/api/v1/real-scenes/cdse-s1a-mumbai-20240218/diagnostics");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const diag = res.body.data;
    expect(diag.validation_type).toBe("REAL_CDSE_SAR_LIVE_SCENE_BASELINE_INFERENCE");
    expect(diag.active_model.model_id).toBe("unet-dual-pol-sar-v2");
    expect(diag.model_response_diagnostics.probability_statistics.max).toBeCloseTo(0.362835, 4);
    expect(diag.model_response_diagnostics.probability_statistics.mean).toBeCloseTo(0.024305, 4);
    expect(diag.model_response_diagnostics.probability_statistics.median).toBeCloseTo(0.022336, 4);
    expect(diag.model_response_diagnostics.candidate_detection.threshold_0_50.positive_pixels).toBe(0);
    expect(diag.model_response_diagnostics.candidate_detection.threshold_0_35.positive_pixels).toBe(1);
    expect(diag.co_registered_metocean.era5_wind_speed_ms).toBeCloseTo(2.79, 2);
    expect(diag.co_registered_metocean.noaa_crw_sst_deg_c).toBeCloseTo(26.30, 2);
    expect(diag.ais_attribution_status.status).toBe("NOT_ESTABLISHED");
    expect(diag.drift_origin_status.status).toBe("NOT_ESTABLISHED");
  });

  it("GET /api/v1/real-scenes/:sceneId/sar-preview should stream preview PNG", async () => {
    const res = await request(app).get("/api/v1/real-scenes/cdse-s1a-mumbai-20240218/sar-preview");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.body.length).toBeGreaterThan(0);
  });
});
