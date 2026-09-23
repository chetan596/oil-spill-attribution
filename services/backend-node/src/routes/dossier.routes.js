const { Router } = require("express");
const dossierController = require("../controllers/dossier.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = Router();

// All dossier routes require authentication
router.use(authenticate);

/**
 * GET /api/v1/dossier
 * List all persisted investigation dossiers in archive.
 */
router.get("/", dossierController.list);

/**
 * POST /api/v1/dossier/:analysisId/generate
 * Synthesize and persist an Analytical Investigation Dossier via Python 0.13F.
 */
router.post("/:analysisId/generate", dossierController.generate);

/**
 * GET /api/v1/dossier/:analysisId/pdf
 * Export a formal investigation report PDF from persisted OG-DOSSIER-V1.
 */
router.get("/:analysisId/pdf", dossierController.exportPdf);

/**
 * GET /api/v1/dossier/:analysisId
 * Retrieve an existing persisted dossier.
 */
router.get("/:analysisId", dossierController.get);

module.exports = router;
