const { Router } = require("express");
const manualAnalysisController = require("./manual-analysis.controller");
const { upload } = require("./manual-analysis.upload");
const { optionalAuthenticate } = require("../middleware/auth.middleware");

const router = Router();

// Allow optional auth across manual analysis routes (enabling authenticated user tracking and frictionless access)
router.use(optionalAuthenticate);

/**
 * POST /api/v1/manual-analysis/upload
 * Part 1: Multipart image upload and validation foundation.
 */
router.post(
  "/upload",
  upload.single("image"),
  manualAnalysisController.uploadOnly
);

/**
 * POST /api/v1/manual-analysis
 * Multipart image upload and job creation.
 */
router.post(
  "/",
  upload.single("image"),
  manualAnalysisController.uploadAndAnalyze
);

/**
 * POST /api/v1/manual-analysis/:jobId/declare-source
 * Phase 16.1: Authoritative backend source declaration for 2-channel SAR imagery.
 */
router.post("/:jobId/declare-source", manualAnalysisController.declareSource);

/**
 * POST /api/v1/manual-analysis/:jobId/analyze
 * Part 0.14D: Optical AI Analysis (Classifier V2 + Segmentation V2 + Visual Annotation).
 */
router.post("/:jobId/analyze", manualAnalysisController.analyzeImage);

/**
 * POST /api/v1/manual-analysis/:jobId/compare-models
 * Phase 14: Side-by-side optical model comparison (Developer Mode).
 */
router.post("/:jobId/compare-models", manualAnalysisController.compareModels);

/**
 * POST /api/v1/manual-analysis/:jobId/classify
 * Part 0.14B: Optical RGB Oil vs Non-Oil binary classification.
 */
router.post("/:jobId/classify", manualAnalysisController.classifyImage);

/**
 * GET /api/v1/manual-analysis/:jobId
 * Job status & progress polling.
 */
router.get("/:jobId", manualAnalysisController.getStatus);

/**
 * GET /api/v1/manual-analysis/:jobId/result
 * Full structured forensic & detection result.
 */
router.get("/:jobId/result", manualAnalysisController.getResult);

/**
 * GET /api/v1/manual-analysis/:jobId/report
 * Technical report dossier.
 */
router.get("/:jobId/report", manualAnalysisController.getReport);

/**
 * GET /api/v1/manual-analysis/:jobId/mask
 * Binary segmentation mask image.
 */
router.get("/:jobId/mask", manualAnalysisController.getMask);

/**
 * GET /api/v1/manual-analysis/:jobId/annotated
 * Visual composite annotated overlay image.
 */
router.get("/:jobId/annotated", manualAnalysisController.getAnnotated);

/**
 * GET /api/v1/manual-analysis/:jobId/overlay
 * Visual spill overlay image.
 */
router.get("/:jobId/overlay", manualAnalysisController.getOverlay);

/**
 * GET /api/v1/manual-analysis/:jobId/probability-map
 * Probability heatmap image.
 */
router.get("/:jobId/probability-map", manualAnalysisController.getProbabilityMap);

/**
 * GET /api/v1/manual-analysis/:jobId/original
 * Source normalized image.
 */
router.get("/:jobId/original", manualAnalysisController.getOriginal);

/**
 * GET /api/v1/manual-analysis/:jobId/preview
 * Derived visual PNG preview of TIFF/GeoTIFF raster.
 */
router.get("/:jobId/preview", manualAnalysisController.getPreview);

/**
 * GET /api/v1/manual-analysis/:jobId/channel1-preview
 * Grayscale PNG visual preview of Channel 1.
 */
router.get("/:jobId/channel1-preview", manualAnalysisController.getChannel1Preview);
router.get("/:jobId/vv", manualAnalysisController.getChannel1Preview);

/**
 * GET /api/v1/manual-analysis/:jobId/channel2-preview
 * Grayscale PNG visual preview of Channel 2.
 */
router.get("/:jobId/channel2-preview", manualAnalysisController.getChannel2Preview);
router.get("/:jobId/vh", manualAnalysisController.getChannel2Preview);

/**
 * POST /api/v1/manual-analysis/:jobId/investigate
 * Connect verified detection to downstream geospatial investigation pipeline.
 */
router.post("/:jobId/investigate", manualAnalysisController.investigate);

/**
 * Phase 16.4 Part 6: Multi-format exports
 */
router.get("/:jobId/export/json", manualAnalysisController.exportJson);
router.get("/:jobId/export/geojson", manualAnalysisController.exportGeoJson);
router.get("/:jobId/export/report", manualAnalysisController.exportReport);
router.get("/:jobId/export/manifest", manualAnalysisController.exportManifest);

module.exports = router;
