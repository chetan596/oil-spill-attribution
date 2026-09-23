/**
 * Phase 16.2 — Part 3: Optical RGB Contract Backend Integration Tests
 *
 * Assertions:
 * 1. POST /analyze with DRONE → 200, KERF model
 * 2. POST /analyze with SATELLITE_RGB → 200, MADOS RGB model
 * 3. POST /analyze with UNKNOWN → 400 MODEL_INPUT_MISMATCH
 * 4. POST /analyze with SAR model on RGB → 400 MODEL_INPUT_MISMATCH
 * 5. POST /analyze with Sentinel-2 model on RGB → 400 MODEL_INPUT_MISMATCH
 * 6. Artifacts returned (mask, annotated, probabilityMap)
 * 7. Response envelope structure is valid (success, data/error)
 */

const request = require("supertest");
const app = require("../../src/app");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const prisma = require("../../src/db/database");

jest.mock("axios");

describe("Phase 16.2 Part 3 — Optical RGB Backend Contract Integration", () => {
  const scratchDir = path.resolve(__dirname, "../../scratch/phase16_2_rgb_tests");

  beforeAll(() => {
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true });
    }
  });

  afterAll(async () => {
    if (fs.existsSync(scratchDir)) {
      try {
        fs.rmSync(scratchDir, { recursive: true, force: true });
      } catch (_) {}
    }
    await prisma.$disconnect();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createJpegBuffer = () => {
    const buf = Buffer.alloc(128);
    buf[0] = 0xff; buf[1] = 0xd8; // SOI
    buf[2] = 0xff; buf[3] = 0xc0; // SOF0
    buf.writeUInt16BE(17, 4);     // length
    buf[6] = 8;                   // precision
    buf.writeUInt16BE(256, 7);    // height
    buf.writeUInt16BE(256, 9);    // width
    buf[11] = 3;                  // 3 components (RGB)
    return buf;
  };

  test("1. POST /analyze with DRONE → 200, KERF model (kerf-resnet34-focaldice-v1)", async () => {
    const uploadRes = await request(app)
      .post("/api/v1/manual-analysis/upload")
      .attach("image", createJpegBuffer(), "drone_capture.jpg");

    expect(uploadRes.status).toBe(201);
    const { jobId } = uploadRes.body.data;

    axios.post.mockResolvedValueOnce({
      status: 200,
      data: {
        status: "COMPLETED",
        model: {
          modelId: "kerf-resnet34-focaldice-v1",
          modelVersion: "1.0.0",
          modelName: "KERF Drone/Aerial RGB ResNet-34 U-Net",
          domain: "DRONE_AERIAL_RGB",
        },
        segmentation: {
          performed: true,
          oil_detected: true,
          confidence_threshold: 0.50,
        },
        artifacts: {
          original_image: `/tmp/job_${jobId}_original.png`,
          mask_image: `/tmp/job_${jobId}_mask.png`,
          annotated_image: `/tmp/job_${jobId}_annotated.png`,
          probability_map: `/tmp/job_${jobId}_probability_map.png`,
        },
        inference_time_ms: 120.0,
      },
    });

    const analyzeRes = await request(app)
      .post(`/api/v1/manual-analysis/${jobId}/analyze`)
      .send({
        source_type: "DRONE",
        model_id: "kerf-resnet34-focaldice-v1",
      });

    expect(analyzeRes.status).toBe(200);
    expect(analyzeRes.body.success).toBe(true);
    const data = analyzeRes.body.data;
    expect(data.status).toBe("COMPLETED");
    expect(data.model.modelId).toBe("kerf-resnet34-focaldice-v1");
    expect(data.artifacts.mask).toBe(`/api/v1/manual-analysis/${jobId}/mask`);
    expect(data.artifacts.annotated).toBe(`/api/v1/manual-analysis/${jobId}/annotated`);
    expect(data.artifacts.probabilityMap).toBe(`/api/v1/manual-analysis/${jobId}/probability-map`);
  });

  test("2. POST /analyze with SATELLITE_RGB → 200, MADOS RGB model (mados-resnet34-rgb-v1)", async () => {
    const uploadRes = await request(app)
      .post("/api/v1/manual-analysis/upload")
      .attach("image", createJpegBuffer(), "satellite_capture.jpg");

    expect(uploadRes.status).toBe(201);
    const { jobId } = uploadRes.body.data;

    axios.post.mockResolvedValueOnce({
      status: 200,
      data: {
        status: "COMPLETED",
        model: {
          modelId: "mados-resnet34-rgb-v1",
          modelVersion: "1.0.0",
          modelName: "MADOS Sentinel-2 RGB Satellite Fallback ResNet-34 U-Net",
          domain: "RGB_SATELLITE",
        },
        segmentation: {
          performed: true,
          oil_detected: false,
          confidence_threshold: 0.50,
        },
        artifacts: {
          original_image: `/tmp/job_${jobId}_original.png`,
          mask_image: `/tmp/job_${jobId}_mask.png`,
          annotated_image: `/tmp/job_${jobId}_annotated.png`,
          probability_map: `/tmp/job_${jobId}_probability_map.png`,
        },
        inference_time_ms: 110.0,
      },
    });

    const analyzeRes = await request(app)
      .post(`/api/v1/manual-analysis/${jobId}/analyze`)
      .send({
        source_type: "SATELLITE_RGB",
        model_id: "mados-resnet34-rgb-v1",
      });

    expect(analyzeRes.status).toBe(200);
    expect(analyzeRes.body.success).toBe(true);
    const data = analyzeRes.body.data;
    expect(data.status).toBe("COMPLETED");
    expect(data.model.modelId).toBe("mados-resnet34-rgb-v1");
  });

  test("3. POST /analyze with UNKNOWN → 400 MODEL_INPUT_MISMATCH", async () => {
    const uploadRes = await request(app)
      .post("/api/v1/manual-analysis/upload")
      .attach("image", createJpegBuffer(), "unknown_sample.jpg");

    const { jobId } = uploadRes.body.data;

    const analyzeRes = await request(app)
      .post(`/api/v1/manual-analysis/${jobId}/analyze`)
      .send({
        source_type: "UNKNOWN",
        model_id: "kerf-resnet34-focaldice-v1",
      });

    expect(analyzeRes.status).toBe(400);
    expect(analyzeRes.body.success).toBe(false);
    expect(analyzeRes.body.error.code).toBe("MODEL_INPUT_MISMATCH");
    expect(analyzeRes.body.error.message).toContain("UNKNOWN");
  });

  test("4. POST /analyze with SAR model on RGB → 400 MODEL_INPUT_MISMATCH", async () => {
    const uploadRes = await request(app)
      .post("/api/v1/manual-analysis/upload")
      .attach("image", createJpegBuffer(), "rgb_sample.jpg");

    const { jobId } = uploadRes.body.data;

    const analyzeRes = await request(app)
      .post(`/api/v1/manual-analysis/${jobId}/analyze`)
      .send({
        source_type: "DRONE",
        model_id: "unet-dual-pol-sar-v09d-residual-loss",
      });

    expect(analyzeRes.status).toBe(400);
    expect(analyzeRes.body.success).toBe(false);
    expect(analyzeRes.body.error.code).toBe("MODEL_INPUT_MISMATCH");
  });

  test("5. POST /analyze with Sentinel-2 MS model on RGB → 400 MODEL_INPUT_MISMATCH", async () => {
    const uploadRes = await request(app)
      .post("/api/v1/manual-analysis/upload")
      .attach("image", createJpegBuffer(), "rgb_sample.jpg");

    const { jobId } = uploadRes.body.data;

    const analyzeRes = await request(app)
      .post(`/api/v1/manual-analysis/${jobId}/analyze`)
      .send({
        source_type: "DRONE",
        model_id: "mados-resnet34-rgbnir-swir-v1",
      });

    expect(analyzeRes.status).toBe(400);
    expect(analyzeRes.body.success).toBe(false);
    expect(analyzeRes.body.error.code).toBe("MODEL_INPUT_MISMATCH");
  });

  test("6 & 7. Response envelope and artifact links format verification", async () => {
    const uploadRes = await request(app)
      .post("/api/v1/manual-analysis/upload")
      .attach("image", createJpegBuffer(), "envelope_test.jpg");

    const { jobId } = uploadRes.body.data;

    axios.post.mockResolvedValueOnce({
      status: 200,
      data: {
        status: "COMPLETED",
        model: {
          modelId: "kerf-resnet34-focaldice-v1",
        },
        segmentation: {
          performed: true,
          oil_detected: false,
        },
        artifacts: {
          original_image: `/tmp/job_${jobId}_orig.png`,
          mask_image: `/tmp/job_${jobId}_mask.png`,
          annotated_image: `/tmp/job_${jobId}_annotated.png`,
          probability_map: `/tmp/job_${jobId}_prob.png`,
        },
      },
    });

    const analyzeRes = await request(app)
      .post(`/api/v1/manual-analysis/${jobId}/analyze`)
      .send({
        source_type: "DRONE",
        model_id: "kerf-resnet34-focaldice-v1",
      });

    expect(analyzeRes.status).toBe(200);
    expect(analyzeRes.body).toHaveProperty("success", true);
    expect(analyzeRes.body).toHaveProperty("data");
    expect(analyzeRes.body.data).toHaveProperty("artifacts");
    expect(analyzeRes.body.data.artifacts).toHaveProperty("mask");
    expect(analyzeRes.body.data.artifacts).toHaveProperty("annotated");
    expect(analyzeRes.body.data.artifacts).toHaveProperty("probabilityMap");
  });
});
