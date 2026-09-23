const dossierService = require("../../src/services/dossier.service");
const evidenceService = require("../../src/services/evidence.service");
const mlClient = require("../../src/clients/ml.client");
const prisma = require("../../src/db/database");

describe("DossierService (Orchestration & Validation)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const validOgDossier = {
    schemaVersion: "OG-DOSSIER-V1",
    generatedAt: new Date().toISOString(),
    evidenceRelease: "OG-SAR-ML-RESEARCH-RELEASE-V0.12",
    provenance: {
      contractVersion: "OG-CANONICAL-EVIDENCE-CONTRACT-V1.0",
      sarSource: "REAL_CDSE",
      aisSource: "DEMO",
      combinationStatus: "DEMO_AIS_CORRELATION",
      isRealAnalytical: false,
    },
    generationMode: "DETERMINISTIC",
    executiveSummary: "Analytical evidence summary for detected candidate slick.",
    spillDetection: {
      semanticStatus: "OBSERVED",
      modelId: "unet-dual-pol-sar-v09d-residual-loss",
      operatingThreshold: 0.5,
    },
    geospatialEvidence: {
      semanticStatus: "DERIVED",
      surfaceAreaKm2: 4.73,
      observedCentroid: { latitude: 18.921, longitude: 72.832 },
    },
    driftEvidence: {
      semanticStatus: "MODELLED",
      engine: "Lagrangian Advection",
      modelledOrigin: { latitude: 19.113, longitude: 72.544, uncertaintyRadiusKm: 2.6 },
    },
    aisEvidence: {
      semanticStatus: "AIS",
      candidates: [
        {
          rank: 1,
          mmsi: "123456789",
          vesselName: "DEMO MARINER ALPHA",
          spatioTemporalCorrelationScore: {
            correlationScore: 0.7462,
            spatialComponent: 0.81,
            temporalComponent: 0.72,
            trajectoryComponent: 0.69,
            dataQualityComponent: 0.75,
            weights: { spatialWeight: 0.35, temporalWeight: 0.25, trajectoryWeight: 0.25, dataQualityWeight: 0.15 },
            scoreType: "ANALYTICAL_CORRELATION_SCORE",
          },
        },
      ],
    },
    analyticalCorrelation: {
      scoreType: "ANALYTICAL_CORRELATION_SCORE",
      interpretation: "Spatio-temporal evidence consistency only.",
    },
    timeline: [
      { timestamp: "2026-03-10T12:00:00Z", phase: "SAR_ACQUISITION", description: "Observed SAR acquisition" },
    ],
    scientificLimitations: [
      "Attribution candidate ranking represents exploratory physical/spatial correlation.",
    ],
    oilTypeAndVolume: {
      oilTypeStatus: "NOT_ESTABLISHED",
      volumeStatus: "NOT_ESTABLISHED",
      statement: "Oil type and volume cannot be established from satellite SAR backscatter alone.",
    },
    legalResponsibility: {
      status: "NOT_ESTABLISHED",
      statement: "The available evidence does not establish legal responsibility or vessel causation.",
      prohibitedAttributionTerms: [
        "RESPONSIBLE_VESSEL",
        "CONFIRMED_VESSEL",
        "GUILTY_VESSEL",
        "CAUSED_SPILL",
        "PROBABILITY_OF_GUILT",
        "ATTRIBUTION_CONFIDENCE_SCORE",
        "DISCHARGE_PROBABILITY",
      ],
    },
    disclaimer: "Disclaimer",
  };

  const mockEvidence = {
    analysisId: "analysis-test-123",
    spillId: "spill-test-123",
    provenance: {
      contractVersion: "OG-CANONICAL-EVIDENCE-CONTRACT-V1.0",
      sarSource: "REAL_CDSE",
      aisSource: "DEMO",
      combinationStatus: "DEMO_AIS_CORRELATION",
    },
  };

  it("should validate a valid OG-DOSSIER-V1 schema successfully", () => {
    expect(dossierService.validateDossierContract(validOgDossier)).toBe(true);
    expect(validOgDossier.disclaimer).toContain("legal proof of spill discharge");
  });

  it("should reject an invalid dossier schema missing required sections", () => {
    const invalidDossier = {
      schemaVersion: "OG-DOSSIER-V1",
      executiveSummary: "Only summary",
    };

    expect(() => dossierService.validateDossierContract(invalidDossier)).toThrow();
  });

  it("should reject dossier if legalResponsibility status is not NOT_ESTABLISHED", () => {
    const badLegalDossier = JSON.parse(JSON.stringify(validOgDossier));
    badLegalDossier.legalResponsibility.status = "CONFIRMED";

    expect(() => dossierService.validateDossierContract(badLegalDossier)).toThrow(
      "legalResponsibility.status must be 'NOT_ESTABLISHED'"
    );
  });

  it("should reject dossier containing prohibited attribution terminology", () => {
    const badTermDossier = JSON.parse(JSON.stringify(validOgDossier));
    badTermDossier.executiveSummary = "This is the RESPONSIBLE_VESSEL for the discharge.";

    expect(() => dossierService.validateDossierContract(badTermDossier)).toThrow("Prohibited attribution term");
  });

  it("should generate, validate, and persist an Analytical Investigation Dossier via Python 0.13F", async () => {
    jest.spyOn(evidenceService, "getStructuredEvidence").mockResolvedValue(mockEvidence);
    jest.spyOn(mlClient, "synthesizeDossier").mockResolvedValue({
      status: "success",
      schemaVersion: "OG-DOSSIER-V1",
      dossier: validOgDossier,
    });
    jest.spyOn(prisma.report, "upsert").mockResolvedValue({
      id: "report-123",
      analysisId: "analysis-test-123",
      title: "Analytical Investigation Dossier — Incident #spill-te",
      content: JSON.stringify(validOgDossier),
      createdAt: new Date(),
    });

    const result = await dossierService.generateDossier("analysis-test-123", "user-123");

    expect(result).toBeDefined();
    expect(result.reportId).toBe("report-123");
    expect(result.analysisId).toBe("analysis-test-123");
    expect(result.dossier).toBeDefined();
    expect(result.dossier.schemaVersion).toBe("OG-DOSSIER-V1");
    expect(result.dossier.legalResponsibility.status).toBe("NOT_ESTABLISHED");
  });

  it("should retrieve an existing persisted dossier in getDossier", async () => {
    const mockReport = {
      id: "report-123",
      analysisId: "analysis-test-123",
      title: "Analytical Investigation Dossier",
      content: JSON.stringify(validOgDossier),
      createdAt: new Date(),
      analysis: {
        spill: { id: "spill-test-123" },
      },
    };

    jest.spyOn(prisma.report, "findUnique").mockResolvedValue(mockReport);

    const result = await dossierService.getDossier("analysis-test-123");
    expect(result.reportId).toBe("report-123");
    expect(result.dossier.schemaVersion).toBe("OG-DOSSIER-V1");
    expect(result.dossier.executiveSummary).toBe(validOgDossier.executiveSummary);
  });

  it("should list persisted dossiers with archive metadata", async () => {
    const mockReports = [
      {
        id: "report-123",
        analysisId: "analysis-test-123",
        title: "Analytical Investigation Dossier",
        content: JSON.stringify(validOgDossier),
        createdAt: new Date(),
        analysis: {
          spill: { id: "spill-test-123" },
        },
      },
    ];

    jest.spyOn(prisma.report, "findMany").mockResolvedValue(mockReports);

    const list = await dossierService.listDossiers();
    expect(list).toHaveLength(1);
    expect(list[0].dossierId).toBe("OG-DOSSIER-ANALYSIS");
    expect(list[0].status).toBe("READY");
    expect(list[0].schemaVersion).toBe("OG-DOSSIER-V1");
  });
});
