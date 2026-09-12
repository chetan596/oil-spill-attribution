const prisma = require("../db/database");
const AppError = require("../errors/AppError");
const dossierService = require("../services/dossier.service");
const llmService = require("../services/llm.service");

/**
 * ReportController — generates incident dossiers for spills.
 * Route: /api/v1/reports
 */
const reportController = {
  /**
   * POST /api/v1/reports/generate/:spillId
   * Generate a report for a completed spill analysis.
   */
  async generate(req, res, next) {
    try {
      const { spillId } = req.params;
      const userId = req.user?.id;

      // Fetch spill with full attribution data
      const spill = await prisma.spill.findUnique({
        where: { id: spillId },
        include: {
          analysis: true,
          attributionResults: {
            include: { vessel: true },
            orderBy: { rank: "asc" },
          },
        },
      });

      if (!spill) throw AppError.notFound("Spill");

      if (spill.analysis.status !== "COMPLETED") {
        throw new AppError(409, "ANALYSIS_NOT_COMPLETE",
          "Report cannot be generated until analysis is complete");
      }

      // Check for existing report
      const existing = await prisma.report.findUnique({
        where: { analysisId: spill.analysisId },
      });
      if (existing) {
        let parsed = null;
        try { parsed = JSON.parse(existing.content); } catch { parsed = existing.content; }
        return res.json({ success: true, data: { ...existing, dossier: parsed }, error: null });
      }

      const dossierResult = await dossierService.generateDossier(spill.analysisId, userId);

      res.status(201).json({ success: true, data: dossierResult, error: null });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = reportController;
