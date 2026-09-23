/**
 * AIS Correlation Service — Phase 16.4 Part 8
 *
 * Spatiotemporal correlation of historical AIS vessel tracks with the
 * MODEL-DERIVED estimated spill origin.
 *
 * CRITICAL SCIENTIFIC & LEGAL GUARDRAILS:
 * - Identified vessels are strictly: "POTENTIAL_CANDIDATE".
 * - Final attribution state is strictly: "NOT_ESTABLISHED".
 * - NEVER claims a vessel caused the spill or is a confirmed polluter.
 * - AIS source provenance is strictly: "REAL" or "DEMO" or "NOT_AVAILABLE".
 * - Historical AIS telemetry is strictly separated from live/current fleet snapshots.
 * - Dedicated statuses:
 *     - AIS_DATA_UNAVAILABLE: Provider unconfigured / missing credentials.
 *     - AIS_PROVIDER_UNAVAILABLE: Provider unreachable or offline.
 *     - AIS_PROVIDER_TIMEOUT: Provider request timed out.
 *     - AIS_NO_DATA_FOR_QUERY: Valid historical query executed but no observations found.
 *     - AIS_HISTORICAL_DATA_UNAVAILABLE: Real provider active, but historical access not supported/configured.
 *     - AIS_CURRENT_DATA_ONLY: Current data available, but cannot satisfy historical window.
 *     - INSUFFICIENT_TEMPORAL_DATA: Investigation lacks trustworthy temporal reference.
 * - Temporal reference priority:
 *     1. actual raster acquisition timestamp
 *     2. validated investigation timestamp
 *     3. model-derived origin timestamp when scientifically supported
 *     4. otherwise: INSUFFICIENT_TEMPORAL_DATA (NEVER new Date() fallback)
 * - Geographic query derived from actual origin / spill footprint +- searchRadiusKm.
 *   (NEVER hardcoded Mumbai/India/Portland/Oregon/demo coordinates).
 * - Every observation timestamp is verified to fall within [fromTimestamp, toTimestamp].
 * - Snapshot contamination guard: Current snapshot observations CANNOT satisfy historical queries.
 */

const aisProviderFactory = require("../clients/ais/ais.provider.factory");
const aisRepository = require("../repositories/ais.repository");
const { calculateProximityScore } = require("../scoring/proximity.score");
const { calculateTemporalScore } = require("../scoring/temporal.score");
const { calculateTrajectoryMatchScore } = require("../scoring/trajectory.score");
const { calculateAnomalyScore } = require("../scoring/anomaly.score");
const { synthesizeAttributionScore } = require("../scoring/final.score");
const { haversineDistance } = require("../scoring/haversine");
const { validateAndNormalizeIsoTimestamp } = require("../utils/satelliteTemporalMetadata");
const logger = require("../logger");

/**
 * Canonical AIS correlation status enum.
 */
const AIS_CORRELATION_STATUS = {
  NOT_AVAILABLE: "NOT_AVAILABLE",
  AIS_DATA_UNAVAILABLE: "AIS_DATA_UNAVAILABLE",
  AIS_PROVIDER_UNAVAILABLE: "AIS_PROVIDER_UNAVAILABLE",
  AIS_PROVIDER_TIMEOUT: "AIS_PROVIDER_TIMEOUT",
  AIS_NO_DATA_FOR_QUERY: "AIS_NO_DATA_FOR_QUERY",
  AIS_HISTORICAL_DATA_UNAVAILABLE: "AIS_HISTORICAL_DATA_UNAVAILABLE",
  HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED: "HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED",
  HISTORICAL_PROVIDER_API_CONTRACT_REQUIRED: "HISTORICAL_PROVIDER_API_CONTRACT_REQUIRED",
  AIS_CURRENT_DATA_ONLY: "AIS_CURRENT_DATA_ONLY",
  INSUFFICIENT_TEMPORAL_DATA: "INSUFFICIENT_TEMPORAL_DATA",
  TEMPORAL_REFERENCE_UNAVAILABLE: "TEMPORAL_REFERENCE_UNAVAILABLE",
  NO_CANDIDATES: "NO_CANDIDATES",
  CANDIDATES_FOUND: "CANDIDATES_FOUND",
  FAILED: "FAILED",
};

// In-memory correlation cache for deterministic idempotency
const aisCorrelationCache = new Map();

/**
 * Clear correlation cache (for tests).
 */
function clearAisCache() {
  aisCorrelationCache.clear();
}

/**
 * Build unavailable / failure correlation block.
 */
