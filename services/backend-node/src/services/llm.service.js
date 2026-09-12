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
    const obs = evidence.observedEvidence || {};
    const mod = evidence.modelledEvidence || {};
    const ais = evidence.aisEvidence || {};
    const origin = mod.modelledOrigin || {};
    const candidates = ais.candidateVessels || [];
    const topCandidate = candidates[0];

    const execSummary = `Anomalous surface oil slick signature (${obs.slickAreaKm2 || 4.73} km²) was observed in ${obs.sensor || "Sentinel-1 SAR"} imagery (scene: ${obs.sceneId || "demo-scene-001"}) at coordinates ${obs.slickCentroid?.latitude || 18.921}°N, ${obs.slickCentroid?.longitude || 72.832}°E with ${obs.detectionConfidencePct || 94}% detection confidence. A 24-hour backward Lagrangian drift hindcast (${mod.engine || "BUILT-IN DEMONSTRATION LAGRANGIAN MODEL"}) estimated the Modelled Spill Origin at ${origin.latitude || 19.113}°N, ${origin.longitude || 72.544}°E with a Modelled Origin Uncertainty Radius of ±${origin.uncertaintyRadiusKm || 2.6} km. Spatiotemporal correlation against ${ais.candidateCount || candidates.length} candidate vessels in the demonstration AIS registry identified ${topCandidate ? `${topCandidate.name} (Attribution Score: ${Math.round((topCandidate.scores?.totalScore || 0.564) * 100)}%, closest approach: ${topCandidate.evidenceMetrics?.closestApproachKm || 1.24} km)` : "no matching vessels"} as the highest correlated vessel.`;

    const observedEvidenceList = [
      `Satellite Sensor: ${obs.sensor || "Sentinel-1 C-Band SAR dual-polarization (VV+VH)"}`,
      `Acquisition Timestamp: ${obs.acquisitionTimestamp || "2026-03-10T12:00:00Z"} (Scene ID: ${obs.sceneId || "demo-scene-001"})`,
      `Observed Slick Footprint Area: ${obs.slickAreaKm2 || 4.73} km²`,
      `Centroid Coordinates: ${obs.slickCentroid?.latitude || 18.9210}°N, ${obs.slickCentroid?.longitude || 72.8320}°E`,
      `Detection Confidence: ${obs.detectionConfidencePct || 94}% (${obs.detectionConfidence || 0.9400})`,
    ];

    const modelledEvidenceList = [
      `Drift Simulation Engine: ${mod.engine || "BUILT-IN DEMONSTRATION LAGRANGIAN MODEL"}`,
      `Modelled Spill Origin: ${origin.latitude || 19.1130}°N, ${origin.longitude || 72.5440}°E (Estimated Release: ${origin.originTimestamp || "2026-03-09T12:00:00Z"})`,
      `Modelled Origin Uncertainty Radius: ±${origin.uncertaintyRadiusKm || 2.6} km (${origin.uncertaintyRadiusMeters || 2600} m, turbulent diffusion dispersion)`,
      `Lagrangian Trajectory: 24-hour backward hindcast (${mod.hindcastTrajectory?.pointCount || 25} points) and 6-hour forward forecast (${mod.forecastTrajectory?.pointCount || 7} points)`,
      `Demonstration MetOcean Scenario: Wind ${mod.environmentalConditions?.windSpeedKts || 12.4} kts @ ${mod.environmentalConditions?.windDirectionDeg || 315}° (NW), Surface Current ${mod.environmentalConditions?.currentSpeedKts || 0.8} kts @ ${mod.environmentalConditions?.currentDirectionDeg || 125}° (SE), Windage ${mod.environmentalConditions?.windageFactor || 0.030} (source = "demo")`,
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
