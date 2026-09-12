const analysisRepository = require("../repositories/analysis.repository");
const { analysisQueue } = require("../jobs/queues");
const AppError = require("../errors/AppError");

/**
 * AnalysisService — orchestrates the creation and status of analysis jobs.
 * Business logic lives here; DB operations are delegated to repositories.
 */
const analysisService = {
  /**
   * Create a new analysis + job, then enqueue it in BullMQ.
   * @param {{ sarSceneId?: string, timeWindowHours?: number, userId?: string }} input
   * @returns {{ jobId: string, analysisId: string, status: string }}
   */
  async createJob({ sarSceneId, timeWindowHours = 24, userId }) {
    // 1. Persist Analysis + AnalysisJob to DB
    const { analysis, job } = await analysisRepository.create({
      userId,
      sceneId: sarSceneId || null,
      payload: { sarSceneId, timeWindowHours },
    });

    // 2. Enqueue in BullMQ
    const bullJob = await analysisQueue.add(
      "run-analysis",
      {
        analysisId:     analysis.id,
        jobId:          job.id,
        sarSceneId:     sarSceneId || null,
        timeWindowHours: Number(timeWindowHours),
      },
      {
        jobId:       job.id,          // deterministic job ID for idempotency
        attempts:    3,
        backoff:     { type: "exponential", delay: 2000 },
        removeOnComplete: { count: 100 },
        removeOnFail:     { count: 50 },
      }
    );

    // 3. Store the BullMQ job ID for external polling
    await analysisRepository.setBullJobId(job.id, bullJob.id);

    return {
      jobId:      job.id,
      analysisId: analysis.id,
      status:     "queued",
    };
  },

  /**
   * Get the current status of a job (including its analysis and spill).
   * @param {string} jobId
   * @returns {object}
   */
  async getJobStatus(jobId) {
    const job = await analysisRepository.findJobById(jobId);
    if (!job) throw AppError.notFound("Job");

    return {
      jobId:       job.id,
      analysisId:  job.analysisId,
      status:      job.status.toLowerCase(),
      progress:    job.progress,
      bullJobId:   job.bullJobId,
      startedAt:   job.startedAt,
      completedAt: job.completedAt,
      errorMessage: job.errorMessage || null,
      payload:     job.payload,
    };
  },
};

module.exports = analysisService;
