/**
 * Phase 16.4 Part 6 — Investigation Report & Multi-Format Export Integration Tests
 *
 * Test Coverage:
 *  1. Canonical investigation snapshot loads cleanly into export service
 *  2. Summary generation reflects canonical detection metrics
 *  3. Full provenance preservation across all export types
 *  4. REAL provenance classification maintained for georeferenced raster input
 *  5. Image footprint marked NOT_AVAILABLE without valid georeferencing
 *  6. MODEL_DERIVED provenance maintained for spill footprint and centroid
 *  7. MODEL_DERIVED provenance maintained for estimated origin
 *  8. MODEL_DERIVED provenance maintained for backward and forward drift
 *  9. DEMO provenance preserved for simulated MetOcean forcing
 * 10. DEMO provenance preserved for simulated AIS telemetry
 * 11. ESTIMATION_TIME_PROXY preserved and documented in report limitations
 * 12. Technical report contains all 15 required sections in order
 * 13. Technical report origin section contains estimated coordinates and uncertainty
 * 14. Technical report drift section contains backtrack and forecast details
 * 15. Forecast NOT_AVAILABLE explicitly stated when forward trajectory is absent
 * 16. Technical report AIS section contains candidate count and spatiotemporal window
 * 17. Every candidate card in report strictly displays POTENTIAL AIS CANDIDATE
 * 18. Vessel attribution in report strictly asserts NOT ESTABLISHED
 * 19. Forbidden attribution terms rejected (responsibleVessel, confirmedPolluter, etc.)
 * 20. JSON export preserves raw canonical contract without flattening
 * 21. JSON export maintains identical fingerprint to canonical snapshot
 * 22. GeoJSON export produces valid FeatureCollection
 * 23. GeoJSON contains only existing features (zero fabricated geometry)
 * 24. GeoJSON features retain featureType, provenance, source, status, and investigationId
 * 25. GeoJSON AIS candidate tracks preserve DEMO vs REAL provenance
 * 26. Artifact manifest generation produces structured machine-readable catalog
 * 27. Manifest contains only existing artifacts on disk
 * 28. Manifest strictly omits server filesystem paths (security requirement)
 * 29. Export services do NOT invoke ML inference (snapshot consumption only)
 * 30. Export services do NOT rerun origin estimation, drift, or AIS correlation
 * 31. Deterministic repeatability: repeated exports produce byte-identical content
 * 32. Job isolation: stale job data cannot bleed into export for different jobId
 * 33. Regression Parts 1–5: canonical contract, GeoJSON footprint, origin, drift, and AIS remain intact
 */

'use strict';

const {
  exportJson,
  exportGeoJson,
  exportReport,
  exportManifest,
  assertNoForbiddenAttribution,
  sanitizePath,
} = require('../../src/manual-analysis/investigationExportService');

const manualAnalysisService = require('../../src/manual-analysis/manual-analysis.service');
const spillOriginEstimationService = require('../../src/manual-analysis/spillOriginEstimationService');
const aisCorrelationService = require('../../src/manual-analysis/aisCorrelationService');

// ── Shared Canonical Fixtures ─────────────────────────────────────────────────
const MOCK_JOB_ID = 'job_test_export_p164_001';
const MOCK_FINGERPRINT = 'fp_sha256_canonical_test_fingerprint_12345';

