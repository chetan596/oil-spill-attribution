const prisma = require("../db/database");
const evidenceService = require("./evidence.service");
const mlClient = require("../clients/ml.client");
const dossierPdfService = require("./dossier-pdf.service");
const AppError = require("../errors/AppError");
const logger = require("../logger");

const DOSSIER_SCHEMA_VERSION = "OG-DOSSIER-V1";
const EVIDENCE_RELEASE = "OG-SAR-ML-RESEARCH-RELEASE-V0.12";

const PROHIBITED_ATTRIBUTION_TERMS = [
  "RESPONSIBLE_VESSEL",
  "CONFIRMED_VESSEL",
  "GUILTY_VESSEL",
  "CAUSED_SPILL",
  "PROBABILITY_OF_GUILT",
  "ATTRIBUTION_CONFIDENCE_SCORE",
  "DISCHARGE_PROBABILITY",
];

const MANDATORY_DISCLAIMER =
  "Attribution candidate ranking represents exploratory physical/spatial correlation with the " +
  "modelled backward drift corridor. It does NOT constitute legal proof of spill discharge or vessel liability.";

/**
 * Recursively scans data structure for prohibited attribution terms, ignoring definition keys.
 */
function scanNoProhibitedTerms(data, path = "") {
  if (
    path.endsWith("prohibitedAttributionTerms") ||
    path.endsWith("strictlyProhibitedActions") ||
    path.includes("prohibitedAttributionTerms") ||
    path.includes("strictlyProhibitedActions")
  ) {
    return;
  }

  if (typeof data === "string") {
    const upper = data.toUpperCase();
    for (const term of PROHIBITED_ATTRIBUTION_TERMS) {
      if (upper.includes(term)) {
        throw new AppError(
          502,
          "GUARDRAIL_VIOLATION",
          `Violation of Scientific Guardrails: Prohibited attribution term '${term}' found at '${path}'`
        );
      }
    }
  } else if (Array.isArray(data)) {
    data.forEach((item, idx) => scanNoProhibitedTerms(item, `${path}[${idx}]`));
  } else if (data && typeof data === "object") {
    for (const [k, v] of Object.entries(data)) {
      scanNoProhibitedTerms(v, path ? `${path}.${k}` : k);
    }
  }
}

/**
 * DossierService — Orchestrates canonical evidence transmission to Python 0.13F,
 * schema validation, persistence, and retrieval.
 *
 * MANDATORY ARCHITECTURAL RULES (Part 0.13G):
 * 1. Python ML Service 0.13F is the SINGLE SOURCE OF TRUTH for dossier synthesis.
 * 2. Node.js MUST NOT calculate scientific values or generate alternative deterministic narrative.
 * 3. If Python service fails, Node returns a controlled error without fabricating a second dossier.
 */
