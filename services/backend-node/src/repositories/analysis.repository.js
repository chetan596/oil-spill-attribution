const prisma = require("../db/database");
const { DEMO_SCENARIOS } = require("../data/demo-scenarios");

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
    // Ensure satelliteScene record exists before creating Analysis referencing it
    if (sceneId) {
      if (DEMO_SCENARIOS[sceneId]) {
        const sc = DEMO_SCENARIOS[sceneId];
        await prisma.satelliteScene.upsert({
          where: { id: sc.id },
          update: {},
          create: {
            id: sc.id,
            sceneId: sc.sceneId,
            satellite: sc.satellite,
            acquisitionAt: sc.acquisitionAt,
            fileUrl: sc.fileUrl,
            geomWkt: sc.sceneGeomWkt,
            bandInfo: sc.bandInfo,
          },
        });
      } else {
        const meta = payload?.metadata || {};
        const bbox = meta.bbox;
        let geomWkt = null;
        if (Array.isArray(bbox) && bbox.length === 4) {
          geomWkt = `POLYGON((${bbox[0]} ${bbox[1]}, ${bbox[2]} ${bbox[1]}, ${bbox[2]} ${bbox[3]}, ${bbox[0]} ${bbox[3]}, ${bbox[0]} ${bbox[1]}))`;
        } else if (meta.geometry?.type === "Polygon" && Array.isArray(meta.geometry?.coordinates?.[0])) {
          const coords = meta.geometry.coordinates[0];
          geomWkt = `POLYGON((${coords.map(([lng, lat]) => `${lng} ${lat}`).join(", ")}))`;
        }

        await prisma.satelliteScene.upsert({
          where: { id: sceneId },
          update: {},
          create: {
            id: sceneId,
            sceneId: sceneId,
            satellite: meta.platform || "Sentinel-1A (CDSE)",
            acquisitionAt: meta.acquisitionStart ? new Date(meta.acquisitionStart) : new Date(),
            fileUrl: meta.localPath || meta.downloadUrl || null,
            geomWkt,
            bandInfo: {
              polarisation: meta.polarization || "VV+VH",
              resolutionMeters: 10,
            },
          },
        });
      }
    }

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

  /**
   * Update AnalysisJob progress and merge additional payload data (e.g. download telemetry).
   */
  async updateJobProgress(jobId, progress, stageInfo = {}) {
    const job = await prisma.analysisJob.findUnique({ where: { id: jobId } });
    if (!job) return null;
    const currentPayload = typeof job.payload === "object" && job.payload ? job.payload : {};
    const updatedPayload = {
      ...currentPayload,
      ...stageInfo,
    };
    return prisma.analysisJob.update({
      where: { id: jobId },
      data: {
        progress: Math.min(100, Math.max(0, Math.round(progress))),
        payload: updatedPayload,
      },
    });
  },
};

module.exports = analysisRepository;
