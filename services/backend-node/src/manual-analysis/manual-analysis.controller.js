const path = require("path");
const fs = require("fs");
const manualAnalysisService = require("./manual-analysis.service");
const investigationExportService = require("./investigationExportService");
const { validateAndNormalizeIsoTimestamp } = require("../utils/satelliteTemporalMetadata");
const AppError = require("../errors/AppError");
const logger = require("../logger");

/**
 * ManualAnalysisController
 *
 * REST Endpoints:
 *   POST /api/v1/manual-analysis
 *   GET  /api/v1/manual-analysis/:jobId
 *   GET  /api/v1/manual-analysis/:jobId/result
 *   GET  /api/v1/manual-analysis/:jobId/report
 *   GET  /api/v1/manual-analysis/:jobId/mask
 *   GET  /api/v1/manual-analysis/:jobId/overlay
 *   GET  /api/v1/manual-analysis/:jobId/probability-map
 *   GET  /api/v1/manual-analysis/:jobId/original
 */
const manualAnalysisController = {
  /**
   * POST /api/v1/manual-analysis/upload
   * Part 1: Multipart manual image upload and validation only.
   * Returns metadata and READY_FOR_ANALYSIS state without triggering AI.
   */
  async uploadOnly(req, res, next) {
    try {
      if (!req.file) {
        throw AppError.badRequest("No image file provided in request. Field name must be 'image'.");
      }

      const userId = req.user?.id || null;
      const rawTimestamp = req.body?.investigationTimestamp || req.body?.acquisitionTimestamp || null;
      let analystTimestamp = null;
      if (rawTimestamp) {
        analystTimestamp = validateAndNormalizeIsoTimestamp(rawTimestamp);
        if (!analystTimestamp) {
          throw AppError.badRequest("Invalid investigationTimestamp. Must be a valid ISO-8601 string.");
        }
      }

      const result = await manualAnalysisService.saveManualUpload({
        file: req.file,
        userId,
        analystTimestamp,
      });

      res.status(201).json({
        success: true,
        data: result,
        error: null,
      });
    } catch (err) {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }
      next(err);
    }
  },

  /**
   * POST /api/v1/manual-analysis/:jobId/classify
   * Part 0.14B: Execute RGB Oil vs Non-Oil binary classification.
   */
  async classifyImage(req, res, next) {
    try {
      const { jobId } = req.params;
      const { threshold } = req.body || {};

      const result = await manualAnalysisService.classifyManualImage(jobId, {
        threshold: threshold !== undefined ? parseFloat(threshold) : undefined,
      });

      res.status(200).json({
        success: true,
        data: result,
        error: null,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/v1/manual-analysis
   * Upload image and enqueue manual analysis job.
   */
  async uploadAndAnalyze(req, res, next) {
    try {
      if (!req.file) {
        throw AppError.badRequest("No image file provided in request. Field name must be 'image'.");
      }

      const { threshold = 0.35, polarization = "VV" } = req.body;
      const userId = req.user?.id || null;
      const rawTimestamp = req.body?.investigationTimestamp || req.body?.acquisitionTimestamp || null;
      let analystTimestamp = null;
      if (rawTimestamp) {
        analystTimestamp = validateAndNormalizeIsoTimestamp(rawTimestamp);
        if (!analystTimestamp) {
          throw AppError.badRequest("Invalid investigationTimestamp. Must be a valid ISO-8601 string.");
        }
      }

      const result = await manualAnalysisService.createManualJob({
        file: req.file,
        userId,
        threshold: parseFloat(threshold) || 0.35,
        polarization,
        analystTimestamp,
      });

      res.status(201).json({
        success: true,
        data: result,
        error: null,
      });
    } catch (err) {
      // Clean up uploaded file on immediate synchronous validation failure
      if (req.file?.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }
      next(err);
    }
  },

  /**
   * GET /api/v1/manual-analysis/:jobId
   * Get status & progress of a manual analysis job.
   */
  async getStatus(req, res, next) {
    try {
      const { jobId } = req.params;
      const status = await manualAnalysisService.getJobStatus(jobId);

      res.json({
        success: true,
        data: status,
        error: null,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/manual-analysis/:jobId/result
   * Get full structured forensic & detection result.
   */
  async getResult(req, res, next) {
    try {
      const { jobId } = req.params;
      const result = await manualAnalysisService.getAnalysisResult(jobId);

      res.json({
        success: true,
        data: result,
        error: null,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/manual-analysis/:jobId/report
   * Get formal technical report dossier.
   */
  async getReport(req, res, next) {
    try {
      const { jobId } = req.params;
      const report = await manualAnalysisService.getReport(jobId);

      res.json({
        success: true,
        data: report,
        error: null,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/manual-analysis/:jobId/mask
   * Stream binary segmentation mask artifact.
   */
  async getMask(req, res, next) {
    try {
      const { jobId } = req.params;
      const filePath = await manualAnalysisService.getArtifactFilePath(jobId, "mask");
      res.setHeader("Content-Type", "image/png");
      res.sendFile(path.resolve(filePath));
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/manual-analysis/:jobId/overlay
   * Stream visual spill overlay artifact.
   */
  async getOverlay(req, res, next) {
    try {
      const { jobId } = req.params;
      const filePath = await manualAnalysisService.getArtifactFilePath(jobId, "overlay");
      res.setHeader("Content-Type", "image/png");
      res.sendFile(path.resolve(filePath));
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/manual-analysis/:jobId/probability-map
   * Stream probability heatmap artifact.
   */
  async getProbabilityMap(req, res, next) {
    try {
      const { jobId } = req.params;
      const filePath = await manualAnalysisService.getArtifactFilePath(jobId, "probability-map");
      res.setHeader("Content-Type", "image/png");
      res.sendFile(path.resolve(filePath));
    } catch (err) {
      if (err.statusCode === 404 || err.status === 404) {
        return res.status(404).json({
          success: false,
          data: null,
          error: {
            code: "NOT_AVAILABLE",
            message: `Artifact 'probability-map' is not available for job '${req.params.jobId}'.`,
          },
        });
      }
      next(err);
    }
  },

  /**
   * POST /api/v1/manual-analysis/:jobId/analyze
   * Part 0.14D: Execute end-to-end optical AI analysis (Classifier V2 + Segmentation V2 + Annotation).
   */
  async analyzeImage(req, res, next) {
    try {
      const { jobId } = req.params;
      logger.info(`[ManualAnalysisController] analyzeImage called for jobId: ${jobId}`, { body: req.body });

      const rawTimestamp = req.body?.investigationTimestamp || req.body?.acquisitionTimestamp || null;
      let analystTimestamp = null;
      if (rawTimestamp) {
        analystTimestamp = validateAndNormalizeIsoTimestamp(rawTimestamp);
        if (!analystTimestamp) {
          throw AppError.badRequest("Invalid investigationTimestamp. Must be a valid ISO-8601 string.");
        }
      }

      const options = { ...(req.body || {}) };
      if (analystTimestamp) {
        options.investigationTimestamp = analystTimestamp;
        options.analystTimestamp = analystTimestamp;
      }

      const result = await manualAnalysisService.analyzeManualImage(jobId, options);

      res.status(200).json({
        success: true,
        data: result,
        error: null,
      });
    } catch (err) {
      logger.error(`[ManualAnalysisController] analyzeImage caught error: ${err.message}`, { stack: err.stack, code: err.code, statusCode: err.statusCode });
      next(err);
    }
  },

  /**
   * POST /api/v1/manual-analysis/:jobId/compare-models
   * Phase 14: Execute side-by-side comparison of Drone RGB vs Satellite RGB models on same image.
   */
  async compareModels(req, res, next) {
    try {
      const { jobId } = req.params;
      const result = await manualAnalysisService.compareManualModels(jobId, req.body || {});

      res.status(200).json({
        success: true,
        data: result,
        error: null,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/manual-analysis/:jobId/annotated
   * Stream composite visual annotated overlay artifact.
   */
  async getAnnotated(req, res, next) {
    try {
      const { jobId } = req.params;
      const filePath = await manualAnalysisService.getArtifactFilePath(jobId, "annotated");
      res.setHeader("Content-Type", "image/png");
      res.sendFile(path.resolve(filePath));
    } catch (err) {
      if (err.statusCode === 404 || err.status === 404) {
        return res.status(404).json({
          success: false,
          data: null,
          error: {
            code: "NOT_AVAILABLE",
            message: `Artifact 'annotated' is not available for job '${req.params.jobId}'.`,
          },
        });
      }
      next(err);
    }
  },

  /**
   * GET /api/v1/manual-analysis/:jobId/original
   * Stream normalized original source image.
   */
  async getOriginal(req, res, next) {
    try {
      const { jobId } = req.params;
      const filePath = await manualAnalysisService.getArtifactFilePath(jobId, "original");
      const ext = path.extname(filePath).toLowerCase();
      const contentType = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".tif" || ext === ".tiff" ? "image/tiff" : "image/png";
      res.setHeader("Content-Type", contentType);
      res.sendFile(path.resolve(filePath));
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/manual-analysis/:jobId/preview
   * Stream derived visual PNG preview from source TIFF (VISUALIZATION_ONLY).
   */
  async getPreview(req, res, next) {
    try {
      const { jobId } = req.params;
      const filePath = await manualAnalysisService.getArtifactFilePath(jobId, "preview");
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Content-Disposition", "inline; filename=\"preview.png\"");
      res.sendFile(path.resolve(filePath));
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/manual-analysis/:jobId/channel1-preview
   * Stream Channel 1 grayscale visual PNG preview.
   */
  async getChannel1Preview(req, res, next) {
    try {
      const { jobId } = req.params;
      const filePath = await manualAnalysisService.getArtifactFilePath(jobId, "channel1-preview");
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Content-Disposition", "inline; filename=\"channel1_preview.png\"");
      return res.sendFile(path.resolve(filePath));
    } catch (err) {
      if (err.statusCode === 503 || err.code === "PREVIEW_SERVICE_UNAVAILABLE") {
        return res.status(503).json({
          status: "NOT_AVAILABLE",
          code: "PREVIEW_SERVICE_UNAVAILABLE",
          channel: "VV",
          message: "Python preview service is unreachable or timed out.",
          jobId: req.params.jobId,
        });
      }
      if (err.statusCode === 404 || err.code === "PREVIEW_NOT_AVAILABLE" || err.code === "NOT_FOUND") {
        return res.status(404).json({
          status: "NOT_AVAILABLE",
          code: "PREVIEW_NOT_AVAILABLE",
          channel: "VV",
          message: err.message || "Channel 1 (VV) preview is not available for this raster.",
          jobId: req.params.jobId,
        });
      }
      return res.status(500).json({
        status: "NOT_AVAILABLE",
        code: "PREVIEW_FAILED",
        channel: "VV",
        message: err.message || "Failed to retrieve channel 1 preview.",
        jobId: req.params.jobId,
      });
    }
  },

  /**
   * GET /api/v1/manual-analysis/:jobId/channel2-preview
   * Stream Channel 2 grayscale visual PNG preview.
   */
  async getChannel2Preview(req, res, next) {
    try {
      const { jobId } = req.params;
      const filePath = await manualAnalysisService.getArtifactFilePath(jobId, "channel2-preview");
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Content-Disposition", "inline; filename=\"channel2_preview.png\"");
      return res.sendFile(path.resolve(filePath));
    } catch (err) {
      if (err.statusCode === 503 || err.code === "PREVIEW_SERVICE_UNAVAILABLE") {
        return res.status(503).json({
          status: "NOT_AVAILABLE",
          code: "PREVIEW_SERVICE_UNAVAILABLE",
          channel: "VH",
          message: "Python preview service is unreachable or timed out.",
          jobId: req.params.jobId,
        });
      }
      if (err.statusCode === 404 || err.code === "PREVIEW_NOT_AVAILABLE" || err.code === "NOT_FOUND") {
        return res.status(404).json({
          status: "NOT_AVAILABLE",
          code: "PREVIEW_NOT_AVAILABLE",
          channel: "VH",
          message: err.message || "Channel 2 (VH) preview is not available for this raster.",
          jobId: req.params.jobId,
        });
      }
      return res.status(500).json({
        status: "NOT_AVAILABLE",
        code: "PREVIEW_FAILED",
        channel: "VH",
        message: err.message || "Failed to retrieve channel 2 preview.",
        jobId: req.params.jobId,
      });
    }
  },

  /**
   * POST /api/v1/manual-analysis/:jobId/investigate
   * Connects verified GeoTIFF optical / SAR detection to downstream investigation pipeline.
   */
  async investigate(req, res, next) {
    try {
      const { jobId } = req.params;
      const result = await manualAnalysisService.investigateManualSpill(jobId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/v1/manual-analysis/:jobId/declare-source
   * Phase 16.1: Authoritative backend source declaration for 2-channel SAR imagery.
   */
  async declareSource(req, res, next) {
    try {
      const { jobId } = req.params;
      const { sourceType, polarizations } = req.body || {};

      const result = await manualAnalysisService.declareSource(jobId, {
        sourceType,
        polarizations,
      });

      res.status(200).json({
        success: true,
        data: result,
        error: null,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/manual-analysis/:jobId/export/json
   * Export canonical investigation JSON snapshot.
   */
  async exportJson(req, res, next) {
    try {
      const { jobId } = req.params;
      const canonical = await manualAnalysisService.getAnalysisResult(jobId);
      const exported = investigationExportService.exportJson(canonical);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="investigation_${jobId}.json"`);
      return res.status(200).json(exported);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/manual-analysis/:jobId/export/geojson
   * Export available geospatial features as a GeoJSON FeatureCollection.
   */
  async exportGeoJson(req, res, next) {
    try {
      const { jobId } = req.params;
      const canonical = await manualAnalysisService.getAnalysisResult(jobId);
      const featureCollection = investigationExportService.exportGeoJson(canonical);

      res.setHeader('Content-Type', 'application/geo+json');
      res.setHeader('Content-Disposition', `attachment; filename="investigation_${jobId}.geojson"`);
      return res.status(200).json(featureCollection);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/manual-analysis/:jobId/export/report
   * Export technical investigation report markdown dossier.
   */
  async exportReport(req, res, next) {
    try {
      const { jobId } = req.params;
      const canonical = await manualAnalysisService.getAnalysisResult(jobId);
      const reportMarkdown = investigationExportService.exportReport(canonical);

      if (req.query && req.query.format === 'json') {
        return res.status(200).json({
          success: true,
          investigationId: jobId,
          fingerprint: canonical.fingerprint,
          report: reportMarkdown,
        });
      }

      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="investigation_${jobId}_report.md"`);
      return res.status(200).send(reportMarkdown);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/manual-analysis/:jobId/export/manifest
   * Export machine-readable artifact manifest.
   */
  async exportManifest(req, res, next) {
    try {
      const { jobId } = req.params;
      const canonical = await manualAnalysisService.getAnalysisResult(jobId);

      const diskMap = {};
      const artifactKeys = ['original', 'mask', 'overlay', 'annotated', 'probabilityMap', 'vv', 'vh'];
      for (const key of artifactKeys) {
        try {
          const filePath = await manualAnalysisService.getArtifactFilePath(jobId, key);
          diskMap[key] = Boolean(filePath && fs.existsSync(filePath));
        } catch (_) {
          diskMap[key] = false;
        }
      }

      const manifest = investigationExportService.exportManifest(canonical, { diskMap });

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="investigation_${jobId}_manifest.json"`);
      return res.status(200).json(manifest);
    } catch (err) {
      next(err);
    }
  },
};

module.exports = manualAnalysisController;
