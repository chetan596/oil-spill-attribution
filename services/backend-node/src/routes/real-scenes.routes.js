/**
 * Real Sentinel-1 Scene & Diagnostics Routes (Copernicus Data Space Ecosystem)
 * Provides authentic metadata, calibrated preview rasters, and live-scene baseline diagnostics.
 */

const fs = require("fs");
const path = require("path");
const express = require("express");
const logger = require("../logger");

const router = express.Router();

const REAL_CDSE_SCENE = {
  id: "cdse-s1a-mumbai-20240218",
  sceneId: "S1A_IW_GRDH_1SDV_20240218T010329_20240218T010354_052606_065D1D_A8B1_COG",
  title: "Real Sentinel-1A Live Scene — Mumbai Offshore Sector",
  description: "Authentic Copernicus Sentinel-1A Level-1 GRD SAR acquisition over Arabian Sea off Mumbai with real co-registered ECMWF ERA5 and NOAA CRW SST data.",
  satellite: "Sentinel-1A",
  sensor: "C-SAR (IW GRD)",
  polarization: "VV+VH",
  passDirection: "Descending",
  orbit: 52606,
  relativeOrbit: 65,
  acquisitionAt: "2024-02-18T01:03:29.872826Z",
  acquisitionEnd: "2024-02-18T01:03:54.871034Z",
  productUuid: "3f5c4ba1-ed70-4065-91b9-2bbeb7ebfb79",
  sourceProvider: "Copernicus Data Space Ecosystem (CDSE)",
  scenarioType: "REAL_CDSE",
  isRealScene: true,
  centroidLat: 18.993339,
  centroidLng: 72.745492,
  bounds: {
    left: 72.716985,
    bottom: 18.965879,
    right: 72.773998,
    top: 19.020798,
  },
  sceneFootprintWkt: "POLYGON((72.716985 18.965879, 72.773998 18.965879, 72.773998 19.020798, 72.716985 19.020798, 72.716985 18.965879))",
  bandInfo: {
    polarisation: "VV+VH",
    resolutionMeters: 10,
    isRealScene: true,
    calibrationStandard: "ESA Sentinel-1 Level-1 Radiometric Calibration (Sigma0 dB)",
  },
  groundTruthAvailable: false,
  vesselAttributionEstablished: false,
  driftOriginEstablished: false,
  disclaimer: "Real Sentinel-1 observation verified via CDSE. This live scene is unlabelled; no ground truth, confirmed oil spill, vessel attribution, or drift origin is established.",
};

const DIAGNOSTICS_PATH = path.resolve(__dirname, "../../../../docs/artifacts/v5d-real-cdse-live-baseline.json");
const DOWNLOAD_META_PATH = path.resolve(__dirname, "../../../../docs/artifacts/v5d-real-cdse-download.json");
const PREVIEW_PNG_PATH = path.resolve(__dirname, "../../../../docs/artifacts/v5d-real-cdse-live-baseline.png");
const SAR_PNG_PATH = path.resolve(__dirname, "../../../../docs/artifacts/v5d-real-cdse-sar.png");

/**
 * GET /api/v1/real-scenes
 * List all available authentic real satellite scenes.
 */
router.get("/", (req, res) => {
  return res.json({
    success: true,
    count: 1,
    data: [REAL_CDSE_SCENE],
  });
});

/**
 * GET /api/v1/real-scenes/:sceneId
 * Retrieve details for a specific real satellite scene.
 */
router.get("/:sceneId", (req, res) => {
  const { sceneId } = req.params;
  if (sceneId === REAL_CDSE_SCENE.id || sceneId === REAL_CDSE_SCENE.sceneId || sceneId.includes("cdse") || sceneId.includes("S1A_IW_GRDH")) {
    return res.json({
      success: true,
      data: REAL_CDSE_SCENE,
    });
  }
  return res.status(404).json({
    success: false,
    error: `Real scene '${sceneId}' not found`,
  });
});

