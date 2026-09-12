const fs = require("fs");
const path = require("path");
const prisma = require("../db/database");
const evidenceService = require("./evidence.service");
const llmService = require("./llm.service");
const AppError = require("../errors/AppError");
const logger = require("../logger");

const MANDATORY_DISCLAIMER =
  "Attribution scores represent modelled spatial, temporal, and trajectory correlations from available AIS and SAR-derived information. They do not establish legal responsibility, causation, or proof of pollution by any vessel. AIS records used in this demonstration are synthetic/demo records and do not represent actual historical vessel movements.";

/**
 * DossierService — Orchestrates structured evidence extraction, LLM synthesis, validation, and persistence.
 */
class DossierService {
  constructor() {
    this.promptsDir = path.resolve(__dirname, "../../../../prompts");
  }

  /**
   * Load prompt templates from markdown files.
   */
  _loadPrompts() {
    try {
      const systemPrompt = fs.existsSync(path.join(this.promptsDir, "dossier-system.md"))
        ? fs.readFileSync(path.join(this.promptsDir, "dossier-system.md"), "utf8")
        : "You are an analytical evidence synthesis assistant. Summarize only supplied evidence.";

      const summaryPrompt = fs.existsSync(path.join(this.promptsDir, "dossier-summary.md"))
        ? fs.readFileSync(path.join(this.promptsDir, "dossier-summary.md"), "utf8")
        : "";

      const candidatePrompt = fs.existsSync(path.join(this.promptsDir, "candidate-analysis.md"))
        ? fs.readFileSync(path.join(this.promptsDir, "candidate-analysis.md"), "utf8")
        : "";

      const limitationsPrompt = fs.existsSync(path.join(this.promptsDir, "limitations.md"))
        ? fs.readFileSync(path.join(this.promptsDir, "limitations.md"), "utf8")
        : "";

      return {
        systemPrompt: [systemPrompt, summaryPrompt, candidatePrompt, limitationsPrompt].join("\n\n"),
      };
    } catch (err) {
      logger.warn("Failed to load custom prompt files, using default prompts", { error: err.message });
      return {
        systemPrompt: "You are an analytical evidence synthesis assistant. Summarize only supplied evidence. Never invent missing data or infer legal responsibility.",
      };
    }
  }

  /**
   * Validate that the dossier object complies strictly with required schema.
   * @param {Object} dossier
   */
  validateDossierSchema(dossier) {
    if (!dossier || typeof dossier !== "object") {
      throw new AppError(502, "INVALID_DOSSIER_FORMAT", "LLM output is not a valid JSON object");
    }

    if (!dossier.executiveSummary || typeof dossier.executiveSummary !== "string") {
      throw new AppError(502, "INVALID_DOSSIER_FORMAT", "Dossier is missing 'executiveSummary' string");
    }

    if (!Array.isArray(dossier.observedEvidence)) {
      throw new AppError(502, "INVALID_DOSSIER_FORMAT", "Dossier is missing 'observedEvidence' array");
    }

    if (!Array.isArray(dossier.modelledEvidence)) {
      throw new AppError(502, "INVALID_DOSSIER_FORMAT", "Dossier is missing 'modelledEvidence' array");
    }

    if (!Array.isArray(dossier.candidateAssessments)) {
      throw new AppError(502, "INVALID_DOSSIER_FORMAT", "Dossier is missing 'candidateAssessments' array");
    }

    if (!Array.isArray(dossier.timeline)) {
      throw new AppError(502, "INVALID_DOSSIER_FORMAT", "Dossier is missing 'timeline' array");
    }

    if (!Array.isArray(dossier.limitations)) {
      throw new AppError(502, "INVALID_DOSSIER_FORMAT", "Dossier is missing 'limitations' array");
    }

    if (!Array.isArray(dossier.recommendedFollowUp)) {
      throw new AppError(502, "INVALID_DOSSIER_FORMAT", "Dossier is missing 'recommendedFollowUp' array");
    }

    // Always enforce the verbatim mandatory disclaimer
    dossier.disclaimer = MANDATORY_DISCLAIMER;

    return true;
  }

  /**
   * Generate an Analytical Investigation Dossier for an analysis/spill.
   * @param {string} identifier - analysisId or spillId
   * @param {string} userId - Optional user ID requesting the dossier
   * @returns {Promise<Object>} Formatted dossier and persisted report
   */
  async generateDossier(identifier, userId = null) {
    logger.info("Generating Analytical Investigation Dossier", { identifier, userId });

    // 1. Obtain structured evidence
    const evidence = await evidenceService.getStructuredEvidence(identifier);

    // 2. Load prompt templates
    const promptContext = this._loadPrompts();

    // 3. Synthesize narrative using LLM service
    let dossier = await llmService.generateDossier(evidence, promptContext);

    // 4. Validate output
    try {
      this.validateDossierSchema(dossier);
    } catch (validationErr) {
      logger.error("Structured LLM validation failed, falling back to deterministic synthesis", {
        error: validationErr.message,
      });
      dossier = llmService._generateDeterministicMockDossier(evidence);
      this.validateDossierSchema(dossier);
    }

    // Attach structured evidence metadata for complete traceability
    dossier.analysisId = evidence.analysisId;
    dossier.spillId = evidence.spillId;
    dossier.evidence = evidence;

    const title = `Analytical Investigation Dossier — Incident #${evidence.spillId.slice(0, 8)}`;
    const content = JSON.stringify(dossier);

    const updateData = {
      title,
      content,
    };

    const createData = {
      analysis: { connect: { id: evidence.analysisId } },
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
      where: { analysisId: evidence.analysisId },
      update: updateData,
      create: createData,
    });

    logger.info("Analytical Investigation Dossier successfully persisted", {
      reportId: report.id,
      analysisId: evidence.analysisId,
    });

    return {
      reportId: report.id,
      analysisId: evidence.analysisId,
      spillId: evidence.spillId,
      title: report.title,
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
      // Fallback for raw text reports
      parsedDossier = {
        executiveSummary: report.content,
        observedEvidence: [],
        modelledEvidence: [],
        candidateAssessments: [],
        timeline: [],
        limitations: [],
        recommendedFollowUp: [],
        disclaimer: MANDATORY_DISCLAIMER,
      };
    }

    return {
      reportId: report.id,
      analysisId: report.analysisId,
      spillId: report.analysis?.spill?.id || null,
      title: report.title,
      createdAt: report.createdAt,
      dossier: parsedDossier,
    };
  }
}

module.exports = new DossierService();
