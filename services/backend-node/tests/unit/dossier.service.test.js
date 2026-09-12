const dossierService = require("../../src/services/dossier.service");
const evidenceService = require("../../src/services/evidence.service");
const llmService = require("../../src/services/llm.service");
const prisma = require("../../src/db/database");

describe("DossierService (Orchestration & Validation)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const mockEvidence = {
    analysisId: "analysis-test-123",
    spillId: "spill-test-123",
    observedEvidence: {
      sensor: "Sentinel-1 SAR",
      slickAreaKm2: 4.73,
      slickCentroid: { latitude: 18.921, longitude: 72.832 },
      detectionConfidencePct: 94,
    },
    modelledEvidence: {
      engine: "BUILT-IN DEMONSTRATION LAGRANGIAN MODEL",
      modelledOrigin: { latitude: 19.113, longitude: 72.544, uncertaintyRadiusKm: 2.6 },
    },
    aisEvidence: {
      candidateCount: 1,
      candidateVessels: [
        {
          rank: 1,
          name: "DEMO MARINER ALPHA",
          mmsi: "123456789",
          scores: { totalScore: 0.7462 },
        },
      ],
    },
  };

  it("should validate a valid dossier schema successfully", () => {
    const validDossier = {
      executiveSummary: "Summary text",
      observedEvidence: ["Obs 1"],
      modelledEvidence: ["Mod 1"],
      candidateAssessments: [{ candidateVessel: "V1", summary: "S1", supportingEvidence: [], limitingEvidence: [] }],
      timeline: [{ time: "2026-03-10", phase: "P1", description: "D1" }],
      limitations: ["Lim 1"],
      recommendedFollowUp: ["Rec 1"],
      disclaimer: "Disclaimer",
    };

    expect(dossierService.validateDossierSchema(validDossier)).toBe(true);
    expect(validDossier.disclaimer).toContain("Attribution scores represent modelled");
  });

  it("should reject an invalid dossier schema missing required sections", () => {
    const invalidDossier = {
      executiveSummary: "Only summary",
      // missing arrays
    };

    expect(() => dossierService.validateDossierSchema(invalidDossier)).toThrow("Dossier is missing");
  });

  it("should generate, validate, and persist an Analytical Investigation Dossier", async () => {
    jest.spyOn(evidenceService, "getStructuredEvidence").mockResolvedValue(mockEvidence);
    jest.spyOn(prisma.report, "upsert").mockResolvedValue({
      id: "report-123",
      analysisId: "analysis-test-123",
      title: "Analytical Investigation Dossier — Incident #spill-te",
      content: JSON.stringify({ executiveSummary: "Test" }),
      createdAt: new Date(),
    });

    const result = await dossierService.generateDossier("analysis-test-123", "user-123");

    expect(result).toBeDefined();
    expect(result.reportId).toBe("report-123");
    expect(result.analysisId).toBe("analysis-test-123");
    expect(result.dossier).toBeDefined();
    expect(result.dossier.disclaimer).toContain("legal responsibility");
  });

  it("should retrieve an existing persisted dossier in getDossier", async () => {
    const mockReport = {
      id: "report-123",
      analysisId: "analysis-test-123",
      title: "Analytical Investigation Dossier",
      content: JSON.stringify({
        executiveSummary: "Stored summary",
        observedEvidence: ["Obs 1"],
        modelledEvidence: ["Mod 1"],
        candidateAssessments: [],
        timeline: [],
        limitations: [],
        recommendedFollowUp: [],
        disclaimer: "Disclaimer text",
      }),
      createdAt: new Date(),
      analysis: {
        spill: { id: "spill-test-123" },
      },
    };

    jest.spyOn(prisma.report, "findUnique").mockResolvedValue(mockReport);

    const result = await dossierService.getDossier("analysis-test-123");
    expect(result.reportId).toBe("report-123");
    expect(result.dossier.executiveSummary).toBe("Stored summary");
  });
});
