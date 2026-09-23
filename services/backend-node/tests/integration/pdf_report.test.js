const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");
const pdfParse = require("pdf-parse");
const dossierService = require("../../src/services/dossier.service");
const dossierPdfService = require("../../src/services/dossier-pdf.service");
const prisma = require("../../src/db/database");
const dossierRoutes = require("../../src/routes/dossier.routes");
const reportsRoutes = require("../../src/routes/reports.routes");
const { errorHandler } = require("../../src/middleware/error.middleware");

// Create test express app
const app = express();
app.use(express.json());
app.use("/api/v1/dossier", dossierRoutes);
app.use("/api/v1/reports", reportsRoutes);
app.use(errorHandler);

const jwtService = require("../../src/auth/jwt.service");

describe("Part 0.13H — Formal Investigation Report / PDF Export Integration Suite", () => {
  let authToken;

  const validDossierData = {
    schemaVersion: "OG-DOSSIER-V1",
    dossierId: "OG-DOSSIER-TEST-001",
    generatedAt: "2026-09-20T00:00:00.000Z",
    evidenceRelease: "OG-SAR-ML-RESEARCH-RELEASE-V0.12",
    provenance: {
      contractVersion: "OG-CANONICAL-EVIDENCE-CONTRACT-V1.0",
      sarSource: "REAL_CDSE",
      aisSource: "DEMO",
      combinationStatus: "DEMO_AIS_CORRELATION",
      isRealAnalytical: false,
    },
    generationMode: "DETERMINISTIC",
    executiveSummary: "Authoritative technical investigation summary based on verified Sentinel-1 SAR acquisition.",
    spillDetection: {
      status: "OBSERVED",
      modelIdentifier: "unet-dual-pol-sar-v09d-residual-loss",
      detectionThreshold: 0.5,
      candidateCount: 1,
      observedEvidence: [
        "Dark formation detected with strong contrast in VV/VH channels.",
        "Smooth surface texture characteristic of biogenic/mineral slick.",
      ],
    },
    geospatialEvidence: {
      surfaceAreaKm2: 4.73,
      observedCentroid: { latitude: 18.921, longitude: 72.832 },
      crs: "EPSG:4326 (WGS 84)",
      geometryType: "MultiPolygon",
    },
    driftEvidence: {
      driftModel: "Deterministic Metocean Hindcast Backtracking",
      metoceanSource: "ECMWF ERA5 / Global Ocean Currents",
      hindcastHours: 24,
      modelledOrigin: { latitude: 19.113, longitude: 72.544, uncertaintyRadiusKm: 2.6, timestamp: "2026-09-19T06:00:00Z" },
      uncertaintyKm: 2.6,
    },
    aisEvidence: {
      source: "DEMO",
      temporalWindow: "±24 Hours",
      candidateCount: 1,
      candidates: [
        {
          rank: 1,
          mmsi: "413289000",
          vesselName: "MT PACIFIC BRAVO",
          vesselType: "Tanker",
          flag: "PA",
          imo: "9312345",
          correlationScore: 0.7462,
          minDistanceKm: 0.35,
        },
      ],
    },
    analyticalCorrelation: {
      scoreType: "ANALYTICAL_CORRELATION_SCORE",
      correlationScore: 0.7462,
      components: {
        spatial: 0.81,
        temporal: 0.72,
        trajectory: 0.69,
        dataQuality: 0.75,
      },
      weights: {
        spatial: 0.4,
        temporal: 0.3,
        trajectory: 0.2,
        dataQuality: 0.1,
      },
      interpretation: "Analytical spatio-temporal consistency only.",
    },
    timeline: [
      { time: "2026-09-19T06:00:00Z", phase: "MODELLED_ORIGIN", description: "Estimated trajectory origin corridor." },
      { time: "2026-09-20T06:00:00Z", phase: "SAR_ACQUISITION", description: "Sentinel-1 SAR acquisition over area." },
    ],
    scientificLimitations: [
      "Attribution candidate ranking represents exploratory physical/spatial correlation.",
      "Wind and wave conditions may influence surface drift rate and dispersion.",
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
    evidenceRefs: {
      geospatial: "geospatialEvidence.surfaceAreaKm2",
      drift: "metoceanDriftEvidence.modelledOrigin",
      ais: "aisCorrelationEvidence.candidates",
    },
    disclaimer: "Disclaimer statement.",
  };

  beforeAll(() => {
    authToken = jwtService.sign({
      sub: "user-test-pdf-123",
      email: "analyst@oceanguard.io",
      role: "ANALYST",
    });
  });

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  const getBinaryPdf = (url) => {
    return request(app)
      .get(url)
      .set("Authorization", `Bearer ${authToken}`)
      .responseType("blob");
  };

  // 1. PDF generated from valid dossier
  test("1. PDF generated from valid dossier returns 200 with application/pdf", async () => {
    jest.spyOn(prisma.report, "findUnique").mockResolvedValue({
      id: "report-test-1",
      analysisId: "analysis-test-1",
      title: "Analytical Investigation Dossier — Incident #test-1",
      content: JSON.stringify(validDossierData),
      createdAt: new Date(),
      analysis: { spill: { id: "spill-test-1" } },
    });

    const res = await getBinaryPdf("/api/v1/dossier/analysis-test-1/pdf");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toContain("OG-DOSSIER-TEST-001.pdf");
    expect(res.body).toBeInstanceOf(Buffer);
    expect(res.body.slice(0, 5).toString()).toBe("%PDF-");
  });

  // 2. Invalid dossier rejected
  test("2. Invalid dossier rejected with controlled 502/422 error", async () => {
    const invalidDossier = { ...validDossierData, schemaVersion: "INVALID-SCHEMA-V99" };
    jest.spyOn(prisma.report, "findUnique").mockResolvedValue({
      id: "report-test-2",
      analysisId: "analysis-test-2",
      title: "Invalid Report",
      content: JSON.stringify(invalidDossier),
      createdAt: new Date(),
      analysis: { spill: { id: "spill-test-2" } },
    });

    const res = await request(app)
      .get("/api/v1/dossier/analysis-test-2/pdf")
      .set("Authorization", `Bearer ${authToken}`);

    expect([422, 502]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  // 3. Missing dossier returns 404
  test("3. Missing dossier returns 404", async () => {
    jest.spyOn(prisma.report, "findUnique").mockResolvedValue(null);

    const res = await request(app)
      .get("/api/v1/dossier/nonexistent-analysis/pdf")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(404);
  });

  // 4. Unauthorized access rejected (401)
  test("4. Unauthorized access rejected with 401", async () => {
    const res = await request(app).get("/api/v1/dossier/analysis-test-1/pdf");
    expect(res.status).toBe(401);
  });

  // 5. Provenance preserved in PDF text
  test("5. Provenance preserved in generated PDF text", async () => {
    jest.spyOn(prisma.report, "findUnique").mockResolvedValue({
      id: "report-test-5",
      analysisId: "analysis-test-5",
      title: "Report 5",
      content: JSON.stringify(validDossierData),
      createdAt: new Date(),
      analysis: { spill: { id: "spill-test-5" } },
    });

    const res = await getBinaryPdf("/api/v1/dossier/analysis-test-5/pdf");
    const pdfData = await pdfParse(res.body);
    expect(pdfData.text).toContain("DEMO_AIS_CORRELATION");
  });

  // 6. Generation mode preserved
  test("6. Generation mode preserved (DETERMINISTIC)", async () => {
    jest.spyOn(prisma.report, "findUnique").mockResolvedValue({
      id: "report-test-6",
      analysisId: "analysis-test-6",
      title: "Report 6",
      content: JSON.stringify(validDossierData),
      createdAt: new Date(),
      analysis: { spill: { id: "spill-test-6" } },
    });

    const res = await getBinaryPdf("/api/v1/dossier/analysis-test-6/pdf");
    const pdfData = await pdfParse(res.body);
    expect(pdfData.text).toContain("DETERMINISTIC");
  });

  // 7. Dossier ID preserved
  test("7. Dossier ID preserved in PDF", async () => {
    jest.spyOn(prisma.report, "findUnique").mockResolvedValue({
      id: "report-test-7",
      analysisId: "analysis-test-7",
      title: "Report 7",
      content: JSON.stringify(validDossierData),
      createdAt: new Date(),
      analysis: { spill: { id: "spill-test-7" } },
    });

    const res = await getBinaryPdf("/api/v1/dossier/analysis-test-7/pdf");
    const pdfData = await pdfParse(res.body);
    expect(pdfData.text).toContain("OG-DOSSIER-TEST-001");
  });

  // 8. Schema version preserved
  test("8. Schema version preserved in PDF (OG-DOSSIER-V1)", async () => {
    jest.spyOn(prisma.report, "findUnique").mockResolvedValue({
      id: "report-test-8",
      analysisId: "analysis-test-8",
      title: "Report 8",
      content: JSON.stringify(validDossierData),
      createdAt: new Date(),
      analysis: { spill: { id: "spill-test-8" } },
    });

    const res = await getBinaryPdf("/api/v1/dossier/analysis-test-8/pdf");
    const pdfData = await pdfParse(res.body);
    expect(pdfData.text).toContain("OG-DOSSIER-V1");
  });

  // 9. Analytical correlation score preserved
  test("9. Analytical score preserved in PDF", async () => {
    jest.spyOn(prisma.report, "findUnique").mockResolvedValue({
      id: "report-test-9",
      analysisId: "analysis-test-9",
      title: "Report 9",
      content: JSON.stringify(validDossierData),
      createdAt: new Date(),
      analysis: { spill: { id: "spill-test-9" } },
    });

    const res = await getBinaryPdf("/api/v1/dossier/analysis-test-9/pdf");
    const pdfData = await pdfParse(res.body);
    expect(pdfData.text).toContain("ANALYTICAL_CORRELATION_SCORE");
    expect(pdfData.text).toContain("0.7462");
  });

  // 10. Score components preserved
  test("10. Score components preserved in PDF", async () => {
    jest.spyOn(prisma.report, "findUnique").mockResolvedValue({
      id: "report-test-10",
      analysisId: "analysis-test-10",
      title: "Report 10",
      content: JSON.stringify(validDossierData),
      createdAt: new Date(),
      analysis: { spill: { id: "spill-test-10" } },
    });

    const res = await getBinaryPdf("/api/v1/dossier/analysis-test-10/pdf");
    const pdfData = await pdfParse(res.body);
    expect(pdfData.text).toContain("Spatial: 0.81");
    expect(pdfData.text).toContain("Temporal: 0.72");
  });

  // 11. Legal responsibility remains NOT_ESTABLISHED
  test("11. Legal responsibility remains NOT_ESTABLISHED in PDF", async () => {
    jest.spyOn(prisma.report, "findUnique").mockResolvedValue({
      id: "report-test-11",
      analysisId: "analysis-test-11",
      title: "Report 11",
      content: JSON.stringify(validDossierData),
      createdAt: new Date(),
      analysis: { spill: { id: "spill-test-11" } },
    });

    const res = await getBinaryPdf("/api/v1/dossier/analysis-test-11/pdf");
    const pdfData = await pdfParse(res.body);
    expect(pdfData.text).toContain("LEGAL RESPONSIBILITY STATUS: NOT_ESTABLISHED");
  });

  // 12. Oil type remains NOT_ESTABLISHED
  test("12. Oil type remains NOT_ESTABLISHED in PDF", async () => {
    jest.spyOn(prisma.report, "findUnique").mockResolvedValue({
      id: "report-test-12",
      analysisId: "analysis-test-12",
      title: "Report 12",
      content: JSON.stringify(validDossierData),
      createdAt: new Date(),
      analysis: { spill: { id: "spill-test-12" } },
    });

    const res = await getBinaryPdf("/api/v1/dossier/analysis-test-12/pdf");
    const pdfData = await pdfParse(res.body);
    expect(pdfData.text).toContain("Oil type was not established from the available evidence.");
  });

  // 13. Volume remains NOT_ESTABLISHED
  test("13. Volume remains NOT_ESTABLISHED in PDF", async () => {
    jest.spyOn(prisma.report, "findUnique").mockResolvedValue({
      id: "report-test-13",
      analysisId: "analysis-test-13",
      title: "Report 13",
      content: JSON.stringify(validDossierData),
      createdAt: new Date(),
      analysis: { spill: { id: "spill-test-13" } },
    });

    const res = await getBinaryPdf("/api/v1/dossier/analysis-test-13/pdf");
    const pdfData = await pdfParse(res.body);
    expect(pdfData.text).toContain("Spill volume was not established from the available evidence.");
  });

  // 14. Modelled origin remains labelled MODELLED
  test("14. Modelled origin remains labelled MODELLED in PDF", async () => {
    jest.spyOn(prisma.report, "findUnique").mockResolvedValue({
      id: "report-test-14",
      analysisId: "analysis-test-14",
      title: "Report 14",
      content: JSON.stringify(validDossierData),
      createdAt: new Date(),
      analysis: { spill: { id: "spill-test-14" } },
    });

    const res = await getBinaryPdf("/api/v1/dossier/analysis-test-14/pdf");
    const pdfData = await pdfParse(res.body);
    expect(pdfData.text).toContain("MODELLED SPILL ORIGIN");
    expect(pdfData.text).not.toContain("Confirmed spill origin");
  });

  // 15. AIS candidate remains AIS Correlation Candidate
  test("15. Candidate vessel rendered as AIS Correlation Candidate", async () => {
    jest.spyOn(prisma.report, "findUnique").mockResolvedValue({
      id: "report-test-15",
      analysisId: "analysis-test-15",
      title: "Report 15",
      content: JSON.stringify(validDossierData),
      createdAt: new Date(),
      analysis: { spill: { id: "spill-test-15" } },
    });

    const res = await getBinaryPdf("/api/v1/dossier/analysis-test-15/pdf");
    const pdfData = await pdfParse(res.body);
    expect(pdfData.text).toContain("AIS CORRELATION CANDIDATES");
    expect(pdfData.text).toContain("MT PACIFIC BRAVO");
    expect(pdfData.text).not.toContain("Responsible Vessel");
  });

  // 16. Minimum historical distance is not mislabeled as dynamic CPA
  test("16. Proximity metric is not mislabeled as Dynamic CPA", async () => {
    jest.spyOn(prisma.report, "findUnique").mockResolvedValue({
      id: "report-test-16",
      analysisId: "analysis-test-16",
      title: "Report 16",
      content: JSON.stringify(validDossierData),
      createdAt: new Date(),
      analysis: { spill: { id: "spill-test-16" } },
    });

    const res = await getBinaryPdf("/api/v1/dossier/analysis-test-16/pdf");
    const pdfData = await pdfParse(res.body);
    expect(pdfData.text).toContain("isDynamicRelativeMotionCPA = false");
    expect(pdfData.text).toContain("Minimum Historical Distance to Modelled Origin");
  });

  // 17. Prohibited attribution language absent in generated PDF
  test("17. Prohibited attribution language absent in generated PDF", async () => {
    jest.spyOn(prisma.report, "findUnique").mockResolvedValue({
      id: "report-test-17",
      analysisId: "analysis-test-17",
      title: "Report 17",
      content: JSON.stringify(validDossierData),
      createdAt: new Date(),
      analysis: { spill: { id: "spill-test-17" } },
    });

    const res = await getBinaryPdf("/api/v1/dossier/analysis-test-17/pdf");
    const pdfData = await pdfParse(res.body);
    const upperText = pdfData.text.toUpperCase();
    expect(upperText).not.toContain("GUILTY_VESSEL");
    expect(upperText).not.toContain("CAUSED_SPILL");
    expect(upperText).not.toContain("PROBABILITY_OF_GUILT");
  });

  // 18. Demo provenance clearly displayed
  test("18. Demo provenance notice clearly displayed", async () => {
    jest.spyOn(prisma.report, "findUnique").mockResolvedValue({
      id: "report-test-18",
      analysisId: "analysis-test-18",
      title: "Report 18",
      content: JSON.stringify(validDossierData),
      createdAt: new Date(),
      analysis: { spill: { id: "spill-test-18" } },
    });

    const res = await getBinaryPdf("/api/v1/dossier/analysis-test-18/pdf");
    const pdfData = await pdfParse(res.body);
    expect(pdfData.text).toContain("DEMONSTRATION EVIDENCE");
  });

  // 19. EvidenceRefs preserved
  test("19. Evidence traceability and canonical refs rendered", async () => {
    jest.spyOn(prisma.report, "findUnique").mockResolvedValue({
      id: "report-test-19",
      analysisId: "analysis-test-19",
      title: "Report 19",
      content: JSON.stringify(validDossierData),
      createdAt: new Date(),
      analysis: { spill: { id: "spill-test-19" } },
    });

    const res = await getBinaryPdf("/api/v1/dossier/analysis-test-19/pdf");
    const pdfData = await pdfParse(res.body);
    expect(pdfData.text).toContain("EVIDENCE TRACEABILITY");
    expect(pdfData.text).toContain("geospatialEvidence.surfaceAreaKm2");
    expect(pdfData.text).toContain("OG-CANONICAL-EVIDENCE-CONTRACT-V1.0");
  });

  // 20. PDF has required sections
  test("20. PDF has required structural sections", async () => {
    jest.spyOn(prisma.report, "findUnique").mockResolvedValue({
      id: "report-test-20",
      analysisId: "analysis-test-20",
      title: "Report 20",
      content: JSON.stringify(validDossierData),
      createdAt: new Date(),
      analysis: { spill: { id: "spill-test-20" } },
    });

    const res = await getBinaryPdf("/api/v1/dossier/analysis-test-20/pdf");
    const pdfData = await pdfParse(res.body);
    expect(pdfData.text).toContain("1. EXECUTIVE SUMMARY");
    expect(pdfData.text).toContain("2. EVIDENCE PROVENANCE & INTEGRITY");
    expect(pdfData.text).toContain("3. SPILL DETECTION EVIDENCE (SAR)");
    expect(pdfData.text).toContain("4. GEOSPATIAL & SPILL GEOMETRY");
    expect(pdfData.text).toContain("5. METOCEAN FORCING & MODELLED DRIFT");
    expect(pdfData.text).toContain("6. AIS TELEMETRY & TRAJECTORY CORRELATION");
    expect(pdfData.text).toContain("7. AIS CORRELATION CANDIDATES");
    expect(pdfData.text).toContain("8. ANALYTICAL CORRELATION SCORE");
    expect(pdfData.text).toContain("9. EVIDENCE TIMELINE");
    expect(pdfData.text).toContain("10. SCIENTIFIC LIMITATIONS");
    expect(pdfData.text).toContain("11. OIL TYPE & VOLUME STATUS");
    expect(pdfData.text).toContain("12. LEGAL RESPONSIBILITY STATUS");
    expect(pdfData.text).toContain("13. EVIDENCE TRACEABILITY");
    expect(pdfData.text).toContain("14. METHODOLOGY & PIPELINE SUMMARY");
    expect(pdfData.text).toContain("15. REPORT METADATA & AUDIT LEDGER");
  });

  // 21. No credentials or secrets in PDF
  test("21. No credentials, API keys or secret tokens in PDF", async () => {
    jest.spyOn(prisma.report, "findUnique").mockResolvedValue({
      id: "report-test-21",
      analysisId: "analysis-test-21",
      title: "Report 21",
      content: JSON.stringify(validDossierData),
      createdAt: new Date(),
      analysis: { spill: { id: "spill-test-21" } },
    });

    const res = await getBinaryPdf("/api/v1/dossier/analysis-test-21/pdf");
    const pdfData = await pdfParse(res.body);
    expect(pdfData.text).not.toContain("test-jwt-secret");
    expect(pdfData.text).not.toContain("API_KEY");
    expect(pdfData.text).not.toContain("Bearer ");
  });

  // 22. PDF generation performance benchmark
  test("22. PDF generation performance benchmark executes under 1000ms", async () => {
    const t0 = Date.now();
    const pdfBuffer = await dossierPdfService.generatePdf({
      dossier: validDossierData,
      dossierId: "OG-DOSSIER-BENCHMARK-001",
      analysisId: "analysis-benchmark-001",
      title: "Benchmark Test Incident",
      createdAt: new Date().toISOString(),
    });
    const t1 = Date.now();
    const duration = t1 - t0;

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);
    expect(duration).toBeLessThan(1000);
  });
});
