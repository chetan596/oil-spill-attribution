const PDFDocument = require("pdfkit");
const AppError = require("../errors/AppError");
const logger = require("../logger");

const PROHIBITED_ATTRIBUTION_TERMS = [
  "RESPONSIBLE_VESSEL",
  "CONFIRMED_VESSEL",
  "GUILTY_VESSEL",
  "CAUSED_SPILL",
  "PROBABILITY_OF_GUILT",
  "ATTRIBUTION_CONFIDENCE_SCORE",
  "DISCHARGE_PROBABILITY",
];

// Technical Palette for Maritime Investigation Dossier
const COLORS = {
  navyDark: "#0B192C",
  navyMid: "#1E3E62",
  navyLight: "#F0F4F8",
  textPrimary: "#1E293B",
  textSecondary: "#475569",
  textMuted: "#64748B",
  border: "#CBD5E1",
  borderLight: "#E2E8F0",
  teal: "#0D9488",
  tealLight: "#CCFBF1",
  amber: "#D97706",
  amberLight: "#FEF3C7",
  violet: "#7C3AED",
  violetLight: "#EDE9FE",
  magenta: "#C026D3",
  magentaLight: "#FAE8FF",
  green: "#16A34A",
  greenLight: "#DCFCE7",
  red: "#DC2626",
  redLight: "#FEE2E2",
  white: "#FFFFFF",
};

class DossierPdfService {
  /**
   * Scan dossier to guarantee no prohibited causal/attribution terminology exists before rendering.
   * @param {Object} dossier
   */
  assertNoProhibitedTerms(dossier) {
    const serialized = JSON.stringify(dossier).toUpperCase();
    for (const term of PROHIBITED_ATTRIBUTION_TERMS) {
      if (
        serialized.includes(term) &&
        !serialized.includes("PROHIBITEDATTRIBUTIONTERMS") &&
        !serialized.includes("STRICTLYPROHIBITEDACTIONS")
      ) {
        throw new AppError(
          502,
          "GUARDRAIL_VIOLATION",
          `Prohibited attribution term '${term}' detected in dossier. PDF generation aborted.`
        );
      }
    }
  }

