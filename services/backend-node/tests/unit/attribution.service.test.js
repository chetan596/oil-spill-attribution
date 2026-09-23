const attributionService = require("../../src/services/attribution.service");
const aisService = require("../../src/services/ais.service");
const spillRepository = require("../../src/repositories/spill.repository");
const prisma = require("../../src/db/database");

describe("Attribution Service Integration & Logic", () => {
  jest.setTimeout(60000);

  beforeAll(async () => {
    // Ingest demo AIS data for tests
    await aisService.ingestDemoData();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should return unavailable state when spill origin is missing", async () => {
    // Mock spill without coordinates
    const originalFindById = spillRepository.findById;
    spillRepository.findById = jest.fn().mockResolvedValue({
      id: "fake-spill-no-origin",
      latitude: null,
      longitude: null,
      driftRun: null,
    });

    const result = await attributionService.analyzeSpill("fake-spill-no-origin");
    expect(result.status).toBe("unavailable");
    expect(result.candidates).toHaveLength(0);
    expect(result.disclaimer).toContain("Attribution scores represent modelled");

    spillRepository.findById = originalFindById;
  });

  it("should return zero candidates with a clear explanation if radius is too small", async () => {
    // Spill in the middle of nowhere where no demo vessels travel
    const originalFindById = spillRepository.findById;
    spillRepository.findById = jest.fn().mockResolvedValue({
      id: "fake-spill-remote",
      latitude: 0.0,
      longitude: 0.0,
      detectedAt: new Date("2026-03-10T12:00:00Z"),
      driftRun: {
        latitude: 0.0,
        longitude: 0.0,
        originTimestamp: new Date("2026-03-10T00:00:00Z"),
        timeWindowHours: 24,
      },
    });

    const result = await attributionService.analyzeSpill("fake-spill-remote", { radiusKm: 10 });
    expect(result.status).toBe("completed");
    expect(result.totalCandidatesFound).toBe(0);
    expect(result.candidates).toHaveLength(0);
    expect(result.explanation).toContain("No candidate vessels identified within 10 km");

    spillRepository.findById = originalFindById;
  });

  it("should rank candidate vessels descending by attribution score for Arabian Sea scenario", async () => {
    const originalFindById = spillRepository.findById;
    const originalSaveAttribution = spillRepository.saveAttributionResults;

    spillRepository.findById = jest.fn().mockResolvedValue({
      id: "demo-spill-arabian-sea",
      analysisId: "demo-analysis-001",
      latitude: 18.921,
      longitude: 72.832,
      detectedAt: new Date("2026-03-10T12:00:00Z"),
      driftRun: {
        latitude: 19.113,
        longitude: 72.544,
        originTimestamp: new Date("2026-03-09T21:30:00Z"),
        timeWindowHours: 24,
      },
    });
    spillRepository.saveAttributionResults = jest.fn().mockResolvedValue([]);

    const result = await attributionService.analyzeSpill("demo-spill-arabian-sea", {
      radiusKm: 50,
      timeWindowHours: 24,
    });

    expect(result.status).toBe("completed");
    expect(result.candidates.length).toBeGreaterThanOrEqual(3);

    // Verify ranked descending
    for (let i = 0; i < result.candidates.length - 1; i++) {
      expect(result.candidates[i].totalScore).toBeGreaterThanOrEqual(result.candidates[i + 1].totalScore);
      expect(result.candidates[i].rank).toBe(i + 1);
    }

    // Top candidate should be DEMO MARINER ALPHA (closest pass)
    const top = result.candidates[0];
    expect(top.vessel.mmsi).toBe("999001001");
    expect(top.vessel.name).toBe("DEMO MARINER ALPHA");
    expect(top.proximityScore).toBeGreaterThan(0.8);
    expect(top.evidence.source).toBe("demo");
    expect(top.evidence.disclaimer).toBeDefined();

    spillRepository.findById = originalFindById;
    spillRepository.saveAttributionResults = originalSaveAttribution;
  }, 20000);

  it("should produce deterministic scores across repeated runs", async () => {
    const originalFindById = spillRepository.findById;
    const originalSaveAttribution = spillRepository.saveAttributionResults;

    const mockSpill = {
      id: "demo-spill-repeat",
      latitude: 18.921,
      longitude: 72.832,
      detectedAt: new Date("2026-03-10T12:00:00Z"),
      driftRun: {
        latitude: 19.113,
        longitude: 72.544,
        originTimestamp: new Date("2026-03-09T21:30:00Z"),
        timeWindowHours: 24,
      },
    };
    spillRepository.findById = jest.fn().mockResolvedValue(mockSpill);
    spillRepository.saveAttributionResults = jest.fn().mockResolvedValue([]);

    const run1 = await attributionService.analyzeSpill("demo-spill-repeat");
    const run2 = await attributionService.analyzeSpill("demo-spill-repeat");

    expect(run1.candidates.length).toBe(run2.candidates.length);
    for (let i = 0; i < run1.candidates.length; i++) {
      expect(run1.candidates[i].totalScore).toBe(run2.candidates[i].totalScore);
      expect(run1.candidates[i].vesselId).toBe(run2.candidates[i].vesselId);
    }

    spillRepository.findById = originalFindById;
    spillRepository.saveAttributionResults = originalSaveAttribution;
  }, 60000);
});
