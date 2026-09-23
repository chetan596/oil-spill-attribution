/**
 * Python ML Drift Simulation Integration Client (Phase 5)
 *
 * Connects Node.js BullMQ worker to the FastAPI Python ML service for
 * Lagrangian hydrodynamic oil spill drift modelling (backward hindcast & forward forecast).
 */

const axios = require("axios");
const spillRepository = require("../repositories/spill.repository");
const AppError = require("../errors/AppError");
const logger = require("../logger");

const config = require("../config/env");
const ML_SERVICE_URL = config.mlServiceUrl || process.env.ML_SERVICE_URL || "http://127.0.0.1:8000";
const DEMO_MODE = (process.env.DEMO_MODE || "true").toLowerCase() === "true";

/**
 * Fallback deterministic Lagrangian drift calculation when Python service is unavailable in DEMO_MODE.
 */
function computeDemoLagrangianDrift({
  latitude,
  longitude,
  detectionTimestamp,
  hoursBack = 24,
  hoursForward = 6,
}) {
  const detectTimeMs = detectionTimestamp ? new Date(detectionTimestamp).getTime() : Date.now();
  const lat = Number(latitude);
  const lng = Number(longitude);

  // Surface drift velocity components under demo environmental forcing (12.4 kts NW wind + 0.8 kts SE current):
  // Drift velocity approx: dLat = -0.008 deg/h, dLng = +0.012 deg/h (moving SE)
  // Therefore, in backward hindcast, slick came from North-West (+0.008 deg/h lat, -0.012 deg/h lng)

  const backwardPath = Array.from({ length: hoursBack + 1 }, (_, i) => {
    const elapsedH = i;
    const ptLat = Number((lat + elapsedH * 0.008).toFixed(5));
    const ptLng = Number((lng - elapsedH * 0.012).toFixed(5));
    const tMs = detectTimeMs - elapsedH * 3600 * 1000;
    // Uncertainty: R(t) = 2.5 * sqrt(2 * K * t_sec) / 1000 (K = 5.0 m^2/s) -> 2.6 km at 24h
    const uncertaintyKm = elapsedH === 0
      ? 0.5
      : Number((2.5 * Math.sqrt(2.0 * 5.0 * elapsedH * 3600) / 1000.0).toFixed(4));

    return {
      seqIndex: i,
      seq_index: i,
      latitude: ptLat,
      longitude: ptLng,
      lat: ptLat,
      lng: ptLng,
      timestamp: new Date(tMs).toISOString(),
      elapsedHours: elapsedH,
      uncertaintyRadiusKm: uncertaintyKm,
      phase: "backward",
    };
  });

  const forwardPath = Array.from({ length: hoursForward + 1 }, (_, i) => {
    const elapsedH = i;
    const ptLat = Number((lat - elapsedH * 0.008).toFixed(5));
    const ptLng = Number((lng + elapsedH * 0.012).toFixed(5));
    const tMs = detectTimeMs + elapsedH * 3600 * 1000;
    const uncertaintyKm = elapsedH === 0
      ? 0.5
      : Number((2.5 * Math.sqrt(2.0 * 5.0 * elapsedH * 3600) / 1000.0).toFixed(4));

    return {
      seqIndex: i,
      seq_index: i,
      latitude: ptLat,
      longitude: ptLng,
      lat: ptLat,
      lng: ptLng,
      timestamp: new Date(tMs).toISOString(),
      elapsedHours: elapsedH,
      uncertaintyRadiusKm: uncertaintyKm,
      phase: "forward",
    };
  });

  const originPoint = backwardPath[backwardPath.length - 1];

  return {
    status: "success",
    engine: "BUILT-IN DEMONSTRATION LAGRANGIAN MODEL",
    latitude: originPoint.lat,
    longitude: originPoint.lng,
    originLat: originPoint.lat,
    originLng: originPoint.lng,
    originTimestamp: originPoint.timestamp,
    timeWindowHours: hoursBack,
    uncertaintyRadiusKm: originPoint.uncertaintyRadiusKm,
    backwardPath,
    forwardPath,
    simulationMeta: {
      engine: "BUILT-IN DEMONSTRATION LAGRANGIAN MODEL",
      pygnome_native_available: false,
      environmental: {
        source: "demo",
        scenario_name: "Arabian Sea Demonstration MetOcean Field",
        wind: { speed_kts: 12.4, direction_from_deg: 315.0, leeway_factor: 0.03 },
        current: { speed_kts: 0.8, direction_towards_deg: 125.0 },
      },
      time_stepping: { step_minutes: 60, hours_back: hoursBack, hours_forward: hoursForward },
      source_classification: {
        satellite_detection: "OBSERVED (Sentinel-1 SAR)",
        drift_trajectory: "MODELLED (Lagrangian Advection)",
        spill_origin: "MODELLED SPILL ORIGIN",
        origin_uncertainty: "Modelled Origin Uncertainty Radius",
        environmental_inputs: "DEMONSTRATION (source: demo)",
      },
      disclaimer: "Demonstration Lagrangian trajectory simulation. Not causal proof of spill discharge.",
    },
  };
}

/**
 * DriftService — business logic and API client for drift simulation data.
 */