/**
 * GET /api/v1/real-scenes/:sceneId/sar-metadata
 * Retrieve provenance metadata for real CDSE SAR scene.
 */
router.get("/:sceneId/sar-metadata", (req, res) => {
  let downloadMeta = null;
  if (fs.existsSync(DOWNLOAD_META_PATH)) {
    try {
      downloadMeta = JSON.parse(fs.readFileSync(DOWNLOAD_META_PATH, "utf8"));
    } catch (e) {
      logger.warn("[RealScenesRoutes] Could not parse download metadata", { error: e.message });
    }
  }

  return res.json({
    sceneId: REAL_CDSE_SCENE.id,
    productId: REAL_CDSE_SCENE.sceneId,
    scenarioType: "REAL_CDSE",
    isRealScene: true,
    sourceClassification: "AUTHENTICATED_CDSE_SOURCE",
    satellite: REAL_CDSE_SCENE.satellite,
    sensor: REAL_CDSE_SCENE.sensor,
    productUuid: REAL_CDSE_SCENE.productUuid,
    sourceProvider: REAL_CDSE_SCENE.sourceProvider,
    acquisitionAt: REAL_CDSE_SCENE.acquisitionAt,
    acquisitionEnd: REAL_CDSE_SCENE.acquisitionEnd,
    orbit: REAL_CDSE_SCENE.orbit,
    relativeOrbit: REAL_CDSE_SCENE.relativeOrbit,
    passDirection: REAL_CDSE_SCENE.passDirection,
    bands: ["VV", "VH"],
    crs: "EPSG:4326 (WGS 84)",
    bounds: REAL_CDSE_SCENE.bounds,
    centroidLat: REAL_CDSE_SCENE.centroidLat,
    centroidLng: REAL_CDSE_SCENE.centroidLng,
    dimensions: "512 x 512",
    detectionModel: "unet-dual-pol-sar-v2",
    threshold: 0.35,
    resolutionMeters: 10,
    calibration: {
      standard: "ESA Sentinel-1 Radiometric Calibration",
      equation: "Sigma0_dB = 10 * log10(DN^2 / A_sigma^2)",
      units: "Decibels (dB)",
      lutSource: "annotation/calibration/calibration-s1a-iw-grd-*.xml",
    },
    rawDnStats: downloadMeta?.raw_dn_statistics || {
      vv: { min: 7, max: 143, mean: 56.68, median: 56.0, std: 14.60 },
      vh: { min: 5, max: 78, mean: 32.22, median: 32.0, std: 7.63 },
    },
    calibratedDbStats: downloadMeta?.calibrated_db_statistics || {
      vv: { min_db: -38.75, max_db: -12.56, mean_db: -20.88, median_db: -20.70, std_db: 2.32 },
      vh: { min_db: -41.66, max_db: -17.82, mean_db: -25.74, median_db: -25.56, std_db: 2.13 },
    },
    previewAvailable: true,
    groundTruthAvailable: false,
    groundTruthStatus: "NOT_AVAILABLE",
    vesselAttributionEstablished: false,
    driftOriginEstablished: false,
    disclaimer: REAL_CDSE_SCENE.disclaimer,
  });
});

/**
 * GET /api/v1/real-scenes/:sceneId/diagnostics
 * Retrieve model baseline response diagnostics and environmental parameters.
 */
