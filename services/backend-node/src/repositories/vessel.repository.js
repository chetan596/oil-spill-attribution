const prisma = require("../db/database");

/**
 * VesselRepository — persistence layer for Vessel model.
 */
const vesselRepository = {
  /**
   * Find a vessel by MMSI.
   */
  async findByMmsi(mmsi) {
    return prisma.vessel.findUnique({
      where: { mmsi: String(mmsi) },
    });
  },

  /**
   * List all vessels in the system.
   */
  async list({ limit = 50, offset = 0 } = {}) {
    return prisma.vessel.findMany({
      take: Number(limit) || 50,
      skip: Number(offset) || 0,
      orderBy: { name: "asc" },
    });
  },

  /**
   * Upsert a vessel record. Creates if not exists, updates if does.
   * @param {{ mmsi, imo?, name?, flag?, vesselType?, lengthM? }} data
   */
  async upsert(data) {
    return prisma.vessel.upsert({
      where: { mmsi: String(data.mmsi) },
      create: {
        mmsi:       String(data.mmsi),
        imo:        data.imo        || null,
        name:       data.name       || null,
        flag:       data.flag       || null,
        vesselType: data.vesselType || null,
        lengthM:    data.lengthM    || null,
      },
      update: {
        name:       data.name       || undefined,
        flag:       data.flag       || undefined,
        vesselType: data.vesselType || undefined,
        lengthM:    data.lengthM    || undefined,
      },
    });
  },

  /**
   * List vessels ranked by their attribution score for a given spill.
   * Returns the same data as spillRepository.getVessels but standalone.
   */
  async listCandidates(spillId) {
    return prisma.attributionResult.findMany({
      where: { spillId },
      include: { vessel: true },
      orderBy: { rank: "asc" },
    });
  },
};

module.exports = vesselRepository;
