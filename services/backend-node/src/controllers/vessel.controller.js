const vesselService = require("../services/vessel.service");

/**
 * VesselController — handles Vessel + AIS track queries.
 * Route: /api/v1/vessels
 */
const vesselController = {
  /**
   * GET /api/v1/vessels
   * List all vessels in the system.
   */
  async listVessels(req, res, next) {
    try {
      const { limit, offset } = req.query;
      const vessels = await vesselService.listVessels({ limit, offset });
      res.json({ success: true, data: vessels, error: null });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/vessels/:mmsi/track
   * Get AIS track for a vessel by MMSI.
   * Optional query params: startTime, endTime (ISO 8601)
   */
  async getTrack(req, res, next) {
    try {
      const { mmsi } = req.params;
      const { startTime, endTime } = req.query;

      const result = await vesselService.getTrack(
        mmsi,
        startTime ? new Date(startTime) : undefined,
        endTime   ? new Date(endTime)   : undefined
      );

      res.json({ success: true, data: result, error: null });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = vesselController;
