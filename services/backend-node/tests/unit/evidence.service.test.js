const evidenceService = require("../../src/services/evidence.service");
const prisma = require("../../src/db/database");

describe("EvidenceService (Structured Evidence Compilation)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should throw error if identifier is missing", async () => {
    await expect(evidenceService.getStructuredEvidence(null)).rejects.toThrow("Analysis ID or Spill ID is required");
  });

  it("should compile a structured evidence package from database records", async () => {
    const mockAnalysis = {
      id: "analysis-test-123",
      status: "COMPLETED",
      createdAt: new Date("2026-03-10T12:05:00Z"),
      updatedAt: new Date("2026-03-10T12:06:00Z"),
      scene: {
        id: "scene-123",
        sceneId: "S1A_IW_GRDH_1SDV_20260310T120000",
        satellite: "Sentinel-1",
        acquisitionAt: new Date("2026-03-10T12:00:00Z"),
        bandInfo: { polarisation: "VV+VH" },
      },
      spill: {
        id: "spill-test-123",
        analysisId: "analysis-test-123",
        latitude: 18.921,
        longitude: 72.832,
        areaKm2: 4.73,
        confidence: 0.94,
        estimatedAgeHours: 14.5,
        detectedAt: new Date("2026-03-10T12:00:00Z"),
        driftRun: {
          id: "drift-run-123",
          spillId: "spill-test-123",
          latitude: 19.113,
          longitude: 72.544,
          originTimestamp: new Date("2026-03-09T12:00:00Z"),
          timeWindowHours: 24,
          simulationMeta: {
            engine: "BUILT-IN DEMONSTRATION LAGRANGIAN MODEL",
            uncertainty_radius_km: 2.6,
            environmental: {
              source: "demo",
              wind_speed_kts: 12.4,
              wind_direction_deg: 315.0,
              current_speed_kts: 0.8,
              current_direction_deg: 125.0,
            },
          },
          points: [
            { id: "p1", phase: "backward", seqIndex: 0, latitude: 18.921, longitude: 72.832 },
            { id: "p2", phase: "backward", seqIndex: 24, latitude: 19.113, longitude: 72.544 },
            { id: "p3", phase: "forward", seqIndex: 1, latitude: 18.880, longitude: 72.880 },
          ],
        },
        attributionResults: [
          {
            id: "attr-1",
            rank: 1,
            totalScore: 0.7462,
            proximityScore: 0.85,
            temporalScore: 0.78,
            trajectoryScore: 0.65,
            anomalyScore: 0.70,
            evidence: { closestApproachKm: 2.35, timeDeltaHours: 1.2, gapCount: 0 },
            vessel: {
              name: "DEMO MARINER ALPHA",
              mmsi: "123456789",
              imo: "9876543",
              flag: "PA",
              vesselType: "Crude Tanker",
              lengthM: 280,
            },
          },
        ],
      },
    };

    jest.spyOn(prisma.analysis, "findUnique").mockResolvedValue(mockAnalysis);

    const evidence = await evidenceService.getStructuredEvidence("analysis-test-123");

    expect(evidence).toBeDefined();
    expect(evidence.analysisId).toBe("analysis-test-123");
    expect(evidence.spillId).toBe("spill-test-123");

    // Check OBSERVED data
    expect(evidence.observedEvidence.classification).toBe("OBSERVED");
    expect(evidence.observedEvidence.sensor).toBe("Sentinel-1");
    expect(evidence.observedEvidence.slickAreaKm2).toBe(4.73);
    expect(evidence.observedEvidence.detectionConfidencePct).toBe(94);

    // Check MODELLED data
    expect(evidence.modelledEvidence.classification).toBe("MODELLED");
    expect(evidence.modelledEvidence.engine).toBe("BUILT-IN DEMONSTRATION LAGRANGIAN MODEL");
    expect(evidence.modelledEvidence.modelledOrigin.latitude).toBe(19.113);
    expect(evidence.modelledEvidence.modelledOrigin.longitude).toBe(72.544);
    expect(evidence.modelledEvidence.modelledOrigin.uncertaintyRadiusKm).toBe(2.6);

    // Check AIS and Candidate vessels
    expect(evidence.aisEvidence.classification).toBe("DEMONSTRATION");
    expect(evidence.aisEvidence.source).toBe("demo");
    expect(evidence.aisEvidence.candidateCount).toBe(1);
    expect(evidence.aisEvidence.candidateVessels[0].name).toBe("DEMO MARINER ALPHA");
    expect(evidence.aisEvidence.candidateVessels[0].scores.totalScore).toBe(0.7462);

    // Check Disclaimers
    expect(evidence.disclaimers.evidentiary).toContain("Attribution scores represent modelled spatial");
  });
});