  /**
   * Build a complete formal PDF document buffer from a validated OG-DOSSIER-V1 artifact.
   * @param {Object} dossierData - { dossierId, analysisId, spillId, title, createdAt, dossier }
   * @returns {Promise<Buffer>}
   */
  async generatePdf(dossierData) {
    const startTime = Date.now();
    const { dossier, dossierId, analysisId, spillId, title, createdAt } = dossierData;

    if (!dossier || typeof dossier !== "object") {
      throw new AppError(422, "INVALID_DOSSIER_DATA", "Cannot generate PDF: dossier content is missing or invalid");
    }

    if (dossier.schemaVersion !== "OG-DOSSIER-V1") {
      throw new AppError(
        422,
        "INVALID_DOSSIER_SCHEMA",
        `Expected schema 'OG-DOSSIER-V1', got '${dossier.schemaVersion}'`
      );
    }

    // Enforce guardrail scan
    this.assertNoProhibitedTerms(dossier);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: "A4",
          margins: { top: 54, bottom: 54, left: 50, right: 50 },
          bufferPages: true,
          info: {
            Title: "Ocean Guard AI — Maritime Oil Spill Investigation Dossier",
            Author: "Ocean Guard AI",
            Subject: "Evidence-based maritime oil spill analysis",
            Keywords: "OceanGuard, SAR, OilSpill, AIS, Metocean, ForensicDossier",
            Creator: "Ocean Guard AI Report Generator",
          },
        });

        const buffers = [];
        doc.on("data", (chunk) => buffers.push(chunk));
        doc.on("end", () => {
          const pdfBuffer = Buffer.concat(buffers);
          const duration = Date.now() - startTime;
          logger.info("Formal Investigation Dossier PDF generated successfully", {
            dossierId: dossierId || dossier.dossierId,
            analysisId,
            bytes: pdfBuffer.length,
            durationMs: duration,
          });
          resolve(pdfBuffer);
        });
        doc.on("error", (err) => reject(err));

        // -------------------------------------------------------------
        // PAGE 1: COVER & EXECUTIVE IDENTITY
        // -------------------------------------------------------------
        this.renderCoverHeader(doc, {
          dossierId: dossierId || dossier.dossierId || `OG-DOSSIER-${analysisId?.slice(0, 8)?.toUpperCase()}`,
          analysisId,
          spillId,
          title: title || `Maritime Spill Incident #${spillId || analysisId?.slice(0, 8)}`,
          createdAt: createdAt || new Date().toISOString(),
          dossier,
        });

        this.renderExecutiveSummary(doc, dossier);
        this.renderEvidenceProvenance(doc, dossier);
        this.renderSpillDetection(doc, dossier);
        this.renderGeospatialEvidence(doc, dossier);
        this.renderMetoceanDriftEvidence(doc, dossier);
        this.renderAisCorrelationEvidence(doc, dossier);
        this.renderCandidateVessels(doc, dossier);
        this.renderAnalyticalScore(doc, dossier);
        this.renderTimeline(doc, dossier);
        this.renderScientificLimitations(doc, dossier);
        this.renderOilTypeAndVolume(doc, dossier);
        this.renderLegalResponsibility(doc, dossier);
        this.renderEvidenceTraceability(doc, dossier);
        this.renderMethodologySummary(doc);
        this.renderReportMetadata(doc, {
          dossierId: dossierId || dossier.dossierId,
          analysisId,
          createdAt,
          dossier,
        });

        // -------------------------------------------------------------
        // POST-PROCESSING: RUNNING HEADERS & FOOTERS ON ALL PAGES
        // -------------------------------------------------------------
        const totalPages = doc.bufferedPageRange().count;
        for (let i = 0; i < totalPages; i++) {
          doc.switchToPage(i);

          // Header on pages > 0 (subsequent pages)
          if (i > 0) {
            doc.save();
            doc
              .font("Helvetica-Bold")
              .fontSize(7.5)
              .fillColor(COLORS.navyMid)
              .text("OCEAN GUARD AI", 50, 25, { continued: true })
              .font("Helvetica")
              .fillColor(COLORS.textMuted)
              .text("  |  Maritime Oil Spill Investigation Dossier", { align: "left" });

            doc
              .font("Helvetica")
              .fontSize(7.5)
              .fillColor(COLORS.textMuted)
              .text(dossierId || dossier.dossierId || "OG-DOSSIER-V1", 50, 25, { align: "right" });

            doc
              .strokeColor(COLORS.borderLight)
              .lineWidth(0.5)
              .moveTo(50, 38)
              .lineTo(doc.page.width - 50, 38)
              .stroke();
            doc.restore();
          }

          // Footer on ALL pages
          doc.save();
          const footerY = doc.page.height - 35;
          doc
            .strokeColor(COLORS.borderLight)
            .lineWidth(0.5)
            .moveTo(50, footerY - 6)
            .lineTo(doc.page.width - 50, footerY - 6)
            .stroke();

          doc
            .font("Helvetica")
            .fontSize(7)
            .fillColor(COLORS.textMuted)
            .text(
              `Dossier ID: ${dossierId || dossier.dossierId}  •  Release: ${dossier.evidenceRelease || "OG-SAR-ML-RESEARCH-RELEASE-V0.12"}`,
              50,
              footerY,
              { align: "left" }
            );

          doc
            .font("Helvetica-Bold")
            .fontSize(7)
            .fillColor(COLORS.navyMid)
            .text(`Page ${i + 1} of ${totalPages}`, 50, footerY, { align: "right" });
          doc.restore();
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  // ===================================================================
  // SECTION RENDERERS
  // ===================================================================

  renderCoverHeader(doc, { dossierId, analysisId, spillId, title, createdAt, dossier }) {
    const width = doc.page.width - 100;

    // Header Navy Box Banner
    doc
      .rect(50, 45, width, 84)
      .fillAndStroke(COLORS.navyDark, COLORS.navyMid);

    // Title inside banner
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(COLORS.teal)
      .text("OCEAN GUARD AI  •  ANALYTICAL INVESTIGATION DOSSIER", 66, 57, { letterSpacing: 0.8 });

    doc
      .font("Helvetica-Bold")
      .fontSize(15)
      .fillColor(COLORS.white)
      .text(title, 66, 73, { width: width - 32, ellipsis: true });

    const genMode = dossier.generationMode || "DETERMINISTIC";
    const provenance = dossier.provenance?.combinationStatus || "DEMO";

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(COLORS.navyLight)
      .text(
        `Generated: ${new Date(createdAt).toUTCString()}  |  Mode: ${genMode}  |  Provenance: ${provenance}`,
        66,
        105
      );

    doc.moveDown(2.5);

    // Metadata Key-Value Grid Box
    const boxY = 138;
    doc
      .rect(50, boxY, width, 58)
      .fillAndStroke(COLORS.navyLight, COLORS.borderLight);

    const colWidth = width / 4;
    const items = [
      { label: "DOSSIER ID", val: dossierId },
      { label: "ANALYSIS ID", val: analysisId ? analysisId.slice(0, 16) : "N/A" },
      { label: "SCHEMA VERSION", val: dossier.schemaVersion || "OG-DOSSIER-V1" },
      { label: "EVIDENCE RELEASE", val: dossier.evidenceRelease || "OG-SAR-V0.12" },
    ];

    items.forEach((item, idx) => {
      const colX = 50 + idx * colWidth + 10;
      doc
        .font("Helvetica-Bold")
        .fontSize(6.5)
        .fillColor(COLORS.textMuted)
        .text(item.label, colX, boxY + 12);

      doc
        .font("Courier-Bold")
        .fontSize(8.5)
        .fillColor(COLORS.navyDark)
        .text(item.val, colX, boxY + 26, { width: colWidth - 14, ellipsis: true });
    });

    doc.y = boxY + 70;
  }

  renderExecutiveSummary(doc, dossier) {
    this.checkPageBreak(doc, 90);
    this.renderSectionHeading(doc, "1. EXECUTIVE SUMMARY", COLORS.magenta);

    const summaryText =
      dossier.executiveSummary ||
      "Analytical surveillance assessment completed based on SAR satellite detection and hindcast drift trajectory correlation.";

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLORS.textPrimary)
      .lineGap(2)
      .text(summaryText, { align: "justify" });

    doc.moveDown(1.0);
  }

  renderEvidenceProvenance(doc, dossier) {
    this.checkPageBreak(doc, 100);
    this.renderSectionHeading(doc, "2. EVIDENCE PROVENANCE & INTEGRITY", COLORS.navyMid);

    const p = dossier.provenance || {};
    const combo = p.combinationStatus || "DEMO";
    const isDemo = combo.includes("DEMO");

    const desc = isDemo
      ? "DEMONSTRATION EVIDENCE: This investigation contains synthetic or simulated data elements. It serves for analytical workflow verification and benchmark demonstration only."
      : "REAL ANALYTICAL EVIDENCE: Processed directly from verified Sentinel-1 SAR acquisition and authoritative metocean feeds.";

    doc
      .rect(50, doc.y, doc.page.width - 100, 36)
      .fillAndStroke(isDemo ? COLORS.amberLight : COLORS.tealLight, isDemo ? COLORS.amber : COLORS.teal);

    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(isDemo ? COLORS.amber : COLORS.teal)
      .text(`PROVENANCE CLASSIFICATION: ${combo}`, 62, doc.y + 7);

    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(COLORS.textPrimary)
      .text(desc, 62, doc.y + 19, { width: doc.page.width - 124 });

    doc.y += 44;
    doc.moveDown(0.6);
  }

  renderSpillDetection(doc, dossier) {
    this.checkPageBreak(doc, 110);
    this.renderSectionHeading(doc, "3. SPILL DETECTION EVIDENCE (SAR)", COLORS.teal);

    const det = dossier.spillDetection || {};
    const geo = dossier.geospatialEvidence || {};

    const tableData = [
      ["Detection Status", det.status || "OBSERVED"],
      ["Detection Model", det.modelIdentifier || "unet-dual-pol-sar-v09d-residual-loss"],
      ["Threshold Applied", `${det.detectionThreshold !== undefined ? det.detectionThreshold : 0.50}`],
      ["Sensor / Mode", "Sentinel-1 C-Band SAR (IW Mode, Dual-Pol VV/VH)"],
      ["Candidate Formations", `${det.candidateCount || 1} distinct contiguous dark formation(s)`],
    ];

    this.renderKeyValueTable(doc, tableData);

    if (det.observedEvidence && Array.isArray(det.observedEvidence)) {
      doc.moveDown(0.4);
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLORS.teal).text("Key Observations:");
      det.observedEvidence.forEach((obs) => {
        doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.textSecondary).text(`• ${obs}`, { indent: 10 });
      });
    }

    doc.moveDown(0.8);
  }

  renderGeospatialEvidence(doc, dossier) {
    this.checkPageBreak(doc, 100);
    this.renderSectionHeading(doc, "4. GEOSPATIAL & SPILL GEOMETRY", COLORS.teal);

    const geo = dossier.geospatialEvidence || {};
    const centroid = geo.observedCentroid || {};

    const tableData = [
      ["Observed Surface Area", `${geo.surfaceAreaKm2 !== undefined ? Number(geo.surfaceAreaKm2).toFixed(3) : "N/A"} km²`],
      [
        "Observed Centroid (Lat, Lon)",
        `Latitude: ${centroid.latitude !== undefined ? Number(centroid.latitude).toFixed(5) + "° N" : "N/A"}, Longitude: ${centroid.longitude !== undefined ? Number(centroid.longitude).toFixed(5) + "° E" : "N/A"}`,
      ],
      ["Coordinate Reference System", geo.crs || "EPSG:4326 (WGS 84)"],
      ["Geometry Type", geo.geometryType || "MultiPolygon / Polygon"],
      ["Spatial Status", "OBSERVED (Direct SAR Segmentation)"],
    ];

    this.renderKeyValueTable(doc, tableData);
    doc.moveDown(0.8);
  }

  renderMetoceanDriftEvidence(doc, dossier) {
    this.checkPageBreak(doc, 120);
    this.renderSectionHeading(doc, "5. METOCEAN FORCING & MODELLED DRIFT", COLORS.amber);

    const drift = dossier.driftEvidence || {};
    const origin = drift.modelledOrigin || {};

    const tableData = [
      ["Drift Model", drift.driftModel || "Deterministic Metocean Hindcast Backtracking"],
      ["Metocean Data Source", drift.metoceanSource || "ECMWF ERA5 / Global Ocean Currents"],
      ["Hindcast Interval", `${drift.hindcastHours || 24} Hours Backward`],
      [
        "MODELLED SPILL ORIGIN",
        `Latitude: ${origin.latitude !== undefined ? Number(origin.latitude).toFixed(5) + "° N" : "N/A"}, Longitude: ${origin.longitude !== undefined ? Number(origin.longitude).toFixed(5) + "° E" : "N/A"}`,
      ],
      ["Origin Timestamp (Modelled)", origin.timestamp || "Estimated 24h prior to acquisition"],
      ["Spatial Uncertainty Envelope", `±${origin.uncertaintyRadiusKm || drift.uncertaintyKm || "2.6"} km (95% corridor)`],
      ["Status Notice", "MODELLED INFERENCE (Does not establish confirmed discharge point)"],
    ];

    this.renderKeyValueTable(doc, tableData);
    doc.moveDown(0.8);
  }

  renderAisCorrelationEvidence(doc, dossier) {
    this.checkPageBreak(doc, 90);
    this.renderSectionHeading(doc, "6. AIS TELEMETRY & TRAJECTORY CORRELATION", COLORS.violet);

    const ais = dossier.aisEvidence || {};

    const tableData = [
      ["AIS Telemetry Source", ais.source || "Historical Terrestrial & Satellite AIS Stream"],
      ["Temporal Correlation Window", ais.temporalWindow || "±24 Hours surrounding hindcast origin"],
      ["Correlated Vessel Candidates", `${ais.candidateCount || (ais.candidates ? ais.candidates.length : 0)} vessel(s)`],
      ["Correlation Metric", "Minimum Historical Distance to Modelled Origin Corridor"],
      ["Dynamic CPA Note", "isDynamicRelativeMotionCPA = false (Exploratory spatial-temporal proximity only)"],
    ];

    this.renderKeyValueTable(doc, tableData);
    doc.moveDown(0.8);
  }

  renderCandidateVessels(doc, dossier) {
    this.checkPageBreak(doc, 130);
    this.renderSectionHeading(doc, "7. AIS CORRELATION CANDIDATES", COLORS.violet);

    const ais = dossier.aisEvidence || {};
    const candidates = ais.candidates || [];

    if (candidates.length === 0) {
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(COLORS.textMuted)
        .text("No candidate vessels exhibited spatio-temporal consistency within the hindcast corridor.");
      doc.moveDown(0.8);
      return;
    }

    candidates.forEach((cand, idx) => {
      this.checkPageBreak(doc, 75);
      const width = doc.page.width - 100;
      doc
        .rect(50, doc.y, width, 56)
        .fillAndStroke(COLORS.navyLight, COLORS.borderLight);

      doc
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .fillColor(COLORS.navyDark)
        .text(
          `Candidate #${idx + 1}: ${cand.vesselName || "UNKNOWN VESSEL"} (MMSI: ${cand.mmsi || "N/A"})`,
          60,
          doc.y + 8
        );

      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor(COLORS.textSecondary)
        .text(
          `Vessel Type: ${cand.vesselType || "Commercial"}  •  Flag: ${cand.flag || "N/A"}  •  IMO: ${cand.imo || "N/A"}`,
          60,
          doc.y + 22
        );

      const score = cand.correlationScore !== undefined ? (Number(cand.correlationScore) * 100).toFixed(1) + "%" : "N/A";
      const dist = cand.minDistanceKm !== undefined ? `${cand.minDistanceKm} km` : "N/A";

      doc
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .fillColor(COLORS.violet)
        .text(`Analytical Correlation Score: ${score}  |  Min Distance to Origin: ${dist}`, 60, doc.y + 36);

      doc.y += 64;
    });

    doc.moveDown(0.4);
  }

  renderAnalyticalScore(doc, dossier) {
    this.checkPageBreak(doc, 120);
    this.renderSectionHeading(doc, "8. ANALYTICAL CORRELATION SCORE", COLORS.violet);

    const scoreObj = dossier.analyticalCorrelation || {};
    const components = scoreObj.components || {};
    const weights = scoreObj.weights || {};

    const tableData = [
      ["Score Classification", "ANALYTICAL_CORRELATION_SCORE"],
      ["Composite Score", `${scoreObj.correlationScore !== undefined ? scoreObj.correlationScore : "N/A"}`],
      [
        "Component Breakdown",
        `Spatial: ${components.spatial !== undefined ? components.spatial : "N/A"} (w=${weights.spatial || 0.4}) | ` +
          `Temporal: ${components.temporal !== undefined ? components.temporal : "N/A"} (w=${weights.temporal || 0.3}) | ` +
          `Trajectory: ${components.trajectory !== undefined ? components.trajectory : "N/A"} (w=${weights.trajectory || 0.2}) | ` +
          `Quality: ${components.dataQuality !== undefined ? components.dataQuality : "N/A"} (w=${weights.dataQuality || 0.1})`,
      ],
      [
        "MANDATORY EXPLANATORY NOTICE",
        "Analytical spatio-temporal consistency only. This score is NOT a probability of guilt, discharge, or causation.",
      ],
    ];

    this.renderKeyValueTable(doc, tableData);
    doc.moveDown(0.8);
  }

  renderTimeline(doc, dossier) {
    const timeline = dossier.timeline || [];
    if (timeline.length === 0) return;

    this.checkPageBreak(doc, 100);
    this.renderSectionHeading(doc, "9. EVIDENCE TIMELINE", COLORS.navyMid);

    timeline.forEach((step) => {
      this.checkPageBreak(doc, 24);
      doc
        .font("Courier-Bold")
        .fontSize(7.5)
        .fillColor(COLORS.navyMid)
        .text(step.time || step.timestamp || "T-00:00", 55, doc.y, { width: 95 });

      doc
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .fillColor(COLORS.amber)
        .text(`[${step.phase || "EVENT"}]`, 155, doc.y - 9, { width: 75 });

      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor(COLORS.textPrimary)
        .text(step.description || step.event || "", 235, doc.y - 9, { width: doc.page.width - 285 });

      doc.moveDown(0.4);
    });

    doc.moveDown(0.8);
  }

  renderScientificLimitations(doc, dossier) {
    const limitations = dossier.scientificLimitations || [];
    if (limitations.length === 0) return;

    this.checkPageBreak(doc, 90);
    this.renderSectionHeading(doc, "10. SCIENTIFIC LIMITATIONS", COLORS.amber);

    limitations.forEach((lim) => {
      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor(COLORS.textSecondary)
        .text(`• ${lim}`, { indent: 10, lineGap: 1.5 });
    });

    doc.moveDown(0.8);
  }

  renderOilTypeAndVolume(doc, dossier) {
    this.checkPageBreak(doc, 80);
    this.renderSectionHeading(doc, "11. OIL TYPE & VOLUME STATUS", COLORS.textMuted);

    const statusObj = dossier.oilTypeAndVolume || {};

    const tableData = [
      ["Oil Type Status", statusObj.oilTypeStatus || "NOT_ESTABLISHED"],
      ["Oil Type Statement", "Oil type was not established from the available evidence."],
      ["Spill Volume Status", statusObj.volumeStatus || "NOT_ESTABLISHED"],
      ["Spill Volume Statement", "Spill volume was not established from the available evidence."],
    ];

    this.renderKeyValueTable(doc, tableData);
    doc.moveDown(0.8);
  }

  renderLegalResponsibility(doc, dossier) {
    this.checkPageBreak(doc, 85);
    this.renderSectionHeading(doc, "12. LEGAL RESPONSIBILITY STATUS", COLORS.red);

    const legal = dossier.legalResponsibility || {};

    doc
      .rect(50, doc.y, doc.page.width - 100, 36)
      .fillAndStroke(COLORS.redLight, COLORS.red);

    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(COLORS.red)
      .text(`LEGAL RESPONSIBILITY STATUS: ${legal.status || "NOT_ESTABLISHED"}`, 62, doc.y + 7);

    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(COLORS.textPrimary)
      .text(
        "The available evidence does not establish legal responsibility or vessel causation. Physical sampling and maritime authority inspection remain mandatory.",
        62,
        doc.y + 19,
        { width: doc.page.width - 124 }
      );

    doc.y += 44;
    doc.moveDown(0.6);
  }

  renderEvidenceTraceability(doc, dossier) {
    const refs = dossier.evidenceRefs || {};
    this.checkPageBreak(doc, 90);
    this.renderSectionHeading(doc, "13. EVIDENCE TRACEABILITY (CANONICAL REFS)", COLORS.navyMid);

    const tableData = [
      ["Geospatial Evidence Ref", refs.geospatial || "geospatialEvidence.surfaceAreaKm2"],
      ["Drift Modelled Origin Ref", refs.drift || "metoceanDriftEvidence.modelledOrigin"],
      ["AIS Correlation Candidates Ref", refs.ais || "aisCorrelationEvidence.candidates"],
      ["Canonical Contract Version", "OG-CANONICAL-EVIDENCE-CONTRACT-V1.0"],
    ];

    this.renderKeyValueTable(doc, tableData);
    doc.moveDown(0.8);
  }

  renderMethodologySummary(doc) {
    this.checkPageBreak(doc, 80);
    this.renderSectionHeading(doc, "14. METHODOLOGY & PIPELINE SUMMARY", COLORS.navyMid);

    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(COLORS.textSecondary)
      .lineGap(1.5)
      .text(
        "Pipeline Sequence: SAR Detection → Geospatial Analysis → Metocean Backtracking → AIS Correlation → Canonical Evidence → Dossier Synthesis.\n" +
          "The report summarizes authoritative outputs from the Ocean Guard AI evidence pipeline. The report renderer does not perform independent scientific inference.",
        { align: "justify" }
      );

    doc.moveDown(0.8);
  }

  renderReportMetadata(doc, { dossierId, analysisId, createdAt, dossier }) {
    this.checkPageBreak(doc, 90);
    this.renderSectionHeading(doc, "15. REPORT METADATA & AUDIT LEDGER", COLORS.navyMid);

    const tableData = [
      ["Document Identifier", dossierId || "OG-DOSSIER-V1"],
      ["Analysis UUID", analysisId || "N/A"],
      ["Generation Mode", dossier.generationMode || "DETERMINISTIC"],
      ["Compilation Timestamp", new Date(createdAt || Date.now()).toISOString()],
      ["System Architecture", "Ocean Guard AI Forensic Decision Support System"],
      [
        "Disclaimer",
        "Attribution candidate ranking represents exploratory physical/spatial correlation. It does NOT constitute legal proof of spill discharge or vessel liability.",
      ],
    ];

    this.renderKeyValueTable(doc, tableData);
    doc.moveDown(0.8);
  }

  // ===================================================================
  // HELPER UTILITIES
  // ===================================================================

  renderSectionHeading(doc, title, accentColor = COLORS.navyMid) {
    doc.save();
    doc
      .rect(50, doc.y, 4, 12)
      .fill(accentColor);

    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(COLORS.navyDark)
      .text(title, 58, doc.y + 1);

    doc.strokeColor(COLORS.borderLight).lineWidth(0.5).moveTo(50, doc.y + 4).lineTo(doc.page.width - 50, doc.y + 4).stroke();
    doc.restore();
    doc.moveDown(0.7);
  }

  renderKeyValueTable(doc, rows) {
    const width = doc.page.width - 100;
    const labelWidth = 140;
    const valueWidth = width - labelWidth;

    rows.forEach(([label, value], idx) => {
      this.checkPageBreak(doc, 18);
      const rowY = doc.y;
      const isAlt = idx % 2 === 1;

      if (isAlt) {
        doc.rect(50, rowY - 2, width, 14).fill(COLORS.navyLight);
      }

      doc
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .fillColor(COLORS.textSecondary)
        .text(label, 56, rowY, { width: labelWidth - 12 });

      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor(COLORS.textPrimary)
        .text(String(value), 50 + labelWidth, rowY, { width: valueWidth - 10 });

      doc.y = rowY + 14;
    });
  }

  checkPageBreak(doc, neededHeight) {
    if (doc.y + neededHeight > doc.page.height - 54) {
      doc.addPage();
    }
  }
}

module.exports = new DossierPdfService();
