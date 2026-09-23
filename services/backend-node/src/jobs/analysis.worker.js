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

const { stageSentinel1Product } = require("../services/sentinel1/sentinel1.download.service");

/**
 * Create and start the BullMQ analysis pipeline worker.
 *
 * State machine:
 *   QUEUED → RUNNING (AUTHENTICATING_CDSE → DOWNLOADING → PREPROCESSING) → DETECTION → HINDCAST → ATTRIBUTION → COMPLETED
 *                                                                                                             ↘ FAILED
 */
function createAnalysisWorker() {
  const worker = new Worker(
    "analysis-pipeline",
    async (bullJob) => {
      const {
        analysisId,
        jobId,
        sarSceneId,
        productId,
        timeWindowHours,
        imagePath,
        metadata = {},
        isRealCdse: payloadIsRealCdse,
        sourceType,
        isManualAnalysis,
      } = bullJob.data;

      // ── MANUAL IMAGE ANALYSIS LIFECYCLE ────────────────────────────────
      if (sourceType === "MANUAL_IMAGE" || isManualAnalysis) {
        logger.info("[Worker] Executing Manual Image Analysis Lifecycle", { analysisId, jobId });
        const manualAnalysisService = require("../manual-analysis/manual-analysis.service");
        return await manualAnalysisService.processManualJob(bullJob);
      }

      logger.info("[Worker] Starting analysis job", { analysisId, jobId, sarSceneId });

      const isRealCdse = Boolean(
        payloadIsRealCdse ||
        sarSceneId === "cdse-s1a-mumbai-20240218" ||
        sarSceneId?.startsWith("cdse-") ||
        sarSceneId?.startsWith("S1") ||
        sarSceneId?.includes("GRD") ||
        sarSceneId?.includes("SAFE") ||
        metadata?.productName?.startsWith("S1") ||
        productId?.startsWith("S1")
      );

      try {
        // Ensure demo AIS data is loaded if table is empty (for demo mode only)
        if (!isRealCdse) {
          const aisCount = await aisRepository.findTrack("999001001");
          if (!aisCount || aisCount.length === 0) {
            logger.info("[Worker] Demo AIS data not present in DB. Ingesting demo dataset...");
            await aisService.ingestDemoData();
          }
        }

        // ── RUNNING (Initial State) ──────────────────────────────────────────
        await analysisRepository.updateStatus(analysisId, jobId, "RUNNING");
        await bullJob.updateProgress(5);

        let localRasterPath = imagePath || null;
        let stagedProvenance = null;

        // ── REAL CDSE DOWNLOAD & STAGING LIFECYCLE ─────────────────────────
        if (isRealCdse) {
          logger.info("[Worker] Executing CDSE Authentication & Download Lifecycle", {
            analysisId,
            sarSceneId: sarSceneId || productId,
          });

          await analysisRepository.updateJobProgress(jobId, 10, {
            stage: "AUTHENTICATING_CDSE",
            stageMessage: "Authenticating with Copernicus Keycloak OAuth2...",
            isRealCdse: true,
          });

          const stagingTargetId = sarSceneId || productId || metadata?.productName;
          const stageResult = await stageSentinel1Product(stagingTargetId, {
            metadata,
            onProgress: async (p) => {
              const baseProgress = p.stage === "AUTHENTICATING_CDSE" ? 10 : 15;
              const transferProgress = p.percent ? Math.round(p.percent * 0.35) : 5;
              const overall = Math.min(50, baseProgress + transferProgress);

              await bullJob.updateProgress(overall);
              await analysisRepository.updateJobProgress(jobId, overall, {
                stage: p.stage,
                stageMessage: p.message,
                bytesDownloaded: p.bytesDownloaded,
                totalBytes: p.totalBytes,
                downloadPercent: p.percent,
                speedBps: p.speedBps,
              });
            },
          });

          stagedProvenance = stageResult.provenance;
          localRasterPath = stagedProvenance?.localPath || localRasterPath;

          // ── PREPROCESSING STAGE ───────────────────────────────────────────
          await bullJob.updateProgress(55);
          await analysisRepository.updateJobProgress(jobId, 55, {
            stage: "PREPROCESSING",
            stageMessage: "Validating GeoTIFF raster bands & ESA Sigma0 radiometric calibration...",
          });
        }

        // ── DETECTION (Model Inference Stage) ──────────────────────────────
        await analysisRepository.updateStatus(analysisId, jobId, "DETECTION");
        const detectionProgress = isRealCdse ? 65 : 20;
        await bullJob.updateProgress(detectionProgress);
        await analysisRepository.updateJobProgress(jobId, detectionProgress, {
          stage: "MODEL_INFERENCE",
          stageMessage: isRealCdse
            ? "Executing Dual-Pol SAR semantic segmentation on authentic CDSE raster..."
            : "Running SAR model detection...",
        });

        logger.info("[Worker] Executing SAR detection stage", {
          analysisId,
          sarSceneId,
          isRealCdse,
          hasRaster: Boolean(localRasterPath),
        });

        const detection = await runSarDetection({
          sarSceneId,
          imagePath: localRasterPath,
          metadata: {
            ...metadata,
            ...(stagedProvenance || {}),
            isRealScene: isRealCdse,
          },
          isRealCdse,
        });

        // Persist spill record
        const spill = await spillRepository.create(analysisId, detection);
        logger.info("[Worker] Spill record created", { spillId: spill.id, isRealCdse });
        await bullJob.updateProgress(isRealCdse ? 80 : 40);

        // ── HINDCAST (Phase 5 Drift Simulation) ───────────────────────────
        await analysisRepository.updateStatus(analysisId, jobId, "HINDCAST");

        if (isRealCdse) {
          logger.info("[Worker] Real CDSE scene: Drift model omitted (unlabelled live scene)", { spillId: spill.id });
          await spillRepository.saveDriftRun(spill.id, {
            latitude: spill.latitude,
            longitude: spill.longitude,
            originTimestamp: spill.detectedAt || new Date(metadata?.acquisitionStart || Date.now()),
            timeWindowHours: 0,
            backwardPath: [],
            forwardPath: [],
            simulationMeta: {
              engine: "NONE",
              status: "NOT_RUN",
              message: "Drift trajectory model was not executed for this unlabelled live scene.",
            },
          });
        } else {
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

          await spillRepository.saveDriftRun(spill.id, driftResult);
          logger.info("[Worker] Drift run and points saved to database", {
            spillId: spill.id,
            originLat: driftResult.originLat,
            originLng: driftResult.originLng,
          });
        }
        await bullJob.updateProgress(isRealCdse ? 90 : 65);

        // ── ATTRIBUTION (Phase 4 AIS Attribution Engine) ────────────────────
        await analysisRepository.updateStatus(analysisId, jobId, "ATTRIBUTION");

        let rankedCandidates = [];
        if (isRealCdse) {
          logger.info("[Worker] Real CDSE scene: AIS correlation omitted (no vessel attribution established for live scene)", { spillId: spill.id });
        } else {
          logger.info("[Worker] Executing AIS Correlation & Vessel Attribution", {
            spillId: spill.id,
          });

          const attributionResult = await attributionService.analyzeSpill(spill.id, {
            timeWindowHours: Number(timeWindowHours) || 24,
          });
          rankedCandidates = attributionResult.candidates || [];
        }

        await bullJob.updateProgress(98);

        // ── COMPLETED ─────────────────────────────────────────────────────
        await analysisRepository.updateStatus(analysisId, jobId, "COMPLETED");
        await bullJob.updateProgress(100);
        await analysisRepository.updateJobProgress(jobId, 100, {
          stage: "ANALYSIS_READY",
          stageMessage: "Processing complete. Analysis results ready.",
        });

        logger.info("[Worker] Analysis completed successfully", {
          analysisId,
          spillId: spill.id,
          scenarioType: isRealCdse ? "REAL_CDSE" : "DEMO",
        });

        return {
          spillId:    spill.id,
          analysisId,
          topSuspect: rankedCandidates[0]?.vessel?.mmsi || null,
          candidatesCount: rankedCandidates.length,
          scenarioType: isRealCdse ? "REAL_CDSE" : "DEMO",
        };

      } catch (err) {
        logger.error("[Worker] Analysis failed", {
          analysisId,
          jobId,
          error: err.message,
          stack: err.stack,
        });
        await analysisRepository.markFailed(analysisId, jobId, err.message);
        await analysisRepository.updateJobProgress(jobId, 0, {
          stage: "FAILED",
          stageMessage: `Pipeline execution failed: ${err.message}`,
          errorMessage: err.message,
        });
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
