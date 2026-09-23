const prisma = require("../../src/db/database");
const analysisRepository = require("../../src/repositories/analysis.repository");
const spillRepository = require("../../src/repositories/spill.repository");
const { runSarDetection } = require("../../src/services/detection.service");
const driftService = require("../../src/services/drift.service");

describe("Multi-Scenario Demonstration Pipeline Integration", () => {
  let createdAnalysisIds = [];

  afterAll(async () => {
    // Cleanup created test records
    for (const analysisId of createdAnalysisIds) {
      await prisma.driftPoint.deleteMany({
        where: { driftRun: { spill: { analysisId } } },
      });
      await prisma.driftRun.deleteMany({
        where: { spill: { analysisId } },
      });
      await prisma.attributionResult.deleteMany({
        where: { spill: { analysisId } },
      });
      await prisma.report.deleteMany({
        where: { analysisId },
      });
      await prisma.spill.deleteMany({
        where: { analysisId },
      });
      await prisma.analysisJob.deleteMany({
        where: { analysisId },
      });
      await prisma.analysis.deleteMany({
        where: { id: analysisId },
      });
    }
  });

  it("should create two distinct analyses with different scenes and different spill locations", async () => {
    // 1. Create Analysis A (Mumbai - demo-scene-001)
    const { analysis: analysisA, job: jobA } = await analysisRepository.create({
      sceneId: "demo-scene-001",
      payload: { sarSceneId: "demo-scene-001", timeWindowHours: 24 },
    });
    createdAnalysisIds.push(analysisA.id);

    // 2. Create Analysis B (Gulf of Kutch - demo-scene-002)
    const { analysis: analysisB, job: jobB } = await analysisRepository.create({
      sceneId: "demo-scene-002",
      payload: { sarSceneId: "demo-scene-002", timeWindowHours: 24 },
    });
    createdAnalysisIds.push(analysisB.id);

    expect(analysisA.id).not.toBe(analysisB.id);
    expect(analysisA.sceneId).toBe("demo-scene-001");
    expect(analysisB.sceneId).toBe("demo-scene-002");

    // 3. Run detection for Analysis A
    const detectionA = await runSarDetection({ sarSceneId: "demo-scene-001" });
    const spillA = await spillRepository.create(analysisA.id, detectionA);

    // 4. Run detection for Analysis B
    const detectionB = await runSarDetection({ sarSceneId: "demo-scene-002" });
    const spillB = await spillRepository.create(analysisB.id, detectionB);

    // 5. Assert distinct spills bound strictly to their respective analyses
    expect(spillA.id).not.toBe(spillB.id);
    expect(spillA.analysisId).toBe(analysisA.id);
    expect(spillB.analysisId).toBe(analysisB.id);

    // Centroids must NOT be identical
    expect(spillA.latitude).toBe(18.921);
    expect(spillA.longitude).toBe(72.832);
    expect(spillA.areaKm2).toBe(4.73);

    expect(spillB.latitude).toBe(22.45);
    expect(spillB.longitude).toBe(69.21);
    expect(spillB.areaKm2).toBe(2.85);

    expect(spillA.latitude).not.toBe(spillB.latitude);
    expect(spillA.longitude).not.toBe(spillB.longitude);
    expect(spillA.geomWkt).not.toBe(spillB.geomWkt);

    // 6. Test direct lookup by analysisId
    const foundSpillA = await spillRepository.findByAnalysisId(analysisA.id);
    const foundSpillB = await spillRepository.findByAnalysisId(analysisB.id);

    expect(foundSpillA.id).toBe(spillA.id);
    expect(foundSpillB.id).toBe(spillB.id);
    expect(foundSpillA.analysis.scene.id).toBe("demo-scene-001");
    expect(foundSpillB.analysis.scene.id).toBe("demo-scene-002");

    // 7. Test drift simulation spatial coherence
    const driftA = await driftService.runDriftSimulation({
      latitude: spillA.latitude,
      longitude: spillA.longitude,
      detectionTimestamp: spillA.detectedAt,
      hoursBack: 24,
    });

    const driftB = await driftService.runDriftSimulation({
      latitude: spillB.latitude,
      longitude: spillB.longitude,
      detectionTimestamp: spillB.detectedAt,
      hoursBack: 24,
    });

    expect(driftA.originLat).toBeGreaterThan(19.0);
    expect(driftA.originLat).toBeLessThan(19.5);
    expect(driftA.originLng).toBeGreaterThan(72.0);
    expect(driftA.originLng).toBeLessThan(72.8);

    expect(driftB.originLat).toBeGreaterThan(22.0);
    expect(driftB.originLat).toBeLessThan(23.0);
    expect(driftB.originLng).toBeGreaterThan(68.5);
    expect(driftB.originLng).toBeLessThan(69.2);

    expect(driftA.originLat).not.toBe(driftB.originLat);
    expect(driftA.originLng).not.toBe(driftB.originLng);
  });
});
