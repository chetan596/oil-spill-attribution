const { Worker } = require("bullmq");
const redis = require("../config/redis");
const analysisRepository = require("../repositories/analysis.repository");
const spillRepository    = require("../repositories/spill.repository");
const vesselRepository   = require("../repositories/vessel.repository");
const aisRepository      = require("../repositories/ais.repository");
const aisService         = require("../services/ais.service");
const driftService       = require("../services/drift.service");
const attributionService = require("../services/attribution.service");
const { runSarDetection } = require("../services/detection.service");
const logger             = require("../logger");

/**
 * Create and start the BullMQ analysis pipeline worker.
 *
 * State machine:
 *   QUEUED → RUNNING → DETECTION → HINDCAST → ATTRIBUTION → COMPLETED
 *                                                          ↘ FAILED
 */
function createAnalysisWorker() {
  const worker = new Worker(
    "analysis-pipeline",
    async (bullJob) => {
      const { analysisId, jobId, sarSceneId, timeWindowHours } = bullJob.data;

      logger.info("[Worker] Starting analysis job", { analysisId, jobId });

      try {
        // Ensure demo AIS data is loaded if table is empty
        const aisCount = await aisRepository.findTrack("999001001");
        if (!aisCount || aisCount.length === 0) {
          logger.info("[Worker] Demo AIS data not present in DB. Ingesting demo dataset...");
          await aisService.ingestDemoData();
        }

        // ── RUNNING ────────────────────────────────────────────────────────
        await analysisRepository.updateStatus(analysisId, jobId, "RUNNING");
        await bullJob.updateProgress(5);

        // ── DETECTION ─────────────────────────────────────────────────────
        await analysisRepository.updateStatus(analysisId, jobId, "DETECTION");
        await bullJob.updateProgress(20);

        logger.info("[Worker] Executing SAR detection stage", { analysisId, sarSceneId });
        const detection = await runSarDetection({ sarSceneId });

        // Persist spill
        const spill = await spillRepository.create(analysisId, detection);
        logger.info("[Worker] Spill created", { spillId: spill.id });
        await bullJob.updateProgress(40);

        // ── HINDCAST (Phase 5 Drift Simulation) ───────────────────────────
        await analysisRepository.updateStatus(analysisId, jobId, "HINDCAST");

        logger.info("[Worker] Executing hydrodynamic drift simulation (hindcast & forecast)", {
          spillId: spill.id,
          centroid: { lat: spill.latitude, lng: spill.longitude },
        });

        const driftResult = await driftService.runDriftSimulation({
          latitude: spill.latitude,
          longitude: spill.longitude,
          detectionTimestamp: spill.detectedAt,
          hoursBack: Number(timeWindowHours) || 24,
          hoursForward: 6,
        });

        // Persist drift run + points
        await spillRepository.saveDriftRun(spill.id, driftResult);
        logger.info("[Worker] Drift run and points saved to database", {
          spillId: spill.id,
          originLat: driftResult.originLat,
          originLng: driftResult.originLng,
          originTimestamp: driftResult.originTimestamp,
          uncertaintyRadiusKm: driftResult.uncertaintyRadiusKm,
        });
        await bullJob.updateProgress(65);

        // ── ATTRIBUTION (Phase 4 AIS Attribution Engine) ────────────────────
        await analysisRepository.updateStatus(analysisId, jobId, "ATTRIBUTION");

        logger.info("[Worker] Executing AIS Correlation & Vessel Attribution", {
          spillId: spill.id,
          modelledOrigin: {
            lat: driftResult.originLat,
            lng: driftResult.originLng,
            timestamp: driftResult.originTimestamp,
          },
        });

        const attributionResult = await attributionService.analyzeSpill(spill.id, {
          timeWindowHours: Number(timeWindowHours) || 24,
        });

        const rankedCandidates = attributionResult.candidates || [];
        logger.info("[Worker] Vessel attribution completed", {
          spillId: spill.id,
          candidatesCount: rankedCandidates.length,
          topSuspect: rankedCandidates[0]?.vessel?.name,
          topScore: rankedCandidates[0]?.totalScore,
        });

        await bullJob.updateProgress(95);

        // ── COMPLETED ─────────────────────────────────────────────────────
        await analysisRepository.updateStatus(analysisId, jobId, "COMPLETED");
        await bullJob.updateProgress(100);

        logger.info("[Worker] Analysis completed successfully", {
          analysisId,
          spillId: spill.id,
          topSuspect: rankedCandidates[0]?.vessel?.name || "None",
        });

        return {
          spillId:    spill.id,
          analysisId,
          topSuspect: rankedCandidates[0]?.vessel?.mmsi || null,
          candidatesCount: rankedCandidates.length,
        };

      } catch (err) {
        logger.error("[Worker] Analysis failed", {
          analysisId,
          jobId,
          error: err.message,
          stack: err.stack,
        });
        await analysisRepository.markFailed(analysisId, jobId, err.message);
        throw err; // Re-throw so BullMQ handles retries
      }
    },
    {
      connection:  redis,
      concurrency: 2, // Process up to 2 jobs simultaneously
    }
  );

  worker.on("completed", (job) => {
    logger.info(`[Worker] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    logger.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
  });

  let lastWorkerErrorLog = 0;
  worker.on("error", (err) => {
    const now = Date.now();
    // Throttle worker connection errors to once every 30 seconds when Redis is offline
    if (now - lastWorkerErrorLog > 30000) {
      lastWorkerErrorLog = now;
      logger.warn(`[Worker] Worker connection issue: ${err.message || err.code || "Redis unreachable"}. Will process jobs once Redis is active.`);
    }
  });

  logger.info("[Worker] Analysis pipeline worker initialized (concurrency: 2)");
  return worker;
}

module.exports = { createAnalysisWorker };
