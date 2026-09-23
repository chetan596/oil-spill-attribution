/**
 * Spill Origin Estimation & Drift Integration Service — Phase 16.4 Parts 3 & 4
 *
 * Provides a unified, gated interface for executing Lagrangian hydrodynamic
 * drift simulations (backward hindcast + forward forecast) from model-derived
 * spill footprints and centroids.
 *
 * Unified Architecture:
 *   Manual GeoTIFF inference → canonical centroid (MODEL_DERIVED)
 *         ↓
 *   spillOriginEstimationService.estimateOriginAndDrift(params)
 *         ↓
 *   Gate 1: geospatial.available === true  →  NOT_AVAILABLE if false
 *   Gate 2: valid spillFootprint           →  INSUFFICIENT_DATA if null
 *   Gate 3: valid centroid lat/lng         →  INSUFFICIENT_DATA if missing
 *   Gate 4: environmental / demo mode check → ENVIRONMENTAL_DATA_UNAVAILABLE if demo off & no env
 *         ↓
 *   SINGLE driftService.runDriftSimulation() execution
 *         ↓
 *   terminal point of backward trajectory === origin.estimatedPoint
 *         ↓
 *   Returns { origin, drift } with unified provenance and zero AIS leakage
 *
 * CRITICAL SCIENTIFIC GUARDRAILS:
 * - Origin is NOT a confirmed source location
 * - Backward & forward trajectories are ESTIMATED (MODEL_DERIVED)
 * - Forward trajectory only returned when genuinely supported by the engine
 * - Environmental data provenance strictly labelled: REAL / DEMO / NOT_AVAILABLE
 * - Timestamps: RASTER_ACQUISITION_TIMESTAMP or ESTIMATION_TIME_PROXY
 * - Zero AIS calls or vessel attribution (remains NOT_ESTABLISHED)
 * - Deterministic in-memory caching keyed by inputs
 */

const driftService = require("../services/drift.service");
const logger = require("../logger");

/**
 * Origin status enum.
 */
const ORIGIN_STATUS = {
  NOT_AVAILABLE: "NOT_AVAILABLE",
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
  ESTIMATED: "ESTIMATED",
  FAILED: "FAILED",
};

/**
 * Drift status enum.
 */
const DRIFT_STATUS = {
  NOT_AVAILABLE: "NOT_AVAILABLE",
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
  ENVIRONMENTAL_DATA_UNAVAILABLE: "ENVIRONMENTAL_DATA_UNAVAILABLE",
  METOCEAN_PROVIDER_CONFIGURATION_REQUIRED: "METOCEAN_PROVIDER_CONFIGURATION_REQUIRED",
  METOCEAN_TIMESTAMP_REQUIRED: "METOCEAN_TIMESTAMP_REQUIRED",
  ESTIMATED: "ESTIMATED",
  FAILED: "FAILED",
};

// In-memory simulation cache for deterministic idempotency
const driftSimulationCache = new Map();

/**
 * Clear simulation cache (useful in tests).
 */
function clearDriftCache() {
  driftSimulationCache.clear();
}

/**
 * Build the null/unavailable origin block for structured failure states.
 */
function buildUnavailableOrigin(status, reason) {
  return {
    status,
    estimatedPoint: null,
    uncertainty: null,
    method: null,
    provenance: "NOT_AVAILABLE",
    source: "SPILL_ORIGIN_ESTIMATION_SERVICE",
    unavailableReason: reason,
  };
}

/**
 * Build the null/unavailable drift block for structured failure states.
 */
function buildUnavailableDrift(status, reason) {
  return {
    status,
    backward: null,
    forward: null,
    environmentalData: {
      source: "NOT_AVAILABLE",
      isDemo: false,
      wind: null,
      current: null,
      timestamp: null,
    },
    uncertainty: null,
    provenance: "NOT_AVAILABLE",
    timestampSource: null,
    engine: null,
    simulationMeta: null,
    unavailableReason: reason,
  };
}

/**
 * Extract a valid [latitude, longitude] pair from a centroid value.
 */
