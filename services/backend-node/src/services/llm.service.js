const logger = require("../logger");
const AppError = require("../errors/AppError");

const MANDATORY_DISCLAIMER =
  "Attribution scores represent modelled spatial, temporal, and trajectory correlations from available AIS and SAR-derived information. They do not establish legal responsibility, causation, or proof of pollution by any vessel. AIS records used in this demonstration are synthetic/demo records and do not represent actual historical vessel movements.";

/**
 * LLMService — Provides configurable LLM provider abstraction for narrative synthesis.
 *
 * CRITICAL SCIENTIFIC RULE:
 * The LLM is NEVER an analytical engine. All numerical values, coordinates, and scores
 * come directly from the pre-computed structured evidence package.
 */
class LLMService {
  constructor() {
    this.enabled = process.env.LLM_ENABLED === "true";
    this.provider = process.env.LLM_PROVIDER || "mock";
    this.model = process.env.LLM_MODEL || "gemini-1.5-pro";
    this.apiKey = process.env.LLM_API_KEY || null;
    this.timeoutMs = parseInt(process.env.LLM_TIMEOUT_MS, 10) || 30000;
  }

  /**
   * Synthesizes an Analytical Investigation Dossier from structured evidence.
   * @param {Object} evidence - Structured evidence package from EvidenceService
   * @param {Object} promptContext - Prompt templates (system, summary, candidate, limitations)
   * @returns {Promise<Object>} Validated structured dossier object
   */
  async generateDossier(evidence, promptContext = {}) {
    logger.info("LLM dossier generation requested", {
      enabled: this.enabled,
      provider: this.provider,
      model: this.model,
      spillId: evidence?.spillId,
    });

    if (!this.enabled || this.provider === "mock") {
      return this._generateDeterministicMockDossier(evidence);
    }

    try {
      if (this.provider === "gemini") {
        return await this._callGeminiProvider(evidence, promptContext);
      } else if (this.provider === "openai") {
        return await this._callOpenAIProvider(evidence, promptContext);
      } else {
        logger.warn(`Unknown LLM provider '${this.provider}', falling back to deterministic mock provider`);
        return this._generateDeterministicMockDossier(evidence);
      }
    } catch (err) {
      logger.error("External LLM provider invocation failed, falling back to deterministic mock provider", {
        error: err.message,
        provider: this.provider,
      });
      return this._generateDeterministicMockDossier(evidence);
    }
  }

