const attributionService = require("../services/attribution.service");
const spillRepository = require("../repositories/spill.repository");
const AppError = require("../errors/AppError");

/**
 * AttributionController — handles vessel candidate attribution analysis endpoints.
 * Route: /api/v1/attribution
 */
const attributionController = {
  /**
   * POST /api/v1/attribution/analyze
   * Trigger on-demand attribution correlation analysis for a spill.
   * Body: { spillId: string, radiusKm?: number, timeWindowHours?: number }
   */
  async analyze(req, res, next) {
    try {
      const { spillId, radiusKm, timeWindowHours } = req.body;
      if (!spillId) {
        throw AppError.badRequest("spillId is required for attribution analysis");
      }

      const result = await attributionService.analyzeSpill(spillId, {
        radiusKm: radiusKm ? Number(radiusKm) : undefined,
        timeWindowHours: timeWindowHours ? Number(timeWindowHours) : undefined,
      });

      res.json({ success: true, data: result, error: null });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/attribution/:analysisId
   * Retrieve attribution results for a given analysis ID (or spill ID).
   */
  async getByAnalysisId(req, res, next) {
    try {
      const { analysisId } = req.params;

      // First check if analysisId is directly a spillId
      let spill = await spillRepository.findById(analysisId);
      if (!spill) {
        // Look up spill by analysisId
        spill = await spillRepository.findByAnalysisId(analysisId);
      }

      if (!spill) {
        throw AppError.notFound("Analysis or Spill not found");
      }

      const candidates = await spillRepository.getVessels(spill.id);

      res.json({
        success: true,
        data: {
          spillId: spill.id,
          analysisId: spill.analysisId,
          totalCandidates: candidates.length,
          candidates,
          disclaimer: attributionService.SCIENTIFIC_DISCLAIMER,
          source: "demo",
        },
        error: null,
      });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = attributionController;
