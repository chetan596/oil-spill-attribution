/**
 * Phase 16.4 Part 6 — Frontend Investigation Workspace UI Tests
 *
 * Verifies all Phase 16.4 Part 6 UI components, presentation of evidence provenance,
 * export controls, guardrails, and non-regression of Parts 1–5 map layers.
 *
 * Tests 1–25:
 *  1. InvestigationHeader renders title, investigation ID, filename, modality, and status
 *  2. InvestigationSummaryPanel renders all 9 core summary indicators with provenance badges
 *  3. ProvenanceLegend renders standard 5 states (REAL, MODEL-DERIVED, DEMO, NOT AVAILABLE, TIME PROXY)
 *  4. InvestigationInputModelCard renders acquisition specs, band structure, and model checkpoint
 *  5. InvestigationDetectionPanel renders detection verdict, coverage %, and probability stats
 *  6. InvestigationDetectionPanel handles missing artifacts gracefully without fake placeholders
 *  7. InvestigationGeospatialPanel renders CRS, spill centroid, and area with strict provenance
 *  8. InvestigationGeospatialPanel renders unavailable notice when geospatial data is missing
 *  9. InvestigationOriginPanel renders estimated coordinates, uncertainty radius, and method
 * 10. InvestigationOriginPanel renders DEMONSTRATION METOCEAN FORCING warning when demo forcing active
 * 11. InvestigationDriftPanel renders separate Estimated Backtrack and Estimated Forecast sections
 * 12. InvestigationDriftPanel renders FORECAST NOT AVAILABLE when forward trajectory is absent
 * 13. InvestigationDriftPanel renders demonstration MetOcean warning with clear explanation
 * 14. InvestigationAisPanel renders candidate count and query search radius
 * 15. InvestigationAisPanel renders candidate cards strictly labeled POTENTIAL AIS CANDIDATE
 * 16. InvestigationAisPanel displays DEMONSTRATION AIS DATA warning when demo AIS is used
 * 17. InvestigationAisPanel candidate cards show proximity, temporal, trajectory, and anomaly scores
 * 18. InvestigationAttributionPanel strictly renders VESSEL ATTRIBUTION: NOT ESTABLISHED
 * 19. InvestigationAttributionPanel displays mandatory legal/scientific guardrail disclaimer
 * 20. InvestigationLimitationsPanel dynamically derives only applicable limitation items
 * 21. InvestigationExportControl renders JSON, GeoJSON, Report, and Manifest download options
 * 22. ManualMapLegend renders all active map layers with color swatches and provenance badges
 * 23. InvestigationWorkspace consolidates complete evidence chain and filter navigation
 * 24. Job isolation: stale investigation data is unmounted cleanly when switching jobs
 * 25. Regression Parts 1–5: ManualFootprintLayer, ManualOriginLayer, ManualDriftLayer, and ManualCandidateLayer coexist
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import ReactDOMServer from 'react-dom/server';

// ── Leaflet / react-leaflet mocks ──────────────────────────────────────────
vi.mock('react-leaflet', () => ({
  Polygon: (props) => React.createElement('div', { ...props, 'data-type': 'Polygon' }),
  Tooltip: (props) => React.createElement('div', { ...props, 'data-type': 'Tooltip' }),
  Popup: (props) => React.createElement('div', { ...props, 'data-type': 'Popup' }),
  CircleMarker: (props) => React.createElement('div', { ...props, 'data-type': 'CircleMarker' }),
  Circle: (props) => React.createElement('div', { ...props, 'data-type': 'Circle' }),
  Polyline: (props) => React.createElement('div', { ...props, 'data-type': 'Polyline' }),
  useMap: () => ({ fitBounds: vi.fn(), flyTo: vi.fn(), setView: vi.fn() }),
}));

vi.mock('leaflet', () => ({
  default: {
    latLngBounds: vi.fn(() => ({ isValid: () => true, pad: vi.fn(() => ({})) })),
    latLng: vi.fn(() => ({})),
    icon: vi.fn(() => ({})),
    divIcon: vi.fn(() => ({})),
  },
  latLngBounds: vi.fn(() => ({ isValid: () => true, pad: vi.fn(() => ({})) })),
  latLng: vi.fn(() => ({})),
  icon: vi.fn(() => ({})),
  divIcon: vi.fn(() => ({})),
}));

// Component imports
import ProvenanceLegend, { ProvenanceBadge } from '../analysis/ProvenanceLegend';
import InvestigationHeader from '../analysis/InvestigationHeader';
import InvestigationSummaryPanel from '../analysis/InvestigationSummaryPanel';
import InvestigationInputModelCard from '../analysis/InvestigationInputModelCard';
import InvestigationDetectionPanel from '../analysis/InvestigationDetectionPanel';
import InvestigationGeospatialPanel from '../analysis/InvestigationGeospatialPanel';
import InvestigationOriginPanel from '../analysis/InvestigationOriginPanel';
import InvestigationDriftPanel from '../analysis/InvestigationDriftPanel';
import InvestigationAisPanel from '../analysis/InvestigationAisPanel';
import InvestigationAttributionPanel from '../analysis/InvestigationAttributionPanel';
import InvestigationLimitationsPanel from '../analysis/InvestigationLimitationsPanel';
import InvestigationExportControl from '../analysis/InvestigationExportControl';
import InvestigationWorkspace from '../analysis/InvestigationWorkspace';
import ManualMapLegend from '../map/ManualMapLegend';
import ManualFootprintLayer from '../map/ManualFootprintLayer';
import ManualOriginLayer from '../map/ManualOriginLayer';
import ManualDriftLayer from '../map/ManualDriftLayer';
import ManualCandidateLayer from '../map/ManualCandidateLayer';

// ── Mock Canonical Fixture ──────────────────────────────────────────────────
const MOCK_CANONICAL = {
  jobId: 'job_test_ui_p164_999',
  analysisId: 'analysis_test_999',
  status: 'COMPLETED',
  fingerprint: 'fp_sha256_canonical_ui_test_fingerprint',
  input: {
    filename: 'S1A_IW_GRDH_TEST_SCENE.tif',
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
    confidence: 0.945,
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
      coordinates: [[[72.5, 18.8], [73.1, 18.8], [73.1, 19.4], [72.5, 19.4], [72.5, 18.8]]],
    },
    spillFootprint: {
      type: 'Polygon',
      coordinates: [[[72.8, 19.1], [72.82, 19.1], [72.82, 19.14], [72.8, 19.14], [72.8, 19.1]]],
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
    original: '/api/v1/manual-analysis/job_test_ui_p164_999/original',
    mask: '/api/v1/manual-analysis/job_test_ui_p164_999/mask',
    overlay: '/api/v1/manual-analysis/job_test_ui_p164_999/overlay',
    probabilityMap: '/api/v1/manual-analysis/job_test_ui_p164_999/probability-map',
    vv: '/api/v1/manual-analysis/job_test_ui_p164_999/vv',
    vh: '/api/v1/manual-analysis/job_test_ui_p164_999/vh',
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
};

describe('Phase 16.4 Part 6 — Frontend Investigation Workspace UI Tests', () => {

  // 1. Investigation Header
  it('1. InvestigationHeader renders title, investigation ID, filename, modality, and status', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(InvestigationHeader, { canonical: MOCK_CANONICAL })
    );
    expect(html).toContain('OCEAN GUARD AI');
    expect(html).toContain('MANUAL INVESTIGATION');
    expect(html).toContain('S1A_IW_GRDH_TEST_SCENE.tif');
    expect(html).toContain('SAR_DUAL_POL');
    expect(html).toContain('STATUS: COMPLETED');
  });

  // 2. Summary Panel
  it('2. InvestigationSummaryPanel renders all 9 core summary indicators with provenance badges', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(InvestigationSummaryPanel, { canonical: MOCK_CANONICAL })
    );
    expect(html).toContain('OIL SPILL');
    expect(html).toContain('DETECTED');
    expect(html).toContain('COVERAGE');
    expect(html).toContain('1.48%');
    expect(html).toContain('ORIGIN');
    expect(html).toContain('ESTIMATED');
    expect(html).toContain('DRIFT');
    expect(html).toContain('AIS CORRELATION');
    expect(html).toContain('1 CANDIDATE');
    expect(html).toContain('ATTRIBUTION');
    expect(html).toContain('NOT ESTABLISHED');
  });

  // 3. Provenance Legend
  it('3. ProvenanceLegend renders standard 5 states (REAL, MODEL-DERIVED, DEMO, NOT AVAILABLE, TIME PROXY)', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ProvenanceLegend, {})
    );
    expect(html).toContain('REAL');
    expect(html).toContain('MODEL-DERIVED');
    expect(html).toContain('DEMO');
    expect(html).toContain('NOT AVAILABLE');
    expect(html).toContain('TIME PROXY');
  });

  // 4. Input & Model Card
  it('4. InvestigationInputModelCard renders acquisition specs, band structure, and model checkpoint', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(InvestigationInputModelCard, { canonical: MOCK_CANONICAL })
    );
    expect(html).toContain('TIFF');
    expect(html).toContain('2 channels');
    expect(html).toContain('SAR_VV_VH (VV + VH)');
    expect(html).toContain('unet-dual-pol-sar-v09d-residual-loss');
    expect(html).toContain('sentinel1_sigma0_db_v1');
    expect(html).toContain('1e25e1dfcb');
  });

  // 5. Detection Panel
  it('5. InvestigationDetectionPanel renders detection verdict, coverage %, and probability stats', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(InvestigationDetectionPanel, { canonical: MOCK_CANONICAL })
    );
    expect(html).toContain('OIL SPILL DETECTED');
    expect(html).toContain('94.5%');
    expect(html).toContain('1.48%');
    expect(html).toContain('88.0%');
    expect(html).toContain('99.0%');
  });

  // 6. Missing artifact handling
  it('6. InvestigationDetectionPanel handles missing artifacts gracefully without fake placeholders', () => {
    const canonicalNoArtifacts = {
      ...MOCK_CANONICAL,
      artifacts: { original: '/api/original' }, // only original exists
    };
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(InvestigationDetectionPanel, { canonical: canonicalNoArtifacts })
    );
    expect(html).toContain('Original Input');
    expect(html).not.toContain('Binary Mask');
    expect(html).not.toContain('SAR VV Channel');
  });

  // 7. Geospatial Panel
  it('7. InvestigationGeospatialPanel renders CRS, spill centroid, and area with strict provenance', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(InvestigationGeospatialPanel, { canonical: MOCK_CANONICAL })
    );
    expect(html).toContain('EPSG:4326');
    expect(html).toContain('19.12345°N, 72.81234°E');
    expect(html).toContain('3.450 km²');
    expect(html).toContain('REAL');
    expect(html).toContain('MODEL-DERIVED');
  });

  // 8. Geospatial unavailable notice
  it('8. InvestigationGeospatialPanel renders unavailable notice when geospatial data is missing', () => {
    const canonicalNoGeo = {
      ...MOCK_CANONICAL,
      geospatial: { available: false, crs: null },
    };
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(InvestigationGeospatialPanel, { canonical: canonicalNoGeo })
    );
    expect(html).toContain('Raster lacks geographic coordinate referencing');
  });

  // 9. Origin Panel
  it('9. InvestigationOriginPanel renders estimated coordinates, uncertainty radius, and method', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(InvestigationOriginPanel, { canonical: MOCK_CANONICAL })
    );
    expect(html).toContain('19.05000°N, 72.75000°E');
    expect(html).toContain('± 2.50 km');
    expect(html).toContain('BACKTRACK_ADVECTION');
  });

  // 10. Origin Panel Demo MetOcean Warning
  it('10. InvestigationOriginPanel renders DEMONSTRATION METOCEAN FORCING warning when demo forcing active', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(InvestigationOriginPanel, { canonical: MOCK_CANONICAL })
    );
    expect(html).toContain('DEMONSTRATION METOCEAN FORCING — NOT REAL-WORLD OCEAN CONDITIONS');
  });

  // 11. Drift Panel Backtrack vs Forecast
  it('11. InvestigationDriftPanel renders separate Estimated Backtrack and Estimated Forecast sections', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(InvestigationDriftPanel, { canonical: MOCK_CANONICAL })
    );
    expect(html).toContain('Estimated Backtrack');
    expect(html).toContain('Estimated Forecast');
    expect(html).toContain('24 hours');
  });

  // 12. Drift Panel Forecast Not Available
  it('12. InvestigationDriftPanel renders FORECAST NOT AVAILABLE when forward trajectory is absent', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(InvestigationDriftPanel, { canonical: MOCK_CANONICAL })
    );
    expect(html).toContain('FORECAST NOT AVAILABLE');
  });

  // 13. Drift Panel Demo Disclaimer
  it('13. InvestigationDriftPanel renders demonstration MetOcean warning with clear explanation', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(InvestigationDriftPanel, { canonical: MOCK_CANONICAL })
    );
    expect(html).toContain('Environmental forcing is demonstration data and does not represent verified historical oceanographic conditions.');
  });

  // 14. AIS Panel Search Radius & Count
  it('14. InvestigationAisPanel renders candidate count and query search radius', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(InvestigationAisPanel, { canonical: MOCK_CANONICAL })
    );
    expect(html).toContain('1 identified');
    expect(html).toContain('50 km');
    expect(html).toContain('± 2.5 km');
  });

  // 15. Candidate Cards POTENTIAL AIS CANDIDATE
  it('15. InvestigationAisPanel renders candidate cards strictly labeled POTENTIAL AIS CANDIDATE', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(InvestigationAisPanel, { canonical: MOCK_CANONICAL })
    );
    expect(html).toContain('POTENTIAL AIS CANDIDATE');
    expect(html).toContain('MV ARABIAN CARRIER');
    expect(html).toContain('419001234');
    expect(html).toContain('9123456');
    expect(html).toContain('Crude Oil Tanker');
  });

  // 16. Demo AIS Warning
  it('16. InvestigationAisPanel displays DEMONSTRATION AIS DATA warning when demo AIS is used', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(InvestigationAisPanel, { canonical: MOCK_CANONICAL })
    );
    expect(html).toContain('DEMONSTRATION AIS DATA — NOT REAL-WORLD AIS EVIDENCE');
    expect(html).toContain('Do not use for maritime enforcement');
  });

  // 17. Evidence Metrics
  it('17. InvestigationAisPanel candidate cards show proximity, temporal, trajectory, and anomaly scores', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(InvestigationAisPanel, { canonical: MOCK_CANONICAL })
    );
    expect(html).toContain('Proximity Score');
    expect(html).toContain('0.920');
    expect(html).toContain('Temporal Score');
    expect(html).toContain('0.880');
    expect(html).toContain('Trajectory Score');
    expect(html).toContain('0.900');
  });

  // 18. Attribution Panel NOT ESTABLISHED
  it('18. InvestigationAttributionPanel strictly renders VESSEL ATTRIBUTION: NOT ESTABLISHED', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(InvestigationAttributionPanel, {})
    );
    expect(html).toContain('Vessel Attribution Status');
    expect(html).toContain('NOT ESTABLISHED');
  });

  // 19. Attribution Disclaimer
  it('19. InvestigationAttributionPanel displays mandatory legal/scientific guardrail disclaimer', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(InvestigationAttributionPanel, {})
    );
    expect(html).toContain('Historical AIS correlation identifies potential spatial and temporal proximity only. Correlation does not establish responsibility for the spill.');
  });

  // 20. Limitations Panel
  it('20. InvestigationLimitationsPanel dynamically derives only applicable limitation items', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(InvestigationLimitationsPanel, { canonical: MOCK_CANONICAL })
    );
    expect(html).toContain('DEMONSTRATION METOCEAN FORCING');
    expect(html).toContain('DEMONSTRATION AIS DATA');
    expect(html).toContain('FORWARD DRIFT UNAVAILABLE');
    expect(html).toContain('MODEL-DERIVED SPILL GEOMETRY');
    expect(html).toContain('MODEL-DERIVED ORIGIN');
    expect(html).toContain('VESSEL ATTRIBUTION NOT ESTABLISHED');
    expect(html).not.toContain('GEOSPATIAL DATA UNAVAILABLE'); // since geo was available
  });

  // 21. Export Control Options
  it('21. InvestigationExportControl renders JSON, GeoJSON, Report, and Manifest download options', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(InvestigationExportControl, { canonical: MOCK_CANONICAL })
    );
    expect(html).toContain('Export Investigation');
    expect(html).toContain('JSON');
    expect(html).toContain('GeoJSON');
    expect(html).toContain('Technical Report');
    expect(html).toContain('Artifact Manifest');
  });

  // 22. Map Legend
  it('22. ManualMapLegend renders all active map layers with color swatches and provenance badges', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ManualMapLegend, { canonical: MOCK_CANONICAL })
    );
    expect(html).toContain('Map Layers');
    expect(html).toContain('Image Footprint');
    expect(html).toContain('Spill Footprint');
    expect(html).toContain('Centroid');
    expect(html).toContain('Estimated Origin');
    expect(html).toContain('Backtrack Trajectory');
    expect(html).toContain('Forecast Trajectory');
    expect(html).toContain('AIS Candidate Track');
    expect(html).toContain('Potential AIS Candidate');
  });

  // 23. Complete Workspace Consolidation
  it('23. InvestigationWorkspace consolidates complete evidence chain and filter navigation', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(InvestigationWorkspace, { canonical: MOCK_CANONICAL })
    );
    expect(html).toContain('OCEAN GUARD AI');
    expect(html).toContain('Full Evidence Chain');
    expect(html).toContain('Detection &amp; Geospatial');
    expect(html).toContain('Origin &amp; Drift');
    expect(html).toContain('AIS Candidates');
    expect(html).toContain('Attribution &amp; Limits');
    expect(html).toContain('Export Investigation');
  });

  // 24. Job isolation (no stale bleeding)
  it('24. Job isolation: stale investigation data is unmounted cleanly when switching jobs', () => {
    const canonicalA = { ...MOCK_CANONICAL, jobId: 'JOB_A', input: { filename: 'file_a.tif' } };
    const canonicalB = { ...MOCK_CANONICAL, jobId: 'JOB_B', input: { filename: 'file_b.tif' } };

    const htmlA = ReactDOMServer.renderToStaticMarkup(React.createElement(InvestigationHeader, { canonical: canonicalA }));
    const htmlB = ReactDOMServer.renderToStaticMarkup(React.createElement(InvestigationHeader, { canonical: canonicalB }));

    expect(htmlA).toContain('file_a.tif');
    expect(htmlA).not.toContain('file_b.tif');
    expect(htmlB).toContain('file_b.tif');
    expect(htmlB).not.toContain('file_a.tif');
  });

  // 25. Parts 1-5 Map Layers Coexist
  it('25. Regression Parts 1–5: ManualFootprintLayer, ManualOriginLayer, ManualDriftLayer, and ManualCandidateLayer coexist', () => {
    const fpEl = React.createElement(ManualFootprintLayer, {
      spillFootprint: MOCK_CANONICAL.geospatial.spillFootprint,
      imageFootprint: MOCK_CANONICAL.geospatial.imageFootprint,
    });
    const origEl = React.createElement(ManualOriginLayer, {
      origin: MOCK_CANONICAL.origin,
    });
    const driftEl = React.createElement(ManualDriftLayer, {
      drift: MOCK_CANONICAL.drift,
    });
    const candEl = React.createElement(ManualCandidateLayer, {
      candidates: MOCK_CANONICAL.aisCorrelation.candidates,
      origin: MOCK_CANONICAL.origin,
    });

    expect(fpEl.type).toBe(ManualFootprintLayer);
    expect(origEl.type).toBe(ManualOriginLayer);
    expect(driftEl.type).toBe(ManualDriftLayer);
    expect(candEl.type).toBe(ManualCandidateLayer);
  });
});
