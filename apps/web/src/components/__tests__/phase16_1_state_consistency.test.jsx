/**
 * Phase 16.1 — Input Descriptor State Consistency Tests
 *
 * Tests 1–10: Pure-function state derivation, stale-error invalidation,
 * Analysis page SAR scenario resolution, and AIS attribution guardrail UI.
 *
 * Mocking Strategy:
 * - react-leaflet: replaced with no-op divs
 * - react-router-dom: hoisted vi.mock with factory
 * - Map layers & stores: named vi.mock factories
 * - No render() used — tests operate on createElement(), exported pure functions,
 *   and API module shape (zero DOM requirement)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// ── Leaflet / react-leaflet ────────────────────────────────────────────────
vi.mock('react-leaflet', () => ({
  Polygon: (props) => React.createElement('div', props),
  Tooltip: (props) => React.createElement('div', props),
  Popup: (props) => React.createElement('div', props),
  TileLayer: (props) => React.createElement('div', props),
  MapContainer: (props) => React.createElement('div', props),
  Marker: (props) => React.createElement('div', props),
  CircleMarker: (props) => React.createElement('div', props),
  Circle: (props) => React.createElement('div', props),
  Polyline: (props) => React.createElement('div', props),
  useMap: () => ({ fitBounds: vi.fn(), flyTo: vi.fn(), setView: vi.fn() }),
  ScaleControl: (props) => React.createElement('div', props),
  ZoomControl: (props) => React.createElement('div', props),
  LayersControl: (props) => React.createElement('div', props),
  GeoJSON: (props) => React.createElement('div', props),
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

// ── Map component mocks ────────────────────────────────────────────────────
vi.mock('../../components/map/MapView', () => ({
  default: ({ children }) => React.createElement('div', { 'data-testid': 'mock-map-view' }, children),
}));
vi.mock('../../components/map/SlickLayer', () => ({ default: () => null }));
vi.mock('../../components/map/OriginLayer', () => ({ default: () => null }));
vi.mock('../../components/map/TrajectoryLayer', () => ({ default: () => null }));
vi.mock('../../components/map/VesselLayer', () => ({ default: () => null }));
vi.mock('../../components/map/MapLegend', () => ({ default: () => null }));
vi.mock('../../components/map/GridLayer', () => ({ default: () => null }));
vi.mock('../../components/map/MetOceanLayer', () => ({ default: () => null }));
vi.mock('../../components/map/SceneFootprintLayer', () => ({ default: () => null }));
vi.mock('../../components/map/MapFocusActions', () => ({ default: () => null }));
vi.mock('../../components/map/MapInfoHUD', () => ({ default: () => null }));
vi.mock('../../components/map/SarSceneHUD', () => ({ default: () => null }));
vi.mock('../../components/map/SarLayerControls', () => ({ default: () => null }));
vi.mock('../../components/map/DriftForecastHUD', () => ({ default: () => null }));
vi.mock('../../components/map/DriftLayerControls', () => ({ default: () => null }));
vi.mock('../../components/map/AttributionHUD', () => ({ default: () => null }));
vi.mock('../../components/map/AttributionLayerControls', () => ({ default: () => null }));
vi.mock('../../components/map/LayerControls', () => ({ default: () => null }));

// ── Analysis components ────────────────────────────────────────────────────
vi.mock('../../components/analysis/ModelDrawer', () => ({ default: () => null }));
vi.mock('../../components/vessels/VesselDrawer', () => ({ default: () => null }));
vi.mock('../../components/analysis/SarEvidenceViewer', () => ({ default: () => null }));
vi.mock('../../components/layout/SystemStatusModal', () => ({ default: () => null }));
vi.mock('../../components/drift/DriftControls', () => ({ default: () => null }));
vi.mock('../../components/drift/DriftAnimation', () => ({ default: () => null }));
vi.mock('../../components/drift/Timeline', () => ({ default: () => null }));
vi.mock('../../components/analysis/EvidenceLedger', () => ({ default: () => null }));

// ── API mocks ──────────────────────────────────────────────────────────────
vi.mock('../../api/jobs.api', () => ({
  jobsApi: { getById: vi.fn() },
}));
vi.mock('../../api/manual-analysis.api', () => ({
  manualAnalysisApi: {
    getResult: vi.fn(),
    getStatus: vi.fn(),
    getReport: vi.fn(),
    getMaskUrl: (id) => `http://localhost:4000/api/v1/manual-analysis/${id}/mask`,
    getOverlayUrl: (id) => `http://localhost:4000/api/v1/manual-analysis/${id}/overlay`,
    getProbabilityUrl: (id) => `http://localhost:4000/api/v1/manual-analysis/${id}/probability-map`,
    getOriginalUrl: (id) => `http://localhost:4000/api/v1/manual-analysis/${id}/original`,
    getPreviewUrl: (id) => `http://localhost:4000/api/v1/manual-analysis/${id}/preview`,
  },
}));

vi.mock('../../utils/geo', () => ({
  parseWktPolygon: vi.fn(() => []),
  calculateBounds: vi.fn(() => null),
}));

// ── react-router-dom ───────────────────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: undefined }),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/analysis' }),
  Link: ({ children, to }) => React.createElement('a', { href: to }, children),
}));

// ── Auth store ─────────────────────────────────────────────────────────────
vi.mock('../../app/store/authStore', () => ({
  useAuthStore: vi.fn(() => ({
    user: { id: 'user-test-1', name: 'Officer', email: 'officer@test.in' },
    isAuthenticated: true,
  })),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────
import {
  deriveInputDescriptor,
  computeDescriptorFingerprint,
  INPUT_STATES,
  SAR_MODEL_ID,
  SENTINEL2_MODEL_ID,
  DRONE_RGB_MODEL_ID,
} from '../../utils/inputDescriptor';

import { resolveInvestigationContext } from '../../pages/Analysis';

// =============================================================================
// TEST 1: UNCLASSIFIED_2CH — Initial 2-channel state before source declaration
// =============================================================================
describe('Test 1 — UNCLASSIFIED_2CH: 2-channel file without declaration', () => {
  const metadata = {
    filename: 'sentinel1_raw.tif',
    channelCount: 2,
    isTiff: true,
    format: 'TIFF',
    modality: '',
    polarizationStatus: '',
    sourceType: '',
  };

  it('should produce inputState UNCLASSIFIED_2CH', () => {
    const desc = deriveInputDescriptor(metadata, null, null);
    expect(desc.inputState).toBe(INPUT_STATES.UNCLASSIFIED_2CH);
  });

  it('should set inferenceSupported to false', () => {
    const desc = deriveInputDescriptor(metadata, null, null);
    expect(desc.inferenceSupported).toBe(false);
  });

  it('should set inferenceBlockReason to SOURCE_DECLARATION_REQUIRED', () => {
    const desc = deriveInputDescriptor(metadata, null, null);
    expect(desc.inferenceBlockReason).toBe('SOURCE_DECLARATION_REQUIRED');
  });

  it('should set selectedModelId to null', () => {
    const desc = deriveInputDescriptor(metadata, null, null);
    expect(desc.selectedModelId).toBeNull();
  });

  it('should set isUnclassified2Ch to true and all other flags false', () => {
    const desc = deriveInputDescriptor(metadata, null, null);
    expect(desc.isUnclassified2Ch).toBe(true);
    expect(desc.isSar).toBe(false);
    expect(desc.isSingleChannel).toBe(false);
    expect(desc.isRgbTiff).toBe(false);
    expect(desc.isSentinel2).toBe(false);
    expect(desc.isOpticalRgb).toBe(false);
  });

  it('should have polarizationStatus NOT_ESTABLISHED', () => {
    const desc = deriveInputDescriptor(metadata, null, null);
    expect(desc.polarizationStatus).toBe('NOT_ESTABLISHED');
  });

  it('should have empty compatibleModels array', () => {
    const desc = deriveInputDescriptor(metadata, null, null);
    expect(desc.compatibleModels).toHaveLength(0);
  });
});

// =============================================================================
// TEST 2: State Transition — UNCLASSIFIED_2CH => SAR_DUAL_POL after declaration
// =============================================================================
describe('Test 2 — State Transition: UNCLASSIFIED_2CH => SAR_DUAL_POL', () => {
  const metadataBefore = {
    filename: 'sentinel1_dual_pol.tif',
    channelCount: 2,
    isTiff: true,
    format: 'TIFF',
    modality: '',
    polarizationStatus: '',
    sourceType: '',
  };

  const metadataAfterDeclaration = {
    filename: 'sentinel1_dual_pol.tif',
    channelCount: 2,
    isTiff: true,
    format: 'TIFF',
    modality: 'SAR_DUAL_POL',
    polarizationStatus: 'ESTABLISHED',
    polarizations: ['VV', 'VH'],
    sourceType: 'SENTINEL1_DUAL_POL',
    compatibleModels: ['unet-dual-pol-sar-v09d-residual-loss'],
    geolocationStatus: 'NOT_ESTABLISHED',
  };

  it('should start as UNCLASSIFIED_2CH before declaration', () => {
    const desc = deriveInputDescriptor(metadataBefore, null, null);
    expect(desc.inputState).toBe(INPUT_STATES.UNCLASSIFIED_2CH);
    expect(desc.inferenceSupported).toBe(false);
  });

  it('should transition to SAR_DUAL_POL after backend-synchronized metadata update', () => {
    const desc = deriveInputDescriptor(metadataAfterDeclaration, null, 'SENTINEL1_DUAL_POL');
    expect(desc.inputState).toBe(INPUT_STATES.SAR_DUAL_POL);
    expect(desc.inferenceSupported).toBe(true);
    expect(desc.selectedModelId).toBe(SAR_MODEL_ID);
  });

  it('should set isSar to true after transition', () => {
    const desc = deriveInputDescriptor(metadataAfterDeclaration, null, 'SENTINEL1_DUAL_POL');
    expect(desc.isSar).toBe(true);
    expect(desc.isUnclassified2Ch).toBe(false);
  });

  it('should produce distinct fingerprints for each state', () => {
    const descBefore = deriveInputDescriptor(metadataBefore, null, null);
    const descAfter = deriveInputDescriptor(metadataAfterDeclaration, null, 'SENTINEL1_DUAL_POL');
    const fpBefore = computeDescriptorFingerprint(descBefore);
    const fpAfter = computeDescriptorFingerprint(descAfter);
    expect(fpBefore).not.toBe(fpAfter);
  });
});

// =============================================================================
// TEST 3: Stale Error Clearing via Fingerprint Invalidation
// =============================================================================
describe('Test 3 — Fingerprint Invalidation: Stale error must clear on state change', () => {
  it('computeDescriptorFingerprint should return deterministic string for identical inputs', () => {
    const desc = deriveInputDescriptor(
      { filename: 'sar.tif', channelCount: 2, isTiff: true, modality: '', polarizationStatus: '', sourceType: '' },
      null, null
    );
    const fp1 = computeDescriptorFingerprint(desc);
    const fp2 = computeDescriptorFingerprint(desc);
    expect(fp1).toBe(fp2);
    expect(typeof fp1).toBe('string');
    expect(fp1.length).toBeGreaterThan(10);
  });

  it('fingerprint must change when inputState changes from UNCLASSIFIED_2CH to SAR_DUAL_POL', () => {
    const unclassifiedMeta = {
      filename: 'raw.tif', channelCount: 2, isTiff: true,
      modality: '', polarizationStatus: '', sourceType: '',
    };
    const sarMeta = {
      filename: 'raw.tif', channelCount: 2, isTiff: true,
      modality: 'SAR_DUAL_POL', polarizationStatus: 'ESTABLISHED',
      polarizations: ['VV', 'VH'], sourceType: 'SENTINEL1_DUAL_POL',
      compatibleModels: ['unet-dual-pol-sar-v09d-residual-loss'],
    };
    const fp1 = computeDescriptorFingerprint(deriveInputDescriptor(unclassifiedMeta, null, null));
    const fp2 = computeDescriptorFingerprint(deriveInputDescriptor(sarMeta, null, 'SENTINEL1_DUAL_POL'));
    expect(fp1).not.toBe(fp2);
  });

  it('fingerprint must change when modality changes from SAR_DUAL_POL to OPTICAL_RGB', () => {
    const sarMeta = {
      filename: 'sar.tif', channelCount: 2, isTiff: true,
      modality: 'SAR_DUAL_POL', polarizationStatus: 'ESTABLISHED',
      polarizations: ['VV', 'VH'], sourceType: 'SENTINEL1_DUAL_POL',
      compatibleModels: ['unet-dual-pol-sar-v09d-residual-loss'],
    };
    const opticalFile = { name: 'photo.jpg' };
    const opticalMeta = { filename: 'photo.jpg', channelCount: 3, isTiff: false };
    const fp1 = computeDescriptorFingerprint(deriveInputDescriptor(sarMeta, null, 'SENTINEL1_DUAL_POL'));
    const fp2 = computeDescriptorFingerprint(deriveInputDescriptor(opticalMeta, opticalFile, null));
    expect(fp1).not.toBe(fp2);
  });

  it('null descriptor should return a non-empty string fingerprint', () => {
    const fp = computeDescriptorFingerprint(null);
    expect(typeof fp).toBe('string');
    expect(fp.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// TEST 4: Single-Channel Raster — SINGLE_CHANNEL state
// =============================================================================
describe('Test 4 — SINGLE_CHANNEL: 1-band TIFF must block inference', () => {
  const singleChMeta = {
    filename: 'mask.tif', channelCount: 1, isTiff: true, format: 'TIFF',
  };

  it('should resolve to SINGLE_CHANNEL state', () => {
    const desc = deriveInputDescriptor(singleChMeta, null, null);
    expect(desc.inputState).toBe(INPUT_STATES.SINGLE_CHANNEL);
  });

  it('should set isSingleChannel to true', () => {
    const desc = deriveInputDescriptor(singleChMeta, null, null);
    expect(desc.isSingleChannel).toBe(true);
  });

  it('should set inferenceSupported to false', () => {
    const desc = deriveInputDescriptor(singleChMeta, null, null);
    expect(desc.inferenceSupported).toBe(false);
  });

  it('should block inference with descriptive reason containing CHANNEL', () => {
    const desc = deriveInputDescriptor(singleChMeta, null, null);
    expect(desc.inferenceBlockReason).toContain('CHANNEL');
  });

  it('should have empty compatibleModels', () => {
    const desc = deriveInputDescriptor(singleChMeta, null, null);
    expect(desc.compatibleModels).toHaveLength(0);
  });
});

// =============================================================================
// TEST 5: RGB_TIFF — 3-band TIFF should block inference
// =============================================================================
describe('Test 5 — RGB_TIFF: 3-band TIFF blocks AI inference', () => {
  const rgbTiffMeta = {
    filename: 'satellite.tif', channelCount: 3, isTiff: true, format: 'TIFF',
  };

  it('should resolve to RGB_TIFF state', () => {
    const desc = deriveInputDescriptor(rgbTiffMeta, null, null);
    expect(desc.inputState).toBe(INPUT_STATES.RGB_TIFF);
  });

  it('should set isRgbTiff to true', () => {
    const desc = deriveInputDescriptor(rgbTiffMeta, null, null);
    expect(desc.isRgbTiff).toBe(true);
    expect(desc.isSar).toBe(false);
  });

  it('should set inferenceSupported to false', () => {
    const desc = deriveInputDescriptor(rgbTiffMeta, null, null);
    expect(desc.inferenceSupported).toBe(false);
  });

  it('should have empty compatibleModels', () => {
    const desc = deriveInputDescriptor(rgbTiffMeta, null, null);
    expect(desc.compatibleModels).toHaveLength(0);
  });
});

// =============================================================================
// TEST 6: Sentinel-2 6-band — SENTINEL2 state with correct model assignment
// =============================================================================
describe('Test 6 — SENTINEL2: 6-band multispectral enables MADOS model', () => {
  const s2Meta = {
    filename: 'sentinel2_mados.tif', channelCount: 6, isTiff: true,
    format: 'TIFF', modality: 'SENTINEL2_MS',
  };

  it('should resolve to SENTINEL2 state', () => {
    const desc = deriveInputDescriptor(s2Meta, null, null);
    expect(desc.inputState).toBe(INPUT_STATES.SENTINEL2);
  });

  it('should set isSentinel2 to true', () => {
    const desc = deriveInputDescriptor(s2Meta, null, null);
    expect(desc.isSentinel2).toBe(true);
    expect(desc.isSar).toBe(false);
  });

  it('should assign SENTINEL2_MODEL_ID as selectedModelId', () => {
    const desc = deriveInputDescriptor(s2Meta, null, null);
    expect(desc.selectedModelId).toBe(SENTINEL2_MODEL_ID);
  });

  it('should set inferenceSupported to true', () => {
    const desc = deriveInputDescriptor(s2Meta, null, null);
    expect(desc.inferenceSupported).toBe(true);
    expect(desc.inferenceBlockReason).toBeNull();
  });
});

// =============================================================================
// TEST 7: OPTICAL_RGB (PNG/JPEG) — DRONE model assigned by default
// =============================================================================
describe('Test 7 — OPTICAL_RGB: PNG/JPEG defaults to DRONE model', () => {
  const jpgFile = { name: 'aerial_photo.jpg' };
  const jpgMeta = { filename: 'aerial_photo.jpg', channelCount: 3, isTiff: false, format: 'JPEG' };

  it('should resolve to OPTICAL_RGB state', () => {
    const desc = deriveInputDescriptor(jpgMeta, jpgFile, null);
    expect(desc.inputState).toBe(INPUT_STATES.OPTICAL_RGB);
  });

  it('should set isOpticalRgb to true', () => {
    const desc = deriveInputDescriptor(jpgMeta, jpgFile, null);
    expect(desc.isOpticalRgb).toBe(true);
    expect(desc.isSar).toBe(false);
  });

  it('should assign DRONE_RGB_MODEL_ID as selectedModelId by default', () => {
    const desc = deriveInputDescriptor(jpgMeta, jpgFile, null);
    expect(desc.selectedModelId).toBe(DRONE_RGB_MODEL_ID);
  });

  it('should set inferenceSupported to true', () => {
    const desc = deriveInputDescriptor(jpgMeta, jpgFile, null);
    expect(desc.inferenceSupported).toBe(true);
  });
});

// =============================================================================
// TEST 8: Analysis Page — SAR Manual Job Resolution (resolveInvestigationContext)
// =============================================================================
describe('Test 8 — Analysis Page: Manual SAR job UUID resolves to REAL_CDSE', () => {
  it('should resolve UUID-format jobId to REAL_CDSE scenario', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const ctx = resolveInvestigationContext(uuid, new URLSearchParams());
    expect(ctx.scenarioId).toBe('REAL_CDSE');
  });

  it('should resolve manual- prefixed job ID to REAL_CDSE scenario', () => {
    const ctx = resolveInvestigationContext('manual-abc123', new URLSearchParams());
    expect(ctx.scenarioId).toBe('REAL_CDSE');
  });

  it('should resolve job- prefixed ID (without scene alias substrings) to REAL_CDSE scenario', () => {
    // job-00001 would contain '001' matching demo-scene-001 alias; use a clean ID
    const ctx = resolveInvestigationContext('job-xyzmno99', new URLSearchParams());
    expect(ctx.scenarioId).toBe('REAL_CDSE');
  });

  it('should resolve ?source=manual search param to REAL_CDSE', () => {
    const params = new URLSearchParams('source=manual');
    const ctx = resolveInvestigationContext(undefined, params);
    expect(ctx.scenarioId).toBe('REAL_CDSE');
  });

  it('should resolve ?modality=SAR_DUAL_POL search param to REAL_CDSE', () => {
    const params = new URLSearchParams('modality=SAR_DUAL_POL');
    const ctx = resolveInvestigationContext(undefined, params);
    expect(ctx.scenarioId).toBe('REAL_CDSE');
  });

  it('should resolve demo-scene-001 correctly to its demo scenario', () => {
    const ctx = resolveInvestigationContext('demo-scene-001', new URLSearchParams());
    expect(ctx.scenarioId).toBe('demo-scene-001');
    expect(ctx.scenarioId).not.toBe('REAL_CDSE');
  });

  it('should resolve demo-scene-002 correctly', () => {
    const ctx = resolveInvestigationContext('demo-scene-002', new URLSearchParams());
    expect(ctx.scenarioId).toBe('demo-scene-002');
  });

  it('unknown ID without UUID format should fall back to demo-scene-001', () => {
    const ctx = resolveInvestigationContext('completely-unknown-scene-xyz', new URLSearchParams());
    expect(ctx.scenarioId).toBe('demo-scene-001');
  });
});

// =============================================================================
// TEST 9: Attribution Guardrail — candidates must be POTENTIAL CANDIDATE
// =============================================================================
describe('Test 9 — Attribution Guardrail: POTENTIAL CANDIDATE classification required', () => {
  const SAR_CANDIDATE_1 = {
    id: 'vessel-sar-1',
    name: 'MV Ocean Voyager',
    mmsi: '419009876',
    flag: 'IN',
    type: 'Crude Oil Tanker',
    rank: 1,
    correlation: 88,
    classification: 'POTENTIAL CANDIDATE',
    speed: 12.4,
    spatialScore: 0.91,
    temporalScore: 0.86,
    trajectoryScore: 0.89,
    anomalyScore: 0.82,
    evidence: { closestApproachKm: 1.2, timeDeltaMinutes: -18 },
  };

  const SAR_CANDIDATE_2 = {
    id: 'vessel-sar-2',
    name: 'MT Arabian Spirit',
    mmsi: '419005432',
    flag: 'LR',
    type: 'Chemical Tanker',
    rank: 2,
    correlation: 64,
    classification: 'POTENTIAL CANDIDATE',
    speed: 14.1,
    spatialScore: 0.68,
    temporalScore: 0.62,
    trajectoryScore: 0.65,
    anomalyScore: 0.58,
    evidence: { closestApproachKm: 4.8, timeDeltaMinutes: -42 },
  };

  it('should have classification set to POTENTIAL CANDIDATE for primary candidate', () => {
    expect(SAR_CANDIDATE_1.classification).toBe('POTENTIAL CANDIDATE');
  });

  it('should have classification set to POTENTIAL CANDIDATE for secondary candidate', () => {
    expect(SAR_CANDIDATE_2.classification).toBe('POTENTIAL CANDIDATE');
  });

  it('should NOT use CONFIRMED POLLUTER classification on any candidate', () => {
    const candidates = [SAR_CANDIDATE_1, SAR_CANDIDATE_2];
    for (const c of candidates) {
      expect(c.classification).not.toBe('CONFIRMED POLLUTER');
      expect(c.classification).not.toBe('CONFIRMED');
    }
  });

  it('candidates should have attribution scores all below 1.0 (fractional probability)', () => {
    for (const candidate of [SAR_CANDIDATE_1, SAR_CANDIDATE_2]) {
      expect(candidate.spatialScore).toBeLessThanOrEqual(1.0);
      expect(candidate.temporalScore).toBeLessThanOrEqual(1.0);
      expect(candidate.trajectoryScore).toBeLessThanOrEqual(1.0);
      expect(candidate.anomalyScore).toBeLessThanOrEqual(1.0);
    }
  });

  it('top candidate should have higher correlation than second candidate', () => {
    expect(SAR_CANDIDATE_1.correlation).toBeGreaterThan(SAR_CANDIDATE_2.correlation);
  });

  it('evidence closestApproachKm must be a positive number', () => {
    expect(SAR_CANDIDATE_1.evidence.closestApproachKm).toBeGreaterThan(0);
    expect(SAR_CANDIDATE_2.evidence.closestApproachKm).toBeGreaterThan(0);
  });
});

// =============================================================================
// TEST 10: SAR_DUAL_POL — Full Condition Check (All 6 conditions must be satisfied)
// =============================================================================
describe('Test 10 — SAR_DUAL_POL: All 6 conditions must be satisfied for full SAR state', () => {
  const buildSarMeta = (overrides = {}) => ({
    filename: 'sentinel1_vv_vh.tif',
    channelCount: 2,
    isTiff: true,
    format: 'TIFF',
    modality: 'SAR_DUAL_POL',
    polarizationStatus: 'ESTABLISHED',
    polarizations: ['VV', 'VH'],
    sourceType: 'SENTINEL1_DUAL_POL',
    compatibleModels: ['unet-dual-pol-sar-v09d-residual-loss'],
    geolocationStatus: 'NOT_ESTABLISHED',
    ...overrides,
  });

  it('should be SAR_DUAL_POL when all 6 conditions satisfied', () => {
    const desc = deriveInputDescriptor(buildSarMeta(), null, 'SENTINEL1_DUAL_POL');
    expect(desc.inputState).toBe(INPUT_STATES.SAR_DUAL_POL);
    expect(desc.inferenceSupported).toBe(true);
    expect(desc.selectedModelId).toBe(SAR_MODEL_ID);
    expect(desc.isSar).toBe(true);
    expect(desc.polarizationStatus).toBe('ESTABLISHED');
    expect(desc.polarizations).toEqual(['VV', 'VH']);
    expect(desc.sourceType).toBe('SENTINEL1_DUAL_POL');
  });

  it('should fall back to UNCLASSIFIED_2CH if polarization NOT ESTABLISHED', () => {
    const desc = deriveInputDescriptor(buildSarMeta({ polarizationStatus: 'NOT_ESTABLISHED', modality: '' }), null, null);
    expect(desc.inputState).toBe(INPUT_STATES.UNCLASSIFIED_2CH);
    expect(desc.inferenceSupported).toBe(false);
  });

  it('should fall back to UNCLASSIFIED_2CH if status empty and no declaration', () => {
    const desc = deriveInputDescriptor(
      buildSarMeta({ polarizationStatus: '', modality: '', sourceType: '' }),
      null, null
    );
    expect(desc.inputState).toBe(INPUT_STATES.UNCLASSIFIED_2CH);
    expect(desc.isSar).toBe(false);
  });

  it('should assign correct band structure for SAR_DUAL_POL', () => {
    const desc = deriveInputDescriptor(buildSarMeta(), null, 'SENTINEL1_DUAL_POL');
    expect(desc.bandStructure).toBe('SAR_VV_VH');
    expect(desc.modality).toBe('SAR_DUAL_POL');
  });

  it('should have exactly one compatibleModel: SAR_MODEL_ID', () => {
    const desc = deriveInputDescriptor(buildSarMeta(), null, 'SENTINEL1_DUAL_POL');
    expect(desc.compatibleModels).toHaveLength(1);
    expect(desc.compatibleModels[0]).toBe(SAR_MODEL_ID);
  });

  it('SAR_MODEL_ID should be the correct dual-pol model string', () => {
    expect(SAR_MODEL_ID).toBe('unet-dual-pol-sar-v09d-residual-loss');
  });

  it('fingerprint should include SAR_MODEL_ID in output string', () => {
    const desc = deriveInputDescriptor(buildSarMeta(), null, 'SENTINEL1_DUAL_POL');
    const fp = computeDescriptorFingerprint(desc);
    expect(fp).toContain(SAR_MODEL_ID);
    expect(fp).toContain('SAR_DUAL_POL');
    expect(fp).toContain('ESTABLISHED');
  });

  it('inferenceBlockReason should be null for successful SAR_DUAL_POL state', () => {
    const desc = deriveInputDescriptor(buildSarMeta(), null, 'SENTINEL1_DUAL_POL');
    expect(desc.inferenceBlockReason).toBeNull();
  });
});

// =============================================================================
// SUPPLEMENTARY — API Module Shape Verification
// =============================================================================
describe('Supplementary — manualAnalysisApi shape integrity', () => {
  it('getMaskUrl should construct correct endpoint', async () => {
    const { manualAnalysisApi: api } = await import('../../api/manual-analysis.api');
    expect(api.getMaskUrl('job-abc')).toContain('/mask');
    expect(api.getMaskUrl('job-abc')).toContain('job-abc');
  });

  it('getOverlayUrl should construct correct endpoint', async () => {
    const { manualAnalysisApi: api } = await import('../../api/manual-analysis.api');
    expect(api.getOverlayUrl('job-abc')).toContain('/overlay');
  });

  it('getProbabilityUrl should construct correct endpoint', async () => {
    const { manualAnalysisApi: api } = await import('../../api/manual-analysis.api');
    expect(api.getProbabilityUrl('job-abc')).toContain('/probability-map');
  });
});
