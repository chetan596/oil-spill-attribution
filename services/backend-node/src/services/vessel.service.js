const vesselRepository = require("../repositories/vessel.repository");
const aisRepository = require("../repositories/ais.repository");
const AppError = require("../errors/AppError");

/**
 * VesselService — business logic for vessel + AIS track queries.
 */
const vesselService = {
  /**
   * List all vessels in database.
   */
  async listVessels(opts) {
    return vesselRepository.list(opts);
  },

  /**
   * Get AIS track for a vessel by MMSI.
   * @param {string} mmsi
   * @param {Date} [startTime]
   * @param {Date} [endTime]
   */
  async getTrack(mmsi, startTime, endTime) {
    const vessel = await vesselRepository.findByMmsi(mmsi);
    if (!vessel) throw AppError.notFound("Vessel");

    const track = await aisRepository.findTrack(mmsi, startTime, endTime);
    return { vessel, track };
  },
};

module.exports = vesselService;
