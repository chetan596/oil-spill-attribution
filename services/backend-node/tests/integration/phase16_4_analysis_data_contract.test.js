/**
 * Phase 16.4 — Part 1: Backend Analysis Data Contract Integration Tests
 *
 * Requirements:
 *  1. GET /api/v1/manual-analysis/:jobId returns 200 with canonical payload for completed SAR job
 *  2. Canonical SAR payload strictly adheres to schema (input, model, detection, compatibility, artifacts, geospatial, provenance, fingerprint)
 *  3. SAR model provenance verification (unet-dual-pol-sar-v09d-residual-loss, SHA256, sigma0 preprocessing)
 *  4. SAR input structure verification (channelCount: 2, modality: SAR_DUAL_POL, sourceType: SENTINEL1_DUAL_POL, VV+VH)
 *  5. GET /api/v1/manual-analysis/:jobId returns 200 with canonical payload for completed Drone RGB job
 *  6. Optical Drone RGB provenance (kerf-resnet34-focaldice-v1, SHA256, kerf-rgb-v1, 3 channels, NOT_APPLICABLE polarizations)
 *  7. GET /api/v1/manual-analysis/:jobId returns 200 with canonical payload for completed Satellite RGB job
 *  8. Optical Satellite RGB provenance (mados-resnet34-rgb-v1, SHA256, mados-rgb-v1, 3 channels)
 *  9. Deterministic result fingerprint (reproducible sha256 digest, changes on outcome/confidence drift)
 * 10. Real geospatial metadata preservation (when CRS/bounds/centroid present: available=true, REAL geolocation, MODEL_DERIVED footprint)
 * 11. Zero fabrication guardrails on non-georeferenced images (available=false, null coordinates, oilType/vesselAttribution=NOT_ESTABLISHED)
 * 12. Structured lifecycle states (404 MANUAL_JOB_NOT_FOUND, structured PROCESSING status, structured FAILED status)
 */

const request = require("supertest");
const app = require("../../src/app");
const prisma = require("../../src/db/database");
const { computeResultFingerprint } = require("../../src/manual-analysis/canonical-investigation.normalizer");
const { v4: uuidv4 } = require("uuid");