const driftService = {
  /**
   * Execute hydrodynamic drift simulation by querying the Python ML Service.
   *
   * @param {Object} params
   * @param {number} params.latitude - Detected slick centroid latitude
   * @param {number} params.longitude - Detected slick centroid longitude
   * @param {string|Date} [params.detectionTimestamp] - Detection timestamp
   * @param {number} [params.hoursBack=24] - Hindcast backward duration
   * @param {number} [params.hoursForward=6] - Forecast forward duration
   * @param {number} [params.windSpeedKts]
   * @param {number} [params.windDirectionDeg]
   * @param {number} [params.currentSpeedKts]
   * @param {number} [params.currentDirectionDeg]
   * @param {number} [params.windageFactor]
   * @param {string} [params.source="demo"]
   */
  async runDriftSimulation({
    latitude,
    longitude,
    detectionTimestamp,
    hoursBack = 24,
    hoursForward = 6,
    windSpeedKts,
    windDirectionDeg,
    currentSpeedKts,
    currentDirectionDeg,
    windageFactor,
    source = "demo",
  }) {
    logger.info("[DriftService] Dispatching drift simulation request to Python ML service", {
      latitude,
      longitude,
      detectionTimestamp,
      hoursBack,
      hoursForward,
      serviceUrl: ML_SERVICE_URL,
    });

    try {
      const response = await axios.post(
        `${ML_SERVICE_URL}/api/v1/hindcast/simulate`,
        {
          latitude: Number(latitude),
          longitude: Number(longitude),
          detection_timestamp: detectionTimestamp ? new Date(detectionTimestamp).toISOString() : null,
          hours_back: Number(hoursBack) || 24,
          hours_forward: Number(hoursForward) || 6,
          wind_speed_kts: windSpeedKts != null ? Number(windSpeedKts) : undefined,
          wind_direction_deg: windDirectionDeg != null ? Number(windDirectionDeg) : undefined,
          current_speed_kts: currentSpeedKts != null ? Number(currentSpeedKts) : undefined,
          current_direction_deg: currentDirectionDeg != null ? Number(currentDirectionDeg) : undefined,
          windage_factor: windageFactor != null ? Number(windageFactor) : undefined,
          source: source || (DEMO_MODE ? "demo" : "copernicus_era5"),
        },
        { timeout: 15000 }
      );

      const mlData = response.data;

      // Transform response to match Node.js internal models
      const backwardPath = (mlData.backward_path || []).map((pt, idx) => ({
        seqIndex: pt.seq_index != null ? pt.seq_index : idx,
        latitude: Number(pt.latitude ?? pt.lat),
        longitude: Number(pt.longitude ?? pt.lng),
        lat: Number(pt.latitude ?? pt.lat),
        lng: Number(pt.longitude ?? pt.lng),
        timestamp: pt.timestamp,
        elapsedHours: pt.elapsed_hours != null ? Number(pt.elapsed_hours) : idx,
        uncertaintyRadiusKm: pt.uncertainty_radius_km != null ? Number(pt.uncertainty_radius_km) : 0.5,
        phase: "backward",
      }));

      const forwardPath = (mlData.forward_path || []).map((pt, idx) => ({
        seqIndex: pt.seq_index != null ? pt.seq_index : idx,
        latitude: Number(pt.latitude ?? pt.lat),
        longitude: Number(pt.longitude ?? pt.lng),
        lat: Number(pt.latitude ?? pt.lat),
        lng: Number(pt.longitude ?? pt.lng),
        timestamp: pt.timestamp,
        elapsedHours: pt.elapsed_hours != null ? Number(pt.elapsed_hours) : idx,
        uncertaintyRadiusKm: pt.uncertainty_radius_km != null ? Number(pt.uncertainty_radius_km) : 0.5,
        phase: "forward",
      }));

      return {
        status: mlData.status || "success",
        engine: mlData.engine || "BUILT-IN DEMONSTRATION LAGRANGIAN MODEL",
        latitude: Number(mlData.origin_lat),
        longitude: Number(mlData.origin_lng),
        originLat: Number(mlData.origin_lat),
        originLng: Number(mlData.origin_lng),
        originTimestamp: mlData.origin_timestamp,
        timeWindowHours: mlData.time_window_hours || hoursBack,
        uncertaintyRadiusKm: mlData.uncertainty_radius_km,
        backwardPath,
        forwardPath,
        geojson: mlData.geojson || null,
        simulationMeta: mlData.simulation_meta || {},
      };
    } catch (err) {
      const detailMsg = err.response?.data?.detail || err.message;
      logger.warn("[DriftService] Python ML drift service returned error or was unreachable", {
        error: detailMsg,
        demoMode: DEMO_MODE,
      });

      if (
        detailMsg.includes("METOCEAN_PROVIDER_CONFIGURATION_REQUIRED") ||
        detailMsg.includes("METOCEAN_TIMESTAMP_REQUIRED") ||
        detailMsg.includes("METOCEAN_DATA_UNAVAILABLE")
      ) {
        throw new Error(detailMsg);
      }

      if (DEMO_MODE) {
        logger.info("[DriftService] Using deterministic demonstration Lagrangian drift fallback");
        return computeDemoLagrangianDrift({
          latitude,
          longitude,
          detectionTimestamp,
          hoursBack,
          hoursForward,
        });
      }

      throw new Error(`Drift Simulation Pipeline Failure: ${detailMsg}`);
    }
  },

  /**
   * Get the stored drift run for a spill.
   */
  async getDriftForSpill(spillId) {
    const drift = await spillRepository.getDrift(spillId);
    if (!drift) {
      throw new AppError(404, "DRIFT_NOT_READY", "Drift simulation not yet available");
    }

    const backwardPoints = (drift.points || []).filter((p) => p.phase === "backward");
    const forwardPoints = (drift.points || []).filter((p) => p.phase === "forward");

    return {
      id: drift.id,
      spillId: drift.spillId,
      latitude: drift.latitude,
      longitude: drift.longitude,
      originLat: drift.latitude,
      originLng: drift.longitude,
      originTimestamp: drift.originTimestamp,
      timeWindowHours: drift.timeWindowHours,
      simulationMeta: drift.simulationMeta,
      backwardPath: backwardPoints,
      forwardPath: forwardPoints,
      points: drift.points,
    };
  },
};

module.exports = driftService;