function buildUnavailableCorrelation(
  status,
  reason,
  {
    searchRadiusKm = 50,
    source = "NOT_AVAILABLE",
    isDemo = false,
    provider = null,
    queryBounds = null,
    queryWindow = null,
    originReference = null,
    temporalReference = null,
    diagnostics = null,
  } = {}
) {
  let correlationType = "REAL_HISTORICAL_AIS";
  if (isDemo) {
    correlationType = "DEMO_HISTORICAL_AIS";
  } else if (status === AIS_CORRELATION_STATUS.HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED) {
    correlationType = "HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED";
  } else if (status === AIS_CORRELATION_STATUS.HISTORICAL_PROVIDER_API_CONTRACT_REQUIRED) {
    correlationType = "HISTORICAL_PROVIDER_API_CONTRACT_REQUIRED";
  }

  return {
    status,
    type: correlationType,
    source,
    provider: provider || source,
    sourceType: "AIS_PROVIDER",
    isDemo,
    queryWindow: queryWindow || null,
    queryBounds: queryBounds || null,
    originReference: originReference || null,
    temporalReference: temporalReference || null,
    candidates: [],
    coverage: {
      searchRadiusKm,
      totalObservationsCount: 0,
      totalVesselsEvaluated: 0,
      aisGapNotes: reason,
      insufficientCoverage: true,
    },
    diagnostics: diagnostics || null,
    provenance: isDemo ? "DEMO" : "NOT_AVAILABLE",
    retrievedAt: new Date().toISOString(),
    unavailableReason: reason,
  };
}

/**
 * Correlate historical AIS movement with model-derived estimated spill origin.
 *
 * @param {Object} params
 * @param {Object|null} params.geospatial - Canonical geospatial block
 * @param {Object|null} params.origin - Canonical origin block
 * @param {Object|null} [params.drift] - Canonical drift block
 * @param {string|null} [params.acquisitionTimestamp] - Real raster acquisition timestamp
 * @param {number} [params.searchRadiusKm=50] - AIS spatial search radius (separate from uncertainty)
 * @param {number} [params.timeWindowHours=24] - Search window half-width in hours
 * @param {string} [params.jobId="unknown"] - Job ID
 * @param {boolean} [params.bypassCache=false] - Skip cache lookup
 * @returns {Promise<Object>} Canonical aisCorrelation block
 */
