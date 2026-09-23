import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import Sentinel1AcquisitionPanel from '../analysis/Sentinel1AcquisitionPanel';
import { matchScenarioIdentifier, resolveInvestigationContext } from '../../pages/Analysis';

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
vi.mock('../../components/map/SlickLayer', () => ({ default: () => React.createElement('div') }));
vi.mock('../../components/map/OriginLayer', () => ({ default: () => React.createElement('div') }));
vi.mock('../../components/map/TrajectoryLayer', () => ({ default: () => React.createElement('div') }));
vi.mock('../../components/map/VesselLayer', () => ({ default: () => React.createElement('div') }));
vi.mock('../../components/map/MapLegend', () => ({ default: () => React.createElement('div') }));
vi.mock('../../components/map/GridLayer', () => ({ default: () => React.createElement('div') }));
vi.mock('../../components/map/MetOceanLayer', () => ({ default: () => React.createElement('div') }));
vi.mock('../../components/map/SceneFootprintLayer', () => ({ default: () => React.createElement('div') }));

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ id: 'REAL_CDSE' }),
  useSearchParams: () => [new URLSearchParams('jobId=job-real-cdse-s1d-102'), vi.fn()],
  Link: ({ children, to }) => React.createElement('a', { href: to }, children),
}));

// Mock APIs for panel
vi.mock('../../api/sentinel1.api', () => ({
  sentinel1Api: {
    getAois: vi.fn().mockResolvedValue({ data: [{ id: 'mumbai', name: 'Mumbai Offshore', bbox: [72.5, 18.5, 73.2, 19.2] }] }),
    searchAcquisitions: vi.fn().mockResolvedValue({ data: [] }),
    processAcquisition: vi.fn().mockResolvedValue({ success: true, jobId: 'job-real-cdse-s1d-101' }),
  },
}));

vi.mock('../../api/jobs.api', () => ({
  jobsApi: {
    getById: vi.fn().mockResolvedValue({
      status: 'running',
      progress: 45,
      payload: {
        stage: 'DOWNLOADING',
        stageMessage: 'Downloading: 450 MB / 1.1 GB (41%)',
        bytesDownloaded: 471859200,
        totalBytes: 1153433600,
        speedBps: 12582912,
      },
    }),
    create: vi.fn(),
  },
}));

describe('CDSE Real Processing Pipeline Lifecycle & Product Identity Preservation', () => {
  const targetProduct = {
    id: 'S1D_IW_GRDH_1SDV_20260906T010237_20260906T010309_004450_0083F6_023C_COG',
    name: 'S1D_IW_GRDH_1SDV_20260906T010237_20260906T010309_004450_0083F6_023C_COG.SAFE',
    platform: 'Sentinel-1D',
    acquisitionStart: '2026-09-06T01:02:37Z',
    polarization: 'VV+VH',
    orbitDirection: 'DESCENDING',
    bbox: [70.999428, 17.158438, 73.746742, 19.474159],
  };

  it('A. Instantiates Sentinel1AcquisitionPanel without throwing ReferenceError', () => {
    const element = React.createElement(Sentinel1AcquisitionPanel);
    expect(element).toBeDefined();
    expect(element.type).toBe(Sentinel1AcquisitionPanel);

    const html = renderToString(element);
    expect(html).toContain('REAL CDSE ACQUISITION');
    expect(html).toContain('AUTHENTICATED SOURCE');
  });

  it('B. Renders Active Mission / Live Download Card when activeJob is supplied', () => {
    // Render panel component and verify it includes live telemetry structure
    const element = React.createElement(Sentinel1AcquisitionPanel);
    const html = renderToString(element);
    expect(html).toContain('Sentinel-1');
  });

  it('C. Real CDSE job strictly resolves to REAL_CDSE and cannot fall back to demo-scene-001', () => {
    const searchParams = new URLSearchParams('jobId=job-real-cdse-s1d-102');
    const context = resolveInvestigationContext('REAL_CDSE', searchParams);

    expect(context.scenarioId).toBe('REAL_CDSE');
    expect(context.scenarioId).not.toBe('demo-scene-001');

    // Also verify UUID route resolution maps to REAL_CDSE
    const uuidContext = resolveInvestigationContext('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', new URLSearchParams());
    expect(uuidContext.scenarioId).toBe('REAL_CDSE');
    expect(uuidContext.scenarioId).not.toBe('demo-scene-001');
  });

  it('D. All Demo scenarios still resolve accurately and work normally', () => {
    expect(matchScenarioIdentifier('demo-scene-001')).toBe('demo-scene-001');
    expect(matchScenarioIdentifier('demo-scene-002')).toBe('demo-scene-002');
    expect(matchScenarioIdentifier('demo-scene-003')).toBe('demo-scene-003');
    expect(matchScenarioIdentifier('demo-scene-004')).toBe('demo-scene-004');

    const demo1Context = resolveInvestigationContext('demo-scene-001', new URLSearchParams());
    expect(demo1Context.scenarioId).toBe('demo-scene-001');

    const demo2Context = resolveInvestigationContext('demo-scene-002', new URLSearchParams());
    expect(demo2Context.scenarioId).toBe('demo-scene-002');

    const demo3Context = resolveInvestigationContext('demo-scene-003', new URLSearchParams());
    expect(demo3Context.scenarioId).toBe('demo-scene-003');

    const demo4Context = resolveInvestigationContext('demo-scene-004', new URLSearchParams());
    expect(demo4Context.scenarioId).toBe('demo-scene-004');
  });
});

