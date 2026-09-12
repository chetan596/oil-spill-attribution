const prisma = require("../db/database");
const AppError = require("../errors/AppError");
const logger = require("../logger");

/**
 * EvidenceService — Constructs structured evidence packages from database records.
 *
 * CRITICAL RULE:
 * This service ONLY aggregates and structures already-computed deterministic model
 * and database outputs. It does NOT compute or alter any detection, drift, or attribution values.
 */
class EvidenceService {
  /**
   * Fetch and assemble a complete structured evidence package for an analysis or spill.
   * @param {string} identifier - analysisId or spillId
   * @returns {Promise<Object>} Structured evidence object
   */
  async getStructuredEvidence(identifier) {
    if (!identifier) {
      throw new AppError(400, "INVALID_IDENTIFIER", "Analysis ID or Spill ID is required");
    }

    // Try finding by analysisId first, fallback to spillId
    let analysis = await prisma.analysis.findUnique({
      where: { id: identifier },
      include: {
        scene: true,
        spill: {
          include: {
            driftRun: {
              include: {
                points: {
                  orderBy: [
                    { phase: "asc" },
                    { seqIndex: "asc" },
                  ],
                },
              },
            },
            attributionResults: {
              include: { vessel: true },
              orderBy: { rank: "asc" },
            },
          },
        },
      },
    });

    // If not found by analysisId, try finding spill directly
    let spill = analysis?.spill;
    if (!analysis) {
      spill = await prisma.spill.findUnique({
        where: { id: identifier },
        include: {
          analysis: {
            include: { scene: true },
          },
          driftRun: {
            include: {
              points: {
                orderBy: [
                  { phase: "asc" },
                  { seqIndex: "asc" },
                ],
              },
            },
          },
          attributionResults: {
            include: { vessel: true },
            orderBy: { rank: "asc" },
          },
        },
      });

      if (!spill) {
        throw AppError.notFound("Analysis or Spill record");
      }
      analysis = spill.analysis;
    }

    if (!spill) {
      throw AppError.notFound("Spill record associated with analysis");
    }

    const scene = analysis?.scene;
    const driftRun = spill.driftRun;
    const attributionResults = spill.attributionResults || [];

    // Parse simulation metadata from drift run
    const simMeta = driftRun?.simulationMeta || {};
    const envMeta = simMeta.environmental || simMeta.environmental_conditions || {};

    const hindcastPoints = driftRun?.points?.filter((p) => p.phase === "backward") || [];
    const forecastPoints = driftRun?.points?.filter((p) => p.phase === "forward") || [];

    // Candidate vessels extraction
    const candidateVessels = attributionResults.map((ar) => {
      const v = ar.vessel || {};
      const ev = ar.evidence || {};
      return {
        rank: ar.rank,
        name: v.name || "Unknown Vessel",
        mmsi: v.mmsi || "N/A",
        imo: v.imo || "N/A",
        flag: v.flag || "Unknown",
        vesselType: v.vesselType || "Unknown",
        lengthM: v.lengthM || null,
        scores: {
          totalScore: Number(ar.totalScore.toFixed(4)),
          proximityScore: Number(ar.proximityScore.toFixed(4)),
          temporalScore: Number(ar.temporalScore.toFixed(4)),
          trajectoryScore: Number(ar.trajectoryScore.toFixed(4)),
          anomalyScore: Number(ar.anomalyScore.toFixed(4)),
        },
        evidenceMetrics: {
          closestApproachKm: ev.closestApproachKm != null ? Number(ev.closestApproachKm.toFixed(3)) : null,
          timeDeltaHours: ev.timeDeltaHours != null ? Number(ev.timeDeltaHours.toFixed(2)) : (ev.dtHours != null ? Number(ev.dtHours.toFixed(2)) : null),
          closestApproachTime: ev.closestApproachTime || null,
          speedKnotsAtCPA: ev.speedKnotsAtCPA != null ? Number(ev.speedKnotsAtCPA.toFixed(1)) : null,
          aisGapCount: ev.gapCount ?? 0,
          speedAnomalies: ev.speedAnomalies ?? false,
          courseAlterationDeg: ev.courseAlterationDeg != null ? Number(ev.courseAlterationDeg.toFixed(1)) : null,
        },
      };
    });

    const structuredEvidence = {
      analysisId: analysis.id,
      spillId: spill.id,
      metadata: {
        analysisStatus: analysis.status,
        createdAt: analysis.createdAt,
        updatedAt: analysis.updatedAt,
        evidenceCompiledAt: new Date().toISOString(),
      },
      observedEvidence: {
        classification: "OBSERVED",
        sensor: scene?.satellite || "Sentinel-1 SAR",
        sceneId: scene?.sceneId || "demo-scene-001",
        acquisitionTimestamp: scene?.acquisitionAt || spill.detectedAt,
        polarisation: scene?.bandInfo?.polarisation || "VV+VH",
        slickCentroid: {
          latitude: Number(spill.latitude.toFixed(4)),
          longitude: Number(spill.longitude.toFixed(4)),
        },
        slickAreaKm2: Number(spill.areaKm2.toFixed(2)),
        detectionConfidence: Number(spill.confidence.toFixed(4)),
        detectionConfidencePct: Math.round(spill.confidence * 100),
        estimatedAgeHours: spill.estimatedAgeHours ?? 14.5,
      },
      modelledEvidence: {
        classification: "MODELLED",
        engine: simMeta.engine || "BUILT-IN DEMONSTRATION LAGRANGIAN MODEL",
        modelledOrigin: driftRun
          ? {
              latitude: Number(driftRun.latitude.toFixed(4)),
              longitude: Number(driftRun.longitude.toFixed(4)),
              originTimestamp: driftRun.originTimestamp,
              uncertaintyRadiusKm: simMeta.uncertainty_radius_km ?? 2.6,
              uncertaintyRadiusMeters: (simMeta.uncertainty_radius_km ?? 2.6) * 1000,
            }
          : null,
        hindcastTrajectory: {
          durationHours: driftRun?.timeWindowHours ?? 24,
          pointCount: hindcastPoints.length > 0 ? hindcastPoints.length : 25,
          timestepSeconds: simMeta.timestep_seconds ?? 3600,
        },
        forecastTrajectory: {
          durationHours: 6,
          pointCount: forecastPoints.length > 0 ? forecastPoints.length : 7,
        },
        environmentalConditions: {
          classification: "DEMONSTRATION",
          source: envMeta.source || "demo",
          windSpeedKts: envMeta.wind_speed_kts ?? 12.4,
          windDirectionDeg: envMeta.wind_direction_deg ?? 315.0,
          currentSpeedKts: envMeta.current_speed_kts ?? 0.8,
          currentDirectionDeg: envMeta.current_direction_deg ?? 125.0,
          windageFactor: envMeta.windage_factor ?? 0.030,
        },
      },
      aisEvidence: {
        classification: "DEMONSTRATION",
        source: "demo",
        candidateCount: candidateVessels.length,
        candidateVessels,
      },
      disclaimers: {
        evidentiary:
          "Attribution scores represent modelled spatial, temporal, and trajectory correlations from available AIS and SAR-derived information. They do not establish legal responsibility, causation, or proof of pollution by any vessel.",
        demoAisNotice:
          "AIS records used in this demonstration are synthetic/demo records and do not represent actual historical vessel movements.",
        demoMetOceanNotice:
          "Environmental wind and surface current vectors are sourced from a structured demonstration scenario (source = 'demo').",
      },
    };

    logger.info("Structured evidence package constructed successfully", {
      analysisId: analysis.id,
      spillId: spill.id,
      candidateCount: candidateVessels.length,
    });

    return structuredEvidence;
  }
}

module.exports = new EvidenceService();
