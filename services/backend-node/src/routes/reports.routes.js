const { Router } = require("express");
const reportController = require("../controllers/report.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = Router();

// All report routes require authentication
router.use(authenticate);

/**
 * POST /api/v1/reports/generate/:spillId
 * Generate an incident report for a completed spill analysis.
 */
router.post("/generate/:spillId", reportController.generate);

module.exports = router;