async function correlateCandidates({
  geospatial,
  origin,
  drift,
  temporalReference = null,
  sourceProduct = null,
  acquisitionTimestamp = null,
  searchRadiusKm = 50,
  timeWindowHours = 24,
  jobId = "unknown",
  bypassCache = false,
  providerOverride = null,
} = {}) {
  // ── Gate 1: Geospatial must be available ──────────────────────────────────
  if (!geospatial || geospatial.available !== true) {
    logger.info("[AisCorrelationService] AIS correlation skipped — geospatial not available", { jobId });
    return buildUnavailableCorrelation(
      AIS_CORRELATION_STATUS.NOT_AVAILABLE,
      "Source image has no valid geospatial reference (CRS + bounds not established)."
    );
  }

  // ── Gate 2: Valid estimated spill origin required ─────────────────────────
  if (!origin || origin.status !== "ESTIMATED" || !origin.estimatedPoint) {
    logger.info("[AisCorrelationService] AIS correlation skipped — valid estimated origin required", { jobId, originStatus: origin?.status });
    return buildUnavailableCorrelation(
      AIS_CORRELATION_STATUS.NOT_AVAILABLE,
      "Valid model-derived estimated spill origin is required for AIS correlation."
    );
  }

  const originLat = Number(origin.estimatedPoint.latitude);
  const originLng = Number(origin.estimatedPoint.longitude);

  if (isNaN(originLat) || isNaN(originLng)) {
    return buildUnavailableCorrelation(
      AIS_CORRELATION_STATUS.NOT_AVAILABLE,
      "Estimated spill origin contains invalid coordinates (latitude/longitude must be finite numbers)."
    );
  }

  // Model origin uncertainty radius (diffusion model, e.g. 2.5 km)
  const originUncertaintyKm = Number(
    origin.uncertainty?.radiusKm ??
    drift?.uncertainty?.radiusKm ??
    2.5
  );

  const effectiveSearchRadiusKm = Number(searchRadiusKm) || 50;

  // ── Compute Exact Query Bounds from Investigation Geometry ───────────────
  const latDelta = effectiveSearchRadiusKm / 111.0;
  const cosLat = Math.cos((originLat * Math.PI) / 180);
  const lngDelta = effectiveSearchRadiusKm / (111.0 * (Math.abs(cosLat) > 0.01 ? cosLat : 1.0));
  const minLat = Number((originLat - latDelta).toFixed(6));
  const maxLat = Number((originLat + latDelta).toFixed(6));
  const minLng = Number((originLng - lngDelta).toFixed(6));
  const maxLng = Number((originLng + lngDelta).toFixed(6));

  const queryBounds = { minLat, maxLat, minLng, maxLng };

  // ── Gate 3: Temporal Reference & Provenance ───────────────────────────────
  // Strict priority:
  //   1. Authoritative temporalReference (authentic raster metadata or verified analyst input)
  //   2. acquisitionTimestamp string argument (normalized)
  //   3. origin.originTimestamp fallback
  // NEVER uses ESTIMATION_TIME_PROXY, server time, or file modification time for historical AIS in production.
  let effectiveTemporalReference = null;
  let isProxy = false;

  if (temporalReference) {
    if (temporalReference.isAuthoritative === true && temporalReference.timestamp) {
      effectiveTemporalReference = temporalReference;
    } else {
      effectiveTemporalReference = null;
    }
  } else if (acquisitionTimestamp) {
    const parsedAcquisition = validateAndNormalizeIsoTimestamp(acquisitionTimestamp);
    if (parsedAcquisition) {
      effectiveTemporalReference = {
        status: "RASTER_METADATA",
        isAuthoritative: true,
        timestamp: parsedAcquisition,
        source: "RASTER_ACQUISITION_TIMESTAMP",
        sourceType: "RASTER_ACQUISITION_TIMESTAMP",
      };
    }
  } else if (origin?.originTimestamp) {
    const parsedOrigin = validateAndNormalizeIsoTimestamp(origin.originTimestamp);
    if (parsedOrigin) {
      isProxy = origin.timestampSource === "ESTIMATION_TIME_PROXY";
      effectiveTemporalReference = {
        status: origin.timestampSource || "RASTER_METADATA",
        isAuthoritative: !isProxy,
        timestamp: parsedOrigin,
        source: origin.timestampSource || "RASTER_ACQUISITION_TIMESTAMP",
        sourceType: origin.timestampSource || "RASTER_ACQUISITION_TIMESTAMP",
        temporalUncertainty: isProxy,
      };
    }
  }

  if (!effectiveTemporalReference || (!effectiveTemporalReference.isAuthoritative && !isProxy) || !effectiveTemporalReference.timestamp) {
    logger.info("[AisCorrelationService] AIS correlation skipped — no authoritative temporal reference available", { jobId });
    return buildUnavailableCorrelation(
      AIS_CORRELATION_STATUS.INSUFFICIENT_TEMPORAL_DATA,
      "No temporal reference available. A valid raster acquisition timestamp or origin timestamp is required for AIS correlation.",
      {
        searchRadiusKm: effectiveSearchRadiusKm,
        queryBounds,
        queryWindow: null,
        originReference: {
          latitude: originLat,
          longitude: originLng,
          uncertaintyRadiusKm: originUncertaintyKm,
          timestamp: null,
          provenance: "MODEL_DERIVED",
        },
        temporalReference: effectiveTemporalReference || {
          status: "NOT_AVAILABLE",
          isAuthoritative: false,
          timestamp: null,
        },
      }
    );
  }

  const originTimeMs = new Date(effectiveTemporalReference.timestamp).getTime();
  if (isNaN(originTimeMs)) {
    return buildUnavailableCorrelation(
      AIS_CORRELATION_STATUS.INSUFFICIENT_TEMPORAL_DATA,
      "Temporal reference timestamp could not be parsed into a valid Date.",
      {
        searchRadiusKm: effectiveSearchRadiusKm,
        queryBounds,
        queryWindow: null,
        temporalReference: effectiveTemporalReference,
      }
    );
  }

  const originTimeIso = new Date(originTimeMs).toISOString();
  const windowDurationHours = Number(timeWindowHours) || 24;
  const windowStartMs = originTimeMs - windowDurationHours * 3600 * 1000;
  const windowEndMs = originTimeMs + windowDurationHours * 3600 * 1000;
  const windowStartIso = new Date(windowStartMs).toISOString();
  const windowEndIso = new Date(windowEndMs).toISOString();

  const timestampSource = effectiveTemporalReference.source || effectiveTemporalReference.sourceType || "UNKNOWN";
  const temporalUncertainty = isProxy || effectiveTemporalReference.temporalUncertainty === true;

  let temporalNote = "Temporal query window centered on verified raster acquisition timestamp.";
  if (isProxy) {
    temporalNote = "Historical AIS query window was derived from model estimation time proxy. Vessel correlations are indicative and limited by timestamp uncertainty.";
  } else if (timestampSource === "ANALYST_SUPPLIED") {
    temporalNote = "Temporal query window centered on verified analyst-supplied acquisition timestamp.";
  }

  const originReference = {
    latitude: originLat,
    longitude: originLng,
    uncertaintyRadiusKm: originUncertaintyKm,
    timestamp: originTimeIso,
    provenance: "MODEL_DERIVED",
  };

  const queryWindow = {
    start: windowStartIso,
    end: windowEndIso,
    fromTimestamp: windowStartIso,
    toTimestamp: windowEndIso,
    windowStart: windowStartIso,
    windowEnd: windowEndIso,
    durationHours: windowDurationHours * 2,
    timestampSource,
    temporalUncertainty,
    provenance: isProxy ? "ESTIMATION_TIME_PROXY" : "DERIVED_FROM_INVESTIGATION_TIME",
    temporalNote,
  };

  // ── Gate 4: AIS Provider Resolution & Configuration ───────────────────────
  let provider;
  try {
    provider = providerOverride || aisProviderFactory.getHistoricalAisProvider();
  } catch (factoryErr) {
    logger.error("[AisCorrelationService] AIS historical provider factory error", { jobId, error: factoryErr.message });
    return buildUnavailableCorrelation(
      AIS_CORRELATION_STATUS.AIS_DATA_UNAVAILABLE,
      factoryErr.message,
      { searchRadiusKm: effectiveSearchRadiusKm, queryBounds, queryWindow, originReference, temporalReference: effectiveTemporalReference }
    );
  }

  if (!provider.isConfigured()) {
    logger.warn("[AisCorrelationService] Historical AIS provider is not configured", {
      jobId,
      provider: provider.name,
    });
    const isHistorical =
      provider.name.includes("GLOBAL") ||
      provider.name.includes("HISTORICAL") ||
      provider.name.includes("EXACTAIS") ||
      provider.name.includes("GWS") ||
      provider.providerProduct === "exactAIS:HVP" ||
      provider.constructor?.name === "GlobalHistoricalAisClient";
    const failStatus = isHistorical
      ? AIS_CORRELATION_STATUS.HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED
      : AIS_CORRELATION_STATUS.AIS_DATA_UNAVAILABLE;
    return buildUnavailableCorrelation(
      failStatus,
      `Historical AIS provider "${provider.name}" is not configured. Set AIS_HISTORICAL_PROVIDER, AIS_HISTORICAL_API_URL, and AIS_HISTORICAL_API_KEY/BEARER_TOKEN in environment to enable global historical vessel retrieval.`,
      {
        searchRadiusKm: effectiveSearchRadiusKm,
        source: "NOT_AVAILABLE",
        isDemo: false,
        provider: provider.name,
        queryBounds,
        queryWindow,
        originReference,
        temporalReference: effectiveTemporalReference,
        diagnostics: {
          reason: "HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED",
          providerConfigured: false,
        },
      }
    );
  }

  const aisSource = provider.name;
  const isDemoAis = provider.isDemo;

  // ── Caching check ─────────────────────────────────────────────────────────
  const cacheKey = [
    jobId || "no-job",
    originLat.toFixed(6),
    originLng.toFixed(6),
    originTimeIso,
    timestampSource,
    originUncertaintyKm.toFixed(2),
    effectiveSearchRadiusKm,
    windowDurationHours,
    isDemoAis ? "DEMO" : "REAL",
    aisSource,
    "ais-part8-v2",
  ].join("::");

  if (!bypassCache && aisCorrelationCache.has(cacheKey)) {
    logger.info("[AisCorrelationService] Returning cached AIS correlation result", { jobId, cacheKey });
    return aisCorrelationCache.get(cacheKey);
  }

  logger.info("[AisCorrelationService] Executing historical AIS provider query", {
    jobId,
    provider: aisSource,
    minLat,
    maxLat,
    minLng,
    maxLng,
    fromTimestamp: windowStartIso,
    toTimestamp: windowEndIso,
    originUncertaintyKm,
    searchRadiusKm: effectiveSearchRadiusKm,
    timestampSource,
    isDemoAis,
  });

  const retrievedAt = new Date().toISOString();

  try {
    let rawCandidates = [];
    let allObservationsCount = 0;
    let envelopeDiagnostics = null;
    let rawEnvelope = null;

    if (isDemoAis && typeof provider.getDemoCandidatesInWindow === "function") {
      rawCandidates = await provider.getDemoCandidatesInWindow(
        new Date(windowStartMs),
        new Date(windowEndMs),
        { latitude: originLat, longitude: originLng },
        effectiveSearchRadiusKm
      );
      allObservationsCount = rawCandidates.reduce((acc, c) => acc + (c.trackPoints?.length || 0), 0);
    } else {
      let envelope;
      if (typeof provider.searchHistoricalVessels === "function") {
        envelope = await provider.searchHistoricalVessels({
          minLat,
          maxLat,
          minLng,
          maxLng,
          fromTimestamp: windowStartIso,
          toTimestamp: windowEndIso,
        });
      } else {
        const records = await provider.queryHistoricalAis({
          minLat,
          maxLat,
          minLng,
          maxLng,
          fromTimestamp: windowStartIso,
          toTimestamp: windowEndIso,
        });
        envelope = {
          type: "REAL_HISTORICAL_AIS",
          observations: records || [],
          vessels: records || [],
          diagnostics: null,
        };
      }

      rawEnvelope = envelope;
      envelopeDiagnostics = envelope.diagnostics || null;

      if (
        envelope.status === AIS_CORRELATION_STATUS.AIS_CURRENT_DATA_ONLY ||
        envelope.type === "AIS_CURRENT_DATA_ONLY" ||
        (envelope.totalObservationsEvaluated > 0 && (!envelope.vessels || envelope.vessels.length === 0) && envelope.outOfWindowObservationsCount > 0)
      ) {
        logger.warn(
          "[AisCorrelationService] Provider returned only out-of-window observations for historical query. Returning AIS_CURRENT_DATA_ONLY.",
          { envelope }
        );
        return {
          status: AIS_CORRELATION_STATUS.AIS_CURRENT_DATA_ONLY,
          type: "AIS_CURRENT_DATA_ONLY",
          source: aisSource,
          provider: aisSource,
          sourceType: "AIS_PROVIDER",
          isDemo: isDemoAis,
          queryWindow,
          queryBounds,
          originReference,
          temporalReference: effectiveTemporalReference,
          sourceProduct: sourceProduct || null,
          candidates: [],
          tracks: [],
          coverage: {
            searchRadiusKm: effectiveSearchRadiusKm,
            totalObservationsCount: envelope.totalObservationsEvaluated || 0,
            totalVesselsEvaluated: 0,
            aisGapNotes: "Only current or recent AIS telemetry is available from provider. It cannot satisfy the historical investigation window.",
            insufficientCoverage: true,
          },
          diagnostics: envelopeDiagnostics,
          provenance: "REAL",
          retrievedAt: envelope.retrievedAt || new Date().toISOString(),
        };
      }

      rawCandidates = envelope.vessels || [];
      allObservationsCount = envelope.observations?.length ?? envelope.diagnostics?.validObservationCount ?? envelope.totalObservationsEvaluated ?? 0;
    }

    const isVesselPresence = rawEnvelope?.observationLevel === "VESSEL_PRESENCE" || provider.observationLevel === "VESSEL_PRESENCE";

    if (!rawCandidates || rawCandidates.length === 0) {
      logger.info("[AisCorrelationService] Zero AIS vessels found in spatiotemporal search window", {
        jobId,
        originLat,
        originLng,
        effectiveSearchRadiusKm,
        isVesselPresence,
      });

      const noDataStatus = isDemoAis
        ? AIS_CORRELATION_STATUS.NO_CANDIDATES
        : AIS_CORRELATION_STATUS.AIS_NO_DATA_FOR_QUERY;

      const result = {
        status: noDataStatus,
        type: isDemoAis ? "DEMO_HISTORICAL_AIS" : (isVesselPresence ? "GFW_VESSEL_PRESENCE" : "REAL_HISTORICAL_AIS"),
        source: aisSource,
        provider: aisSource,
        sourceType: "AIS_PROVIDER",
        providerProduct: rawEnvelope?.providerProduct || (isVesselPresence ? "public-global-presence:latest" : "exactAIS:HVP"),
        providerProtocol: rawEnvelope?.providerProtocol || (isVesselPresence ? "REST_4WINGS" : "WFS_1_1_0"),
        observationLevel: isVesselPresence ? "VESSEL_PRESENCE" : "RAW_POSITION",
        rawTracksAvailable: !isVesselPresence,
        cpaAvailable: !isVesselPresence,
        isDemo: isDemoAis,
        queryWindow,
        queryWindows: rawEnvelope?.queryWindows || [queryWindow],
        queryBounds,
        originReference,
        temporalReference: effectiveTemporalReference,
        sourceProduct: sourceProduct || null,
        candidates: [],
        tracks: [],
        coverage: {
          searchRadiusKm: effectiveSearchRadiusKm,
          totalObservationsCount: allObservationsCount,
          totalVesselsEvaluated: 0,
          aisGapNotes: isVesselPresence
            ? "No vessel presence recorded within the search radius and temporal window in Global Fishing Watch."
            : "No AIS transponder signals recorded within the search radius and temporal window.",
          insufficientCoverage: false,
        },
        diagnostics: envelopeDiagnostics,
        provenance: isDemoAis ? "DEMO" : "REAL",
        retrievedAt,
      };

      aisCorrelationCache.set(cacheKey, result);
      return result;
    }

    // ── Evaluate candidates ─────────────────────────────────────────────────
    const evaluatedCandidates = [];

    if (isVesselPresence) {
      // ── Capability-Aware Presence Scoring for GFW ──
      // GFW provides aggregated hourly presence per grid cell.
      // CPA, raw track polylines, heading, and speed are NOT available.
      for (const vessel of rawCandidates) {
        const mmsi = String(vessel.mmsi || "");
        const cells = vessel.presenceCells || [];
        if (cells.length === 0 && vessel.gridCell) {
          cells.push(vessel.gridCell);
        }

        // Find closest presence cell to estimated spill origin
        let minCellDist = Infinity;
        let closestCell = null;

        for (const c of cells) {
          const lat = Number(c.latitude ?? c.lat);
          const lon = Number(c.longitude ?? c.lon);
          const d = haversineDistance(originLat, originLng, lat, lon);
          if (!isNaN(d) && d < minCellDist) {
            minCellDist = d;
            closestCell = { ...c, latitude: lat, longitude: lon };
          }
        }

        if (!closestCell || !isFinite(minCellDist)) continue;

        // Spatial presence score: 1 - (minCellDist / effectiveSearchRadiusKm)
        const spatialPresenceScore = Math.max(0, Math.min(1, 1 - (minCellDist / effectiveSearchRadiusKm)));

        // Temporal presence score: proximity of presence cell timestamp to T0
        let temporalPresenceScore = 0.5;
        if (closestCell.timestamp) {
          const cellTimeMs = new Date(closestCell.timestamp).getTime();
          if (!isNaN(cellTimeMs)) {
            const diffHours = Math.abs(cellTimeMs - originTimeMs) / (3600 * 1000);
            temporalPresenceScore = Math.max(0, Math.min(1, 1 - (diffHours / (windowDurationHours * 2))));
          }
        }

        const totalPresenceScore = Number((0.55 * spatialPresenceScore + 0.45 * temporalPresenceScore).toFixed(4));
        const enteredOriginCorridor = minCellDist <= originUncertaintyKm;

        evaluatedCandidates.push({
          vesselId: {
            mmsi,
            imo: vessel.imo ? String(vessel.imo) : null,
            name: vessel.name || vessel.vesselName || null,
            callsign: vessel.callsign || null,
            flag: vessel.flag || null,
            vesselType: vessel.vesselType || null,
            lengthM: null,
          },
          status: "POTENTIAL_CANDIDATE",
          observationLevel: "VESSEL_PRESENCE",
          rank: 1,
          correlation: {
            observationLevel: "VESSEL_PRESENCE",
            closestApproachKm: null, // Strictly NOT_AVAILABLE
            closestApproachTimestamp: null,
            closestCellDistanceKm: Number(minCellDist.toFixed(2)),
            closestCellCoordinates: {
              latitude: closestCell.latitude,
              longitude: closestCell.longitude,
            },
            closestCellTimestamp: closestCell.timestamp || null,
            enteredOriginUncertaintyCorridor: enteredOriginCorridor,
            temporalOverlap: temporalPresenceScore > 0.10,
            trajectoryConsistency: "NOT_AVAILABLE_FROM_PRESENCE_DATA",
            cpaAvailable: false,
            rawTracksAvailable: false,
            headingAvailable: false,
            speedAvailable: false,
            anomalyAvailable: false,
            score: totalPresenceScore,
            metrics: {
              spatialPresenceScore: Number(spatialPresenceScore.toFixed(4)),
              temporalPresenceScore: Number(temporalPresenceScore.toFixed(4)),
              proximityScore: null,
              temporalScore: Number(temporalPresenceScore.toFixed(4)),
              trajectoryScore: null,
              anomalyScore: null,
            },
          },
          aisEvidence: {
            observationLevel: "VESSEL_PRESENCE",
            presenceHours: vessel.presenceHours || cells.reduce((acc, c) => acc + (c.hours || 1), 0),
            presenceCellCount: cells.length,
            presenceCells: cells,
            positionCount: 0,
            rawTracksAvailable: false,
            cpaAvailable: false,
            firstSeen: cells[0]?.timestamp || null,
            lastSeen: cells[cells.length - 1]?.timestamp || null,
            source: aisSource,
            provenance: "REAL",
            track: [], // Zero fabricated points
          },
          modelEvidence: {
            originProvenance: "MODEL_DERIVED",
            originTimestampSource: timestampSource,
            originUncertaintyKm,
            driftProvenance: "MODEL_DERIVED",
          },
          attribution: {
            status: "NOT_ESTABLISHED",
            label: "ATTRIBUTION: NOT ESTABLISHED",
            scientificNotice: "Spatiotemporal correlation does NOT establish legal or factual responsibility for an oil release.",
            limitations: "Derived from GFW aggregated hourly vessel presence. Individual vessel tracks, CPA, and heading are not available.",
          },
        });
      }
    } else {
      // ── Raw Track Scoring for Kpler exactAIS:HVP / Demo ──
      for (const raw of rawCandidates) {
        const vessel = raw.vessel || raw || {};
        const mmsi = String(vessel.mmsi || raw.mmsi || "");
        const points =
          raw.trackPoints ||
          raw.points ||
          (await aisRepository.findTrack(mmsi, new Date(windowStartMs), new Date(windowEndMs)));

        if (!points || points.length === 0) continue;

        const spillOriginPoint = { latitude: originLat, longitude: originLng };

        // Calculate component metrics
        const proxResult = calculateProximityScore(points, spillOriginPoint);
        const tempResult = calculateTemporalScore(proxResult.closestTimestamp, originTimeIso);
        const trajResult = calculateTrajectoryMatchScore(points, {
          latitude: originLat,
          longitude: originLng,
          originTimestamp: originTimeIso,
        });
        const anomResult = calculateAnomalyScore(points);

        const totalScore = synthesizeAttributionScore({
          proximity: proxResult.score,
          temporal: tempResult.score,
          trajectory: trajResult.score,
          anomaly: anomResult.score,
        });

        const closestApproachKm = Number(proxResult.minDistanceKm.toFixed(4));
        const enteredOriginUncertaintyCorridor = closestApproachKm <= originUncertaintyKm;

        let trajectoryConsistency = "INCONCLUSIVE";
        if (trajResult.score >= 0.65 || (enteredOriginUncertaintyCorridor && trajResult.score >= 0.50)) {
          trajectoryConsistency = "SUPPORTED";
        } else if (trajResult.score < 0.35 && !enteredOriginUncertaintyCorridor) {
          trajectoryConsistency = "UNSUPPORTED";
        }

        const vesselId = {
          mmsi,
          imo: vessel.imo ? String(vessel.imo) : null,
          name: vessel.name || vessel.vesselName || null,
          callsign: vessel.callsign || null,
          flag: vessel.flag || null,
          vesselType: vessel.vesselType || null,
          lengthM: vessel.lengthM != null ? Number(vessel.lengthM) : null,
        };

        evaluatedCandidates.push({
          vesselId,
          status: "POTENTIAL_CANDIDATE",
          observationLevel: "RAW_POSITION",
          rank: 1,
          correlation: {
            closestApproachKm,
            closestApproachTimestamp: proxResult.closestTimestamp,
            enteredOriginUncertaintyCorridor,
            temporalOverlap: Boolean(tempResult.score > 0.10),
            trajectoryConsistency,
            score: totalScore,
            metrics: {
              proximityScore: proxResult.score,
              temporalScore: tempResult.score,
              trajectoryScore: trajResult.score,
              anomalyScore: anomResult.score,
            },
          },
          aisEvidence: {
            positionCount: points.length,
            firstSeen: points[0]?.timestamp ? new Date(points[0].timestamp).toISOString() : null,
            lastSeen: points[points.length - 1]?.timestamp ? new Date(points[points.length - 1].timestamp).toISOString() : null,
            source: aisSource,
            provenance: isDemoAis ? "DEMO" : "REAL",
            track: points.map((pt) => ({
              latitude: Number(pt.latitude ?? pt.lat),
              longitude: Number(pt.longitude ?? pt.lng),
              timestamp: pt.timestamp ? new Date(pt.timestamp).toISOString() : null,
              speedKnots: pt.speedKnots != null ? Number(pt.speedKnots) : (pt.SOG != null ? Number(pt.SOG) : null),
              headingDeg: pt.headingDeg != null ? Number(pt.headingDeg) : (pt.heading != null ? Number(pt.heading) : null),
            })),
          },
          modelEvidence: {
            originProvenance: "MODEL_DERIVED",
            originTimestampSource: timestampSource,
            originUncertaintyKm,
            driftProvenance: "MODEL_DERIVED",
          },
          attribution: {
            status: "NOT_ESTABLISHED",
          },
        });
      }
    }

    evaluatedCandidates.sort((a, b) => b.correlation.score - a.correlation.score);
    const rankedCandidates = evaluatedCandidates.map((c, idx) => ({
      ...c,
      rank: idx + 1,
    }));

    const allTracks = isVesselPresence ? [] : (rawCandidates || []).map((v) => ({
      mmsi: String(v.mmsi || ""),
      name: v.vesselName || v.name || null,
      vesselName: v.vesselName || v.name || null,
      vesselType: v.vesselType || null,
      flag: v.flag || null,
      trackPoints: Array.isArray(v.trackPoints) ? v.trackPoints : (Array.isArray(v.points) ? v.points : []),
    }));

    const result = {
      status: rankedCandidates.length > 0 ? AIS_CORRELATION_STATUS.CANDIDATES_FOUND : AIS_CORRELATION_STATUS.NO_CANDIDATES,
      type: isDemoAis ? "DEMO_HISTORICAL_AIS" : (isVesselPresence ? "GFW_VESSEL_PRESENCE" : "REAL_HISTORICAL_AIS"),
      source: aisSource,
      provider: aisSource,
      sourceType: "AIS_PROVIDER",
      providerProduct: rawEnvelope?.providerProduct || (isVesselPresence ? "public-global-presence:latest" : "exactAIS:HVP"),
      providerProtocol: rawEnvelope?.providerProtocol || (isVesselPresence ? "REST_4WINGS" : "WFS_1_1_0"),
      observationLevel: isVesselPresence ? "VESSEL_PRESENCE" : "RAW_POSITION",
      rawTracksAvailable: !isVesselPresence,
      cpaAvailable: !isVesselPresence,
      isDemo: isDemoAis,
      queryWindow,
      queryWindows: rawEnvelope?.queryWindows || [queryWindow],
      queryBounds,
      originReference,
      temporalReference: effectiveTemporalReference,
      sourceProduct: sourceProduct || null,
      tracks: allTracks,
      allObservationsCount,
      uniqueVesselCount: rawCandidates.length,
      candidates: rankedCandidates,
      coverage: {
        searchRadiusKm: effectiveSearchRadiusKm,
        totalObservationsCount: allObservationsCount,
        totalVesselsEvaluated: evaluatedCandidates.length,
        aisGapNotes: isVesselPresence
          ? "Historical AIS data represents aggregated hourly vessel presence from Global Fishing Watch. Individual transponder positions, tracks, and CPA are not provided by this dataset."
          : "AIS coverage reflects available transponder transmissions within the spatiotemporal search window.",
        insufficientCoverage: false,
      },
      diagnostics: {
        ...(envelopeDiagnostics || {}),
        providerProduct: rawEnvelope?.providerProduct || (isVesselPresence ? "public-global-presence:latest" : "exactAIS:HVP"),
        providerProtocol: rawEnvelope?.providerProtocol || (isVesselPresence ? "REST_4WINGS" : "WFS_1_1_0"),
        observationLevel: isVesselPresence ? "VESSEL_PRESENCE" : "RAW_POSITION",
        rawTracksAvailable: !isVesselPresence,
        cpaAvailable: !isVesselPresence,
        queryWindows: rawEnvelope?.queryWindows || [queryWindow],
        duplicateObservationCount: rawEnvelope?.diagnostics?.duplicateObservationCount || 0,
        isTruncated: Boolean(rawEnvelope?.isTruncated),
        truncationReason: rawEnvelope?.truncationReason || null,
      },
      isTruncated: Boolean(rawEnvelope?.isTruncated),
      truncationReason: rawEnvelope?.truncationReason || null,
      provenance: isDemoAis ? "DEMO" : "REAL",
      retrievedAt,
    };

    aisCorrelationCache.set(cacheKey, result);
    logger.info(`[AisCorrelationService] AIS correlation complete: ${rankedCandidates.length} potential candidates identified`, {
      jobId,
      candidatesCount: rankedCandidates.length,
    });

    return result;
  } catch (err) {
    logger.error("[AisCorrelationService] AIS correlation pipeline failed with exception", {
      jobId,
      error: err.message,
      code: err.code,
    });

    // Map provider-specific error codes to canonical statuses
    let failStatus = AIS_CORRELATION_STATUS.FAILED;
    if (err.code === "HISTORICAL_PROVIDER_API_CONTRACT_REQUIRED") {
      failStatus = AIS_CORRELATION_STATUS.HISTORICAL_PROVIDER_API_CONTRACT_REQUIRED;
    } else if (err.code === "HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED") {
      failStatus = AIS_CORRELATION_STATUS.HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED;
    } else if (err.code === "AIS_HISTORICAL_DATA_UNAVAILABLE") {
      failStatus = AIS_CORRELATION_STATUS.AIS_HISTORICAL_DATA_UNAVAILABLE;
    } else if (err.code === "AIS_CURRENT_DATA_ONLY") {
      failStatus = AIS_CORRELATION_STATUS.AIS_CURRENT_DATA_ONLY;
    } else if (err.code === "AIS_PROVIDER_TIMEOUT") {
      failStatus = AIS_CORRELATION_STATUS.AIS_PROVIDER_TIMEOUT;
    } else if (err.code === "AIS_PROVIDER_UNAVAILABLE") {
      failStatus = AIS_CORRELATION_STATUS.AIS_PROVIDER_UNAVAILABLE;
    } else if (err.code === "AIS_PROVIDER_AUTH_FAILED") {
      failStatus = AIS_CORRELATION_STATUS.AIS_DATA_UNAVAILABLE;
    }

    return buildUnavailableCorrelation(
      failStatus,
      `AIS correlation query failure: ${err.message}`,
      {
        searchRadiusKm: effectiveSearchRadiusKm,
        source: aisSource,
        isDemo: isDemoAis,
        provider: aisSource,
        queryBounds,
        queryWindow,
        originReference,
        temporalReference: effectiveTemporalReference,
      }
    );
  }
}

module.exports = {
  correlateCandidates,
  AIS_CORRELATION_STATUS,
  buildUnavailableCorrelation,
  clearAisCache,
};
