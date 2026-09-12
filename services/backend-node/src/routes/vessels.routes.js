const { Router } = require("express");
const vesselController = require("../controllers/vessel.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = Router();

// All vessel routes require authentication
router.use(authenticate);

/**
 * GET /api/v1/vessels
 * List vessels in database.
 */
router.get("/", vesselController.listVessels);

/**
 * GET /api/v1/vessels/:mmsi/track
 * Get AIS track for a vessel.
 * Optional: ?startTime=ISO&endTime=ISO
 */
router.get("/:mmsi/track", vesselController.getTrack);

module.exports = router;