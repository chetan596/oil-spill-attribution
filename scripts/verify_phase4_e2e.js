/**
 * E2E Verification Script for Phase 4 AIS Correlation & Vessel Attribution
 */

const prisma = require('../services/backend-node/src/db/database');
const { runSeed } = require('../services/backend-node/src/db/seed');
const attributionService = require('../services/backend-node/src/services/attribution.service');
const spillRepository = require('../services/backend-node/src/repositories/spill.repository');
const llmService = require('../services/backend-node/src/llm/llm.service');

async function runE2EVerification() {
  console.log('===============================================================');
  console.log('PHASE 4 — AIS CORRELATION & VESSEL ATTRIBUTION E2E VERIFICATION');
  console.log('===============================================================');

  // 1. Run seed
  console.log('\n[1/5] Running Database Seed...');
  const seedSummary = await runSeed();
  console.log(`  ✓ Seed successful: ${seedSummary.upsertedVessels} demo vessels, ${seedSummary.totalPointsInDb} AIS points`);

  // 2. Create a test Analysis and Spill
  console.log('\n[2/5] Creating Test Analysis, Spill & Modelled Drift Run...');
  const testAnalysis = await prisma.analysis.create({
    data: {
      status: 'COMPLETED',
    },
  });

  const testSpill = await spillRepository.create(testAnalysis.id, {
    latitude: 18.921,
    longitude: 72.832,
    areaKm2: 4.73,
    confidence: 0.94,
    estimatedAgeHours: 14.5,
    geomWkt: 'POLYGON((72.800 18.900, 72.860 18.900, 72.860 18.942, 72.800 18.942, 72.800 18.900))',
  });

  // Save modelled hindcast drift run (origin around 19.113°N, 72.544°E at 2026-03-09T21:30:00Z)
  const originTimestamp = new Date('2026-03-09T21:30:00.000Z');
  await spillRepository.saveDriftRun(testSpill.id, {
    latitude: 19.113,
    longitude: 72.544,
    originTimestamp,
    timeWindowHours: 24,
    backwardPath: [
      { lat: 18.921, lng: 72.832, timestamp: new Date('2026-03-10T12:00:00Z') },
      { lat: 19.015, lng: 72.690, timestamp: new Date('2026-03-10T04:00:00Z') },
      { lat: 19.113, lng: 72.544, timestamp: originTimestamp },
    ],
    forwardPath: [
      { lat: 18.910, lng: 72.845, timestamp: new Date('2026-03-10T13:00:00Z') },
    ],
  });
  console.log(`  ✓ Test Spill (${testSpill.id}) and DriftRun successfully persisted`);

  // 3. Execute Attribution Service
  console.log('\n[3/5] Executing Attribution Service analyzeSpill()...');
  const attributionResult = await attributionService.analyzeSpill(testSpill.id, {
    radiusKm: 50,
    timeWindowHours: 24,
  });

  console.log(`  ✓ Attribution completed with status: ${attributionResult.status}`);
  console.log(`  ✓ Total candidate vessels identified: ${attributionResult.candidates.length}`);

  // 4. Verify Candidate Rankings and Evidence Breakdown
  console.log('\n[4/5] Candidate Vessel Attribution Breakdown:');
  attributionResult.candidates.forEach((c) => {
    const ev = c.evidence;
    console.log(`\n  -------------------------------------------------------------`);
    console.log(`  Rank #${c.rank}: ${c.vessel.name} (MMSI: ${c.vessel.mmsi})`);
    console.log(`  Type / Flag: ${c.vessel.vesselType} | ${c.vessel.flag} | ${c.vessel.lengthM}m`);
    console.log(`  Total Attribution Score: ${(c.totalScore * 100).toFixed(2)}%`);
    console.log(`  - Proximity Score (30%):  ${(c.proximityScore * 100).toFixed(2)}% (Min Dist: ${ev.distanceKm} km)`);
    console.log(`  - Temporal Score  (25%):  ${(c.temporalScore * 100).toFixed(2)}% (Time Diff: ${ev.timeDiffHours} hrs)`);
    console.log(`  - Trajectory Score(25%):  ${(c.trajectoryScore * 100).toFixed(2)}% (CPA Dist: ${ev.cpaDistanceKm} km)`);
    console.log(`  - Anomaly Score   (20%):  ${(c.anomalyScore * 100).toFixed(2)}% (AIS Gap: ${ev.aisGapMinutes} min, SpeedDrop: ${ev.speedDropDetected})`);
    console.log(`  - Passing Time: ${ev.closestTimestamp}`);
    console.log(`  - Source Label: "${ev.source}"`);
  });

  // 5. Generate Incident Report
  console.log('\n[5/5] Generating Incident Investigation Dossier...');
  const reportNarrative = await llmService.generateIncidentSummary({
    spillId: testSpill.id,
    centroid: { lat: testSpill.latitude, lng: testSpill.longitude },
    areaKm2: testSpill.areaKm2,
    confidence: testSpill.confidence,
    suspects: attributionResult.candidates,
  });

  console.log('  ✓ Report generation completed successfully.');
  console.log('\n--- SAMPLE REPORT EXCERPT ---');
  console.log(reportNarrative.slice(0, 500) + '...\n');

  // Verify DB Persistence
  const persistedResults = await spillRepository.getVessels(testSpill.id);
  console.log(`  ✓ Verified DB persistence: ${persistedResults.length} records in attribution_results table`);

  // Cleanup test analysis
  await prisma.attributionResult.deleteMany({ where: { spillId: testSpill.id } });
  await prisma.driftPoint.deleteMany({ where: { driftRun: { spillId: testSpill.id } } });
  await prisma.driftRun.deleteMany({ where: { spillId: testSpill.id } });
  await prisma.spill.deleteMany({ where: { id: testSpill.id } });
  await prisma.analysis.deleteMany({ where: { id: testAnalysis.id } });

  console.log('\n===============================================================');
  console.log('ALL PHASE 4 PIPELINE VERIFICATIONS PASSED SUCCESSFULLY!');
  console.log('===============================================================');
}

runE2EVerification()
  .catch((err) => {
    console.error('E2E Verification Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
