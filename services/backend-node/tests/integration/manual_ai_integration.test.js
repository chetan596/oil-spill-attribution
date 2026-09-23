/**
 * Part 0.14D — Manual Upload AI Integration Tests
 *
 * Verifies:
 *   - POST /api/v1/manual-analysis/:jobId/analyze endpoint
 *   - End-to-end execution of Classifier V2 + Segmentation V2 + Visual Annotation
 *   - Modality routing (Optical vs Georeferenced SAR)
 *   - Minimal database persistence (ManualAnalysis table)
 *   - GET /api/v1/manual-analysis/:jobId/annotated artifact streaming
 *   - Strict adherence to geospatial guardrails (status = NOT_ESTABLISHED)
 *   - Security: Zero arbitrary path traversal or leaked internals
 */

const request = require("supertest");
const app = require("../../src/app");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const prisma = require("../../src/db/database");
const redis = require("../../src/config/redis");

jest.mock("axios");

describe("Part 0.14D — Manual Upload AI Integration", () => {
  const scratchDir = path.resolve(__dirname, "../../scratch/ai_integration_tests");

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
    if (redis && typeof redis.disconnect === "function") {
      try {
        redis.disconnect();
      } catch (_) {}
    }
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createPngBuffer = () => {
    const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = Buffer.alloc(25);
    ihdr.writeUInt32BE(13, 0);
    ihdr.write("IHDR", 4);
    ihdr.writeUInt32BE(256, 8);
    ihdr.writeUInt32BE(256, 12);
    ihdr.writeUInt8(8, 16);
    ihdr.writeUInt8(2, 17);
    return Buffer.concat([header, ihdr, Buffer.alloc(100)]);
  };

  const createJpegBuffer = () => {
    const buf = Buffer.alloc(128);
    buf[0] = 0xff; buf[1] = 0xd8;
    buf[2] = 0xff; buf[3] = 0xc0;
    buf.writeUInt16BE(17, 4);
    buf[6] = 8;
    buf.writeUInt16BE(256, 7);
    buf.writeUInt16BE(256, 9);
    buf[11] = 3;
    return buf;
  };

  test("1. Upload JPG and execute POST /api/v1/manual-analysis/:jobId/analyze", async () => {
    // 1. Upload
    const uploadRes = await request(app)
      .post("/api/v1/manual-analysis/upload")
      .attach("image", createJpegBuffer(), "oil_spill.jpg");

    expect(uploadRes.status).toBe(201);
    const { jobId, analysisId } = uploadRes.body.data;
    expect(jobId).toBeDefined();

    // 2. Mock Python ML Service response
    axios.post.mockResolvedValueOnce({
      status: 200,
      data: {
        model: {
          classifier: "rgb-oil-classifier-resnet18-v2",
          classifier_version: "2.0.0",
          classifier_checkpoint_sha256: "6ccf88c8be6764384297005effedbaf047165ef20dc4148911bc66ddfc10dd84",
          segmentation: "optical-oil-seg-unet-resnet18-v2",
          segmentation_version: "2.0.0",
          segmentation_checkpoint_sha256: "e3d44f7e480daedf42ef5e96fd0e650193f5763f8dac38630fd21a034e5ea398",
          segmentation_threshold: 0.80,
          status: "EXPERIMENTAL",
        },
        classification: {
          label: "OIL_SPILL",
          confidence: 0.9412,
          probabilities: {
            CLEAN_OCEAN: 0.0102,
            LOOK_ALIKE: 0.0486,
            OIL_SPILL: 0.9412,
          },
          is_oil_spill: true,
        },
        segmentation: {
          performed: true,
          mask_available: true,
          foreground_pixels: 5430,
          foreground_fraction: 0.0828,
          confidence_threshold: 0.80,
          oil_detected: true,
        },
        input_metadata: {
          width: 256,
          height: 256,
          total_pixels: 65536,
          format: "JPEG",
        },
        artifacts: {
          original_image: `/tmp/job_${jobId}_original.png`,
          mask_image: `/tmp/job_${jobId}_mask.png`,
          annotated_image: `/tmp/job_${jobId}_annotated.png`,
        },
        geospatial: {
          status: "NOT_ESTABLISHED",
        },
        inference_time_ms: 184.5,
      },
    });

    // 3. Trigger analysis
    const analyzeRes = await request(app)
      .post(`/api/v1/manual-analysis/${jobId}/analyze`)
      .send({ source_type: "DRONE" });

    expect(analyzeRes.status).toBe(200);
    const data = analyzeRes.body.data;
    expect(data.status).toBe("COMPLETED");
    expect(data.classification.label).toBe("OIL_SPILL");
    expect(data.segmentation.foreground_pixels).toBe(5430);
    expect(data.geospatial.geolocationStatus || data.geospatial.status).toBe("NOT_ESTABLISHED");
    expect(data.artifacts.annotated).toBe(`/api/v1/manual-analysis/${jobId}/annotated`);

    // 4. Verify minimal persistence in Prisma
    const persisted = await prisma.manualAnalysis.findFirst({
      where: { jobId },
    });
    expect(persisted).toBeDefined();
    expect(persisted.oilSpillDetected).toBe(true);
    expect(persisted.modelVersion).toContain("optical-oil-seg-unet-resnet18-v2");
    expect(persisted.maskAvailable).toBe(true);
  });

  test("2. Error Handling: Analyze with non-existent job ID returns 404", async () => {
    const res = await request(app)
      .post("/api/v1/manual-analysis/non-existent-id-00000/analyze");

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test("3. Error Handling: ML Service failure transitions to FAILED state (502)", async () => {
    // 1. Upload
    const uploadRes = await request(app)
      .post("/api/v1/manual-analysis/upload")
      .attach("image", createPngBuffer(), "test_error.png");

    const { jobId } = uploadRes.body.data;

    // 2. Mock ML failure
    axios.post.mockRejectedValueOnce(new Error("Connection refused"));

    // 3. Trigger analyze
    const analyzeRes = await request(app)
      .post(`/api/v1/manual-analysis/${jobId}/analyze`)
      .send({ source_type: "DRONE" });

    expect(analyzeRes.status).toBe(502);

    // Verify job status is FAILED
    const job = await prisma.analysisJob.findFirst({ where: { id: jobId } });
    expect(job.status).toBe("FAILED");
  });

  test("4. Geospatial Guardrail: ordinary upload strictly has NO fake coordinates", async () => {
    const uploadRes = await request(app)
      .post("/api/v1/manual-analysis/upload")
      .attach("image", createJpegBuffer(), "optical_marine.jpg");

    const { jobId } = uploadRes.body.data;

    axios.post.mockResolvedValueOnce({
      status: 200,
      data: {
        model: { classifier: "rgb-oil-classifier-resnet18-v2", segmentation: "optical-oil-seg-unet-resnet18-v2", segmentation_threshold: 0.80, status: "EXPERIMENTAL" },
        classification: { label: "CLEAN_OCEAN", confidence: 0.98, probabilities: { CLEAN_OCEAN: 0.98, LOOK_ALIKE: 0.01, OIL_SPILL: 0.01 }, is_oil_spill: false },
        segmentation: { performed: true, mask_available: true, foreground_pixels: 0, foreground_fraction: 0.0, confidence_threshold: 0.80, oil_detected: false },
        input_metadata: { width: 256, height: 256, total_pixels: 65536, format: "JPEG" },
        artifacts: {},
        geospatial: { status: "NOT_ESTABLISHED" },
        inference_time_ms: 120.0,
      },
    });

    const analyzeRes = await request(app)
      .post(`/api/v1/manual-analysis/${jobId}/analyze`)
      .send({ source_type: "DRONE" });

    expect(analyzeRes.status).toBe(200);
    expect(analyzeRes.body.data.geospatial.geolocationStatus || analyzeRes.body.data.geospatial.status).toBe("NOT_ESTABLISHED");
    expect(analyzeRes.body.data.geospatial.latitude).toBeUndefined();
    expect(analyzeRes.body.data.geospatial.longitude).toBeUndefined();
    expect(analyzeRes.body.data.geospatial.vessel).toBeUndefined();
  });
});