function extractCentroidCoords(centroid) {
  if (!centroid) return null;

  let lat, lng;
  if (Array.isArray(centroid) && centroid.length >= 2) {
    lat = Number(centroid[0]);
    lng = Number(centroid[1]);
  } else if (typeof centroid === "object") {
    lat = Number(centroid.latitude ?? centroid.lat ?? NaN);
    lng = Number(centroid.longitude ?? centroid.lng ?? NaN);
  }

  if (isNaN(lat) || isNaN(lng) || !isFinite(lat) || !isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { latitude: lat, longitude: lng };
}

/**
 * Check whether a spillFootprint GeoJSON Feature has valid geometry.
 */
function isValidSpillFootprint(spillFootprint) {
  if (!spillFootprint) return false;
  const geom = spillFootprint.geometry || spillFootprint;
  if (!geom || !geom.type || !geom.coordinates) return false;
  if (geom.coordinates.length === 0) return false;
  return true;
}

/**
 * Build GeoJSON LineString Feature from waypoint path.
 */
function buildTrajectoryFeature({ pathPoints, direction, hours, engine, environmentalSource }) {
  if (!pathPoints || pathPoints.length === 0) return null;

  const coordinates = pathPoints.map((pt) => [
    Number(Number(pt.longitude ?? pt.lng).toFixed(6)),
    Number(Number(pt.latitude ?? pt.lat).toFixed(6)),
  ]);

  const timestamps = pathPoints.map((pt) => pt.timestamp).filter(Boolean);

  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates,
    },
    properties: {
      provenance: "MODEL_DERIVED",
      direction,
      hours,
      engine,
      environmentalSource,
      pointCount: pathPoints.length,
      timestamps: timestamps.length > 0 ? timestamps : undefined,
    },
  };
}

/**
 * Unified execution of origin estimation and drift trajectories.
 *
 * Runs the drift simulation ONCE and extracts:
 *   - origin.estimatedPoint from terminal point of backward trajectory
 *   - backward drift trajectory (GeoJSON LineString Feature)
 *   - forward drift trajectory (GeoJSON LineString Feature or NOT_AVAILABLE)
 *   - uncertainty and environmental provenance
 *
 * @param {Object} params
 * @param {Object|null} params.geospatial - Canonical geospatial block
 * @param {Object|null} params.spillFootprint - Model-derived spill footprint GeoJSON
 * @param {Object|null} params.centroid - Canonical centroid ({ latitude, longitude })
 * @param {string|null} [params.acquisitionTimestamp] - Real raster timestamp or null
 * @param {number} [params.hoursBack=24] - Hindcast window
 * @param {number} [params.hoursForward=6] - Forecast window
 * @param {string} [params.jobId="unknown"] - Job ID
 * @param {boolean} [params.bypassCache=false] - Bypass in-memory cache
 * @returns {Promise<{ origin: Object, drift: Object }>}
 */