class DossierService {
  /**
   * Validate that the dossier strictly complies with OG-DOSSIER-V1 contract.
   * @param {Object} dossier
   */
  validateDossierContract(dossier) {
    if (!dossier || typeof dossier !== "object") {
      throw new AppError(502, "INVALID_DOSSIER_SCHEMA", "Dossier output is not a valid JSON object");
    }

    if (dossier.schemaVersion !== DOSSIER_SCHEMA_VERSION) {
      throw new AppError(
        502,
        "INVALID_DOSSIER_SCHEMA",
        `Dossier schemaVersion must be '${DOSSIER_SCHEMA_VERSION}', received '${dossier.schemaVersion}'`
      );
    }

    if (dossier.evidenceRelease !== EVIDENCE_RELEASE) {
      throw new AppError(
        502,
        "INVALID_DOSSIER_SCHEMA",
        `Dossier evidenceRelease must be '${EVIDENCE_RELEASE}', received '${dossier.evidenceRelease}'`
      );
    }

    if (!dossier.provenance || typeof dossier.provenance !== "object") {
      throw new AppError(502, "INVALID_DOSSIER_SCHEMA", "Dossier is missing 'provenance' object");
    }

    if (!dossier.generationMode || !["LLM", "DETERMINISTIC"].includes(dossier.generationMode)) {
      throw new AppError(
        502,
        "INVALID_DOSSIER_SCHEMA",
        `Dossier generationMode must be 'LLM' or 'DETERMINISTIC', received '${dossier.generationMode}'`
      );
    }

    if (!dossier.executiveSummary || typeof dossier.executiveSummary !== "string") {
      throw new AppError(502, "INVALID_DOSSIER_SCHEMA", "Dossier is missing 'executiveSummary' string");
    }

    if (!dossier.spillDetection || typeof dossier.spillDetection !== "object") {
      throw new AppError(502, "INVALID_DOSSIER_SCHEMA", "Dossier is missing 'spillDetection' object");
    }

    if (!dossier.geospatialEvidence || typeof dossier.geospatialEvidence !== "object") {
      throw new AppError(502, "INVALID_DOSSIER_SCHEMA", "Dossier is missing 'geospatialEvidence' object");
    }

    if (!dossier.driftEvidence || typeof dossier.driftEvidence !== "object") {
      throw new AppError(502, "INVALID_DOSSIER_SCHEMA", "Dossier is missing 'driftEvidence' object");
    }

    if (!dossier.aisEvidence || typeof dossier.aisEvidence !== "object") {
      throw new AppError(502, "INVALID_DOSSIER_SCHEMA", "Dossier is missing 'aisEvidence' object");
    }

    if (!dossier.analyticalCorrelation || typeof dossier.analyticalCorrelation !== "object") {
      throw new AppError(502, "INVALID_DOSSIER_SCHEMA", "Dossier is missing 'analyticalCorrelation' object");
    }

    if (!Array.isArray(dossier.timeline)) {
      throw new AppError(502, "INVALID_DOSSIER_SCHEMA", "Dossier is missing 'timeline' array");
    }

    if (!Array.isArray(dossier.scientificLimitations)) {
      throw new AppError(502, "INVALID_DOSSIER_SCHEMA", "Dossier is missing 'scientificLimitations' array");
    }

    if (!dossier.oilTypeAndVolume || typeof dossier.oilTypeAndVolume !== "object") {
      throw new AppError(502, "INVALID_DOSSIER_SCHEMA", "Dossier is missing 'oilTypeAndVolume' object");
    }

    // Verify NOT_ESTABLISHED preservation
    if (dossier.oilTypeAndVolume.oilTypeStatus !== "NOT_ESTABLISHED") {
      throw new AppError(502, "INVALID_DOSSIER_SCHEMA", "oilTypeStatus must remain NOT_ESTABLISHED");
    }
    if (dossier.oilTypeAndVolume.volumeStatus !== "NOT_ESTABLISHED") {
      throw new AppError(502, "INVALID_DOSSIER_SCHEMA", "volumeStatus must remain NOT_ESTABLISHED");
    }

    if (!dossier.legalResponsibility || typeof dossier.legalResponsibility !== "object") {
      throw new AppError(502, "INVALID_DOSSIER_SCHEMA", "Dossier is missing 'legalResponsibility' object");
    }

    if (dossier.legalResponsibility.status !== "NOT_ESTABLISHED") {
      throw new AppError(
        502,
        "LEGAL_GUARDRAIL_VIOLATION",
        `legalResponsibility.status must be 'NOT_ESTABLISHED', received '${dossier.legalResponsibility.status}'`
      );
    }

    // Scan for prohibited terminology across the entire dossier
    scanNoProhibitedTerms(dossier);

    // Enforce mandatory disclaimer
    dossier.disclaimer = MANDATORY_DISCLAIMER;

    return true;
  }

  /**
   * Synthesize and persist an Analytical Investigation Dossier for an analysis/spill.
   * Calls Python ML Service Part 0.13F as the authoritative synthesis engine.
   *
   * @param {string} identifier - analysisId or spillId
   * @param {string} userId - Optional user ID requesting synthesis
   * @param {Object} options - Optional provider/model configuration
   * @returns {Promise<Object>} Validated dossier and persisted report details
   */
  async generateDossier(identifier, userId = null, options = {}) {
    logger.info("Generating Analytical Investigation Dossier via Python 0.13F", { identifier, userId });

    // 1. Obtain authoritative canonical evidence package from database records
    const canonicalEvidence = await evidenceService.getStructuredEvidence(identifier);

    // 2. Request synthesis from Python 0.13F service
    let synthesisResponse;
    try {
      synthesisResponse = await mlClient.synthesizeDossier({
        canonical_evidence: canonicalEvidence,
        provider: options.provider || process.env.LLM_PROVIDER || "mock",
        model: options.model || process.env.LLM_MODEL || "gemini-1.5-pro",
        temperature: options.temperature !== undefined ? options.temperature : 0.1,
      });
    } catch (err) {
      logger.error("Python 0.13F dossier synthesis service failed", {
        error: err.message,
        identifier,
      });
      throw new AppError(
        502,
        "DOSSIER_GENERATION_FAILED",
        `Authoritative Python dossier synthesis service failed: ${err.message}`
      );
    }

    const dossier = synthesisResponse?.dossier;
    if (!dossier) {
      throw new AppError(502, "DOSSIER_GENERATION_FAILED", "Python service returned empty dossier response");
    }

    // 3. Validate OG-DOSSIER-V1 schema, provenance, generationMode, and legal guardrails
    this.validateDossierContract(dossier);

    // 4. Attach lineage metadata
    const analysisId = canonicalEvidence.analysisId;
    const spillId = canonicalEvidence.spillId;
    const dossierId = `OG-DOSSIER-${analysisId.slice(0, 8).toUpperCase()}`;

    dossier.dossierId = dossierId;
    dossier.analysisId = analysisId;
    dossier.spillId = spillId;
    dossier.status = "READY";

    const title = `Analytical Investigation Dossier — Incident #${spillId.slice(0, 8)}`;
    const content = JSON.stringify(dossier);

    const updateData = {
      title,
      content,
    };

    const createData = {
      analysis: { connect: { id: analysisId } },
      title,
      content,
    };

    if (userId) {
      try {
        const userExists = await prisma.user.findUnique({ where: { id: userId } });
        if (userExists) {
          updateData.user = { connect: { id: userId } };
          createData.user = { connect: { id: userId } };
        }
      } catch {
        // User lookup failed, proceed without user relation
      }
    }

    // 5. Persist to PostgreSQL Report model
    const report = await prisma.report.upsert({
      where: { analysisId },
      update: updateData,
      create: createData,
    });

    logger.info("Analytical Investigation Dossier successfully validated and persisted", {
      reportId: report.id,
      dossierId,
      analysisId,
      generationMode: dossier.generationMode,
      provenance: dossier.provenance?.combinationStatus,
    });

    return {
      reportId: report.id,
      dossierId,
      analysisId,
      spillId,
      title: report.title,
      status: "READY",
      createdAt: report.createdAt,
      dossier,
    };
  }

