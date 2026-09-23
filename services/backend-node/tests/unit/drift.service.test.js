const axios = require("axios");
const driftService = require("../../src/services/drift.service");
const spillRepository = require("../../src/repositories/spill.repository");

describe("DriftService Integration Client & Fallback", () => {
  it("should compute deterministic Lagrangian drift in DEMO_MODE fallback", async () => {
    const originalPost = axios.post;
    axios.post = jest.fn().mockRejectedValue(new Error("Downstream service unreachable"));

    const res = await driftService.runDriftSimulation({
      latitude: 18.921,
      longitude: 72.832,
      detectionTimestamp: "2026-03-10T12:00:00Z",
      hoursBack: 24,
      hoursForward: 6,
    });

    axios.post = originalPost;

    expect(res).toBeDefined();
    expect(res.status).toBe("success");
    expect(res.engine).toBe("BUILT-IN DEMONSTRATION LAGRANGIAN MODEL");
    expect(res.originLat).toBeDefined();
    expect(res.originLng).toBeDefined();
    expect(res.originTimestamp).toBeDefined();
    expect(res.uncertaintyRadiusKm).toBeGreaterThan(0.5);

    // Verify backward path structure
    expect(res.backwardPath).toHaveLength(25);
    expect(res.backwardPath[0].phase).toBe("backward");
    expect(res.backwardPath[0].seqIndex).toBe(0);
    expect(res.backwardPath[24].seqIndex).toBe(24);

    // Verify forward path structure
    expect(res.forwardPath).toHaveLength(7);
    expect(res.forwardPath[0].phase).toBe("forward");
    expect(res.forwardPath[6].seqIndex).toBe(6);

    // Verify simulation metadata
    expect(res.simulationMeta.environmental.source).toBe("demo");
    expect(res.simulationMeta.source_classification.drift_trajectory).toContain("MODELLED");
  });

  it("should retrieve stored drift run from repository in getDriftForSpill", async () => {
    const originalGetDrift = spillRepository.getDrift;
    spillRepository.getDrift = jest.fn().mockResolvedValue({
      id: "drift-run-123",
      spillId: "spill-123",
      latitude: 19.113,
      longitude: 72.544,
      originTimestamp: new Date("2026-03-09T21:30:00Z"),
      timeWindowHours: 24,
      simulationMeta: { engine: "BUILT-IN DEMONSTRATION LAGRANGIAN MODEL" },
      points: [
        { phase: "backward", latitude: 18.921, longitude: 72.832, seqIndex: 0 },
        { phase: "backward", latitude: 19.113, longitude: 72.544, seqIndex: 24 },
        { phase: "forward", latitude: 18.880, longitude: 72.880, seqIndex: 1 },
      ],
    });

    const result = await driftService.getDriftForSpill("spill-123");
    expect(result.id).toBe("drift-run-123");
    expect(result.backwardPath).toHaveLength(2);
    expect(result.forwardPath).toHaveLength(1);
    expect(result.originLat).toBe(19.113);

    spillRepository.getDrift = originalGetDrift;
  });
});
