const { Router } = require("express");
const dossierController = require("../controllers/dossier.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = Router();

// All dossier routes require authentication
router.use(authenticate);

/**
 * POST /api/v1/dossier/:analysisId/generate
 * Synthesize and persist an Analytical Investigation Dossier.
 */
router.post("/:analysisId/generate", dossierController.generate);

/**
 * GET /api/v1/dossier/:analysisId
 * Retrieve an existing persisted dossier.
 */
router.get("/:analysisId", dossierController.get);

module.exports = router;
