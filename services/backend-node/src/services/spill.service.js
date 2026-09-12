const spillRepository = require("../repositories/spill.repository");
const AppError = require("../errors/AppError");

/**
 * SpillService — business logic for Spill queries.
 * Delegates all DB operations to spillRepository.
 */
const spillService = {
  /**
   * List all spills (paginated).
   */
  async list({ limit = 20, offset = 0 } = {}) {
    return spillRepository.list({ limit, offset });
  },

  /**
   * Get full spill details by ID.
   */
  async getById(id) {
    const spill = await spillRepository.findById(id);
    if (!spill) throw AppError.notFound("Spill");
    return spill;
  },

  /**
   * Get drift trajectory for a spill.
   */
  async getDrift(spillId) {
    const spill = await spillRepository.findById(spillId);
    if (!spill) throw AppError.notFound("Spill");

    const drift = await spillRepository.getDrift(spillId);
    if (!drift) {
      throw new AppError(404, "DRIFT_NOT_READY", "Drift simulation not yet available for this spill");
    }
    return drift;
  },

  /**
   * Get ranked vessel candidates for a spill.
   */
  async getVessels(spillId) {
    const spill = await spillRepository.findById(spillId);
    if (!spill) throw AppError.notFound("Spill");

    return spillRepository.getVessels(spillId);
  },
};

module.exports = spillService;
