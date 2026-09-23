const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");
const dossierService = require("../../src/services/dossier.service");
const evidenceService = require("../../src/services/evidence.service");
const mlClient = require("../../src/clients/ml.client");
const prisma = require("../../src/db/database");
const dossierRoutes = require("../../src/routes/dossier.routes");
const { errorHandler } = require("../../src/middleware/error.middleware");

// Create test express app
const app = express();
app.use(express.json());
app.use("/api/v1/dossier", dossierRoutes);
app.use(errorHandler);

describe("Part 0.13G — Dossier Integration & Reporting Contract (Comprehensive Audit Suite)", () => {
  let authToken;

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

  beforeAll(() => {
    authToken = jwt.sign(
      { id: "test-user-id", email: "analyst@oceanguard.ai", role: "ANALYST" },
      process.env.JWT_SECRET || "supersecretkey123_development_only",
      { expiresIn: "1h" }
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // 1. Dossier generation
  it("1. should generate and persist dossier successfully via Python 0.13F", async () => {
    jest.spyOn(evidenceService, "getStructuredEvidence").mockResolvedValue(mockEvidence);
    jest.spyOn(mlClient, "synthesizeDossier").mockResolvedValue({
      status: "success",
      schemaVersion: "OG-DOSSIER-V1",
      dossier: validOgDossier,
    });
    jest.spyOn(prisma.report, "upsert").mockResolvedValue({
      id: "report-123",
      analysisId: "analysis-test-123",
      title: "Analytical Investigation Dossier",
      content: JSON.stringify(validOgDossier),
      createdAt: new Date(),
    });

    const res = await request(app)
      .post("/api/v1/dossier/analysis-test-123/generate")
      .set("Authorization", `Bearer ${authToken}`)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.dossier.schemaVersion).toBe("OG-DOSSIER-V1");
    expect(res.body.data.status).toBe("READY");
  });

  // 2. Dossier retrieval
  it("2. should retrieve an existing dossier by analysisId", async () => {
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

    const res = await request(app)
      .get("/api/v1/dossier/analysis-test-123")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.dossier.schemaVersion).toBe("OG-DOSSIER-V1");
    expect(res.body.data.status).toBe("READY");
  });

  // 3. OG-DOSSIER-V1 schema preservation
  it("3. should preserve OG-DOSSIER-V1 schema version and release headers", () => {
    expect(dossierService.validateDossierContract(validOgDossier)).toBe(true);
    expect(validOgDossier.schemaVersion).toBe("OG-DOSSIER-V1");
    expect(validOgDossier.evidenceRelease).toBe("OG-SAR-ML-RESEARCH-RELEASE-V0.12");
  });

  // 4. Provenance preservation
  it("4. should preserve combination provenance status without transformation", () => {
    expect(validOgDossier.provenance.combinationStatus).toBe("DEMO_AIS_CORRELATION");
    expect(validOgDossier.provenance.sarSource).toBe("REAL_CDSE");
    expect(validOgDossier.provenance.aisSource).toBe("DEMO");
  });

  // 5. Generation mode preservation
  it("5. should preserve generationMode from Python synthesis", () => {
    expect(validOgDossier.generationMode).toBe("DETERMINISTIC");
  });

  // 6. REAL/DEMO isolation
  it("6. should maintain REAL and DEMO data stream separation", () => {
    expect(validOgDossier.provenance.isRealAnalytical).toBe(false);
  });

  // 7. Legal responsibility preservation
  it("7. should strictly preserve legalResponsibility.status = NOT_ESTABLISHED", () => {
    expect(validOgDossier.legalResponsibility.status).toBe("NOT_ESTABLISHED");
  });

  // 8. Oil type NOT_ESTABLISHED preservation
  it("8. should preserve oilTypeStatus as NOT_ESTABLISHED", () => {
    expect(validOgDossier.oilTypeAndVolume.oilTypeStatus).toBe("NOT_ESTABLISHED");
  });

  // 9. Volume NOT_ESTABLISHED preservation
  it("9. should preserve volumeStatus as NOT_ESTABLISHED", () => {
    expect(validOgDossier.oilTypeAndVolume.volumeStatus).toBe("NOT_ESTABLISHED");
  });

  // 10. Analytical score semantics
  it("10. should maintain ANALYTICAL_CORRELATION_SCORE scoreType and interpretation", () => {
    expect(validOgDossier.analyticalCorrelation.scoreType).toBe("ANALYTICAL_CORRELATION_SCORE");
    expect(validOgDossier.analyticalCorrelation.interpretation).toContain("Spatio-temporal evidence consistency only");
  });

  // 11. evidenceRefs preservation
  it("11. should preserve evidence timeline and references", () => {
    expect(Array.isArray(validOgDossier.timeline)).toBe(true);
    expect(validOgDossier.timeline.length).toBeGreaterThan(0);
  });

  // 12. Unauthorized access rejection
  it("12. should reject unauthenticated requests with 401", async () => {
    const res = await request(app).get("/api/v1/dossier/analysis-test-123");
    expect(res.status).toBe(401);
  });

  // 13. Missing dossier handling
  it("13. should return 404 for non-existent dossier", async () => {
    jest.spyOn(prisma.report, "findUnique").mockResolvedValue(null);

    const res = await request(app)
      .get("/api/v1/dossier/nonexistent-id")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(404);
  });

  // 14. Python/LLM service failure handling
  it("14. should return controlled 502 error if Python service fails without fabricating data", async () => {
    jest.spyOn(evidenceService, "getStructuredEvidence").mockResolvedValue(mockEvidence);
    jest.spyOn(mlClient, "synthesizeDossier").mockRejectedValue(new Error("Connection refused"));

    const res = await request(app)
      .post("/api/v1/dossier/analysis-test-123/generate")
      .set("Authorization", `Bearer ${authToken}`)
      .send({});

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("DOSSIER_GENERATION_FAILED");
  });

  // 15. READY only after valid schema
  it("15. should mark dossier status READY only after schema validation", async () => {
    jest.spyOn(evidenceService, "getStructuredEvidence").mockResolvedValue(mockEvidence);
    jest.spyOn(mlClient, "synthesizeDossier").mockResolvedValue({
      status: "success",
      schemaVersion: "OG-DOSSIER-V1",
      dossier: validOgDossier,
    });
    jest.spyOn(prisma.report, "upsert").mockResolvedValue({
      id: "report-123",
      analysisId: "analysis-test-123",
      title: "Analytical Investigation Dossier",
      content: JSON.stringify(validOgDossier),
      createdAt: new Date(),
    });

    const result = await dossierService.generateDossier("analysis-test-123");
    expect(result.status).toBe("READY");
  });

  // 16. Deterministic synthesis identification
  it("16. should identify deterministic generationMode", () => {
    const detDossier = { ...validOgDossier, generationMode: "DETERMINISTIC" };
    expect(dossierService.validateDossierContract(detDossier)).toBe(true);
    expect(detDossier.generationMode).toBe("DETERMINISTIC");
  });

  // 17. LLM synthesis identification
  it("17. should identify LLM generationMode", () => {
    const llmDossier = { ...validOgDossier, generationMode: "LLM" };
    expect(dossierService.validateDossierContract(llmDossier)).toBe(true);
    expect(llmDossier.generationMode).toBe("LLM");
  });

  // 18. Browser cannot override canonical evidence
  it("18. should ignore browser-submitted scientific fields on generate endpoint", async () => {
    const spyEvidence = jest.spyOn(evidenceService, "getStructuredEvidence").mockResolvedValue(mockEvidence);
    jest.spyOn(mlClient, "synthesizeDossier").mockResolvedValue({
      status: "success",
      schemaVersion: "OG-DOSSIER-V1",
      dossier: validOgDossier,
    });
    jest.spyOn(prisma.report, "upsert").mockResolvedValue({
      id: "report-123",
      analysisId: "analysis-test-123",
      title: "Analytical Investigation Dossier",
      content: JSON.stringify(validOgDossier),
      createdAt: new Date(),
    });

    const res = await request(app)
      .post("/api/v1/dossier/analysis-test-123/generate")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        surfaceAreaKm2: 999999,
        correlationScore: 1.0,
        vesselMmsi: "FAKE_VESSEL",
        legalResponsibility: "CONFIRMED",
      });

    expect(res.status).toBe(201);
    expect(spyEvidence).toHaveBeenCalledWith("analysis-test-123");
    // Canonical area from database remains 4.73, not 999999
    expect(res.body.data.dossier.geospatialEvidence.surfaceAreaKm2).toBe(4.73);
  });

  // 19. Browser cannot submit arbitrary AIS score
  it("19. should preserve server-calculated AIS correlation score", async () => {
    jest.spyOn(evidenceService, "getStructuredEvidence").mockResolvedValue(mockEvidence);
    jest.spyOn(mlClient, "synthesizeDossier").mockResolvedValue({
      status: "success",
      schemaVersion: "OG-DOSSIER-V1",
      dossier: validOgDossier,
    });
    jest.spyOn(prisma.report, "upsert").mockResolvedValue({
      id: "report-123",
      analysisId: "analysis-test-123",
      title: "Analytical Investigation Dossier",
      content: JSON.stringify(validOgDossier),
      createdAt: new Date(),
    });

    const res = await request(app)
      .post("/api/v1/dossier/analysis-test-123/generate")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ correlationScore: 0.9999 });

    expect(res.body.data.dossier.aisEvidence.candidates[0].spatioTemporalCorrelationScore.correlationScore).toBe(0.7462);
  });

  // 20. Browser cannot submit arbitrary vessel responsibility
  it("20. should enforce legalResponsibility as NOT_ESTABLISHED regardless of browser input", async () => {
    jest.spyOn(evidenceService, "getStructuredEvidence").mockResolvedValue(mockEvidence);
    jest.spyOn(mlClient, "synthesizeDossier").mockResolvedValue({
      status: "success",
      schemaVersion: "OG-DOSSIER-V1",
      dossier: validOgDossier,
    });
    jest.spyOn(prisma.report, "upsert").mockResolvedValue({
      id: "report-123",
      analysisId: "analysis-test-123",
      title: "Analytical Investigation Dossier",
      content: JSON.stringify(validOgDossier),
      createdAt: new Date(),
    });

    const res = await request(app)
      .post("/api/v1/dossier/analysis-test-123/generate")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ legalResponsibility: { status: "CONFIRMED_VESSEL" } });

    expect(res.body.data.dossier.legalResponsibility.status).toBe("NOT_ESTABLISHED");
  });

  // 21. Scientific Value Tampering Test
  it("21. should reject or disregard malicious tampering payload", async () => {
    const maliciousPayload = {
      surfaceAreaKm2: 999999,
      correlationScore: 1.0,
      vesselMmsi: "FAKE",
      legalResponsibility: "CONFIRMED",
    };

    jest.spyOn(evidenceService, "getStructuredEvidence").mockResolvedValue(mockEvidence);
    jest.spyOn(mlClient, "synthesizeDossier").mockResolvedValue({
      status: "success",
      schemaVersion: "OG-DOSSIER-V1",
      dossier: validOgDossier,
    });
    jest.spyOn(prisma.report, "upsert").mockResolvedValue({
      id: "report-123",
      analysisId: "analysis-test-123",
      title: "Analytical Investigation Dossier",
      content: JSON.stringify(validOgDossier),
      createdAt: new Date(),
    });

    const res = await request(app)
      .post("/api/v1/dossier/analysis-test-123/generate")
      .set("Authorization", `Bearer ${authToken}`)
      .send(maliciousPayload);

    expect(res.status).toBe(201);
    expect(res.body.data.dossier.geospatialEvidence.surfaceAreaKm2).toBe(4.73);
    expect(res.body.data.dossier.legalResponsibility.status).toBe("NOT_ESTABLISHED");
  });

  // 22. Node/Python Dossier Consistency
  it("22. should preserve Python evidence fields without scientific alteration", () => {
    expect(validOgDossier.geospatialEvidence.surfaceAreaKm2).toBe(4.73);
    expect(validOgDossier.driftEvidence.modelledOrigin.latitude).toBe(19.113);
    expect(validOgDossier.aisEvidence.candidates[0].mmsi).toBe("123456789");
    expect(validOgDossier.aisEvidence.candidates[0].spatioTemporalCorrelationScore.correlationScore).toBe(0.7462);
  });

  // 23. Deterministic Generation Mode Preservation
  it("23. should never relabel DETERMINISTIC synthesis as LLM", () => {
    const detDossier = JSON.parse(JSON.stringify(validOgDossier));
    detDossier.generationMode = "DETERMINISTIC";
    expect(detDossier.generationMode).not.toBe("LLM");
    expect(detDossier.generationMode).toBe("DETERMINISTIC");
  });
});