  /**
   * Retrieve an existing persisted dossier for an analysis.
   * @param {string} analysisId
   * @returns {Promise<Object>} Persisted dossier object
   */
  async getDossier(analysisId) {
    if (!analysisId) {
      throw new AppError(400, "INVALID_ANALYSIS_ID", "Analysis ID is required");
    }

    const report = await prisma.report.findUnique({
      where: { analysisId },
      include: {
        analysis: {
          include: {
            spill: true,
          },
        },
      },
    });

    if (!report) {
      throw AppError.notFound("Analytical Investigation Dossier");
    }

    let parsedDossier = null;
    try {
      parsedDossier = JSON.parse(report.content);
    } catch {
      throw new AppError(500, "CORRUPT_DOSSIER_DATA", "Persisted dossier content is not valid JSON");
    }

    const dossierId = parsedDossier.dossierId || `OG-DOSSIER-${analysisId.slice(0, 8).toUpperCase()}`;

    return {
      reportId: report.id,
      dossierId,
      analysisId: report.analysisId,
      spillId: report.analysis?.spill?.id || null,
      title: report.title,
      status: "READY",
      createdAt: report.createdAt,
      dossier: parsedDossier,
    };
  }

  /**
   * List all persisted investigation dossiers for archive view.
   * @returns {Promise<Array<Object>>} List of dossier summary records
   */
  async listDossiers() {
    const reports = await prisma.report.findMany({
      include: {
        analysis: {
          include: {
            spill: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return reports.map((report) => {
      let parsed = null;
      try {
        parsed = JSON.parse(report.content);
      } catch {
        parsed = {};
      }

      const dossierId = parsed?.dossierId || `OG-DOSSIER-${report.analysisId.slice(0, 8).toUpperCase()}`;

      return {
        dossierId,
        reportId: report.id,
        analysisId: report.analysisId,
        spillId: report.analysis?.spill?.id || null,
        title: report.title,
        schemaVersion: parsed?.schemaVersion || DOSSIER_SCHEMA_VERSION,
        evidenceRelease: parsed?.evidenceRelease || EVIDENCE_RELEASE,
        generationMode: parsed?.generationMode || "DETERMINISTIC",
        provenance: parsed?.provenance || { combinationStatus: "DEMO" },
        status: "READY",
        createdAt: report.createdAt,
      };
    });
  }

  /**
   * Generate a formal PDF document from a persisted OG-DOSSIER-V1 artifact.
   * @param {string} analysisId
   * @returns {Promise<{ pdfBuffer: Buffer, filename: string, dossierId: string }>}
   */
  async generateDossierPdf(analysisId) {
    if (!analysisId) {
      throw new AppError(400, "INVALID_ANALYSIS_ID", "Analysis ID is required for PDF generation");
    }

    // 1. Retrieve authoritative persisted dossier
    const dossierRecord = await this.getDossier(analysisId);

    // 2. Validate contract before PDF rendering
    this.validateDossierContract(dossierRecord.dossier);

    // 3. Delegate to presentation layer PDF generator
    const pdfBuffer = await dossierPdfService.generatePdf(dossierRecord);
    const filename = `${dossierRecord.dossierId || `OG-DOSSIER-${analysisId.slice(0, 8)}`}.pdf`;

    return {
      pdfBuffer,
      filename,
      dossierId: dossierRecord.dossierId,
      analysisId,
    };
  }
}

module.exports = new DossierService();
