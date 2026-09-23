import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import backendData from '../../../../../services/backend-node/src/data/demo-scenarios.js';

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

// Mock MapView and map layers to prevent Leaflet window reference error in Node test runner
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
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'demo-scene-001' }),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/analysis/demo-scene-001' }),
  Link: ({ children, to }) => React.createElement('a', { href: to }, children),
}));

// Mock stores
vi.mock('../../app/store/authStore', () => ({
  useAuthStore: vi.fn(() => ({
    user: { id: 'user-1', name: 'Tactical Officer', email: 'officer@ocean-guard.gov.in' },
    isAuthenticated: true,
  })),
}));

import {
  SCENARIOS,
  matchScenarioIdentifier,
  resolveInvestigationContext,
} from '../../pages/Analysis.jsx';

const { DEMO_SCENARIOS } = backendData;

describe('Analysis Workspace Geographic Data & Scenario Binding Regression Suite', () => {
  // 1. Verify all demo scenes 001 - 004 match authoritative backend scene definitions
  describe('Authoritative Backend Scenario Conformity (demo-scene-001 through demo-scene-004)', () => {
    const sceneKeys = ['demo-scene-001', 'demo-scene-002', 'demo-scene-003', 'demo-scene-004'];

    sceneKeys.forEach((key) => {
      it(`Scenario ${key} aligns with canonical backend scene metadata and footprint geometry`, () => {
        const canonical = DEMO_SCENARIOS[key];
        expect(canonical).toBeDefined();

        const frontend = SCENARIOS.find((s) => s.id === key);
        expect(frontend).toBeDefined();

        // 1. Scene Footprint WKT derived directly from backend sceneGeomWkt
        expect(frontend.sceneFootprintWkt).toBe(canonical.sceneGeomWkt);

        // 2. Centroid coordinates derived from backend centroidLat / centroidLng
        expect(frontend.center[0]).toBeCloseTo(canonical.centroidLat, 2);
        expect(frontend.center[1]).toBeCloseTo(canonical.centroidLng, 2);

        // 3. Modeled spill origin coordinates derived from backend originLat / originLng
        expect(frontend.originCoords[0]).toBeCloseTo(canonical.originLat, 2);
        expect(frontend.originCoords[1]).toBeCloseTo(canonical.originLng, 2);

        // 4. Primary slick coordinates match centroid
        const primarySlick = frontend.slicks[0];
        expect(primarySlick).toBeDefined();
        expect(primarySlick.lat).toBeCloseTo(canonical.centroidLat, 2);
        expect(primarySlick.lng).toBeCloseTo(canonical.centroidLng, 2);

        // 5. Distinct geographical separation: Ensure scenarios do NOT share Mumbai coordinates
        if (key !== 'demo-scene-001') {
          const mumbai = DEMO_SCENARIOS['demo-scene-001'];
          expect(frontend.center[0]).not.toEqual(mumbai.centroidLat);
          expect(frontend.center[1]).not.toEqual(mumbai.centroidLng);
          expect(frontend.originCoords[0]).not.toEqual(mumbai.originLat);
          expect(frontend.originCoords[1]).not.toEqual(mumbai.originLng);
        }
      });
    });
  });

  // 2. Scenario Resolution by Query Parameters
  describe('Scenario Query Parameters Resolution', () => {
    it('resolves explicit scenario query parameter for all demo scenes', () => {
      ['demo-scene-001', 'demo-scene-002', 'demo-scene-003', 'demo-scene-004'].forEach((id) => {
        const params = new URLSearchParams(`scenario=${id}`);
        const ctx = resolveInvestigationContext(undefined, params);
        expect(ctx.scenarioId).toBe(id);
      });
    });

    it('prioritizes scenario query param over ambiguous route param', () => {
      const params = new URLSearchParams('scenario=demo-scene-003');
      const ctx = resolveInvestigationContext('demo-scene-001', params);
      expect(ctx.scenarioId).toBe('demo-scene-003');
    });
  });

  // 3. Scenario Resolution by Aliases & Backend Scene IDs
  describe('Scenario Aliases & Backend Identifiers Resolution', () => {
    it('resolves numeric shortcodes and regional aliases to the correct scenario', () => {
      expect(matchScenarioIdentifier('001')).toBe('demo-scene-001');
      expect(matchScenarioIdentifier('1')).toBe('demo-scene-001');
      expect(matchScenarioIdentifier('mumbai')).toBe('demo-scene-001');

      expect(matchScenarioIdentifier('002')).toBe('demo-scene-002');
      expect(matchScenarioIdentifier('2')).toBe('demo-scene-002');
      expect(matchScenarioIdentifier('kutch')).toBe('demo-scene-002');

      expect(matchScenarioIdentifier('003')).toBe('demo-scene-003');
      expect(matchScenarioIdentifier('3')).toBe('demo-scene-003');
      expect(matchScenarioIdentifier('paradip')).toBe('demo-scene-003');
      expect(matchScenarioIdentifier('bengal')).toBe('demo-scene-003');

      expect(matchScenarioIdentifier('004')).toBe('demo-scene-004');
      expect(matchScenarioIdentifier('4')).toBe('demo-scene-004');
      expect(matchScenarioIdentifier('goa')).toBe('demo-scene-004');
      expect(matchScenarioIdentifier('malabar')).toBe('demo-scene-004');
    });

    it('resolves backend sceneIds directly from authoritative backend data', () => {
      Object.values(DEMO_SCENARIOS).forEach((backendScene) => {
        const resolved = matchScenarioIdentifier(backendScene.sceneId);
        expect(resolved).toBe(backendScene.id);
      });
    });
  });

  // 4. Candidate and Slick Navigation Binding
  describe('Candidate and Slick Param Binding to Owning Scenario', () => {
    it('correctly maps a candidate MMSI to its parent scenario without Mumbai fallback', () => {
      // MMSI 419002345 belongs to demo-scene-002 (Kutch)
      const paramsKutch = new URLSearchParams('candidate=419002345');
      const ctxKutch = resolveInvestigationContext(undefined, paramsKutch);
      expect(ctxKutch.scenarioId).toBe('demo-scene-002');
      expect(ctxKutch.candidateId).toBe('vessel-k1');

      // MMSI 419003456 belongs to demo-scene-003 (Paradip)
      const paramsParadip = new URLSearchParams('candidate=419003456');
      const ctxParadip = resolveInvestigationContext(undefined, paramsParadip);
      expect(ctxParadip.scenarioId).toBe('demo-scene-003');
      expect(ctxParadip.candidateId).toBe('vessel-p1');

      // MMSI 419004567 belongs to demo-scene-004 (Goa)
      const paramsGoa = new URLSearchParams('candidate=419004567');
      const ctxGoa = resolveInvestigationContext(undefined, paramsGoa);
      expect(ctxGoa.scenarioId).toBe('demo-scene-004');
      expect(ctxGoa.candidateId).toBe('vessel-g1');
    });

    it('correctly maps a slick ID to its parent scenario', () => {
      // Slick 22486915 belongs to demo-scene-002 (Kutch)
      const paramsKutchSlick = new URLSearchParams('slick=22486915');
      const ctxKutchSlick = resolveInvestigationContext(undefined, paramsKutchSlick);
      expect(ctxKutchSlick.scenarioId).toBe('demo-scene-002');
      expect(ctxKutchSlick.slickId).toBe('22486915');

      // Slick 20258667 belongs to demo-scene-003 (Paradip)
      const paramsParadipSlick = new URLSearchParams('slick=20258667');
      const ctxParadipSlick = resolveInvestigationContext(undefined, paramsParadipSlick);
      expect(ctxParadipSlick.scenarioId).toBe('demo-scene-003');
      expect(ctxParadipSlick.slickId).toBe('20258667');
    });
  });

  // 5. REAL_CDSE Isolation Guarantee
  describe('REAL_CDSE Isolation Guarantees', () => {
    it('isolates real job UUIDs strictly to REAL_CDSE and never resolves to demo-scene-001', () => {
      const realJobUuid = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
      const ctx = resolveInvestigationContext(realJobUuid, new URLSearchParams());
      expect(ctx.scenarioId).toBe('REAL_CDSE');
      expect(ctx.scenarioId).not.toBe('demo-scene-001');

      const realJobPrefix = 'job-cdse-execution-7749';
      const ctx2 = resolveInvestigationContext(realJobPrefix, new URLSearchParams());
      expect(ctx2.scenarioId).toBe('REAL_CDSE');
      expect(ctx2.scenarioId).not.toBe('demo-scene-001');
    });

    it('ensures REAL_CDSE scenario contains no synthetic demo vessels, drift or origin', () => {
      const realCdse = SCENARIOS.find((s) => s.id === 'REAL_CDSE');
      expect(realCdse).toBeDefined();
      expect(realCdse.isRealScene).toBe(true);
      expect(realCdse.vessels).toHaveLength(0);
      expect(realCdse.backwardPath).toHaveLength(0);
      expect(realCdse.forwardPath).toHaveLength(0);
      expect(realCdse.originCoords).toBeNull();
    });
  });
});