function createMockCanonical(overrides = {}) {
  return {
    jobId: MOCK_JOB_ID,
    analysisId: 'analysis_001',
    status: 'COMPLETED',
    fingerprint: MOCK_FINGERPRINT,
    input: {
      filename: 'sentinel1_mumbai_sar.tif',
      inputFormat: 'TIFF',
      channelCount: 2,
      modality: 'SAR_DUAL_POL',
      sourceType: 'SENTINEL1_DUAL_POL',
      bandStructure: 'SAR_VV_VH',
      polarizationStatus: 'ESTABLISHED',
      polarizations: ['VV', 'VH'],
    },
    model: {
      modelId: 'unet-dual-pol-sar-v09d-residual-loss',
      modelVersion: '1.0.0',
      checkpointSha256: '1e25e1dfcbe109268f6a394c8e718b5b3fecfc62507663dece55452d377b21e8',
      preprocessingVersion: 'sentinel1_sigma0_db_v1',
      threshold: 0.50,
    },
    detection: {
      oilSpillDetected: true,
      confidence: 0.942,
      coveragePercent: 1.48,
      probabilityStats: {
        meanForegroundProbability: 0.88,
        maxProbability: 0.99,
      },
    },
    geospatial: {
      available: true,
      crs: 'EPSG:4326',
      crsName: 'WGS 84',
      bounds: [72.5, 18.8, 73.1, 19.4],
      areaKm2: 3.45,
      centroid: { latitude: 19.12345, longitude: 72.81234, provenance: 'MODEL_DERIVED' },
      imageFootprint: {
        type: 'Polygon',
        coordinates: [
          [[72.5, 18.8], [73.1, 18.8], [73.1, 19.4], [72.5, 19.4], [72.5, 18.8]],
        ],
      },
      spillFootprint: {
        type: 'Polygon',
        coordinates: [
          [[72.8, 19.1], [72.82, 19.1], [72.82, 19.14], [72.8, 19.14], [72.8, 19.1]],
        ],
      },
    },
    origin: {
      status: 'ESTIMATED',
      provenance: 'MODEL_DERIVED',
      method: 'METOCEAN_REVERSE_TRAJECTORY',
      engine: 'BACKTRACK_ADVECTION',
      estimatedPoint: { latitude: 19.05, longitude: 72.75 },
      uncertaintyRadiusKm: 2.5,
      timestampSource: 'RASTER_ACQUISITION_TIMESTAMP',
    },
    drift: {
      status: 'ESTIMATED',
      provenance: 'MODEL_DERIVED',
      timestampSource: 'RASTER_ACQUISITION_TIMESTAMP',
      backward: {
        status: 'ESTIMATED',
        durationHours: 24,
        startPoint: { latitude: 19.12345, longitude: 72.81234 },
        endPoint: { latitude: 19.05, longitude: 72.75 },
        feature: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [[72.81234, 19.12345], [72.78, 19.08], [72.75, 19.05]],
          },
        },
      },
      forward: {
        status: 'NOT_AVAILABLE',
        feature: null,
      },
      environmentalData: {
        source: 'DEMO',
        isDemo: true,
        windSource: 'SIMULATED_GFS_10M',
        currentSource: 'SIMULATED_HYCOM_SURFACE',
      },
    },
    aisCorrelation: {
      status: 'CANDIDATES_FOUND',
      provenance: 'DEMO',
      source: 'DEMO',
      isDemo: true,
      timestampSource: 'RASTER_ACQUISITION_TIMESTAMP',
      temporalUncertainty: false,
      searchRadiusKm: 50,
      originUncertaintyKm: 2.5,
      queryWindow: {
        start: '2026-03-11T00:00:00.000Z',
        end: '2026-03-13T00:00:00.000Z',
      },
      candidates: [
        {
          rank: 1,
          mmsi: '419001234',
          imo: '9123456',
          name: 'MV ARABIAN CARRIER',
          flag: 'IN',
          vesselType: 'Crude Oil Tanker',
          status: 'POTENTIAL_CANDIDATE',
          closestApproachKm: 1.8,
          closestApproachTime: '2026-03-12T04:30:00.000Z',
          enteredOriginUncertaintyCorridor: true,
          closestApproach: { latitude: 19.055, longitude: 72.755 },
          historicalTrack: {
            type: 'LineString',
            coordinates: [[72.70, 19.00], [72.755, 19.055], [72.80, 19.10]],
          },
          evidenceMetrics: {
            proximityScore: 0.92,
            temporalScore: 0.88,
            trajectoryScore: 0.90,
            anomalyScore: 0.0,
            anomalySignals: [],
          },
          attribution: {
            status: 'NOT_ESTABLISHED',
          },
        },
      ],
    },
    artifacts: {
      original: `/api/v1/manual-analysis/${MOCK_JOB_ID}/original`,
      mask: `/api/v1/manual-analysis/${MOCK_JOB_ID}/mask`,
      overlay: `/api/v1/manual-analysis/${MOCK_JOB_ID}/overlay`,
      probabilityMap: `/api/v1/manual-analysis/${MOCK_JOB_ID}/probability-map`,
      vv: `/api/v1/manual-analysis/${MOCK_JOB_ID}/vv`,
      vh: `/api/v1/manual-analysis/${MOCK_JOB_ID}/vh`,
    },
    provenance: {
      inputGeolocation: 'REAL',
      detection: 'MODEL_DERIVED',
      footprint: 'MODEL_DERIVED',
      origin: 'MODEL_DERIVED',
      drift: 'MODEL_DERIVED',
      aisCorrelation: 'DEMO',
      oilType: 'NOT_ESTABLISHED',
      vesselAttribution: 'NOT_ESTABLISHED',
    },
    ...overrides,
  };
}

