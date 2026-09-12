const llmService = require("../../src/services/llm.service");

describe("LLMService (Provider Abstraction & Deterministic Mock)", () => {
  const sampleEvidence = {
    analysisId: "analysis-test-123",
    spillId: "spill-test-123",
    observedEvidence: {
      classification: "OBSERVED",
      sensor: "Sentinel-1 SAR",
      sceneId: "demo-scene-001",
      acquisitionTimestamp: "2026-03-10T12:00:00Z",
      slickCentroid: { latitude: 18.921, longitude: 72.832 },
      slickAreaKm2: 4.73,
      detectionConfidence: 0.94,
      detectionConfidencePct: 94,
    },
    modelledEvidence: {
      classification: "MODELLED",
      engine: "BUILT-IN DEMONSTRATION LAGRANGIAN MODEL",
      modelledOrigin: {
        latitude: 19.113,
        longitude: 72.544,
        originTimestamp: "2026-03-09T12:00:00Z",
        uncertaintyRadiusKm: 2.6,
        uncertaintyRadiusMeters: 2600,
      },
      hindcastTrajectory: { durationHours: 24, pointCount: 25 },
      forecastTrajectory: { durationHours: 6, pointCount: 7 },
      environmentalConditions: {
        source: "demo",
        windSpeedKts: 12.4,
        windDirectionDeg: 315.0,
        currentSpeedKts: 0.8,
        currentDirectionDeg: 125.0,
      },
    },
    aisEvidence: {
      classification: "DEMONSTRATION",
      source: "demo",
      candidateCount: 1,
      candidateVessels: [
        {
          rank: 1,
          name: "DEMO MARINER ALPHA",
          mmsi: "123456789",
          imo: "9876543",
          flag: "PA",
          vesselType: "Crude Tanker",
          scores: { totalScore: 0.7462, proximityScore: 0.85, temporalScore: 0.78, trajectoryScore: 0.65, anomalyScore: 0.70 },
          evidenceMetrics: { closestApproachKm: 2.35, timeDeltaHours: 1.2 },
        },
      ],
    },
  };

  it("should generate a structured dossier in deterministic mock mode", async () => {
    const dossier = await llmService.generateDossier(sampleEvidence);

    expect(dossier).toBeDefined();
    expect(dossier.executiveSummary).toContain("Sentinel-1 SAR");
    expect(dossier.executiveSummary).toContain("4.73 km²");
    expect(dossier.executiveSummary).toContain("DEMO MARINER ALPHA");
    expect(dossier.executiveSummary).toContain("75%"); // 0.7462 rounded is 75%

    expect(Array.isArray(dossier.observedEvidence)).toBe(true);
    expect(dossier.observedEvidence.length).toBeGreaterThan(0);

    expect(Array.isArray(dossier.modelledEvidence)).toBe(true);
    expect(dossier.modelledEvidence.some((m) => m.includes("BUILT-IN DEMONSTRATION LAGRANGIAN MODEL"))).toBe(true);
    expect(dossier.modelledEvidence.some((m) => m.includes("±2.6 km"))).toBe(true);

    expect(Array.isArray(dossier.candidateAssessments)).toBe(true);
    expect(dossier.candidateAssessments[0].candidateVessel).toContain("DEMO MARINER ALPHA");
    expect(dossier.candidateAssessments[0].summary).toContain("75%");

    expect(Array.isArray(dossier.timeline)).toBe(true);
    expect(Array.isArray(dossier.limitations)).toBe(true);
    expect(Array.isArray(dossier.recommendedFollowUp)).toBe(true);

    // Mandatory disclaimer validation
    expect(dossier.disclaimer).toContain("Attribution scores represent modelled spatial, temporal, and trajectory correlations");
    expect(dossier.disclaimer).toContain("do not establish legal responsibility");
  });

  it("should never contain prohibited words like guilty or responsible vessel", async () => {
    const dossier = await llmService.generateDossier(sampleEvidence);
    const jsonStr = JSON.stringify(dossier).toLowerCase();

    expect(jsonStr).not.toContain("guilty vessel");
    expect(jsonStr).not.toContain("responsible vessel");
    expect(jsonStr).not.toContain("confirmed polluter");
    expect(jsonStr).not.toContain("culprit");
  });
});