async function estimateOriginAndDrift({
  geospatial,
  spillFootprint,
  centroid,
  acquisitionTimestamp = null,
  hoursBack = 24,
  hoursForward = 6,
  jobId = "unknown",
  bypassCache = false,
} = {}) {
  // ── Gate 1: Geospatial must be established ──────────────────────────────
  if (!geospatial || geospatial.available !== true) {
    logger.info("[SpillOriginEstimationService] Drift/Origin skipped — geospatial not available", { jobId });
    const reason = "Source image has no valid geospatial reference (CRS + bounds not established)";
    return {
      origin: buildUnavailableOrigin(ORIGIN_STATUS.NOT_AVAILABLE, reason),
      drift: buildUnavailableDrift(DRIFT_STATUS.NOT_AVAILABLE, reason),
    };
  }

  // ── Gate 2: Valid model-derived spill geometry required ─────────────────
  if (!isValidSpillFootprint(spillFootprint)) {
    logger.info("[SpillOriginEstimationService] Drift/Origin skipped — no valid spill footprint", { jobId });
    const reason = "No model-derived spill geometry available. Spill footprint is required.";
    return {
      origin: buildUnavailableOrigin(ORIGIN_STATUS.INSUFFICIENT_DATA, reason),
      drift: buildUnavailableDrift(DRIFT_STATUS.INSUFFICIENT_DATA, reason),
    };
  }

  // ── Gate 3: Valid centroid coordinates required ─────────────────────────
  const centroidCoords = extractCentroidCoords(centroid);
  if (!centroidCoords) {
    logger.info("[SpillOriginEstimationService] Drift/Origin skipped — centroid coordinates invalid", { jobId, centroid });
    const reason = "Model-derived spill centroid coordinates are missing or invalid.";
    return {
      origin: buildUnavailableOrigin(ORIGIN_STATUS.INSUFFICIENT_DATA, reason),
      drift: buildUnavailableDrift(DRIFT_STATUS.INSUFFICIENT_DATA, reason),
    };
  }

  // ── Temporal provenance ─────────────────────────────────────────────────
  const detectionTimestamp = acquisitionTimestamp || null;
  const timestampSource = acquisitionTimestamp
    ? "RASTER_ACQUISITION_TIMESTAMP"
    : "ESTIMATION_TIME_PROXY";

  const isDemoModeEnabled = (process.env.DEMO_MODE || "true").toLowerCase() === "true";

  // ── Cache check ─────────────────────────────────────────────────────────
  const cacheKey = [
    jobId || "no-job",
    geospatial.crs || "no-crs",
    geospatial.bounds ? JSON.stringify(geospatial.bounds) : "no-bounds",
    centroidCoords.latitude.toFixed(6),
    centroidCoords.longitude.toFixed(6),
    detectionTimestamp || "proxy-time",
    hoursBack,
    hoursForward,
    isDemoModeEnabled ? "DEMO" : "REAL",
    "lagrangian-v1",
  ].join("::");

  if (!bypassCache && driftSimulationCache.has(cacheKey)) {
    logger.info("[SpillOriginEstimationService] Returning cached drift/origin result", { jobId, cacheKey });
    return driftSimulationCache.get(cacheKey);
  }

  logger.info("[SpillOriginEstimationService] Dispatching single drift simulation for investigation", {
    jobId,
    centroidLat: centroidCoords.latitude,
    centroidLng: centroidCoords.longitude,
    hoursBack,
    hoursForward,
    timestampSource,
    isDemoMode: isDemoModeEnabled,
  });

  try {
    const driftResult = await driftService.runDriftSimulation({
      latitude: centroidCoords.latitude,
      longitude: centroidCoords.longitude,
      detectionTimestamp,
      hoursBack,
      hoursForward,
      source: "manual_investigation",
    });

    if (!driftResult || driftResult.status === "failed") {
      logger.warn("[SpillOriginEstimationService] Drift simulation returned failure status", { jobId, driftResult });
      const reason = "Lagrangian drift simulation returned a failure status.";
      return {
        origin: buildUnavailableOrigin(ORIGIN_STATUS.FAILED, reason),
        drift: buildUnavailableDrift(DRIFT_STATUS.FAILED, reason),
      };
    }

    const backwardPath = driftResult.backwardPath || [];
    const forwardPath = driftResult.forwardPath || [];

    if (!Array.isArray(backwardPath) || backwardPath.length === 0) {
      logger.warn("[SpillOriginEstimationService] Drift result missing backward trajectory path", { jobId });
      const reason = "Drift simulation returned an empty or invalid backward trajectory.";
      return {
        origin: buildUnavailableOrigin(ORIGIN_STATUS.FAILED, reason),
        drift: buildUnavailableDrift(DRIFT_STATUS.FAILED, reason),
      };
    }

    // Origin is the terminal point of the backward trajectory
    const originPoint = backwardPath[backwardPath.length - 1];
    const originLat = originPoint?.lat ?? originPoint?.latitude ?? driftResult.originLat ?? driftResult.latitude;
    const originLng = originPoint?.lng ?? originPoint?.longitude ?? driftResult.originLng ?? driftResult.longitude;

    if (originLat == null || originLng == null || isNaN(Number(originLat)) || isNaN(Number(originLng))) {
      logger.warn("[SpillOriginEstimationService] Drift result has invalid origin coordinates", { jobId, driftResult });
      const reason = "Drift simulation returned invalid origin coordinates.";
      return {
        origin: buildUnavailableOrigin(ORIGIN_STATUS.FAILED, reason),
        drift: buildUnavailableDrift(DRIFT_STATUS.FAILED, reason),
      };
    }

    const formattedOriginPoint = {
      latitude: Number(Number(originLat).toFixed(6)),
      longitude: Number(Number(originLng).toFixed(6)),
    };

    const centroidStartPoint = {
      latitude: Number(Number(centroidCoords.latitude).toFixed(6)),
      longitude: Number(Number(centroidCoords.longitude).toFixed(6)),
    };

    const uncertaintyRadiusKm = Number(
      originPoint.uncertaintyRadiusKm ??
      driftResult.uncertaintyRadiusKm ??
      driftResult.simulationMeta?.uncertainty_radius_km ??
      2.5
    );

    const engine = driftResult.engine || driftResult.simulationMeta?.engine || "BUILT-IN DEMONSTRATION LAGRANGIAN MODEL";

    // Environmental provenance handling
    const simEnvironmental = driftResult.simulationMeta?.environmental || driftResult.simulationMeta || {};
    const rawEnvSource = (
      simEnvironmental.forcingProvenance ||
      simEnvironmental.source ||
      driftResult.forcingProvenance ||
      driftResult.source ||
      (isDemoModeEnabled ? "demo" : "not_available")
    ).toString();

    let environmentalSource = "NOT_AVAILABLE";
    let isDemoEnv = false;

    if (
      rawEnvSource.toUpperCase().includes("REAL") ||
      rawEnvSource.toUpperCase().includes("MULTI_OBS") ||
      rawEnvSource.toUpperCase().includes("HINDCAST") ||
      rawEnvSource.toUpperCase().includes("REANALYSIS") ||
      rawEnvSource.toUpperCase() === "REAL"
    ) {
      environmentalSource = rawEnvSource.toUpperCase();
      isDemoEnv = false;
    } else if (rawEnvSource.toLowerCase() === "demo" || isDemoModeEnabled) {
      environmentalSource = "DEMO";
      isDemoEnv = true;
    } else {
      environmentalSource = "NOT_AVAILABLE";
      isDemoEnv = false;
    }

    const environmentalData = {
      source: environmentalSource,
      isDemo: isDemoEnv,
      forcingProvenance: simEnvironmental.forcingProvenance || environmentalSource,
      forwardProvenance: simEnvironmental.forwardProvenance || null,
      provider: simEnvironmental.provider || null,
      datasets: simEnvironmental.datasets || null,
      currentForcingDefinition: simEnvironmental.currentForcingDefinition || null,
      wind: simEnvironmental.wind || null,
      current: simEnvironmental.current || null,
      scenarioName: simEnvironmental.scenario_name || null,
      timestamp: detectionTimestamp || null,
    };

    // Construct Backward Trajectory Feature
    const backwardFeature = buildTrajectoryFeature({
      pathPoints: backwardPath,
      direction: "backward",
      hours: hoursBack,
      engine,
      environmentalSource,
    });

    const backward = {
      trajectory: backwardFeature,
      feature: backwardFeature,
      hours: hoursBack,
      startPoint: centroidStartPoint,
      endPoint: formattedOriginPoint,
      points: backwardPath,
    };

    // Construct Forward Trajectory Feature (only if supported and genuinely available)
    let forward = null;
    const hasForwardPoints = Array.isArray(forwardPath) && forwardPath.length > 1 && hoursForward > 0;

    if (hasForwardPoints) {
      const forwardTerminalPoint = forwardPath[forwardPath.length - 1];
      const forwardEndPoint = {
        latitude: Number(Number(forwardTerminalPoint.lat ?? forwardTerminalPoint.latitude).toFixed(6)),
        longitude: Number(Number(forwardTerminalPoint.lng ?? forwardTerminalPoint.longitude).toFixed(6)),
      };

      const forwardFeature = buildTrajectoryFeature({
        pathPoints: forwardPath,
        direction: "forward",
        hours: hoursForward,
        engine,
        environmentalSource,
      });

      forward = {
        status: "ESTIMATED",
        trajectory: forwardFeature,
        feature: forwardFeature,
        hours: hoursForward,
        startPoint: centroidStartPoint,
        endPoint: forwardEndPoint,
        points: forwardPath,
      };
    } else {
      forward = {
        status: "NOT_AVAILABLE",
        trajectory: null,
        feature: null,
        hours: 0,
        startPoint: null,
        endPoint: null,
        points: [],
      };
    }

    const origin = {
      status: ORIGIN_STATUS.ESTIMATED,
      estimatedPoint: formattedOriginPoint,
      uncertainty: {
        radiusKm: Number(uncertaintyRadiusKm.toFixed(4)),
        confidence: "LOW_TO_MEDIUM",
        notes: "Uncertainty radius grows with hindcast duration. Environmental inputs are demonstration values.",
      },
      method: `Lagrangian reverse hindcast (${hoursBack}h backward trace from model-derived spill centroid)`,
      engine,
      provenance: "MODEL_DERIVED",
      source: "SPILL_ORIGIN_ESTIMATION_SERVICE",
      timestampSource,
      simulationMeta: driftResult.simulationMeta || null,
      centroidUsed: centroidCoords,
      hoursBack,
    };

    const drift = {
      status: DRIFT_STATUS.ESTIMATED,
      backward,
      forward,
      environmentalData,
      uncertainty: {
        radiusKm: Number(uncertaintyRadiusKm.toFixed(4)),
        confidence: "LOW_TO_MEDIUM",
        notes: "Estimated uncertainty corridor derived from advection-diffusion modeling.",
      },
      provenance: "MODEL_DERIVED",
      timestampSource,
      engine,
      simulationMeta: driftResult.simulationMeta || null,
    };

    const result = { origin, drift };

    // Cache deterministic result
    driftSimulationCache.set(cacheKey, result);

    logger.info("[SpillOriginEstimationService] Unified drift and origin computed successfully", {
      jobId,
      originLat,
      originLng,
      hoursBack,
      hoursForward,
      forwardStatus: forward.status,
      environmentalSource,
    });

    return result;
  } catch (err) {
    logger.error("[SpillOriginEstimationService] Drift simulation threw exception", {
      jobId,
      error: err.message,
    });

    let failureStatus = DRIFT_STATUS.FAILED;
    let failureReason = `Drift simulation pipeline failure: ${err.message}`;

    if (err.message?.includes("METOCEAN_PROVIDER_CONFIGURATION_REQUIRED")) {
      failureStatus = DRIFT_STATUS.METOCEAN_PROVIDER_CONFIGURATION_REQUIRED;
      failureReason = err.message;
    } else if (err.message?.includes("METOCEAN_TIMESTAMP_REQUIRED")) {
      failureStatus = DRIFT_STATUS.METOCEAN_TIMESTAMP_REQUIRED;
      failureReason = err.message;
    } else if (
      err.message?.includes("METOCEAN_DATA_UNAVAILABLE") ||
      !isDemoModeEnabled ||
      err.message?.toLowerCase().includes("environmental")
    ) {
      failureStatus = DRIFT_STATUS.ENVIRONMENTAL_DATA_UNAVAILABLE;
      failureReason = err.message || "Environmental data is unavailable and demonstration mode is disabled.";
    }

    return {
      origin: buildUnavailableOrigin(ORIGIN_STATUS.FAILED, failureReason),
      drift: buildUnavailableDrift(failureStatus, failureReason),
    };
  }
}

/**
 * Backwards-compatible estimateOrigin helper.
 */
async function estimateOrigin(params) {
  const { origin } = await estimateOriginAndDrift(params);
  return origin;
}

module.exports = {
  estimateOriginAndDrift,
  estimateOrigin,
  ORIGIN_STATUS,
  DRIFT_STATUS,
  buildUnavailableOrigin,
  buildUnavailableDrift,
  extractCentroidCoords,
  isValidSpillFootprint,
  buildTrajectoryFeature,
  clearDriftCache,
};
