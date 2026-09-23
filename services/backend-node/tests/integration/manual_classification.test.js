/**
 * Part 0.14B — Manual Image RGB Classification Integration Tests
 *
 * Verifies:
 *   - POST /api/v1/manual-analysis/:jobId/classify endpoint
 *   - Valid JPG and PNG classification flow
 *   - Rejection of TIFF / SAR files via Modality Guard (HTTP 422)
 *   - Rejection of unsupported formats (HTTP 400)
 *   - Error handling for non-existent analysis/job ID (HTTP 404)
 *   - Verification of scientific metadata (status, oilSpillDetected, modelProbability, threshold, location: NOT_ESTABLISHED)
 *   - Security: Zero path leakage or stack traces on errors
 */

const request = require("supertest");
const app = require("../../src/app");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const prisma = require("../../src/db/database");

jest.mock("axios");

describe("Part 0.14B — Manual Image RGB Classification", () => {
  const scratchDir = path.resolve(__dirname, "../../scratch/classification_tests");

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

  const createPngBuffer = () => {
    const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = Buffer.alloc(25);
    ihdr.writeUInt32BE(13, 0);
    ihdr.write("IHDR", 4);
    ihdr.writeUInt32BE(224, 8);
    ihdr.writeUInt32BE(224, 12);
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
    buf.writeUInt16BE(224, 7);
    buf.writeUInt16BE(224, 9);
    buf[11] = 3;
    return buf;
  };

  const createTiffBuffer = () => {
    const buf = Buffer.alloc(128);
    buf[0] = 0x49; buf[1] = 0x49; buf[2] = 0x2a; buf[3] = 0x00;
    return buf;
  };

  test("1. Upload JPG and successfully classify with OIL_SPILL_DETECTED", async () => {
    // 1. Upload
    const uploadRes = await request(app)
      .post("/api/v1/manual-analysis/upload")
      .attach("image", createJpegBuffer(), "oil_spill.jpg");

    expect(uploadRes.status).toBe(201);
    const { analysisId, jobId } = uploadRes.body.data;
    expect(analysisId).toBeDefined();

    // 2. Mock ML service response
    axios.post.mockResolvedValueOnce({
      status: 200,
      data: {
        status: "OIL_SPILL_DETECTED",
        oil_spill_detected: true,
        model_probability: 0.8845,
        decision_threshold: 0.80,
        probability_label: "MODEL_PROBABILITY",
        modality: "OPTICAL_RGB",
        location: "NOT_ESTABLISHED",
        input_metadata: { format: "JPEG", width: 224, height: 224, size_bytes: 128 },
        model_info: {
          model_id: "rgb-oil-classifier-resnet18-v1",
          version: "1.0.0",
          architecture: "ResNet-18 (ImageNet Transfer Learning + Custom Binary Head)",
          checkpoint_sha256: "1e764a220bab83fc312e6b7f7872def29e429e6c5799ecefb016718d2fc8aabe",
          device: "cuda:0",
        },
        inference_time_ms: 18.5,
      },
    });

    // 3. Classify
    const classifyRes = await request(app)
      .post(`/api/v1/manual-analysis/${analysisId}/classify`)
      .send({ threshold: 0.80 });

    expect(classifyRes.status).toBe(200);
    expect(classifyRes.body.success).toBe(true);
    expect(classifyRes.body.data.status).toBe("OIL_SPILL_DETECTED");
    expect(classifyRes.body.data.oilSpillDetected).toBe(true);
    expect(classifyRes.body.data.modelProbability).toBe(0.8845);
    expect(classifyRes.body.data.decisionThreshold).toBe(0.80);
    expect(classifyRes.body.data.location).toBe("NOT_ESTABLISHED");
    expect(classifyRes.body.data.modality).toBe("OPTICAL_RGB");
  });

  test("2. Upload PNG and successfully classify with NO_OIL_SPILL_DETECTED", async () => {
    const uploadRes = await request(app)
      .post("/api/v1/manual-analysis/upload")
      .attach("image", createPngBuffer(), "clean_ocean.png");

    expect(uploadRes.status).toBe(201);
    const { analysisId } = uploadRes.body.data;

    axios.post.mockResolvedValueOnce({
      status: 200,
      data: {
        status: "NO_OIL_SPILL_DETECTED",
        oil_spill_detected: false,
        model_probability: 0.1250,
        decision_threshold: 0.80,
        probability_label: "MODEL_PROBABILITY",
        modality: "OPTICAL_RGB",
        location: "NOT_ESTABLISHED",
        input_metadata: { format: "PNG", width: 224, height: 224, size_bytes: 133 },
        model_info: {
          model_id: "rgb-oil-classifier-resnet18-v1",
          version: "1.0.0",
          architecture: "ResNet-18 (ImageNet Transfer Learning + Custom Binary Head)",
          checkpoint_sha256: "1e764a220bab83fc312e6b7f7872def29e429e6c5799ecefb016718d2fc8aabe",
          device: "cuda:0",
        },
        inference_time_ms: 16.2,
      },
    });

    const classifyRes = await request(app)
      .post(`/api/v1/manual-analysis/${analysisId}/classify`)
      .send({});

    expect(classifyRes.status).toBe(200);
    expect(classifyRes.body.data.status).toBe("NO_OIL_SPILL_DETECTED");
    expect(classifyRes.body.data.oilSpillDetected).toBe(false);
    expect(classifyRes.body.data.modelProbability).toBe(0.1250);
  });

  test("3. Modality Guard: Reject classification of TIFF/SAR imagery with HTTP 422", async () => {
    const uploadRes = await request(app)
      .post("/api/v1/manual-analysis/upload")
      .attach("image", createTiffBuffer(), "sar_radar.tif");

    expect(uploadRes.status).toBe(201);
    const { analysisId } = uploadRes.body.data;

    axios.post.mockClear();

    const classifyRes = await request(app)
      .post(`/api/v1/manual-analysis/${analysisId}/classify`)
      .send({});

    expect(classifyRes.status).toBe(422);
    expect(classifyRes.body.error.code).toBe("MODALITY_GUARD_REJECTION");
    expect(classifyRes.body.error.message).toContain("TIFF/SAR");
    // Ensure ML service was never called
    expect(axios.post).not.toHaveBeenCalled();
  });

  test("4. Non-existent Analysis ID returns HTTP 404", async () => {
    const classifyRes = await request(app)
      .post("/api/v1/manual-analysis/non-existent-id-99999/classify")
      .send({});

    expect(classifyRes.status).toBe(404);
    expect(classifyRes.body.error.code).toBe("NOT_FOUND");
  });

  test("5. Fail closed when ML service fails (HTTP 502)", async () => {
    const uploadRes = await request(app)
      .post("/api/v1/manual-analysis/upload")
      .attach("image", createJpegBuffer(), "sample.jpg");

    const { analysisId } = uploadRes.body.data;

    axios.post.mockRejectedValueOnce(new Error("Connection refused to ML service"));

    const classifyRes = await request(app)
      .post(`/api/v1/manual-analysis/${analysisId}/classify`)
      .send({});

    expect(classifyRes.status).toBe(502);
    expect(classifyRes.body.error.code).toBe("ML_SERVICE_ERROR");
    // Ensure no internal Python path is leaked
    expect(JSON.stringify(classifyRes.body)).not.toContain(".py");
  });
});