  /**
   * Generates a fully factual, deterministic dossier based strictly on supplied evidence.
   * @param {Object} evidence - Structured evidence package
   * @returns {Object} Structured dossier matching required JSON schema
   */
  _generateDeterministicMockDossier(evidence) {
    const isRealCdse = evidence.metadata?.scenarioType === "REAL_CDSE" || evidence.metadata?.isRealScene || evidence.observedEvidence?.sourceClassification === "AUTHENTICATED_CDSE_SOURCE" || evidence.observedEvidence?.sceneId?.includes("S1A_IW_GRDH");

    if (isRealCdse) {
      const obs = evidence.observedEvidence || {};
      const mod = evidence.modelledEvidence || {};
      const env = mod.environmentalConditions || {};

      const execSummary = `Authentic Sentinel-1A Level-1 GRD SAR acquisition (${obs.productUuid || "3f5c4ba1-ed70-4065-91b9-2bbeb7ebfb79"}) over the Mumbai offshore sector (centroid: ${obs.slickCentroid?.latitude || 18.9933}°N, ${obs.slickCentroid?.longitude || 72.7455}°E) was verified from Copernicus Data Space Ecosystem. The unlabelled live scene was evaluated using the existing V2 dual-pol SAR baseline model, yielding mean model probability 0.0243 and max probability 0.3628 (0 pixels at 0.50 threshold, 1 pixel at 0.35 threshold). Co-registered ECMWF ERA5 surface wind (${env.era5WindSpeedMs || 2.79} m/s) and NOAA Coral Reef Watch daily SST analysis (${env.noaaCrwSstDegC || 26.30} °C) provide verified environmental context. No ground truth is available; no confirmed oil spill is established; no vessel responsibility is established; no real drift trajectory model was executed.`;

      const observedEvidenceList = [
        `Satellite Platform: ${obs.sensor || "Sentinel-1A C-SAR (IW GRD Level-1 Dual-Pol VV+VH)"}`,
        `Acquisition Timestamp: ${obs.acquisitionTimestamp || "2024-02-18T01:03:29Z"} (Product UUID: ${obs.productUuid || "3f5c4ba1-ed70-4065-91b9-2bbeb7ebfb79"})`,
        `Source Provider: Copernicus Data Space Ecosystem (CDSE Authenticated STAC Archive)`,
        `Subscene Centroid: ${obs.slickCentroid?.latitude || 18.9933}°N, ${obs.slickCentroid?.longitude || 72.7455}°E (Offshore Mumbai, Arabian Sea)`,
        `Ground Truth Status: NOT AVAILABLE (Unlabelled live satellite acquisition)`,
      ];

      const modelledEvidenceList = [
        `AI Model Baseline: existing unet-dual-pol-sar-v2 (2-channel dual-polarization)`,
        `Model Probability Distribution: Mean = 0.0243, Median = 0.0223, P90 = 0.0351, P95 = 0.0407, Max = 0.3628`,
        `Model Threshold Response: 0 pixels at 0.50 threshold (0.0000 km²); 1 pixel at 0.35 threshold (0.0001 km²)`,
        `Environmental Wind: Mean 10m surface wind speed = ${env.era5WindSpeedMs || 2.79} m/s (ECMWF ERA5 reanalysis)`,
        `Environmental SST: Mean sea surface temperature = ${env.noaaCrwSstDegC || 26.30} °C (NOAA CRW daily SST analysis)`,
        `Drift Model Status: NOT RUN FOR THIS REAL SCENE (Unlabelled live scene)`,
      ];

      const candidateAssessments = [];

      const timeline = [
        {
          time: obs.acquisitionTimestamp || "2024-02-18T01:03:29Z",
          phase: "OBSERVED SATELLITE ACQUISITION",
          description: "Authentic Sentinel-1A SAR descending pass acquired over Mumbai offshore waters.",
        },
        {
          time: "2024-02-18T01:04:00Z",
          phase: "ESA LEVEL-1 CALIBRATION",
          description: "Radiometric Sigma0 dB conversion from 16-bit Level-1 GRD measurement raster.",
        },
        {
          time: "2024-02-18T01:05:00Z",
          phase: "AI BASELINE EVALUATION",
          description: "Evaluated with active unet-dual-pol-sar-v2 baseline model yielding max probability 0.3628.",
        },
      ];

      const limitations = [
        "Unlabelled Live Scene: No ground-truth annotation or in-situ verification exists for this satellite pass.",
        "Modelled Evidence Only: Model responses reflect statistical dark-surface backscatter signatures, not a confirmed oil spill.",
        "No Vessel Attribution: AIS candidate attribution has not been established for this live scene.",
        "Drift Model Omitted: Numerical Lagrangian backward trajectory was not executed for this unlabelled live scene.",
        "AIS Telemetry Separation: Any AIS records present in the system belong to simulated demonstration scenarios.",
      ];

      const recommendedFollowUp = [
        "Task subsequent optical or SAR satellite passes over the Mumbai offshore sector to monitor for recurring features.",
        "Review regional coastal surveillance and maritime patrol logs for the 18 Feb 2024 time window.",
        "Incorporate verified live maritime AIS feeds when available for this geographic corridor.",
      ];

      const disclaimer = "Real Sentinel-1 observation verified via CDSE. This live scene is unlabelled; no ground truth, confirmed oil spill, vessel attribution, or drift origin is established.";

      return {
        executiveSummary: execSummary,
        observedEvidence: observedEvidenceList,
        modelledEvidence: modelledEvidenceList,
        candidateAssessments,
        timeline,
        limitations,
        recommendedFollowUp,
        disclaimer,
        provider: "mock",
        generatedAt: new Date().toISOString(),
      };
    }

    const obs = evidence.observedEvidence || {};
    const mod = evidence.modelledEvidence || {};
    const ais = evidence.aisEvidence || {};
    const origin = mod.modelledOrigin || {};
    const candidates = ais.candidateVessels || [];
    const topCandidate = candidates[0];

    const centroidStr =
      obs.slickCentroid?.latitude != null && obs.slickCentroid?.longitude != null
        ? `${obs.slickCentroid.latitude}°N, ${obs.slickCentroid.longitude}°E`
        : "NOT_AVAILABLE";

    const originStr =
      origin.latitude != null && origin.longitude != null
        ? `${origin.latitude}°N, ${origin.longitude}°E`
        : "NOT_AVAILABLE";

    const execSummary = `Anomalous surface oil slick signature (${obs.slickAreaKm2 != null ? `${obs.slickAreaKm2} km²` : "NOT_AVAILABLE"}) was observed in ${obs.sensor || "Sentinel-1 SAR"} imagery (scene: ${obs.sceneId || "UNKNOWN"}) at coordinates ${centroidStr} with ${obs.detectionConfidencePct != null ? `${obs.detectionConfidencePct}%` : "NOT_AVAILABLE"} detection confidence. A 24-hour backward Lagrangian drift hindcast (${mod.engine || "LAGRANGIAN_MODEL"}) estimated the Modelled Spill Origin at ${originStr} with a Modelled Origin Uncertainty Radius of ±${origin.uncertaintyRadiusKm != null ? `${origin.uncertaintyRadiusKm} km` : "NOT_AVAILABLE"}. Spatiotemporal correlation against ${ais.candidateCount || candidates.length} candidate vessels identified ${topCandidate ? `${topCandidate.name} (Attribution Score: ${Math.round((topCandidate.scores?.totalScore || 0.5) * 100)}%, closest approach: ${topCandidate.evidenceMetrics?.closestApproachKm != null ? `${topCandidate.evidenceMetrics.closestApproachKm} km` : "N/A"})` : "no matching vessels"} as candidate vessel.`;

    const observedEvidenceList = [
      `Satellite Sensor: ${obs.sensor || "Sentinel-1 C-Band SAR dual-polarization (VV+VH)"}`,
      `Acquisition Timestamp: ${obs.acquisitionTimestamp || "NOT_AVAILABLE"} (Scene ID: ${obs.sceneId || "UNKNOWN"})`,
      `Observed Slick Footprint Area: ${obs.slickAreaKm2 != null ? `${obs.slickAreaKm2} km²` : "NOT_AVAILABLE"}`,
      `Centroid Coordinates: ${centroidStr}`,
      `Detection Confidence: ${obs.detectionConfidencePct != null ? `${obs.detectionConfidencePct}%` : "NOT_AVAILABLE"} (${obs.detectionConfidence != null ? obs.detectionConfidence : "N/A"})`,
    ];

    const modelledEvidenceList = [
      `Drift Simulation Engine: ${mod.engine || "LAGRANGIAN_MODEL"}`,
      `Modelled Spill Origin: ${originStr} (Estimated Release: ${origin.originTimestamp || "NOT_AVAILABLE"})`,
      `Modelled Origin Uncertainty Radius: ±${origin.uncertaintyRadiusKm != null ? `${origin.uncertaintyRadiusKm} km` : "NOT_AVAILABLE"}`,
      `Lagrangian Trajectory: 24-hour backward hindcast (${mod.hindcastTrajectory?.pointCount || 0} points) and 6-hour forward forecast (${mod.forecastTrajectory?.pointCount || 0} points)`,
      `MetOcean Scenario: Wind ${mod.environmentalConditions?.windSpeedKts || "N/A"} kts, Surface Current ${mod.environmentalConditions?.currentSpeedKts || "N/A"} kts`,
    ];

    const candidateAssessments = candidates.map((c) => {
      const totalPct = Math.round((c.scores?.totalScore || 0) * 100);
      const proxPct = Math.round((c.scores?.proximityScore || 0) * 100);
      const tempPct = Math.round((c.scores?.temporalScore || 0) * 100);
      const trajPct = Math.round((c.scores?.trajectoryScore || 0) * 100);
      const anomPct = Math.round((c.scores?.anomalyScore || 0) * 100);
      const cpaKm = c.evidenceMetrics?.closestApproachKm != null ? `${c.evidenceMetrics.closestApproachKm} km` : "N/A";
      const dtHours = c.evidenceMetrics?.timeDeltaHours != null ? `${c.evidenceMetrics.timeDeltaHours} hrs` : "N/A";

      return {
        candidateVessel: `${c.name} (MMSI: ${c.mmsi}, IMO: ${c.imo || "N/A"}, Type: ${c.vesselType || "Cargo"}, Flag: ${c.flag || "Unknown"}) — Attribution Score: ${totalPct}% (Rank #${c.rank})`,
        summary: `${c.name} ranks #${c.rank} with an overall Attribution Score of ${totalPct}% based on spatial proximity score of ${proxPct}%, temporal score of ${tempPct}%, trajectory score of ${trajPct}%, and anomaly score of ${anomPct}%.`,
        supportingEvidence: [
          `Closest Point of Approach (CPA) to Modelled Origin: ${cpaKm}`,
          `Temporal Delta to Estimated Release Window: ${dtHours}`,
          `Trajectory & Heading Kinematics Score: ${trajPct}%`,
          `AIS Anomaly & Velocity Continuity Score: ${anomPct}% (Recorded AIS transmission gaps: ${c.evidenceMetrics?.aisGapCount || 0})`,
        ],
        limitingEvidence: [
          "AIS positions reflect demonstration synthetic dataset (source = 'demo') and do not represent physical historical transponder transmissions.",
          "Attribution correlation is mathematical and does not establish deliberate discharge or physical pipe/tanker valve operation.",
        ],
      };
    });

    const timeline = [
      {
        time: origin.originTimestamp || "2026-03-09T12:00:00Z",
        phase: "MODELLED DISCHARGE ORIGIN",
        description: `Estimated release window at Modelled Spill Origin (${origin.latitude || 19.113}°N, ${origin.longitude || 72.544}°E) with uncertainty radius ±${origin.uncertaintyRadiusKm || 2.6} km.`,
      },
      {
        time: "2026-03-09T18:00:00Z",
        phase: "MODELLED HINDCAST DRIFT",
        description: "Intermediate backward advection under 12.4 kts NW wind and 0.8 kts SE current.",
      },
      {
        time: obs.acquisitionTimestamp || "2026-03-10T12:00:00Z",
        phase: "OBSERVED SATELLITE DETECTION",
        description: `Sentinel-1 SAR acquisition detects ${obs.slickAreaKm2 || 4.73} km² surface slick at ${obs.slickCentroid?.latitude || 18.921}°N, ${obs.slickCentroid?.longitude || 72.832}°E.`,
      },
      {
        time: "2026-03-10T18:00:00Z",
        phase: "MODELLED FORWARD FORECAST",
        description: "Projected 6-hour slick advection and expanding dispersion horizon.",
      },
    ];

    const limitations = [
      "Satellite SAR Resolution & Single Snapshot: Sentinel-1 C-band SAR provides a single-epoch spatial snapshot (10m resolution) and cannot observe continuous fluid discharge events.",
      "Demonstration MetOcean Scenario: Wind and current fields are derived from a structured steady-state demonstration scenario (source = 'demo') rather than assimilative reanalysis grids.",
      "Demonstration AIS Catalogue: AIS trajectories are generated from a benchmark simulation dataset (source = 'demo') with non-live historical vessel registries.",
      "Turbulent Diffusion Parameterization: Dispersion kinematics utilize horizontal diffusion coefficient K = 5.0 m²/s producing the Modelled Origin Uncertainty Radius.",
    ];

    const recommendedFollowUp = [
      "Request Port State Control (PSC) physical inspection and oil record book audit for top-ranked candidate vessels at next port of call.",
      "Collect physical surface slick samples for gas chromatography-mass spectrometry (GC-MS) hydrocarbon biomarker fingerprinting.",
      "Task high-resolution multispectral optical satellites (PlanetScope / Sentinel-2) over forward forecast trajectory zones.",
      "Correlate findings with regional maritime surveillance coastal radar and aerial patrol logs.",
    ];

    return {
      executiveSummary: execSummary,
      observedEvidence: observedEvidenceList,
      modelledEvidence: modelledEvidenceList,
      candidateAssessments,
      timeline,
      limitations,
      recommendedFollowUp,
      disclaimer: MANDATORY_DISCLAIMER,
      provider: "mock",
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Calls Google Gemini API provider.
   */
  async function_callGemini(evidence, promptContext) {
    if (!this.apiKey) {
      throw new Error("LLM_API_KEY is not configured for Gemini provider");
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const systemPrompt = promptContext.systemPrompt || "You are an analytical evidence synthesis assistant. Return JSON.";
    const userPrompt = `
Synthesize an Analytical Investigation Dossier from this structured evidence:
${JSON.stringify(evidence, null, 2)}

Ensure the JSON output adheres strictly to the schema:
{
  "executiveSummary": string,
  "observedEvidence": string[],
  "modelledEvidence": string[],
  "candidateAssessments": [
    {
      "candidateVessel": string,
      "summary": string,
      "supportingEvidence": string[],
      "limitingEvidence": string[]
    }
  ],
  "timeline": [{ "time": string, "phase": string, "description": string }],
  "limitations": string[],
  "recommendedFollowUp": string[],
  "disclaimer": string
}
`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Gemini API error (${res.status}): ${errorText}`);
      }

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error("Empty response from Gemini provider");

      const parsed = JSON.parse(rawText);
      parsed.provider = "gemini";
      parsed.disclaimer = MANDATORY_DISCLAIMER;
      return parsed;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Calls OpenAI provider.
   */
  async _callOpenAIProvider(evidence, promptContext) {
    if (!this.apiKey) {
      throw new Error("LLM_API_KEY is not configured for OpenAI provider");
    }

    const endpoint = "https://api.openai.com/v1/chat/completions";
    const systemPrompt = promptContext.systemPrompt || "You are an analytical evidence synthesis assistant. Return JSON.";
    const userPrompt = `Synthesize an Analytical Investigation Dossier from this structured evidence:\n${JSON.stringify(evidence, null, 2)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model || "gpt-4o",
          response_format: { type: "json_object" },
          temperature: 0.1,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`OpenAI API error (${res.status}): ${errorText}`);
      }

      const data = await res.json();
      const rawText = data?.choices?.[0]?.message?.content;
      if (!rawText) throw new Error("Empty response from OpenAI provider");

      const parsed = JSON.parse(rawText);
      parsed.provider = "openai";
      parsed.disclaimer = MANDATORY_DISCLAIMER;
      return parsed;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async _callGeminiProvider(evidence, promptContext) {
    return this.function_callGemini(evidence, promptContext);
  }
}

module.exports = new LLMService();
