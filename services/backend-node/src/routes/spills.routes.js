const { Router } = require("express");
const spillController = require("../controllers/spill.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = Router();

// All spill routes require authentication
router.use(authenticate);

/**
 * GET /api/v1/spills
 * List all detected spills (paginated, ?limit=&offset=).
 */
router.get("/", spillController.list);

/**
 * GET /api/v1/spills/:id
 * Get full details for a specific spill.
 */
router.get("/:id", spillController.getById);

/**
 * GET /api/v1/spills/:id/drift
 * Get drift trajectory (backward + forward paths) for a spill.
 */
router.get("/:id/drift", spillController.getDrift);

/**
 * GET /api/v1/spills/:id/vessels
 * Get ranked vessel attribution candidates for a spill.
 */
router.get("/:id/vessels", spillController.getVessels);

module.exports = router;