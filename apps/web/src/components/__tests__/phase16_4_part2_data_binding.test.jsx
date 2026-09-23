/**
 * Phase 16.4 — Part 2: Real Investigation Data Binding & Static/Demo Elimination Tests
 *
 * Verifies:
 *  1. buildDynamicRealScenario returns null when not REAL_CDSE or without data
 *  2. Missing bbox results in center: null (no Mumbai coordinates fallback)
 *  3. Missing bbox results in slicks: [] (no fabricated slick location)
 *  4. Missing bbox results in sceneFootprintWkt: null
 *  5. originCoords is strictly null (no +0.02 fabricated offset)
 *  6. uncertaintyKm is strictly null (no hardcoded 1.8)
 *  7. confidence is strictly null (no hardcoded 94)
 *  8. driftKm is strictly null (no hardcoded 12.4)
 *  9. driftSpeed is strictly 'NOT ESTABLISHED' (no '0.65 kt NW')
 * 10. estimatedAgeHours is strictly null (no hardcoded 6.2)
 * 11. windVector is strictly 'NOT MODELLED' (no '11.2 kn @ 235° (SW)')
 * 12. currentVector is strictly 'NOT MODELLED' (no '0.38 m/s @ 305° (NW)')
 * 13. SAR areaKm2 fallback is 0 (never fabricated 0.05)
 * 14. Slick confidence fallback is null (never 0.94 demo value)
 * 15. Real bbox derives correct centroid center [lat, lng]
 * 16. Real explicit confidence is preserved when present
 * 17. Manual canonical data binding maintains strict provenance without demo fallbacks
 * 18. Manual canonical data with missing geospatial sets center: null and slicks: []
 * 19. resolveInvestigationContext routes real/manual job IDs to REAL_CDSE
 * 20. Zero demo constants leak into REAL_CDSE scenario output
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';

// Mock Leaflet & react-leaflet for Node test runner
vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: { _getIconUrl: vi.fn() }, mergeOptions: vi.fn() } },
    divIcon: vi.fn(() => ({})),
    latLngBounds: vi.fn(() => ({ extend: vi.fn() })),
  },
}));

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => React.createElement('div', { 'data-testid': 'mock-map-container' }, children),
  TileLayer: () => React.createElement('div', { 'data-testid': 'mock-tile-layer' }),
  useMap: () => ({ invalidateSize: vi.fn(), setView: vi.fn(), fitBounds: vi.fn() }),
  GeoJSON: () => React.createElement('div', { 'data-testid': 'mock-geojson' }),
  CircleMarker: () => React.createElement('div', { 'data-testid': 'mock-circle-marker' }),
  Popup: ({ children }) => React.createElement('div', { 'data-testid': 'mock-popup' }, children),
  Tooltip: ({ children }) => React.createElement('div', { 'data-testid': 'mock-tooltip' }, children),
  Polygon: () => React.createElement('div', { 'data-testid': 'mock-polygon' }),
  Polyline: () => React.createElement('div', { 'data-testid': 'mock-polyline' }),
}));

// Mock MapView and map layers to avoid DOM/Leaflet window dependencies in Node test runner
vi.mock('../../components/map/MapView', () => ({
  default: ({ children }) => React.createElement('div', { 'data-testid': 'mock-map-view' }, children),
}));
vi.mock('../../components/map/SlickLayer', () => ({
  default: () => React.createElement('div', { 'data-testid': 'mock-slick-layer' }),
}));
vi.mock('../../components/map/OriginLayer', () => ({
  default: () => React.createElement('div', { 'data-testid': 'mock-origin-layer' }),
}));
vi.mock('../../components/map/TrajectoryLayer', () => ({
  default: () => React.createElement('div', { 'data-testid': 'mock-trajectory-layer' }),
}));
vi.mock('../../components/map/VesselLayer', () => ({
  default: () => React.createElement('div', { 'data-testid': 'mock-vessel-layer' }),
}));
vi.mock('../../components/map/MapLegend', () => ({
  default: () => React.createElement('div', { 'data-testid': 'mock-map-legend' }),
}));
vi.mock('../../components/map/GridLayer', () => ({
  default: () => React.createElement('div', { 'data-testid': 'mock-grid-layer' }),
}));
vi.mock('../../components/map/MetOceanLayer', () => ({
  default: () => React.createElement('div', { 'data-testid': 'mock-metocean-layer' }),
}));
vi.mock('../../components/map/SceneFootprintLayer', () => ({
  default: () => React.createElement('div', { 'data-testid': 'mock-scenefootprint-layer' }),
}));

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'demo-scene-001' }),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/analysis' }),
  Link: ({ children, to }) => React.createElement('a', { href: to }, children),
}));

// Mock stores
vi.mock('../../app/store/authStore', () => ({
  useAuthStore: vi.fn(() => ({
    user: { id: 'test-user', name: 'Test Officer' },
    isAuthenticated: true,
  })),
}));

import { buildDynamicRealScenario, resolveInvestigationContext } from '../../pages/Analysis';

// Forbidden demo constants that must NEVER appear in real investigation scenarios
const FORBIDDEN_DEMO_STRINGS = [
  '11.2 kn @ 235° (SW)',
  '0.38 m/s @ 305° (NW)',
  '0.65 kt NW',
  '70.999428',
  '17.158438',
  '73.746742',
  '19.474159',
];

describe('Phase 16.4 Part 2 — Real Investigation Data Binding', () => {

  describe('buildDynamicRealScenario — Boundary & Guardrails', () => {
    it('returns null when selectedScenarioId is not REAL_CDSE and no jobId', () => {
      const result = buildDynamicRealScenario({
        selectedScenarioId: 'demo-scene-001',
        jobId: null,
        realJobData: { payload: {} },
      });
      expect(result).toBeNull();
    });

    it('returns null when neither realJobData nor manualInvestigationData is provided', () => {
      const result = buildDynamicRealScenario({
        selectedScenarioId: 'REAL_CDSE',
        jobId: 'job-12345',
        realJobData: null,
        manualInvestigationData: null,
      });
      expect(result).toBeNull();
    });
  });

  describe('buildDynamicRealScenario — realJobData without geospatial metadata', () => {
    const jobWithoutBbox = {
      jobId: 'real-job-001',
      payload: {
        metadata: {
          productName: 'S1A_IW_GRDH_1SDV_20260906T010203_060708_012345_ABCD.SAFE',
          platform: 'Sentinel-1A',
        },
      },
    };

    it('sets center to null when metadata.bbox is absent (never Mumbai coords)', () => {
      const scenario = buildDynamicRealScenario({
        selectedScenarioId: 'REAL_CDSE',
        jobId: 'real-job-001',
        realJobData: jobWithoutBbox,
      });
      expect(scenario.center).toBeNull();
    });

    it('sets slicks to empty array when metadata.bbox is absent', () => {
      const scenario = buildDynamicRealScenario({
        selectedScenarioId: 'REAL_CDSE',
        jobId: 'real-job-001',
        realJobData: jobWithoutBbox,
      });
      expect(scenario.slicks).toEqual([]);
    });

    it('sets sceneFootprintWkt to null when metadata.bbox is absent', () => {
      const scenario = buildDynamicRealScenario({
        selectedScenarioId: 'REAL_CDSE',
        jobId: 'real-job-001',
        realJobData: jobWithoutBbox,
      });
      expect(scenario.sceneFootprintWkt).toBeNull();
    });

    it('strictly sets originCoords to null (no fabricated +0.02 offset)', () => {
      const scenario = buildDynamicRealScenario({
        selectedScenarioId: 'REAL_CDSE',
        jobId: 'real-job-001',
        realJobData: jobWithoutBbox,
      });
      expect(scenario.originCoords).toBeNull();
    });

    it('strictly sets uncertaintyKm to null (no hardcoded 1.8)', () => {
      const scenario = buildDynamicRealScenario({
        selectedScenarioId: 'REAL_CDSE',
        jobId: 'real-job-001',
        realJobData: jobWithoutBbox,
      });
      expect(scenario.uncertaintyKm).toBeNull();
    });

    it('strictly sets confidence to null (no hardcoded 94)', () => {
      const scenario = buildDynamicRealScenario({
        selectedScenarioId: 'REAL_CDSE',
        jobId: 'real-job-001',
        realJobData: jobWithoutBbox,
      });
      expect(scenario.confidence).toBeNull();
    });

    it('strictly sets driftKm to null (no hardcoded 12.4)', () => {
      const scenario = buildDynamicRealScenario({
        selectedScenarioId: 'REAL_CDSE',
        jobId: 'real-job-001',
        realJobData: jobWithoutBbox,
      });
      expect(scenario.driftKm).toBeNull();
    });

    it('strictly sets driftSpeed to NOT ESTABLISHED (no 0.65 kt NW)', () => {
      const scenario = buildDynamicRealScenario({
        selectedScenarioId: 'REAL_CDSE',
        jobId: 'real-job-001',
        realJobData: jobWithoutBbox,
      });
      expect(scenario.driftSpeed).toBe('NOT ESTABLISHED');
    });

    it('strictly sets estimatedAgeHours to null (no hardcoded 6.2)', () => {
      const scenario = buildDynamicRealScenario({
        selectedScenarioId: 'REAL_CDSE',
        jobId: 'real-job-001',
        realJobData: jobWithoutBbox,
      });
      expect(scenario.estimatedAgeHours).toBeNull();
    });

    it('strictly sets windVector to NOT MODELLED (no demo wind string)', () => {
      const scenario = buildDynamicRealScenario({
        selectedScenarioId: 'REAL_CDSE',
        jobId: 'real-job-001',
        realJobData: jobWithoutBbox,
      });
      expect(scenario.windVector).toBe('NOT MODELLED');
    });

    it('strictly sets currentVector to NOT MODELLED (no demo current string)', () => {
      const scenario = buildDynamicRealScenario({
        selectedScenarioId: 'REAL_CDSE',
        jobId: 'real-job-001',
        realJobData: jobWithoutBbox,
      });
      expect(scenario.currentVector).toBe('NOT MODELLED');
    });

    it('does not fabricate areaKm2 (falls back to 0, never 0.05)', () => {
      const scenario = buildDynamicRealScenario({
        selectedScenarioId: 'REAL_CDSE',
        jobId: 'real-job-001',
        realJobData: {
          payload: {
            sourceType: 'SENTINEL1_DUAL_POL',
            metadata: {},
          },
        },
      });
      expect(scenario.areaKm2).toBe(0);
    });
  });

  describe('buildDynamicRealScenario — realJobData with authentic bbox', () => {
    // Real bbox: [minLng, minLat, maxLng, maxLat]
    const authenticJob = {
      jobId: 's1-real-ingest-42',
      payload: {
        sourceType: 'SENTINEL1_DUAL_POL',
        modality: 'SAR_DUAL_POL',
        areaKm2: 3.45,
        confidence: 0.912,
        metadata: {
          productName: 'S1A_IW_GRDH_1SDV_20260906_REAL',
          platform: 'Sentinel-1A',
          bbox: [72.0, 18.0, 73.0, 20.0],
          acquisitionStart: '2026-09-06T01:00:00Z',
        },
      },
    };

    it('computes center strictly from authentic bbox centroid', () => {
      const scenario = buildDynamicRealScenario({
        selectedScenarioId: 'REAL_CDSE',
        jobId: 's1-real-ingest-42',
        realJobData: authenticJob,
      });
      // Center lat = (18.0 + 20.0) / 2 = 19.0, lng = (72.0 + 73.0) / 2 = 72.5
      expect(scenario.center).toEqual([19.0, 72.5]);
    });

    it('creates slick entry at centroid with authentic area and confidence', () => {
      const scenario = buildDynamicRealScenario({
        selectedScenarioId: 'REAL_CDSE',
        jobId: 's1-real-ingest-42',
        realJobData: authenticJob,
      });
      expect(scenario.slicks).toHaveLength(1);
      const slick = scenario.slicks[0];
      expect(slick.lat).toBe(19.0);
      expect(slick.lng).toBe(72.5);
      expect(slick.areaKm2).toBe(3.45);
      expect(slick.confidence).toBe(0.912);
    });

    it('generates sceneFootprintWkt matching authentic bbox coordinates', () => {
      const scenario = buildDynamicRealScenario({
        selectedScenarioId: 'REAL_CDSE',
        jobId: 's1-real-ingest-42',
        realJobData: authenticJob,
      });
      expect(scenario.sceneFootprintWkt).toBe(
        'POLYGON((72 18, 73 18, 73 20, 72 20, 72 18))'
      );
    });

    it('sets slick confidence to null when payload.confidence is omitted (never 0.94)', () => {
      const jobWithoutConfidence = {
        ...authenticJob,
        payload: {
          ...authenticJob.payload,
          confidence: undefined,
        },
      };
      const scenario = buildDynamicRealScenario({
        selectedScenarioId: 'REAL_CDSE',
        jobId: 's1-real-ingest-42',
        realJobData: jobWithoutConfidence,
      });
      expect(scenario.slicks[0].confidence).toBeNull();
    });

    it('maintains originCoords: null even when slick coordinates exist', () => {
      const scenario = buildDynamicRealScenario({
        selectedScenarioId: 'REAL_CDSE',
        jobId: 's1-real-ingest-42',
        realJobData: authenticJob,
      });
      expect(scenario.originCoords).toBeNull();
    });
  });

  describe('buildDynamicRealScenario — manualInvestigationData branch', () => {
    it('binds canonical manual investigation data without demo fallbacks', () => {
      const manualData = {
        jobId: 'manual-test-001',
        input: {
          filename: 'raster_scene.tif',
          sourceType: 'SENTINEL1_DUAL_POL',
          modality: 'SAR_DUAL_POL',
          channelCount: 2,
          inputFormat: 'GeoTIFF',
        },
        model: {
          modelId: 'unet-dual-pol-sar-v09d-residual-loss',
        },
        detection: {
          oilSpillDetected: true,
          confidence: 0.875,
        },
        geospatial: {
          available: true,
          centroid: { latitude: 19.5, longitude: 72.8 },
          areaKm2: 2.1,
          bounds: [72.5, 19.0, 73.0, 20.0],
          footprint: { type: 'Polygon', coordinates: [] },
        },
        origin: {
          status: 'NOT_ESTABLISHED',
          estimatedPoint: null,
        },
        provenance: {
          inputGeolocation: 'AFFINE_TRANSFORM',
          vesselAttribution: 'NOT_ESTABLISHED',
        },
        drift: { backward: { points: [] }, forward: { points: [] } },
        aisCorrelation: { candidates: [] },
      };

      const scenario = buildDynamicRealScenario({
        selectedScenarioId: 'REAL_CDSE',
        jobId: 'manual-test-001',
        manualInvestigationData: manualData,
      });

      expect(scenario.id).toBe('REAL_CDSE');
      expect(scenario.center).toEqual([19.5, 72.8]);
      expect(scenario.slicks).toHaveLength(1);
      expect(scenario.slicks[0].confidence).toBe(0.875);
      expect(scenario.slicks[0].areaKm2).toBe(2.1);
      expect(scenario.originEstimate).toBeNull();
    });

    it('sets center to null when geospatial is unavailable in manual data', () => {
      const manualDataNoGeo = {
        jobId: 'manual-test-nogeo',
        input: {
          filename: 'non_geo_image.png',
          sourceType: 'OPTICAL_RGB',
          modality: 'OPTICAL_RGB',
          channelCount: 3,
          inputFormat: 'PNG',
        },
        model: { modelId: 'optical-v1' },
        detection: { oilSpillDetected: true, confidence: 0.75 },
        geospatial: { available: false, centroid: null, bounds: null },
        provenance: { inputGeolocation: 'UNAVAILABLE', vesselAttribution: 'NOT_ESTABLISHED' },
      };

      const scenario = buildDynamicRealScenario({
        selectedScenarioId: 'REAL_CDSE',
        jobId: 'manual-test-nogeo',
        manualInvestigationData: manualDataNoGeo,
      });

      expect(scenario.center).toBeNull();
      expect(scenario.slicks).toEqual([]);
      expect(scenario.geospatialAvailable).toBe(false);
    });
  });

  describe('Static & Demo Value Elimination Audit', () => {
    it('guarantees NO forbidden demo strings appear in the serialized real scenario', () => {
      const scenario = buildDynamicRealScenario({
        selectedScenarioId: 'REAL_CDSE',
        jobId: 'real-audit-001',
        realJobData: {
          payload: {
            metadata: {},
          },
        },
      });

      const serialized = JSON.stringify(scenario);
      for (const forbidden of FORBIDDEN_DEMO_STRINGS) {
        expect(serialized).not.toContain(forbidden);
      }
    });

    it('guarantees numeric demo constants are absent from realJobData scenario', () => {
      const scenario = buildDynamicRealScenario({
        selectedScenarioId: 'REAL_CDSE',
        jobId: 'real-audit-002',
        realJobData: {
          payload: {
            metadata: {},
          },
        },
      });

      // Demo confidence was 94 / 0.94
      expect(scenario.confidence).not.toBe(94);
      expect(scenario.confidence).toBeNull();

      // Demo drift km was 12.4
      expect(scenario.driftKm).not.toBe(12.4);
      expect(scenario.driftKm).toBeNull();

      // Demo age hours was 6.2
      expect(scenario.estimatedAgeHours).not.toBe(6.2);
      expect(scenario.estimatedAgeHours).toBeNull();

      // Demo uncertainty was 1.8
      expect(scenario.uncertaintyKm).not.toBe(1.8);
      expect(scenario.uncertaintyKm).toBeNull();

      // Demo drift speed was '0.65 kt NW'
      expect(scenario.driftSpeed).not.toBe('0.65 kt NW');
      expect(scenario.driftSpeed).toBe('NOT ESTABLISHED');
    });
  });

  describe('resolveInvestigationContext — Real & Manual Job Routing', () => {
    it('routes a UUID paramId to REAL_CDSE', () => {
      const ctx = resolveInvestigationContext('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', new URLSearchParams());
      expect(ctx.scenarioId).toBe('REAL_CDSE');
    });

    it('routes job- prefix to REAL_CDSE', () => {
      const ctx = resolveInvestigationContext('job-12345678', new URLSearchParams());
      expect(ctx.scenarioId).toBe('REAL_CDSE');
    });

    it('routes manual- prefix to REAL_CDSE', () => {
      const ctx = resolveInvestigationContext('manual-87654321', new URLSearchParams());
      expect(ctx.scenarioId).toBe('REAL_CDSE');
    });

    it('routes source=manual search param to REAL_CDSE', () => {
      const params = new URLSearchParams('source=manual');
      const ctx = resolveInvestigationContext(undefined, params);
      expect(ctx.scenarioId).toBe('REAL_CDSE');
    });

    it('routes modality=SAR_DUAL_POL search param to REAL_CDSE', () => {
      const params = new URLSearchParams('modality=SAR_DUAL_POL');
      const ctx = resolveInvestigationContext(undefined, params);
      expect(ctx.scenarioId).toBe('REAL_CDSE');
    });
  });
});
