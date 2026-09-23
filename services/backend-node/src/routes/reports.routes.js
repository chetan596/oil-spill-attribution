const { Router } = require("express");
const reportController = require("../controllers/report.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = Router();

const dossierController = require("../controllers/dossier.controller");

// All report routes require authentication
router.use(authenticate);

/**
 * POST /api/v1/reports/generate/:spillId
 * Generate an incident report for a completed spill analysis.
 */
router.post("/generate/:spillId", reportController.generate);

/**
 * GET /api/v1/reports/:analysisId/pdf
 * Export a formal investigation report PDF from persisted OG-DOSSIER-V1.
 */
router.get("/:analysisId/pdf", dossierController.exportPdf);

module.exports = router;
