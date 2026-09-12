/**
 * Phase 6 — LLM-Assisted Analytical Investigation Dossier E2E Verification
 */

const prisma = require('../services/backend-node/src/db/database');
const { runSeed } = require('../services/backend-node/src/db/seed');
const driftService = require('../services/backend-node/src/services/drift.service');
const attributionService = require('../services/backend-node/src/services/attribution.service');
const spillRepository = require('../services/backend-node/src/repositories/spill.repository');
const evidenceService = require('../services/backend-node/src/services/evidence.service');
const dossierService = require('../services/backend-node/src/services/dossier.service');

async function runPhase6Verification() {
  console.log('====================================================================');
  console.log('PHASE 6 — LLM-ASSISTED ANALYTICAL INVESTIGATION DOSSIER E2E');
  console.log('====================================================================');

  // 1. Database seed verification
  console.log('\n[1/7] Initializing Database & Demonstration AIS Environment...');
  const seedSummary = await runSeed();
  console.log(`  ✓ Database ready (${seedSummary.upsertedVessels} demo vessels, ${seedSummary.totalPointsInDb} AIS tracks)`);

  // 2. Create Analysis & Spill from SAR detection
  console.log('\n[2/7] Seeding Observed SAR Detection & Analysis Record...');
  const testAnalysis = await prisma.analysis.create({
    data: { status: 'COMPLETED' },
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
  console.log(`  ✓ Observed SAR Spill created (ID: ${testSpill.id}) at Centroid: [18.9210°N, 72.8320°E]`);

  // 3. Compute and Persist Lagrangian Drift Simulation
  console.log('\n[3/7] Computing & Persisting Lagrangian Drift Hindcast & Forecast...');
  const driftResult = await driftService.runDriftSimulation({
    latitude: testSpill.latitude,
    longitude: testSpill.longitude,
    detectionTimestamp: testSpill.detectedAt,
    hoursBack: 24,
    hoursForward: 6,
  });
  await spillRepository.saveDriftRun(testSpill.id, driftResult);
  console.log(`  ✓ Modelled Origin: [${driftResult.originLat.toFixed(4)}°N, ${driftResult.originLng.toFixed(4)}°E], Uncertainty: ±${Number(driftResult.uncertaintyRadiusKm).toFixed(2)} km`);

  // 4. Compute and Persist AIS Vessel Attribution Correlation
  console.log('\n[4/7] Computing & Persisting AIS Candidate Vessel Correlations...');
  const attributionResult = await attributionService.analyzeSpill(testSpill.id, {
    radiusKm: 50,
    timeWindowHours: 24,
  });
  console.log(`  ✓ Correlated ${attributionResult.candidates.length} candidate vessels (Top: ${attributionResult.candidates[0]?.vessel?.name})`);

  // 5. Construct Structured Evidence Package
  console.log('\n[5/7] Compiling Structured Evidence Package via EvidenceService...');
  const evidence = await evidenceService.getStructuredEvidence(testAnalysis.id);
  
  if (!evidence.observedEvidence || evidence.observedEvidence.classification !== 'OBSERVED') {
    throw new Error('Evidence package missing valid OBSERVED data classification');
  }
  if (!evidence.modelledEvidence || evidence.modelledEvidence.classification !== 'MODELLED') {
    throw new Error('Evidence package missing valid MODELLED data classification');
  }
  if (!evidence.aisEvidence || evidence.aisEvidence.classification !== 'DEMONSTRATION') {
    throw new Error('Evidence package missing valid DEMONSTRATION data classification');
  }
  console.log(`  ✓ Evidence package verified: OBSERVED (SAR), MODELLED (Drift), DEMONSTRATION (AIS)`);
  console.log(`  ✓ Candidate vessels in evidence: ${evidence.aisEvidence.candidateVessels.length}`);

  // 6. Synthesize, Validate, and Persist Dossier
  console.log('\n[6/7] Synthesizing Analytical Investigation Dossier via DossierService...');
  const dossierRes = await dossierService.generateDossier(testAnalysis.id, 'e2e-tester-id');
  const d = dossierRes.dossier;

  // Validate schema properties
  if (!d.executiveSummary || typeof d.executiveSummary !== 'string') throw new Error('Dossier missing executiveSummary');
  if (!Array.isArray(d.observedEvidence) || d.observedEvidence.length === 0) throw new Error('Dossier missing observedEvidence');
  if (!Array.isArray(d.modelledEvidence) || d.modelledEvidence.length === 0) throw new Error('Dossier missing modelledEvidence');
  if (!Array.isArray(d.candidateAssessments) || d.candidateAssessments.length === 0) throw new Error('Dossier missing candidateAssessments');
  if (!Array.isArray(d.timeline) || d.timeline.length === 0) throw new Error('Dossier missing timeline');
  if (!Array.isArray(d.limitations) || d.limitations.length === 0) throw new Error('Dossier missing limitations');
  if (!Array.isArray(d.recommendedFollowUp) || d.recommendedFollowUp.length === 0) throw new Error('Dossier missing recommendedFollowUp');
  if (!d.disclaimer || !d.disclaimer.includes('Attribution scores represent modelled spatial')) throw new Error('Dossier missing mandatory disclaimer');

  // Verify numerical preservation
  if (!d.executiveSummary.includes('4.73') && !d.observedEvidence.some(e => e.includes('4.73'))) {
    throw new Error('Observed area 4.73 km² was not preserved in dossier');
  }
  const topCandName = attributionResult.candidates[0].vessel.name;
  if (!d.candidateAssessments[0].candidateVessel.includes(topCandName)) {
    throw new Error(`Top candidate vessel name (${topCandName}) missing from candidate assessment`);
  }

  console.log(`  ✓ Dossier JSON successfully validated against required schema`);
  console.log(`  ✓ Mandatory disclaimer verified verbatim`);
  console.log(`  ✓ Report record persisted (Report ID: ${dossierRes.reportId})`);

  // 7. Verify Retrieval via GET Dossier
  console.log('\n[7/7] Verifying Persisted Dossier Retrieval via getDossier()...');
  const retrieved = await dossierService.getDossier(testAnalysis.id);
  if (retrieved.reportId !== dossierRes.reportId) {
    throw new Error('Retrieved reportId does not match persisted reportId');
  }
  console.log(`  ✓ Retrieved persisted dossier: "${retrieved.title}"`);
  console.log(`  ✓ Executive summary length: ${retrieved.dossier.executiveSummary.length} characters`);
  console.log(`  ✓ Candidate assessments count: ${retrieved.dossier.candidateAssessments.length}`);

  console.log('\n--- VERIFICATION DOSSIER EXECUTIVE SUMMARY EXCERPT ---');
  console.log(retrieved.dossier.executiveSummary);
  console.log('------------------------------------------------------');

  // Teardown
  await prisma.report.deleteMany({ where: { analysisId: testAnalysis.id } });
  await prisma.attributionResult.deleteMany({ where: { spillId: testSpill.id } });
  await prisma.driftPoint.deleteMany({ where: { driftRun: { spillId: testSpill.id } } });
  await prisma.driftRun.deleteMany({ where: { spillId: testSpill.id } });
  await prisma.spill.deleteMany({ where: { id: testSpill.id } });
  await prisma.analysis.deleteMany({ where: { id: testAnalysis.id } });

  console.log('\n====================================================================');
  console.log('ALL PHASE 6 LLM DOSSIER VERIFICATIONS COMPLETED SUCCESSFULLY!');
  console.log('====================================================================');
}

runPhase6Verification()
  .catch((err) => {
    console.error('Phase 6 Verification Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
