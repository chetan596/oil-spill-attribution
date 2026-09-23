const spillService = require("../services/spill.service");

/**
 * SpillController — handles Spill queries.
 * Route: /api/v1/spills
 */
const spillController = {
  /**
   * GET /api/v1/spills
   * List all detected spills (paginated).
   */
  async list(req, res, next) {
    try {
      const limit  = Math.min(Number(req.query.limit)  || 20, 100);
      const offset = Number(req.query.offset) || 0;

      const result = await spillService.list({ limit, offset });

      res.json({
        success: true,
        data: {
          spills:     result.data,
          total:      result.total,
          limit,
          offset,
        },
        error: null,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/spills/:id
   * Get full spill details including analysis status.
   */
  async getById(req, res, next) {
    try {
      const spill = await spillService.getById(req.params.id);
      res.json({ success: true, data: spill, error: null });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/spills/by-analysis/:analysisId
   * Get spill record directly associated with an analysis ID.
   */
  async getByAnalysisId(req, res, next) {
    try {
      const spill = await spillService.getByAnalysisId(req.params.analysisId);
      res.json({ success: true, data: spill, error: null });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/spills/:id/drift
   * Get drift trajectory (backward + forward paths).
   */
  async getDrift(req, res, next) {
    try {
      const drift = await spillService.getDrift(req.params.id);
      res.json({ success: true, data: drift, error: null });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/spills/:id/vessels
   * Get ranked vessel candidates for a spill.
   */
  async getVessels(req, res, next) {
    try {
      const vessels = await spillService.getVessels(req.params.id);
      res.json({ success: true, data: vessels, error: null });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = spillController;
