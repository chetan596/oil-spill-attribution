const prisma = require("../db/database");

/**
 * SpillRepository — persistence layer for Spill and related data.
 */
const spillRepository = {
  /**
   * Create a new Spill from a detection result.
   * @param {string} analysisId
   * @param {{ latitude, longitude, areaKm2, geomWkt, confidence, estimatedAgeHours }} detection
   */
  async create(analysisId, detection) {
    return prisma.spill.create({
      data: {
        analysisId,
        latitude:          Number(detection.latitude ?? detection.centroidLat),
        longitude:         Number(detection.longitude ?? detection.centroidLng),
        areaKm2:           Number(detection.areaKm2),
        geomWkt:           detection.geomWkt || detection.polygonWkt || null,
        confidence:        Number(detection.confidence),
        estimatedAgeHours: detection.estimatedAgeHours ? Number(detection.estimatedAgeHours) : null,
      },
    });
  },

  /**
   * Find a Spill by its ID with all related data.
   */
  async findById(id) {
    return prisma.spill.findUnique({
      where: { id },
      include: {
        analysis: true,
        driftRun: {
          include: {
            points: { orderBy: { seqIndex: "asc" } },
          },
        },
        attributionResults: {
          include: { vessel: true },
          orderBy: { rank: "asc" },
        },
      },
    });
  },

  /**
   * Find a Spill by analysisId.
   */
  async findByAnalysisId(analysisId) {
    return prisma.spill.findUnique({
      where: { analysisId },
      include: {
        driftRun: { include: { points: true } },
        attributionResults: {
          include: { vessel: true },
          orderBy: { rank: "asc" },
        },
      },
    });
  },

  /**
   * List all spills, most recent first.
   * @param {{ limit?: number, offset?: number }} opts
   */
  async list({ limit = 20, offset = 0 } = {}) {
    const [data, total] = await prisma.$transaction([
      prisma.spill.findMany({
        take: limit,
        skip: offset,
        orderBy: { detectedAt: "desc" },
        include: { analysis: { select: { status: true } } },
      }),
      prisma.spill.count(),
    ]);
    return { data, total };
  },

  /**
   * Get drift trajectory for a spill.
   */
  async getDrift(spillId) {
    return prisma.driftRun.findUnique({
      where: { spillId },
      include: {
        points: { orderBy: { seqIndex: "asc" } },
      },
    });
  },

  /**
   * Get ranked vessel candidates for a spill.
   */
  async getVessels(spillId) {
    return prisma.attributionResult.findMany({
      where: { spillId },
      include: { vessel: true },
      orderBy: { rank: "asc" },
    });
  },

  /**
   * Save drift run + drift points in a transaction.
   * @param {string} spillId
   * @param {{ latitude, longitude, originTimestamp, timeWindowHours, backwardPath, forwardPath }} hindcast
   */
  async saveDriftRun(spillId, hindcast) {
    return prisma.$transaction(async (tx) => {
      const driftRun = await tx.driftRun.create({
        data: {
          spillId,
          latitude:        Number(hindcast.latitude ?? hindcast.originLat),
          longitude:       Number(hindcast.longitude ?? hindcast.originLng),
          originTimestamp: new Date(hindcast.originTimestamp),
          timeWindowHours: hindcast.timeWindowHours || 24,
          simulationMeta:  hindcast.simulationMeta || {},
        },
      });

      const backwardPoints = (hindcast.backwardPath || []).map((pt, idx) => ({
        driftRunId: driftRun.id,
        latitude:   Number(pt.latitude ?? pt.lat),
        longitude:  Number(pt.longitude ?? pt.lng),
        geomWkt:    pt.geomWkt || null,
        timestamp:  new Date(pt.timestamp),
        phase:      "backward",
        seqIndex:   idx,
      }));

      const forwardPoints = (hindcast.forwardPath || []).map((pt, idx) => ({
        driftRunId: driftRun.id,
        latitude:   Number(pt.latitude ?? pt.lat),
        longitude:  Number(pt.longitude ?? pt.lng),
        geomWkt:    pt.geomWkt || null,
        timestamp:  new Date(pt.timestamp),
        phase:      "forward",
        seqIndex:   idx,
      }));

      await tx.driftPoint.createMany({
        data: [...backwardPoints, ...forwardPoints],
      });

      return driftRun;
    });
  },

  /**
   * Save attribution results (upsert by spillId+vesselId).
   * @param {string} spillId
   * @param {Array} results - [{ vesselId, proximityScore, temporalScore, ... }]
   */
  async saveAttributionResults(spillId, results) {
    const ops = results.map((r) =>
      prisma.attributionResult.upsert({
        where: { spillId_vesselId: { spillId, vesselId: r.vesselId } },
        create: {
          spillId,
          vesselId:        r.vesselId,
          proximityScore:  r.proximityScore,
          temporalScore:   r.temporalScore,
          trajectoryScore: r.trajectoryScore,
          anomalyScore:    r.anomalyScore,
          totalScore:      r.totalScore,
          rank:            r.rank,
          evidence:        r.evidence || {},
        },
        update: {
          proximityScore:  r.proximityScore,
          temporalScore:   r.temporalScore,
          trajectoryScore: r.trajectoryScore,
          anomalyScore:    r.anomalyScore,
          totalScore:      r.totalScore,
          rank:            r.rank,
          evidence:        r.evidence || {},
        },
      })
    );
    return prisma.$transaction(ops);
  },
};

module.exports = spillRepository;
