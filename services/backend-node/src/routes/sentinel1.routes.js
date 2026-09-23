/**
 * Sentinel-1 Acquisition & Discovery Routes (Copernicus Data Space Ecosystem)
 */

const express = require("express");
const sentinel1Service = require("../services/sentinel1/sentinel1.service");
const analysisService = require("../services/analysis.service");
const logger = require("../logger");

const router = express.Router();

/**
 * GET /api/v1/sentinel1/aois
 * List registered maritime Areas of Interest (AOIs).
 */
router.get("/aois", async (req, res, next) => {
  try {
    const aois = await sentinel1Service.getAois();
    res.json({
      success: true,
      count: aois.length,
      data: aois,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/sentinel1/search
 * Search real Sentinel-1 products from CDSE STAC catalogue.
 */
router.get("/search", async (req, res, next) => {
  try {
    const {
      aoi,
      lat,
      lng,
      bbox,
      startDate,
      endDate,
      mode = "IW",
      polarization = "VV+VH",
      limit = 15,
    } = req.query;

    let parsedBbox = null;
    if (bbox) {
      if (typeof bbox === "string") {
        parsedBbox = bbox.split(",").map(Number);
      } else if (Array.isArray(bbox)) {
        parsedBbox = bbox.map(Number);
      }
    } else if (lat && lng) {
      const latitude = Number(lat);
      const longitude = Number(lng);
      parsedBbox = [longitude - 0.35, latitude - 0.35, longitude + 0.35, latitude + 0.35];
    }

    const results = await sentinel1Service.searchAcquisitions({
      aoi: aoi || (parsedBbox ? "custom" : "mumbai"),
      bbox: parsedBbox,
      startDate,
      endDate,
      mode,
      polarization,
      limit: Number(limit) || 15,
    });

    res.json(results);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/sentinel1/products/:productId
 * Get normalized metadata for a specific Sentinel-1 product.
 */
router.get("/products/:productId", async (req, res, next) => {
  try {
    const { productId } = req.params;
    const result = await sentinel1Service.getProduct(productId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/sentinel1/download
 * Stage and download a Sentinel-1 product from CDSE.
 */
router.post("/download", async (req, res, next) => {
  try {
    const { productId, options } = req.body;
    if (!productId) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: productId",
      });
    }

    const result = await sentinel1Service.downloadAndStage(productId, options);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/sentinel1/process
 * Dispatch analysis job for a real Sentinel-1 scene.
 */
router.post("/process", async (req, res, next) => {
  try {
    const {
      productId,
      sarSceneId,
      timeWindowHours = 24,
      imagePath,
      metadata,
    } = req.body;

    const sceneId = sarSceneId || productId;
    if (!sceneId) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: productId or sarSceneId",
      });
    }

    logger.info("[Sentinel1Routes] Creating analysis job for real Sentinel-1 acquisition", {
      sceneId,
      timeWindowHours,
      imagePath,
    });

    const job = await analysisService.createJob({
      sarSceneId: sceneId,
      productId: productId || sceneId,
      timeWindowHours: Number(timeWindowHours) || 24,
      userId: req.user?.id || null,
      imagePath: imagePath || null,
      metadata: metadata || {},
      isRealCdse: true,
    });

    res.status(201).json({
      success: true,
      message: "Analysis job dispatched for real Sentinel-1 acquisition",
      jobId: job.jobId,
      analysisId: job.analysisId,
      sceneId,
      source: "COPERNICUS_DATA_SPACE",
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
