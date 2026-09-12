const { Router } = require("express");
const attributionController = require("../controllers/attribution.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = Router();

// All attribution routes require authentication
router.use(authenticate);

/**
 * POST /api/v1/attribution/analyze
 * Trigger AIS correlation and vessel candidate attribution.
 */
router.post("/analyze", attributionController.analyze);

/**
 * GET /api/v1/attribution/:analysisId
 * Get candidate vessel attribution results for an analysis or spill.
 */
router.get("/:analysisId", attributionController.getByAnalysisId);

module.exports = router;
