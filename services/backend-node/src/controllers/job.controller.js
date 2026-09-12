const analysisService = require("../services/analysis.service");
const AppError = require("../errors/AppError");

/**
 * JobController — handles job creation and status polling.
 * Route: /api/v1/jobs
 */
const jobController = {
  /**
   * POST /api/v1/jobs
   * Create a new analysis job and enqueue it.
   */
  async create(req, res, next) {
    try {
      const { sarSceneId, timeWindowHours } = req.body;
      const userId = req.user?.id;

      const result = await analysisService.createJob({
        sarSceneId,
        timeWindowHours: timeWindowHours || 24,
        userId,
      });

      res.status(201).json({
        success: true,
        data: result,
        error: null,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/jobs/:id
   * Get the current status of a job.
   */
  async getStatus(req, res, next) {
    try {
      const { id } = req.params;
      const status = await analysisService.getJobStatus(id);

      res.json({
        success: true,
        data: status,
        error: null,
      });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = jobController;