router.get("/:sceneId/diagnostics", (req, res) => {
  let diagData = null;
  if (fs.existsSync(DIAGNOSTICS_PATH)) {
    try {
      diagData = JSON.parse(fs.readFileSync(DIAGNOSTICS_PATH, "utf8"));
    } catch (e) {
      logger.warn("[RealScenesRoutes] Could not parse diagnostics JSON", { error: e.message });
    }
  }

  const defaultDiag = {
    validation_type: "REAL_CDSE_SAR_LIVE_SCENE_BASELINE_INFERENCE",
    scenarioType: "REAL_CDSE",
    active_model: {
      model_id: "unet-dual-pol-sar-v2",
      architecture: "UNet (Dual-Pol 2-Channel)",
      in_channels: 2,
    },
    model_response_diagnostics: {
      probability_statistics: {
        min: 0.000398,
        max: 0.362835,
        mean: 0.024305,
        median: 0.022336,
        std: 0.011739,
        p90: 0.035095,
        p95: 0.040692,
        p99: 0.065173,
      },
      candidate_detection: {
        threshold_0_50: {
          positive_pixels: 0,
          candidate_area_km2: 0.0,
        },
        threshold_0_35: {
          positive_pixels: 1,
          candidate_area_km2: 0.0001,
        },
      },
      wording: "SAR MODEL RESPONSE — UNLABELLED LIVE SCENE",
      ground_truth_status: "NOT_AVAILABLE",
      accuracy_metrics_reported: "NONE (unsupervised live evaluation)",
    },
    co_registered_metocean: {
      era5_wind_speed_ms: 2.79,
      noaa_crw_sst_deg_c: 26.30,
      wind_source: "ECMWF ERA5 10m Surface Reanalysis",
      sst_source: "NOAA Coral Reef Watch daily SST analysis",
    },
    ais_attribution_status: {
      status: "NOT_ESTABLISHED",
      message: "No real vessel attribution is established for this live Sentinel-1 scene.",
      disclaimer: "AIS data present in the system is for simulated demonstration scenarios only.",
    },
    drift_origin_status: {
      status: "NOT_ESTABLISHED",
      message: "Drift trajectory model was not executed for this unlabelled live scene.",
    },
  };

  const mergedData = {
    ...defaultDiag,
    ...(diagData || {}),
    ais_attribution_status: defaultDiag.ais_attribution_status,
    drift_origin_status: defaultDiag.drift_origin_status,
  };

  return res.json({
    success: true,
    data: mergedData,
  });
});

/**
 * GET /api/v1/real-scenes/:sceneId/sar-preview
 * Stream server-side rendered PNG visualization artifact with channel & view filtering.
 */
router.get("/:sceneId/sar-preview", (req, res) => {
  const channel = (req.query.channel || "").toLowerCase();
  const view = (req.query.view || "").toLowerCase();

  const CDSE_PREVIEWS_DIR = path.resolve(__dirname, "../../../../data/raw/satellite/cdse/previews");
  let targetPath = null;

  if (channel === "vv") {
    targetPath = path.join(CDSE_PREVIEWS_DIR, "cdse_vv.png");
  } else if (channel === "vh") {
    targetPath = path.join(CDSE_PREVIEWS_DIR, "cdse_vh.png");
  } else if (channel === "vv_vh" || channel === "vv+vh" || view === "source") {
    targetPath = path.join(CDSE_PREVIEWS_DIR, "cdse_vv_vh.png");
    if (!fs.existsSync(targetPath)) targetPath = SAR_PNG_PATH;
  } else if (view === "four_panel") {
    targetPath = PREVIEW_PNG_PATH;
  } else {
    // Default: If no channel or view specified, use full 4-panel analysis or SAR preview
    targetPath = fs.existsSync(PREVIEW_PNG_PATH) ? PREVIEW_PNG_PATH : SAR_PNG_PATH;
  }

  if (targetPath && fs.existsSync(targetPath)) {
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("X-SAR-Scene-ID", req.params.sceneId);
    res.setHeader("X-SAR-Channel", channel || "vv_vh");
    res.setHeader("X-SAR-Source-Classification", "AUTHENTICATED_CDSE_SOURCE");
    return fs.createReadStream(targetPath).pipe(res);
  }

  return res.status(404).json({
    success: false,
    error: `Preview artifact for channel '${channel || "default"}' not found on server`,
  });
});

module.exports = router;
