const dossierService = require("../services/dossier.service");

/**
 * DossierController — Handles requests for LLM-assisted Analytical Investigation Dossiers.
 * Routes: /api/v1/dossier
 */
const dossierController = {
  /**
   * POST /api/v1/dossier/:analysisId/generate
   * Generate an Analytical Investigation Dossier for an analysis via Python 0.13F.
   * Note: The server resolves authoritative canonical evidence; browser cannot supply scientific values.
   */
  async generate(req, res, next) {
    try {
      const { analysisId } = req.params;
      const userId = req.user?.id || null;
      const { provider, model, temperature } = req.body || {};

      const result = await dossierService.generateDossier(analysisId, userId, {
        provider,
        model,
        temperature,
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

  /**
   * GET /api/v1/dossier
   * List all persisted investigation dossiers.
   */
  async list(req, res, next) {
    try {
      const dossiers = await dossierService.listDossiers();

      res.status(200).json({
        success: true,
        data: dossiers,
        error: null,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/dossier/:analysisId/pdf
   * Export formal investigation report PDF generated from persisted OG-DOSSIER-V1.
   */
  async exportPdf(req, res, next) {
    try {
      const { analysisId } = req.params;

      const { pdfBuffer, filename } = await dossierService.generateDossierPdf(analysisId);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length);

      return res.status(200).send(pdfBuffer);
    } catch (err) {
      next(err);
    }
  },
};

module.exports = dossierController;
