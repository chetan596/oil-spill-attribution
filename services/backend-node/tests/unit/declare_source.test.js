const request = require("supertest");
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const manualAnalysisRoutes = require("../../src/manual-analysis/manual-analysis.routes");
const prisma = require("../../src/db/database");

const app = express();
app.use(express.json());
app.use("/api/v1/manual-analysis", manualAnalysisRoutes);
app.use((err, req, res, next) => {
  res.status(err.statusCode || 500).json({
    success: false,
    error: {
      message: err.message,
      code: err.code || "INTERNAL_ERROR",
      details: err.details || {},
    },
  });
});

describe("PHASE 16.2 — Backend declare-source route contract tests", () => {
  const tmpDir = path.resolve(__dirname, "../../scratch/test-declare-source");
  let testTiff2ChPath;
  let testTiff1ChPath;
  let testTiff3ChPath;

  beforeAll(async () => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Create valid mock TIFF files (with standard little-endian header: 49 49 2A 00 + offset)
    const tiffHeader = Buffer.from([
      0x49, 0x49, 0x2a, 0x00, // II*\0
      0x08, 0x00, 0x00, 0x00, // offset to first IFD (8)
      0x00, 0x00,             // number of directory entries: 0
      0x00, 0x00, 0x00, 0x00, // next IFD: 0
      0x00, 0x00, 0x00, 0x00  // padding
    ]);

    testTiff2ChPath = path.join(tmpDir, "test_2ch.tif");
    testTiff1ChPath = path.join(tmpDir, "test_1ch.tif");
    testTiff3ChPath = path.join(tmpDir, "test_3ch.tif");

    fs.writeFileSync(testTiff2ChPath, tiffHeader);
    fs.writeFileSync(testTiff1ChPath, tiffHeader);
    fs.writeFileSync(testTiff3ChPath, tiffHeader);
  });

  afterAll(async () => {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (_) {}
  });

  // Helper to create test Analysis & AnalysisJob records in DB
  async function createTestJob({ channelCount, localPath, filename = "test.tif" }) {
    const analysis = await prisma.analysis.create({
      data: {
        status: "QUEUED",
      },
    });

    const job = await prisma.analysisJob.create({
      data: {
        analysisId: analysis.id,
        status: "QUEUED",
        progress: 0,
        payload: {
          sourceType: "MANUAL_IMAGE",
          filename,
          originalFilename: filename,
          localPath,
          uploadDir: path.dirname(localPath),
          channelCount,
          bands: channelCount,
          format: "TIFF",
          stage: "READY_FOR_ANALYSIS",
        },
      },
    });

    return { analysis, job };
  }

  // 1. Route exists, 2. Correct HTTP method, 3. Correct URL
  it("1. Route exists and responds to POST /api/v1/manual-analysis/:jobId/declare-source", async () => {
    const dummyId = crypto.randomUUID();
    const res = await request(app)
      .post(`/api/v1/manual-analysis/${dummyId}/declare-source`)
      .send({
        sourceType: "SENTINEL1_DUAL_POL",
        polarizations: ["VV", "VH"],
      });

    // Even if job doesn't exist, it should hit controller and return 404 (not express route 404)
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain("Manual Analysis record for ID");
  });

  it("2. Rejects incorrect HTTP method (GET instead of POST)", async () => {
    const dummyId = crypto.randomUUID();
    const res = await request(app).get(`/api/v1/manual-analysis/${dummyId}/declare-source`);
    expect(res.status).toBe(404); // GET route does not exist
  });

  it("3. Correct URL contract matches expected endpoint pattern", async () => {
    const dummyId = crypto.randomUUID();
    const res = await request(app)
      .post(`/api/v1/manual-analysis/${dummyId}/declare-source`)
      .send({});
    expect(res.status).toBe(404); // hits declareSource controller handler for dummyId
  });

  // 8. Missing job fails
  it("8. Fails with 404 when job does not exist", async () => {
    const nonexistentJobId = crypto.randomUUID();
    const res = await request(app)
      .post(`/api/v1/manual-analysis/${nonexistentJobId}/declare-source`)
      .send({
        sourceType: "SENTINEL1_DUAL_POL",
        polarizations: ["VV", "VH"],
      });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  // 5. 1-channel declaration fails
  it("5. Fails with 400 when uploaded raster has 1 channel", async () => {
    const { job } = await createTestJob({
      channelCount: 1,
      localPath: testTiff1ChPath,
      filename: "test_1ch.tif",
    });

    const res = await request(app)
      .post(`/api/v1/manual-analysis/${job.id}/declare-source`)
      .send({
        sourceType: "SENTINEL1_DUAL_POL",
        polarizations: ["VV", "VH"],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("INVALID_CHANNEL_COUNT");
    expect(res.body.error.message).toContain("requires exactly a 2-channel raster");
  });

  // 6. 3-channel declaration fails
  it("6. Fails with 400 when uploaded raster has 3 channels", async () => {
    const { job } = await createTestJob({
      channelCount: 3,
      localPath: testTiff3ChPath,
      filename: "test_3ch.tif",
    });

    const res = await request(app)
      .post(`/api/v1/manual-analysis/${job.id}/declare-source`)
      .send({
        sourceType: "SENTINEL1_DUAL_POL",
        polarizations: ["VV", "VH"],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("INVALID_CHANNEL_COUNT");
    expect(res.body.error.message).toContain("requires exactly a 2-channel raster");
  });

  // 7. Invalid polarization fails
  it("7a. Fails with 400 when polarization declaration is not ['VV', 'VH']", async () => {
    const { job } = await createTestJob({
      channelCount: 2,
      localPath: testTiff2ChPath,
      filename: "test_2ch.tif",
    });

    const res = await request(app)
      .post(`/api/v1/manual-analysis/${job.id}/declare-source`)
      .send({
        sourceType: "SENTINEL1_DUAL_POL",
        polarizations: ["HH", "HV"],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("INVALID_POLARIZATIONS");
  });

  it("7b. Fails with 400 when polarization declaration has only 1 channel", async () => {
    const { job } = await createTestJob({
      channelCount: 2,
      localPath: testTiff2ChPath,
      filename: "test_2ch.tif",
    });

    const res = await request(app)
      .post(`/api/v1/manual-analysis/${job.id}/declare-source`)
      .send({
        sourceType: "SENTINEL1_DUAL_POL",
        polarizations: ["VV"],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("INVALID_POLARIZATIONS");
  });

  it("7c. Fails with 400 when sourceType is invalid", async () => {
    const { job } = await createTestJob({
      channelCount: 2,
      localPath: testTiff2ChPath,
      filename: "test_2ch.tif",
    });

    const res = await request(app)
      .post(`/api/v1/manual-analysis/${job.id}/declare-source`)
      .send({
        sourceType: "LANDSAT_8",
        polarizations: ["VV", "VH"],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("INVALID_SOURCE_DECLARATION");
  });

  it("7d. Fails with 400 when raster file does not exist on disk", async () => {
    const { job } = await createTestJob({
      channelCount: 2,
      localPath: path.join(tmpDir, "non_existent_raster.tif"),
      filename: "non_existent_raster.tif",
    });

    const res = await request(app)
      .post(`/api/v1/manual-analysis/${job.id}/declare-source`)
      .send({
        sourceType: "SENTINEL1_DUAL_POL",
        polarizations: ["VV", "VH"],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("INVALID_RASTER");
    expect(res.body.error.message).toContain("missing or invalid on disk");
  });

  // 4. Valid declaration succeeds & 9. Response contains authoritative SAR descriptor
  it("4 & 9. Valid declaration succeeds and returns authoritative SAR descriptor", async () => {
    const { job } = await createTestJob({
      channelCount: 2,
      localPath: testTiff2ChPath,
      filename: "test_2ch.tif",
    });

    const res = await request(app)
      .post(`/api/v1/manual-analysis/${job.id}/declare-source`)
      .send({
        sourceType: "SENTINEL1_DUAL_POL",
        polarizations: ["VV", "VH"],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.error).toBeNull();

    const descriptor = res.body.data;
    expect(descriptor).toBeDefined();

    // Verify all authoritative descriptor requirements
    expect(descriptor.jobId).toBe(job.id);
    expect(descriptor.channelCount).toBe(2);
    expect(descriptor.modality).toBe("SAR_DUAL_POL");
    expect(descriptor.polarizationStatus).toBe("ESTABLISHED");
    expect(descriptor.polarizations).toEqual(["VV", "VH"]);
    expect(descriptor.sourceType).toBe("SENTINEL1_DUAL_POL");
    expect(descriptor.compatibleModels).toEqual(["unet-dual-pol-sar-v09d-residual-loss"]);
    expect(descriptor.selectedModelId).toBe("unet-dual-pol-sar-v09d-residual-loss");
    expect(descriptor.inferenceSupported).toBe(true);
    expect(descriptor.sourceIdentification).toBe("USER_DECLARED");

    // Verify persistence in DB
    const updatedJob = await prisma.analysisJob.findUnique({
      where: { id: job.id },
    });
    expect(updatedJob.payload.sourceType).toBe("SENTINEL1_DUAL_POL");
    expect(updatedJob.payload.modality).toBe("SAR_DUAL_POL");
    expect(updatedJob.payload.polarizationStatus).toBe("ESTABLISHED");
    expect(updatedJob.payload.polarizations).toEqual(["VV", "VH"]);
    expect(updatedJob.payload.compatibleModels).toEqual(["unet-dual-pol-sar-v09d-residual-loss"]);
    expect(updatedJob.payload.selectedModelId).toBe("unet-dual-pol-sar-v09d-residual-loss");
    expect(updatedJob.payload.sourceIdentification).toBe("USER_DECLARED");
  });
});