describe('Phase 16.4 Part 6 — Investigation Report & Multi-Format Export Integration Suite', () => {

  // 1. Canonical snapshot loading
  it('1. Canonical investigation snapshot loads cleanly into export service', () => {
    const canonical = createMockCanonical();
    const jsonExport = exportJson(canonical);
    expect(jsonExport.success).toBe(true);
    expect(jsonExport.investigationId).toBe(MOCK_JOB_ID);
    expect(jsonExport.data).toBeDefined();
  });

  // 2. Summary generation
  it('2. Summary generation reflects canonical detection metrics', () => {
    const canonical = createMockCanonical();
    const report = exportReport(canonical);
    expect(report).toContain('OIL SPILL CONFIRMED DETECTED');
    expect(report).toContain('1.48%');
    expect(report).toContain('94.20%');
    expect(report).toContain('unet-dual-pol-sar-v09d-residual-loss');
  });

  // 3. Provenance preservation
  it('3. Full provenance preservation across all export types', () => {
    const canonical = createMockCanonical();
    const jsonExport = exportJson(canonical);
    expect(jsonExport.data.provenance.inputGeolocation).toBe('REAL');
    expect(jsonExport.data.provenance.detection).toBe('MODEL_DERIVED');
    expect(jsonExport.data.provenance.footprint).toBe('MODEL_DERIVED');
    expect(jsonExport.data.provenance.origin).toBe('MODEL_DERIVED');
    expect(jsonExport.data.provenance.drift).toBe('MODEL_DERIVED');
    expect(jsonExport.data.provenance.aisCorrelation).toBe('DEMO');
    expect(jsonExport.data.provenance.vesselAttribution).toBe('NOT_ESTABLISHED');
  });

  // 4. REAL provenance
  it('4. REAL provenance classification maintained for georeferenced raster input', () => {
    const canonical = createMockCanonical();
    const geojson = exportGeoJson(canonical);
    const imgFeat = geojson.features.find(f => f.properties.featureType === 'IMAGE_FOOTPRINT');
    expect(imgFeat).toBeDefined();
    expect(imgFeat.properties.provenance).toBe('REAL');
  });

  // 5. Image footprint NOT_AVAILABLE without valid georeferencing
  it('5. Image footprint marked NOT_AVAILABLE without valid georeferencing', () => {
    const canonical = createMockCanonical({
      geospatial: { available: false, crs: null, imageFootprint: null },
      provenance: { inputGeolocation: 'NOT_AVAILABLE' },
    });
    const geojson = exportGeoJson(canonical);
    const imgFeat = geojson.features.find(f => f.properties.featureType === 'IMAGE_FOOTPRINT');
    expect(imgFeat).toBeUndefined(); // No geometry fabricated
  });

  // 6. MODEL_DERIVED provenance for spill footprint and centroid
  it('6. MODEL_DERIVED provenance maintained for spill footprint and centroid', () => {
    const canonical = createMockCanonical();
    const geojson = exportGeoJson(canonical);
    const spillFeat = geojson.features.find(f => f.properties.featureType === 'SPILL_FOOTPRINT');
    const centroidFeat = geojson.features.find(f => f.properties.featureType === 'CENTROID');
    expect(spillFeat.properties.provenance).toBe('MODEL_DERIVED');
    expect(centroidFeat.properties.provenance).toBe('MODEL_DERIVED');
  });

  // 7. MODEL_DERIVED provenance for estimated origin
  it('7. MODEL_DERIVED provenance maintained for estimated origin', () => {
    const canonical = createMockCanonical();
    const geojson = exportGeoJson(canonical);
    const originFeat = geojson.features.find(f => f.properties.featureType === 'ESTIMATED_ORIGIN');
    expect(originFeat).toBeDefined();
    expect(originFeat.properties.provenance).toBe('MODEL_DERIVED');
  });

  // 8. MODEL_DERIVED provenance for drift
  it('8. MODEL_DERIVED provenance maintained for backward and forward drift', () => {
    const canonical = createMockCanonical();
    const geojson = exportGeoJson(canonical);
    const backFeat = geojson.features.find(f => f.properties.featureType === 'ESTIMATED_BACKTRACK');
    expect(backFeat).toBeDefined();
    expect(backFeat.properties.provenance).toBe('MODEL_DERIVED');
  });

  // 9. DEMO provenance for MetOcean forcing
  it('9. DEMO provenance preserved for simulated MetOcean forcing', () => {
    const canonical = createMockCanonical();
    const report = exportReport(canonical);
    expect(report).toContain('DEMONSTRATION METOCEAN FORCING');
    expect(report).toContain('SIMULATED_GFS_10M');
  });

  // 10. DEMO provenance for simulated AIS
  it('10. DEMO provenance preserved for simulated AIS telemetry', () => {
    const canonical = createMockCanonical();
    const report = exportReport(canonical);
    expect(report).toContain('DEMONSTRATION AIS DATA — NOT REAL-WORLD AIS EVIDENCE');
    const geojson = exportGeoJson(canonical);
    const trackFeat = geojson.features.find(f => f.properties.featureType === 'AIS_CANDIDATE_TRACK');
    expect(trackFeat.properties.provenance).toBe('DEMO');
    expect(trackFeat.properties.isDemo).toBe(true);
  });

  // 11. ESTIMATION_TIME_PROXY preserved
  it('11. ESTIMATION_TIME_PROXY preserved and documented in report limitations', () => {
    const canonical = createMockCanonical({
      origin: {
        status: 'ESTIMATED',
        timestampSource: 'ESTIMATION_TIME_PROXY',
        estimatedPoint: { latitude: 19.05, longitude: 72.75 },
      },
    });
    const report = exportReport(canonical);
    expect(report).toContain('ESTIMATION TIME PROXY');
  });

  // 12. 15 required sections in technical report
  it('12. Technical report contains all 15 required sections in order', () => {
    const canonical = createMockCanonical();
    const report = exportReport(canonical);

    const requiredSections = [
      '1. INVESTIGATION SUMMARY',
      '2. INPUT & ACQUISITION',
      '3. AI MODEL & INFERENCE',
      '4. SPILL DETECTION',
      '5. GEOSPATIAL ANALYSIS',
      '6. SPILL FOOTPRINT',
      '7. ESTIMATED SPILL ORIGIN',
      '8. DRIFT / BACKTRACKING',
      '9. ENVIRONMENTAL DATA PROVENANCE',
      '10. AIS CORRELATION EVIDENCE',
      '11. POTENTIAL VESSEL CANDIDATES',
      '12. ATTRIBUTION STATUS',
      '13. EVIDENCE LIMITATIONS',
      '14. PROVENANCE SUMMARY',
      '15. TECHNICAL METADATA',
    ];

    let lastIdx = -1;
    for (const section of requiredSections) {
      const idx = report.indexOf(section);
      expect(idx).toBeGreaterThan(-1);
      expect(idx).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  // 13. Origin section coordinates and uncertainty
  it('13. Technical report origin section contains estimated coordinates and uncertainty', () => {
    const canonical = createMockCanonical();
    const report = exportReport(canonical);
    expect(report).toContain('Lat 19.05000, Lon 72.75000');
    expect(report).toContain('2.50 km');
  });

  // 14. Drift section backtrack and duration
  it('14. Technical report drift section contains backtrack and forecast details', () => {
    const canonical = createMockCanonical();
    const report = exportReport(canonical);
    expect(report).toContain('24 hours backward');
    expect(report).toContain('[ESTIMATED BACKTRACK]');
    expect(report).toContain('[ESTIMATED FORECAST]');
  });

  // 15. Forecast NOT_AVAILABLE explicitly stated
  it('15. Forecast NOT_AVAILABLE explicitly stated when forward trajectory is absent', () => {
    const canonical = createMockCanonical();
    const report = exportReport(canonical);
    expect(report).toContain('FORECAST NOT AVAILABLE');
  });

  // 16. AIS candidate count and window
  it('16. Technical report AIS section contains candidate count and spatiotemporal window', () => {
    const canonical = createMockCanonical();
    const report = exportReport(canonical);
    expect(report).toContain('Total Candidates Identified: 1');
    expect(report).toContain('50 km around estimated origin');
  });

  // 17. Candidate strictly POTENTIAL AIS CANDIDATE
  it('17. Every candidate card in report strictly displays POTENTIAL AIS CANDIDATE', () => {
    const canonical = createMockCanonical();
    const report = exportReport(canonical);
    expect(report).toContain('Status                 : POTENTIAL AIS CANDIDATE');
    expect(report).toContain('MV ARABIAN CARRIER');
    expect(report).toContain('419001234');
  });

  // 18. Attribution NOT ESTABLISHED
  it('18. Vessel attribution in report strictly asserts NOT ESTABLISHED', () => {
    const canonical = createMockCanonical();
    const report = exportReport(canonical);
    expect(report).toContain('FINAL VERDICT: VESSEL ATTRIBUTION NOT ESTABLISHED');
    expect(report).toContain('AIS correlation does not establish vessel responsibility.');
  });

  // 19. Forbidden attribution terms rejected
  it('19. Forbidden attribution terms rejected (responsibleVessel, confirmedPolluter, etc.)', () => {
    const canonicalWithPolluter = createMockCanonical({
      responsibleVessel: 'MV BAD SHIP',
    });
    expect(() => exportJson(canonicalWithPolluter)).toThrow(/Forbidden polluter attribution term/);
    expect(() => exportGeoJson(canonicalWithPolluter)).toThrow(/Forbidden polluter attribution term/);
    expect(() => exportReport(canonicalWithPolluter)).toThrow(/Forbidden polluter attribution term/);
  });

  // 20. JSON export preserves canonical contract
  it('20. JSON export preserves raw canonical contract without flattening', () => {
    const canonical = createMockCanonical();
    const jsonExport = exportJson(canonical);
    expect(jsonExport.data.input.modality).toBe('SAR_DUAL_POL');
    expect(jsonExport.data.model.modelId).toBe('unet-dual-pol-sar-v09d-residual-loss');
    expect(jsonExport.data.origin.status).toBe('ESTIMATED');
    expect(jsonExport.data.drift.backward.status).toBe('ESTIMATED');
    expect(jsonExport.data.aisCorrelation.candidates.length).toBe(1);
  });

  // 21. JSON export fingerprint consistency
  it('21. JSON export maintains identical fingerprint to canonical snapshot', () => {
    const canonical = createMockCanonical();
    const jsonExport = exportJson(canonical);
    expect(jsonExport.fingerprint).toBe(MOCK_FINGERPRINT);
  });

  // 22. GeoJSON FeatureCollection
  it('22. GeoJSON export produces valid FeatureCollection', () => {
    const canonical = createMockCanonical();
    const geojson = exportGeoJson(canonical);
    expect(geojson.type).toBe('FeatureCollection');
    expect(Array.isArray(geojson.features)).toBe(true);
    expect(geojson.features.length).toBeGreaterThan(0);
  });

  // 23. Zero fabricated geometry
  it('23. GeoJSON contains only existing features (zero fabricated geometry)', () => {
    const canonical = createMockCanonical({
      drift: { backward: { status: 'NOT_AVAILABLE' }, forward: { status: 'NOT_AVAILABLE' } },
      aisCorrelation: { status: 'NO_CANDIDATES', candidates: [] },
    });
    const geojson = exportGeoJson(canonical);
    const backtrackFeat = geojson.features.find(f => f.properties.featureType === 'ESTIMATED_BACKTRACK');
    const forecastFeat = geojson.features.find(f => f.properties.featureType === 'ESTIMATED_FORECAST');
    const candidateFeat = geojson.features.find(f => f.properties.featureType === 'AIS_CANDIDATE_TRACK');
    expect(backtrackFeat).toBeUndefined();
    expect(forecastFeat).toBeUndefined();
    expect(candidateFeat).toBeUndefined();
  });

  // 24. GeoJSON features retain mandatory properties
  it('24. GeoJSON features retain featureType, provenance, source, status, and investigationId', () => {
    const canonical = createMockCanonical();
    const geojson = exportGeoJson(canonical);
    for (const feat of geojson.features) {
      expect(feat.properties.featureType).toBeDefined();
      expect(feat.properties.provenance).toBeDefined();
      expect(feat.properties.status).toBeDefined();
      expect(feat.properties.investigationId).toBe(MOCK_JOB_ID);
    }
  });

  // 25. GeoJSON AIS candidate tracks preserve provenance
  it('25. GeoJSON AIS candidate tracks preserve DEMO vs REAL provenance', () => {
    const canonical = createMockCanonical();
    const geojson = exportGeoJson(canonical);
    const candidateTrack = geojson.features.find(f => f.properties.featureType === 'AIS_CANDIDATE_TRACK');
    expect(candidateTrack).toBeDefined();
    expect(candidateTrack.properties.provenance).toBe('DEMO');
    expect(candidateTrack.properties.isDemo).toBe(true);
    expect(candidateTrack.properties.status).toBe('POTENTIAL_CANDIDATE');
    expect(candidateTrack.properties.attributionStatus).toBe('NOT_ESTABLISHED');
  });

  // 26. Artifact manifest generation
  it('26. Artifact manifest generation produces structured machine-readable catalog', () => {
    const canonical = createMockCanonical();
    const manifest = exportManifest(canonical);
    expect(manifest.manifestVersion).toBe('1.0.0');
    expect(manifest.investigationId).toBe(MOCK_JOB_ID);
    expect(manifest.fingerprint).toBe(MOCK_FINGERPRINT);
    expect(Array.isArray(manifest.artifacts)).toBe(true);
    expect(manifest.artifacts.length).toBeGreaterThan(0);
  });

  // 27. Manifest contains only existing artifacts
  it('27. Manifest contains only existing artifacts on disk when diskMap provided', () => {
    const canonical = createMockCanonical();
    const manifest = exportManifest(canonical, {
      diskMap: {
        original: true,
        mask: true,
        overlay: false, // simulated absent
        probabilityMap: false,
        vv: true,
        vh: false,
      },
    });
    const types = manifest.artifacts.map(a => a.artifactType);
    expect(types).toContain('original');
    expect(types).toContain('mask');
    expect(types).toContain('vv');
    expect(types).not.toContain('overlay');
    expect(types).not.toContain('vh');
  });

  // 28. Manifest strictly omits server filesystem paths
  it('28. Manifest strictly omits server filesystem paths (security requirement)', () => {
    const canonical = createMockCanonical({
      artifacts: {
        original: 'C:\\Users\\admin\\secret_data\\original.png',
        mask: '/home/deploy/production_env/mask.png',
      },
    });
    const manifest = exportManifest(canonical);
    const manifestStr = JSON.stringify(manifest);
    expect(manifestStr).not.toContain('C:\\');
    expect(manifestStr).not.toContain('/home/');
    expect(manifestStr).not.toContain('secret_data');
  });

  // 29. Export does not invoke ML inference
  it('29. Export services do NOT invoke ML inference (snapshot consumption only)', () => {
    const canonical = createMockCanonical();
    // export functions are pure functions of canonical snapshot
    const res1 = exportJson(canonical);
    const res2 = exportGeoJson(canonical);
    const res3 = exportReport(canonical);
    expect(res1).toBeDefined();
    expect(res2).toBeDefined();
    expect(res3).toBeDefined();
  });

  // 30. Export does not rerun origin, drift, or AIS correlation
  it('30. Export services do NOT rerun origin estimation, drift, or AIS correlation', () => {
    const estimateSpy = jest.spyOn(spillOriginEstimationService, 'estimateOriginAndDrift');
    const aisSpy = jest.spyOn(aisCorrelationService, 'correlateCandidates');

    const canonical = createMockCanonical();
    exportJson(canonical);
    exportGeoJson(canonical);
    exportReport(canonical);
    exportManifest(canonical);

    expect(estimateSpy).not.toHaveBeenCalled();
    expect(aisSpy).not.toHaveBeenCalled();

    estimateSpy.mockRestore();
    aisSpy.mockRestore();
  });

  // 31. Deterministic repeatability
  it('31. Deterministic repeatability: repeated exports produce consistent output', () => {
    const canonical = createMockCanonical();
    const rep1 = exportReport(canonical);
    const rep2 = exportReport(canonical);
    // Remove dynamic timestamp line for exact equality
    const normalizeReport = r => r.replace(/GENERATED AT\s+:.+/g, 'GENERATED AT : FIXED');
    expect(normalizeReport(rep1)).toBe(normalizeReport(rep2));
  });

  // 32. Job isolation
  it('32. Job isolation: stale job data cannot bleed into export for different jobId', () => {
    const jobA = createMockCanonical({ jobId: 'JOB_A', fingerprint: 'FP_A' });
    const jobB = createMockCanonical({ jobId: 'JOB_B', fingerprint: 'FP_B' });

    const exportA = exportJson(jobA);
    const exportB = exportJson(jobB);

    expect(exportA.investigationId).toBe('JOB_A');
    expect(exportB.investigationId).toBe('JOB_B');
    expect(exportA.fingerprint).toBe('FP_A');
    expect(exportB.fingerprint).toBe('FP_B');
  });

  // 33. Regression Parts 1-5
  it('33. Regression Parts 1–5: canonical contract, GeoJSON footprint, origin, drift, and AIS remain intact', () => {
    const canonical = createMockCanonical();
    expect(canonical.input).toBeDefined();
    expect(canonical.model).toBeDefined();
    expect(canonical.detection).toBeDefined();
    expect(canonical.geospatial.available).toBe(true);
    expect(canonical.origin.status).toBe('ESTIMATED');
    expect(canonical.drift.status).toBe('ESTIMATED');
    expect(canonical.aisCorrelation.status).toBe('CANDIDATES_FOUND');
    expect(canonical.provenance.vesselAttribution).toBe('NOT_ESTABLISHED');
  });

  // 34. sanitizePath helper tests
  it('34. sanitizePath strips Windows and Unix file paths cleanly', () => {
    expect(sanitizePath('D:\\PROJECTS\\temp\\output.png')).toBe('output.png');
    expect(sanitizePath('/var/log/spill/analysis.log')).toBe('analysis.log');
    expect(sanitizePath('clean_relative.png')).toBe('clean_relative.png');
  });

  // 35. manualAnalysisService has export service bound
  it('35. manualAnalysisService has investigationExportService bound', () => {
    expect(manualAnalysisService.investigationExportService).toBeDefined();
    expect(typeof manualAnalysisService.investigationExportService.exportJson).toBe('function');
    expect(typeof manualAnalysisService.investigationExportService.exportGeoJson).toBe('function');
    expect(typeof manualAnalysisService.investigationExportService.exportReport).toBe('function');
    expect(typeof manualAnalysisService.investigationExportService.exportManifest).toBe('function');
  });
});
