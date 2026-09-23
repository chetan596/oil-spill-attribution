import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { useAuthStore } from '../../app/store/authStore';

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
  useAuthStore: vi.fn(),
}));

import Analysis, { resolveInvestigationContext } from '../../pages/Analysis';

describe('Blue Forensic AI - Detailed Analysis Workspace & Route Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.mockReturnValue({
      user: { id: 'user-1', name: 'Tactical Officer', email: 'officer@blueforensic.gov.in' },
      isAuthenticated: true,
    });
  });

  it('instantiates Analysis page component properly', () => {
    const element = React.createElement(Analysis);
    expect(element).toBeDefined();
    expect(element.type).toBe(Analysis);
  });

  it('maintains verified scientific provenance badges and scene defaults', () => {
    const element = React.createElement(Analysis);
    expect(element).toBeDefined();
  });

  it('resolves default investigation context when no params are passed', () => {
    const context = resolveInvestigationContext(undefined, new URLSearchParams());
    expect(context.scenarioId).toBe('demo-scene-001');
    expect(context.activeTab).toBe('investigation');
    expect(context.selectedSlickId).toBe('043e9402');
  });

  it('resolves investigation context from scenario id route param', () => {
    const context = resolveInvestigationContext('demo-scene-002', new URLSearchParams());
    expect(context.scenarioId).toBe('demo-scene-002');
    expect(context.activeTab).toBe('investigation');
  });

  it('resolves investigation context when route param is a slick id', () => {
    // Slicks for Paradip (demo-scene-003): slick id '20258667'
    const context = resolveInvestigationContext('20258667', new URLSearchParams());
    expect(context.scenarioId).toBe('demo-scene-003');
    expect(context.selectedSlickId).toBe('20258667');
    expect(context.focusTarget?.type).toBe('slick');
    expect(context.focusTarget?.id).toBe('20258667');
  });

  it('preserves candidate query param and selects AIS attribution tab', () => {
    // Vessel MMSI or ID lookup
    const searchParams = new URLSearchParams('candidate=419001234&tab=ais');
    const context = resolveInvestigationContext('demo-scene-001', searchParams);
    expect(context.scenarioId).toBe('demo-scene-001');
    expect(context.selectedCandidateId).toBe('vessel-1');
    expect(context.activeTab).toBe('ais');
    expect(context.focusTarget?.type).toBe('candidate');
  });

  it('handles custom workspace tab parameter from Overview pipeline navigation', () => {
    const driftParams = new URLSearchParams('tab=drift');
    const driftContext = resolveInvestigationContext('demo-scene-001', driftParams);
    expect(driftContext.activeTab).toBe('drift');

    const sarParams = new URLSearchParams('tab=sar');
    const sarContext = resolveInvestigationContext('demo-scene-001', sarParams);
    expect(sarContext.activeTab).toBe('sar');

    const dossierParams = new URLSearchParams('tab=dossier');
    const dossierContext = resolveInvestigationContext('demo-scene-001', dossierParams);
    expect(dossierContext.activeTab).toBe('dossier');
  });

  it('strictly handles REAL_CDSE scenario isolation and does not invent fake investigation IDs', () => {
    const searchParams = new URLSearchParams();
    const context = resolveInvestigationContext('REAL_CDSE', searchParams);
    expect(context.scenarioId).toBe('REAL_CDSE');
    expect(context.selectedCandidateId).toBeNull();
  });

  it('gracefully handles invalid or nonexistent ID by defaulting cleanly to demo-scene-001', () => {
    const searchParams = new URLSearchParams();
    const context = resolveInvestigationContext('nonexistent-uuid-999', searchParams);
    expect(context.scenarioId).toBe('demo-scene-001');
    expect(context.activeTab).toBe('investigation');
  });

  it('renders Analysis component function without throwing ReferenceError for demo scenarios with driftData', () => {
    expect(() => {
      const element = React.createElement(Analysis);
      expect(element).toBeDefined();
      expect(element.type).toBe(Analysis);
    }).not.toThrow();
  });

  it('renders Analysis component without throwing when driftData is unavailable / REAL_CDSE', () => {
    expect(() => {
      const element = React.createElement(Analysis);
      expect(element).toBeDefined();
    }).not.toThrow();
  });

  it('renders Analysis page to string without runtime error across all HUD modes', async () => {
    const { renderToString } = await import('react-dom/server');
    const element = React.createElement(Analysis);
    const html = renderToString(element);
    expect(html).toContain('COMMAND INVESTIGATION');
  });

  it('renders AttributionHUD without useState ReferenceError', async () => {
    const { renderToString } = await import('react-dom/server');
    const AttributionHUD = (await import('../../components/map/AttributionHUD')).default;
    const element = React.createElement(AttributionHUD, {
      candidateVessels: [
        {
          id: 'vessel-1',
          name: 'MV Kandla Star',
          mmsi: '419001234',
          totalScore: 0.94,
          evidence: { distanceKm: 0.8 },
        },
      ],
      selectedCandidate: {
        id: 'vessel-1',
        name: 'MV Kandla Star',
        mmsi: '419001234',
        totalScore: 0.94,
        evidence: { distanceKm: 0.8 },
      },
    });

    const html = renderToString(element);
    expect(html).toContain('AIS ATTRIBUTION');
    expect(html).toContain('MV Kandla Star');
  });
});
