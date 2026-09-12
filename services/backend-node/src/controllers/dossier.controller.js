const dossierService = require("../services/dossier.service");

/**
 * DossierController — Handles requests for LLM-assisted Analytical Investigation Dossiers.
 * Routes: /api/v1/dossier
 */
const dossierController = {
  /**
   * POST /api/v1/dossier/:analysisId/generate
   * Generate an LLM-assisted Analytical Investigation Dossier for an analysis.
   */
  async generate(req, res, next) {
    try {
      const { analysisId } = req.params;
      const userId = req.user?.id || null;

      const result = await dossierService.generateDossier(analysisId, userId);

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
   * GET /api/v1/dossier/:analysisId
   * Retrieve a previously generated Analytical Investigation Dossier.
   */
  async get(req, res, next) {
    try {
      const { analysisId } = req.params;

      const result = await dossierService.getDossier(analysisId);

      res.status(200).json({
        success: true,
        data: result,
        error: null,
      });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = dossierController;
