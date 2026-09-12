const { Router } = require("express");
const jobController = require("../controllers/job.controller");
const { authenticate } = require("../middleware/auth.middleware");
const validate = require("../middleware/validation.middleware");
const { createJobSchema } = require("../schemas/job.schema");

const router = Router();

// All job routes require authentication
router.use(authenticate);

/**
 * POST /api/v1/jobs
 * Create a new analysis job and enqueue it.
 */
router.post("/", validate(createJobSchema), jobController.create);

/**
 * GET /api/v1/jobs/:id
 * Get the current status of a job.
 */
router.get("/:id", jobController.getStatus);

module.exports = router;