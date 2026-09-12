const prisma = require("../db/database");

/**
 * AnalysisRepository — persistence layer for Analysis and AnalysisJob models.
 * All database operations for analyses/jobs live here.
 */
const analysisRepository = {
  /**
   * Create a new Analysis + its first AnalysisJob in a single transaction.
   * @param {{ userId?: string, sceneId?: string, payload?: object }} data
   * @returns {{ analysis: Analysis, job: AnalysisJob }}
   */
  async create({ userId, sceneId, payload }) {
    return prisma.$transaction(async (tx) => {
      const analysis = await tx.analysis.create({
        data: {
          sceneId: sceneId || null,
          status: "QUEUED",
        },
      });

      const job = await tx.analysisJob.create({
        data: {
          analysisId: analysis.id,
          userId: userId || null,
          status: "QUEUED",
          payload: payload || {},
        },
      });

      return { analysis, job };
    });
  },

  /**
   * Find an Analysis by ID, including its job(s) and spill.
   */
  async findById(id) {
    return prisma.analysis.findUnique({
      where: { id },
      include: {
        jobs: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        spill: {
          include: {
            driftRun: {
              include: { points: { orderBy: { seqIndex: "asc" } } },
            },
            attributionResults: {
              include: { vessel: true },
              orderBy: { rank: "asc" },
            },
          },
        },
      },
    });
  },

  /**
   * Find an AnalysisJob by its ID (primary), bullJobId, or analysisId.
   * @param {string} jobId
   */
  async findJobById(jobId) {
    return prisma.analysisJob.findFirst({
      where: {
        OR: [
          { id: jobId },
          { bullJobId: jobId },
          { analysisId: jobId },
        ],
      },
      include: {
        analysis: true,
      },
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Update the status of both Analysis and its latest AnalysisJob.
   * @param {string} analysisId
   * @param {string} jobId
   * @param {string} status  - JobStatus enum value
   * @param {object} [extra] - Additional fields for AnalysisJob update
   */
  async updateStatus(analysisId, jobId, status, extra = {}) {
    return prisma.$transaction([
      prisma.analysis.update({
        where: { id: analysisId },
        data: { status },
      }),
      prisma.analysisJob.update({
        where: { id: jobId },
        data: {
          status,
          ...(status === "RUNNING"   && { startedAt: new Date() }),
          ...(status === "COMPLETED" && { completedAt: new Date(), progress: 100 }),
          ...(status === "FAILED"    && { completedAt: new Date() }),
          ...extra,
        },
      }),
    ]);
  },

  /**
   * Mark an AnalysisJob as failed with an error message.
   */
  async markFailed(analysisId, jobId, errorMessage) {
    return this.updateStatus(analysisId, jobId, "FAILED", {
      errorMessage: String(errorMessage),
    });
  },

  /**
   * Link a BullMQ job ID to an AnalysisJob record.
   */
  async setBullJobId(jobId, bullJobId) {
    return prisma.analysisJob.update({
      where: { id: jobId },
      data: { bullJobId: String(bullJobId) },
    });
  },
};

module.exports = analysisRepository;
