const spillRepository = require("../repositories/spill.repository");
const aisRepository = require("../repositories/ais.repository");
const aisService = require("./ais.service");
const { calculateProximityScore } = require("../scoring/proximity.score");
const { calculateTemporalScore } = require("../scoring/temporal.score");
const { calculateTrajectoryMatchScore } = require("../scoring/trajectory.score");
const { calculateAnomalyScore } = require("../scoring/anomaly.score");
const { synthesizeAttributionScore, ATTRIBUTION_WEIGHTS } = require("../scoring/final.score");
const logger = require("../logger");

const SCIENTIFIC_DISCLAIMER =
  "Attribution scores represent modelled spatial, temporal, and trajectory correlations from available AIS and SAR-derived information. They do not establish legal responsibility, causation, or proof of pollution by any vessel. AIS records used in this demonstration are synthetic/demo records and do not represent actual historical vessel movements.";

/**
 * AttributionService — Orchestrates AIS correlation and vessel attribution scoring.
 */
const attributionService = {
  SCIENTIFIC_DISCLAIMER,

  /**
   * Analyze a spill for vessel candidate attribution.
   *
   * @param {string} spillId - The ID of the spill record
   * @param {Object} [options]
   * @param {number} [options.radiusKm=50] - Custom search radius in km
   * @param {number} [options.timeWindowHours=24] - Custom temporal window in hours
   * @returns {Promise<Object>} Attribution analysis results and evidence dossier
   */
  async analyzeSpill(spillId, options = {}) {
    logger.info("[AttributionService] Starting spill attribution analysis", { spillId, options });

    // 1. Load Spill
    const spill = await spillRepository.findById(spillId);
    if (!spill) {
      throw new Error(`Spill not found for ID: ${spillId}`);
    }

    // 2. Load DriftRun
    const driftRun = spill.driftRun || (await spillRepository.getDrift(spillId));

    // 3. Obtain modelled origin
    let originLat = null;
    let originLng = null;
    let originTimestamp = null;
    let timeWindowHours = options.timeWindowHours || 24;

    if (driftRun && driftRun.latitude != null && driftRun.longitude != null) {
      originLat = Number(driftRun.latitude);
      originLng = Number(driftRun.longitude);
      originTimestamp = driftRun.originTimestamp;
      timeWindowHours = driftRun.timeWindowHours || timeWindowHours;
    } else if (spill.latitude != null && spill.longitude != null) {
      // Fallback to spill detection centroid if drift run has no separate origin
      originLat = Number(spill.latitude);
      originLng = Number(spill.longitude);
      originTimestamp = spill.detectedAt;
    }

    if (originLat == null || originLng == null) {
      logger.error("[AttributionService] Missing modelled spill origin coordinates", { spillId });
      return {
        status: "unavailable",
        error: "Missing modelled spill origin coordinates. Cannot perform spatial correlation without valid origin.",
        spillId,
        candidates: [],
        disclaimer: SCIENTIFIC_DISCLAIMER,
      };
    }

    const searchRadiusKm = Number(options.radiusKm) || aisService.DEFAULT_AIS_SEARCH_RADIUS_KM;
    const spillOrigin = {
      latitude: originLat,
      longitude: originLng,
      originTimestamp,
    };

    logger.info("[AttributionService] Modelled origin determined", {
      originLat,
      originLng,
      originTimestamp,
      searchRadiusKm,
      timeWindowHours,
    });

    // 4. Query AIS candidates
    const searchResult = await aisService.findCandidatesNearSpill(
      spillOrigin,
      searchRadiusKm,
      timeWindowHours
    );

    const rawCandidates = searchResult.candidates || [];

    if (rawCandidates.length === 0) {
      logger.info("[AttributionService] Zero candidate vessels found within search radius", {
        spillId,
        searchRadiusKm,
      });
      return {
        status: "completed",
        spillId,
        origin: spillOrigin,
        searchRadiusKm,
        timeWindowHours,
        totalCandidatesFound: 0,
        candidates: [],
        explanation: `No candidate vessels identified within ${searchRadiusKm} km search radius of modelled origin during the specified time window.`,
        disclaimer: SCIENTIFIC_DISCLAIMER,
        source: "demo",
      };
    }

    // 5. Score each candidate across the 4 correlation components
    const scoredCandidates = [];

    for (const raw of rawCandidates) {
      const { vessel, mmsi } = raw;
      // Fetch complete track in time window for full trajectory analysis
      const trackPoints = await aisRepository.findTrack(mmsi);

      // Component 1: Proximity Score
      const proxResult = calculateProximityScore(trackPoints, spillOrigin);

      // Component 2: Temporal Score
      const tempResult = calculateTemporalScore(
        proxResult.closestTimestamp,
        originTimestamp
      );

      // Component 3: Trajectory Score
      const trajResult = calculateTrajectoryMatchScore(trackPoints, spillOrigin);

      // Component 4: Anomaly Score
      const anomResult = calculateAnomalyScore(trackPoints);

      // Final Synthesized Attribution Score
      const totalScore = synthesizeAttributionScore({
        proximity:  proxResult.score,
        temporal:   tempResult.score,
        trajectory: trajResult.score,
        anomaly:    anomResult.score,
      });

      scoredCandidates.push({
        vesselId: vessel.id,
        vessel: {
          id: vessel.id,
          mmsi: vessel.mmsi,
          imo: vessel.imo,
          name: vessel.name,
          flag: vessel.flag,
          vesselType: vessel.vesselType,
          lengthM: vessel.lengthM,
          source: "demo",
        },
        proximityScore: proxResult.score,
        temporalScore: tempResult.score,
        trajectoryScore: trajResult.score,
        anomalyScore: anomResult.score,
        totalScore,
        evidence: {
          distanceKm: proxResult.minDistanceKm,
          closestTimestamp: proxResult.closestTimestamp,
          closestPoint: proxResult.closestPoint,
          passingLat: proxResult.closestPoint?.latitude ?? null,
          passingLng: proxResult.closestPoint?.longitude ?? null,
          speedAtPassingKts: proxResult.closestPoint?.speedKnots ?? null,
          headingAtPassingDeg: proxResult.closestPoint?.headingDeg ?? null,
          timeDiffHours: tempResult.timeDiffHours,
          vesselPassingTime: tempResult.vesselPassingTime,
          estimatedSpillTime: tempResult.estimatedSpillTime,
          cpaDistanceKm: trajResult.cpaDistanceKm,
          headingConsistency: trajResult.headingConsistency,
          speedConsistency: trajResult.speedConsistency,
          timeToOriginHours: trajResult.timeToOriginHours,
          aisGapMinutes: anomResult.aisGapMinutes,
          speedDropDetected: anomResult.speedDropDetected,
          courseChangeDetected: anomResult.courseChangeDetected,
          maxSpeedDropKts: anomResult.maxSpeedDropKts,
          maxCourseChangeDeg: anomResult.maxCourseChangeDeg,
          weights: ATTRIBUTION_WEIGHTS,
          searchRadiusKm,
          source: "demo",
          disclaimer: SCIENTIFIC_DISCLAIMER,
        },
      });
    }

    // 6. Rank candidates descending by totalScore
    scoredCandidates.sort((a, b) => b.totalScore - a.totalScore);
    const rankedCandidates = scoredCandidates.map((c, idx) => ({
      ...c,
      rank: idx + 1,
    }));

    // 7. Persist AttributionResult to Database
    await spillRepository.saveAttributionResults(spillId, rankedCandidates);
    logger.info("[AttributionService] Attribution results successfully persisted to database", {
      spillId,
      candidatesCount: rankedCandidates.length,
      topCandidate: rankedCandidates[0]?.vessel?.name,
      topScore: rankedCandidates[0]?.totalScore,
    });

    return {
      status: "completed",
      spillId,
      origin: spillOrigin,
      searchRadiusKm,
      timeWindowHours,
      totalCandidatesFound: rankedCandidates.length,
      candidates: rankedCandidates,
      disclaimer: SCIENTIFIC_DISCLAIMER,
      source: "demo",
    };
  },
};

module.exports = attributionService;