describe("Phase 16.4 Part 1 — Backend Analysis Data Contract Integration", () => {
  let createdJobIds = [];

  afterAll(async () => {
    // Clean up created test jobs & analyses
    if (createdJobIds.length > 0) {
      await prisma.analysisJob.deleteMany({
        where: { id: { in: createdJobIds } },
      }).catch(() => {});
      await prisma.manualAnalysis.deleteMany({
        where: { jobId: { in: createdJobIds } },
      }).catch(() => {});
      await prisma.analysis.deleteMany({
        where: { id: { in: createdJobIds } },
      }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  const createCompletedJob = async ({
    sourceType,
    isTiff = false,
    channelCount = 3,
    mlResult = {},
    geospatial = null,
  }) => {
    const analysisId = uuidv4();
    const jobId = uuidv4();
    createdJobIds.push(jobId);

    await prisma.analysis.create({
      data: {
        id: analysisId,
        sceneId: null, // nullable — avoids FK constraint with synthetic test scene IDs
        status: "COMPLETED",
      },
    });

    const isSar = sourceType === "SENTINEL1_DUAL_POL" || (isTiff && channelCount === 2);

    const payload = {
      originalFilename: isSar ? "test_sentinel1_dual_pol.tif" : (sourceType === "SATELLITE_RGB" ? "test_sentinel2_rgb.jpg" : "test_drone_flight.jpg"),
      isTiff,
      channelCount,
      sourceType,
      source_type: sourceType,
      modality: isSar ? "SAR_DUAL_POL" : "OPTICAL_RGB",
      mlResult: {
        oilSpillDetected: true,
        detectionConfidence: 0.942,
        oilSpillCoveragePercent: 4.85,
        estimatedAreaKm2: 2.34,
        model: {
          modelId: isSar ? "unet-dual-pol-sar-v09d-residual-loss" : (sourceType === "SATELLITE_RGB" ? "mados-resnet34-rgb-v1" : "kerf-resnet34-focaldice-v1"),
          modelVersion: "1.0.0",
          checkpointSha256: isSar ? "1e25e1dfcbe109268f6a394c8e718b5b3fecfc62507663dece55452d377b21e8" : (sourceType === "SATELLITE_RGB" ? "d249fbeea1211e4bfbe1102927e36ca93f5540a7cfdc8ea6e987c6b5bcf418ce" : "d1ae45d3eaf995a221da3d273c177eb13c850b193cd6690a1b6bc47b0baf5264"),
          preprocessingVersion: isSar ? "sentinel1_sigma0_db_v1" : (sourceType === "SATELLITE_RGB" ? "mados-rgb-v1" : "kerf-rgb-v1"),
          operatingThreshold: 0.50,
        },
        ...mlResult,
      },
      geospatial: geospatial || {
        geolocationStatus: "NOT_ESTABLISHED",
        available: false,
        crs: null,
      },
    };

    const job = await prisma.analysisJob.create({
      data: {
        id: jobId,
        analysisId,
        status: "COMPLETED",
        progress: 100,
        payload,
      },
    });

    return { job, analysisId, jobId };
  };

  test("1. GET /api/v1/manual-analysis/:jobId returns 200 with canonical payload for completed SAR job", async () => {
    const { jobId } = await createCompletedJob({
      sourceType: "SENTINEL1_DUAL_POL",
      isTiff: true,
      channelCount: 2,
    });

    const res = await request(app)
      .get(`/api/v1/manual-analysis/${jobId}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.jobId).toBe(jobId);
    expect(res.body.data.status).toBe("COMPLETED");
  });

  test("2. Canonical SAR payload strictly adheres to schema", async () => {
    const { jobId } = await createCompletedJob({
      sourceType: "SENTINEL1_DUAL_POL",
      isTiff: true,
      channelCount: 2,
    });

    const res = await request(app).get(`/api/v1/manual-analysis/${jobId}`).expect(200);
    const d = res.body.data;

    // Check all required sections
    expect(d).toHaveProperty("input");
    expect(d).toHaveProperty("model");
    expect(d).toHaveProperty("detection");
    expect(d).toHaveProperty("compatibility");
    expect(d).toHaveProperty("artifacts");
    expect(d).toHaveProperty("geospatial");
    expect(d).toHaveProperty("provenance");
    expect(d).toHaveProperty("fingerprint");
    expect(typeof d.fingerprint).toBe("string");
    expect(d.fingerprint).toHaveLength(64);
  });

  test("3. SAR payload model provenance verification", async () => {
    const { jobId } = await createCompletedJob({
      sourceType: "SENTINEL1_DUAL_POL",
      isTiff: true,
      channelCount: 2,
    });

    const res = await request(app).get(`/api/v1/manual-analysis/${jobId}`).expect(200);
    const m = res.body.data.model;

    expect(m.modelId).toBe("unet-dual-pol-sar-v09d-residual-loss");
    expect(m.checkpointSha256).toBe("1e25e1dfcbe109268f6a394c8e718b5b3fecfc62507663dece55452d377b21e8");
    expect(m.preprocessingVersion).toBe("sentinel1_sigma0_db_v1");
    expect(m.threshold).toBe(0.50);
  });

  test("4. SAR input structure verification (channelCount: 2, modality: SAR_DUAL_POL, VV+VH)", async () => {
    const { jobId } = await createCompletedJob({
      sourceType: "SENTINEL1_DUAL_POL",
      isTiff: true,
      channelCount: 2,
    });

    const res = await request(app).get(`/api/v1/manual-analysis/${jobId}`).expect(200);
    const inp = res.body.data.input;

    expect(inp.channelCount).toBe(2);
    expect(inp.modality).toBe("SAR_DUAL_POL");
    expect(inp.sourceType).toBe("SENTINEL1_DUAL_POL");
    expect(inp.bandStructure).toBe("DUAL_BAND_SAR");
    expect(inp.polarizationStatus).toBe("ESTABLISHED");
    expect(inp.polarizations).toEqual(["VV", "VH"]);
    expect(inp.inputFormat).toBe("TIFF");
  });

  test("5. GET /api/v1/manual-analysis/:jobId returns 200 with canonical payload for completed Drone RGB job", async () => {
    const { jobId } = await createCompletedJob({
      sourceType: "DRONE",
      isTiff: false,
      channelCount: 3,
    });

    const res = await request(app).get(`/api/v1/manual-analysis/${jobId}`).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.input.sourceType).toBe("DRONE");
    expect(res.body.data.input.modality).toBe("OPTICAL_RGB");
  });

  test("6. Optical Drone RGB provenance (kerf-resnet34-focaldice-v1, 3 channels, NOT_APPLICABLE polarizations)", async () => {
    const { jobId } = await createCompletedJob({
      sourceType: "DRONE",
      isTiff: false,
      channelCount: 3,
    });

    const res = await request(app).get(`/api/v1/manual-analysis/${jobId}`).expect(200);
    const { input, model, compatibility, artifacts } = res.body.data;

    expect(model.modelId).toBe("kerf-resnet34-focaldice-v1");
    expect(model.checkpointSha256).toBe("d1ae45d3eaf995a221da3d273c177eb13c850b193cd6690a1b6bc47b0baf5264");
    expect(model.preprocessingVersion).toBe("kerf-rgb-v1");
    expect(input.channelCount).toBe(3);
    expect(input.polarizationStatus).toBe("NOT_APPLICABLE");
    expect(input.polarizations).toEqual([]);
    expect(compatibility.opticalCompatible).toBe(true);
    expect(compatibility.sarCompatible).toBe(false);
    expect(artifacts.vv).toBeNull();
    expect(artifacts.vh).toBeNull();
  });

  test("7. GET /api/v1/manual-analysis/:jobId returns 200 with canonical payload for completed Satellite RGB job", async () => {
    const { jobId } = await createCompletedJob({
      sourceType: "SATELLITE_RGB",
      isTiff: false,
      channelCount: 3,
    });

    const res = await request(app).get(`/api/v1/manual-analysis/${jobId}`).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.input.sourceType).toBe("SATELLITE_RGB");
  });

  test("8. Optical Satellite RGB provenance (mados-resnet34-rgb-v1, SHA256, mados-rgb-v1)", async () => {
    const { jobId } = await createCompletedJob({
      sourceType: "SATELLITE_RGB",
      isTiff: false,
      channelCount: 3,
    });

    const res = await request(app).get(`/api/v1/manual-analysis/${jobId}`).expect(200);
    const { model, input } = res.body.data;

    expect(model.modelId).toBe("mados-resnet34-rgb-v1");
    expect(model.checkpointSha256).toBe("d249fbeea1211e4bfbe1102927e36ca93f5540a7cfdc8ea6e987c6b5bcf418ce");
    expect(model.preprocessingVersion).toBe("mados-rgb-v1");
    expect(input.channelCount).toBe(3);
    expect(input.modality).toBe("OPTICAL_RGB");
  });

  test("9. Deterministic result fingerprint (reproducible sha256 digest, changes on drift)", async () => {
    const fp1 = computeResultFingerprint({
      jobId: "test-job-fp",
      modelId: "unet-dual-pol-sar-v09d-residual-loss",
      checkpointSha256: "1e25e1dfcbe109268f6a394c8e718b5b3fecfc62507663dece55452d377b21e8",
      inputFormat: "TIFF",
      channelCount: 2,
      crs: "EPSG:4326",
      oilSpillDetected: true,
      confidence: 0.942,
    });

    const fp2 = computeResultFingerprint({
      jobId: "test-job-fp",
      modelId: "unet-dual-pol-sar-v09d-residual-loss",
      checkpointSha256: "1e25e1dfcbe109268f6a394c8e718b5b3fecfc62507663dece55452d377b21e8",
      inputFormat: "TIFF",
      channelCount: 2,
      crs: "EPSG:4326",
      oilSpillDetected: true,
      confidence: 0.942,
    });

    // Changed confidence
    const fp3 = computeResultFingerprint({
      jobId: "test-job-fp",
      modelId: "unet-dual-pol-sar-v09d-residual-loss",
      checkpointSha256: "1e25e1dfcbe109268f6a394c8e718b5b3fecfc62507663dece55452d377b21e8",
      inputFormat: "TIFF",
      channelCount: 2,
      crs: "EPSG:4326",
      oilSpillDetected: true,
      confidence: 0.750,
    });

    expect(fp1).toBe(fp2);
    expect(fp1).not.toBe(fp3);
    expect(fp1).toHaveLength(64);
  });

  test("10. Real geospatial metadata preservation when embedded coordinates present", async () => {
    const { jobId } = await createCompletedJob({
      sourceType: "SENTINEL1_DUAL_POL",
      isTiff: true,
      channelCount: 2,
      geospatial: {
        geolocationStatus: "ESTABLISHED",
        available: true,
        crs: "EPSG:4326",
        bounds: [72.5, 18.5, 73.0, 19.0],
        centroid: [18.75, 72.75],
        physicalAreaKm2: 3.14,
        footprint: { type: "Polygon", coordinates: [[[72.5, 18.5], [73.0, 18.5], [73.0, 19.0], [72.5, 19.0], [72.5, 18.5]]] },
      },
    });

    const res = await request(app).get(`/api/v1/manual-analysis/${jobId}`).expect(200);
    const { geospatial, provenance } = res.body.data;

    expect(geospatial.available).toBe(true);
    expect(geospatial.crs).toBe("EPSG:4326");
    expect(geospatial.crsName).toBe("WGS 84");
    expect(geospatial.bounds).toEqual([72.5, 18.5, 73.0, 19.0]);
    // centroid is now a canonical object with provenance
    expect(geospatial.centroid).toMatchObject({ latitude: 18.75, longitude: 72.75, provenance: "MODEL_DERIVED" });
    expect(provenance.inputGeolocation).toBe("REAL");
    expect(provenance.footprint).toBe("MODEL_DERIVED");
  });

  test("11. Zero fabrication guardrails on non-georeferenced images", async () => {
    const { jobId } = await createCompletedJob({
      sourceType: "DRONE",
      isTiff: false,
      channelCount: 3,
      geospatial: {
        geolocationStatus: "NOT_ESTABLISHED",
        available: false,
      },
    });

    const res = await request(app).get(`/api/v1/manual-analysis/${jobId}`).expect(200);
    const { geospatial, provenance } = res.body.data;

    expect(geospatial.available).toBe(false);
    expect(geospatial.crs).toBeNull();
    expect(geospatial.bounds).toBeNull();
    expect(geospatial.centroid).toBeNull();
    expect(geospatial.footprint).toBeNull();
    expect(provenance.inputGeolocation).toBe("NOT_AVAILABLE");
    expect(provenance.footprint).toBe("NOT_AVAILABLE");
    expect(provenance.oilType).toBe("NOT_ESTABLISHED");
    expect(provenance.vesselAttribution).toBe("NOT_ESTABLISHED");
  });

  test("12. Structured lifecycle states (404 not found, structured PROCESSING, structured FAILED)", async () => {
    // 12a: Not found
    const notFoundRes = await request(app)
      .get("/api/v1/manual-analysis/00000000-0000-0000-0000-000000000000")
      .expect(404);
    expect(notFoundRes.body.success).toBe(false);
    expect(notFoundRes.body.error.code).toBe("MANUAL_JOB_NOT_FOUND");

    // 12b: Processing state
    const procAnalysisId = uuidv4();
    const procJobId = uuidv4();
    createdJobIds.push(procJobId);

    await prisma.analysis.create({
      data: { id: procAnalysisId, sceneId: null, status: "RUNNING" }, // RUNNING maps to PROCESSING in service output
    });
    await prisma.analysisJob.create({
      data: {
        id: procJobId,
        analysisId: procAnalysisId,
        status: "RUNNING", // RUNNING is a valid JobStatus enum; service maps it to "PROCESSING" in output
        progress: 45,
        payload: { stage: "DETECTING", stageMessage: "Evaluating optical segmentation" },
      },
    });

    const procRes = await request(app)
      .get(`/api/v1/manual-analysis/${procJobId}`)
      .expect(200);
    expect(procRes.body.success).toBe(true);
    expect(procRes.body.data.status).toBe("PROCESSING");
    expect(procRes.body.data.progress).toBe(45);
    expect(procRes.body.data.stage).toBe("DETECTING");

    // 12c: Failed state
    const failAnalysisId = uuidv4();
    const failJobId = uuidv4();
    createdJobIds.push(failJobId);

    await prisma.analysis.create({
      data: { id: failAnalysisId, sceneId: null, status: "FAILED" },
    });
    await prisma.analysisJob.create({
      data: {
        id: failJobId,
        analysisId: failAnalysisId,
        status: "FAILED",
        progress: 20,
        errorMessage: "Downstream CUDA out of memory in SAR inference engine",
        payload: { stage: "FAILED" },
      },
    });

    const failRes = await request(app)
      .get(`/api/v1/manual-analysis/${failJobId}`)
      .expect(200);
    expect(failRes.body.success).toBe(true);
    expect(failRes.body.data.status).toBe("FAILED");
    expect(failRes.body.data.errorMessage).toContain("CUDA out of memory");
  });
});
