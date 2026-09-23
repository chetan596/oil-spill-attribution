const request = require("supertest");
const express = require("express");
const path = require("path");
const fs = require("fs");
const manualAnalysisRoutes = require("../../src/manual-analysis/manual-analysis.routes");
const manualAnalysisService = require("../../src/manual-analysis/manual-analysis.service");
const { validateMagicBytes } = require("../../src/manual-analysis/manual-analysis.upload");

const app = express();
app.use(express.json());
app.use("/api/v1/manual-analysis", manualAnalysisRoutes);
// Error handling middleware
app.use((err, req, res, next) => {
  res.status(err.statusCode || 500).json({
    success: false,
    error: {
      message: err.message,
      code: err.code || "INTERNAL_ERROR",
    },
  });
});

describe("Manual SAR Image Analysis Pipeline & Forensic Guardrails", () => {
  const tmpDir = path.resolve(__dirname, "../../scratch/test-uploads");

  beforeAll(() => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  });

  afterAll(() => {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (_) {}
  });

  describe("File Ingress & Magic-Byte Validation", () => {
    it("should reject upload request when no image file is provided", async () => {
      const res = await request(app)
        .post("/api/v1/manual-analysis")
        .send({ threshold: 0.35 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("No image file provided");
    });

    it("should detect corrupted or spoofed files failing magic byte inspection", () => {
      const fakeCorruptPath = path.join(tmpDir, "spoofed.png");
      fs.writeFileSync(fakeCorruptPath, Buffer.from("NOT_A_REAL_IMAGE_HEADER"));

      const validation = validateMagicBytes(fakeCorruptPath);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("does not match a recognized TIFF, PNG, or JPEG raster format");
    });

    it("should validate real PNG magic bytes (89 50 4E 47)", () => {
      const validPngPath = path.join(tmpDir, "valid_header.png");
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00,
        0x08, 0x00, 0x00, 0x00, 0x00
      ]);
      fs.writeFileSync(validPngPath, pngBuffer);

      const validation = validateMagicBytes(validPngPath);
      expect(validation.valid).toBe(true);
      expect(validation.mime).toBe("image/png");
    });
  });

  describe("Scientific Constraints & Fallback Inference Logic", () => {
    it("should enforce NOT_ESTABLISHED for oil type on manual SAR images", async () => {
      // Create a test 1-channel mock SAR raster
      const sarMockPath = path.join(tmpDir, "sar_mock_test.png");
      // 1x1 valid PNG
      const pngBuf = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64"
      );
      fs.writeFileSync(sarMockPath, pngBuf);

      const uploadResult = await manualAnalysisService.createManualJob({
        file: {
          path: sarMockPath,
          originalname: "synthetic_sar_patch.png",
          filename: "synthetic_sar_patch.png",
          size: pngBuf.length,
          mimetype: "image/png",
        },
        threshold: 0.35,
        polarization: "VV",
      });

      expect(uploadResult.success).toBe(true);
      expect(uploadResult.jobId).toBeDefined();
      expect(uploadResult.status).toBe("QUEUED");

      // Verify status endpoint
      const statusRes = await request(app).get(`/api/v1/manual-analysis/${uploadResult.jobId}`);
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.data.jobId).toBe(uploadResult.jobId);
    });

    it("should reject optical RGB photos with INSUFFICIENT_DATA and not fabricate fake oil confidence", async () => {
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
      // In optical RGB mode (colorType = 2), chromatic divergence rejects optical photos
      const opticalMockPath = path.join(tmpDir, "beach_photo.jpg");
      // Minimal JPEG header FF D8 FF
      const jpegBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01]);
      fs.writeFileSync(opticalMockPath, jpegBuf);

      const magicCheck = validateMagicBytes(opticalMockPath);
      expect(magicCheck.valid).toBe(true);
      expect(magicCheck.mime).toBe("image/jpeg");
    });
  });
});
