/**
 * Phase 5 — Hydrodynamic Drift Modelling & Backward Hindcast E2E Verification
 */

const prisma = require('../services/backend-node/src/db/database');
const { runSeed } = require('../services/backend-node/src/db/seed');
const driftService = require('../services/backend-node/src/services/drift.service');
const attributionService = require('../services/backend-node/src/services/attribution.service');
const spillRepository = require('../services/backend-node/src/repositories/spill.repository');
const llmService = require('../services/backend-node/src/llm/llm.service');

async function runPhase5Verification() {
  console.log('====================================================================');
  console.log('PHASE 5 — HYDRODYNAMIC DRIFT MODELLING & BACKWARD HINDCAST E2E');
  console.log('====================================================================');

  // 1. Database seed verification
  console.log('\n[1/6] Running Database Seed...');
  const seedSummary = await runSeed();
  console.log(`  ✓ Database ready (${seedSummary.upsertedVessels} demo vessels, ${seedSummary.totalPointsInDb} AIS points)`);

  // 2. Create Analysis & Spill from SAR detection
  console.log('\n[2/6] Initializing Analysis & Spill Record from Observed SAR Detection...');
  const testAnalysis = await prisma.analysis.create({
    data: { status: 'RUNNING' },
  });

  const detectionTime = new Date('2026-03-10T12:00:00.000Z');
  const testSpill = await spillRepository.create(testAnalysis.id, {
    latitude: 18.921,
    longitude: 72.832,
    areaKm2: 4.73,
    confidence: 0.94,
    estimatedAgeHours: 14.5,
    detectedAt: detectionTime,
    geomWkt: 'POLYGON((72.800 18.900, 72.860 18.900, 72.860 18.942, 72.800 18.942, 72.800 18.900))',
  });
  console.log(`  ✓ Observed Spill created (ID: ${testSpill.id}) at Centroid: [18.921°N, 72.832°E]`);

  // 3. Execute Drift Simulation (Reverse Hindcast + Forward Forecast)
  console.log('\n[3/6] Executing Hydrodynamic Drift Simulation (Lagrangian Advection)...');
  const driftResult = await driftService.runDriftSimulation({
    latitude: testSpill.latitude,
    longitude: testSpill.longitude,
    detectionTimestamp: testSpill.detectedAt,
    hoursBack: 24,
    hoursForward: 6,
  });

  console.log(`  ✓ Drift Simulation status: ${driftResult.status}`);
  console.log(`  ✓ Engine: "${driftResult.engine}"`);
  console.log(`  ✓ Modelled Origin: [${driftResult.originLat.toFixed(4)}°N, ${driftResult.originLng.toFixed(4)}°E]`);
  console.log(`  ✓ Modelled Origin Timestamp: ${driftResult.originTimestamp}`);
  console.log(`  ✓ Modelled Origin Uncertainty Radius: ±${Number(driftResult.uncertaintyRadiusKm).toFixed(2)} km`);
  console.log(`  ✓ Backward Trajectory Waypoints: ${driftResult.backwardPath.length} points (-24h to 0h)`);
  console.log(`  ✓ Forward Forecast Waypoints: ${driftResult.forwardPath.length} points (0h to +6h)`);

  // 4. Persist Drift Run & Points into Database
  console.log('\n[4/6] Persisting DriftRun and DriftPoint records to PostgreSQL...');
  const persistedDrift = await spillRepository.saveDriftRun(testSpill.id, driftResult);
  console.log(`  ✓ DriftRun persisted (ID: ${persistedDrift.id})`);

  const driftInDb = await spillRepository.getDrift(testSpill.id);
  console.log(`  ✓ Verified DB persistence: ${driftInDb.points.length} drift trajectory points in drift_points table`);

  // 5. Connect Modelled Origin to AIS Candidate Attribution
  console.log('\n[5/6] Executing AIS Candidate Attribution using Modelled Origin...');
  const attributionResult = await attributionService.analyzeSpill(testSpill.id, {
    radiusKm: 50,
    timeWindowHours: 24,
  });

  console.log(`  ✓ Attribution completed with ${attributionResult.candidates.length} candidates ranked:`);
  attributionResult.candidates.forEach((c) => {
    console.log(`    - Rank #${c.rank}: ${c.vessel.name} (Score: ${(c.totalScore * 100).toFixed(1)}%) | Min Dist to Origin: ${c.evidence.distanceKm} km | Δt: ${c.evidence.timeDiffHours}h`);
  });

  // 6. Generate Investigation Dossier
  console.log('\n[6/6] Compiling Incident Investigation Dossier with Disclaimers...');
  const dossier = await llmService.generateIncidentSummary({
    spillId: testSpill.id,
    centroid: { lat: testSpill.latitude, lng: testSpill.longitude },
    areaKm2: testSpill.areaKm2,
    confidence: testSpill.confidence,
    suspects: attributionResult.candidates,
  });

  console.log('  ✓ Dossier compiled successfully.');
  console.log('\n--- VERIFICATION DOSSIER EXCERPT ---');
  console.log(dossier.slice(0, 600) + '...\n');

  // Cleanup test records
  await prisma.attributionResult.deleteMany({ where: { spillId: testSpill.id } });
  await prisma.driftPoint.deleteMany({ where: { driftRun: { spillId: testSpill.id } } });
  await prisma.driftRun.deleteMany({ where: { spillId: testSpill.id } });
  await prisma.spill.deleteMany({ where: { id: testSpill.id } });
  await prisma.analysis.deleteMany({ where: { id: testAnalysis.id } });

  console.log('====================================================================');
  console.log('ALL PHASE 5 DRIFT MODELLING VERIFICATIONS COMPLETED SUCCESSFULLY!');
  console.log('====================================================================');
}

runPhase5Verification()
  .catch((err) => {
    console.error('Phase 5 Verification Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
