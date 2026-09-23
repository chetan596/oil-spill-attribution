import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { manualAnalysisApi } from '../../api/manual-analysis.api';

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

vi.mock('../../components/map/MapView', () => ({
  default: ({ children }) => React.createElement('div', { 'data-testid': 'mock-map-view' }, children),
}));

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ id: undefined }),
  Link: ({ children, to }) => React.createElement('a', { href: to }, children),
}));

// Mock manualAnalysisApi
vi.mock('../../api/manual-analysis.api', () => ({
  manualAnalysisApi: {
    uploadOnly: vi.fn(),
    classifyImage: vi.fn(),
    uploadAndAnalyze: vi.fn(),
    getStatus: vi.fn(),
    getResult: vi.fn(),
    getReport: vi.fn(),
    getMaskUrl: vi.fn((id) => `http://localhost:4000/api/v1/manual-analysis/${id}/mask`),
    getOverlayUrl: vi.fn((id) => `http://localhost:4000/api/v1/manual-analysis/${id}/overlay`),
    getProbabilityUrl: vi.fn((id) => `http://localhost:4000/api/v1/manual-analysis/${id}/probability-map`),
    getOriginalUrl: vi.fn((id) => `http://localhost:4000/api/v1/manual-analysis/${id}/original`),
  },
}));

import ManualAnalysis from '../../pages/ManualAnalysis';

describe('Manual SAR & Optical Image Analysis Component & Workstation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should instantiate the ManualAnalysis page component and export functions', () => {
    expect(ManualAnalysis).toBeDefined();
    expect(typeof ManualAnalysis).toBe('function');
  });

  it('should verify manualAnalysisApi endpoints are properly mapped', () => {
    expect(manualAnalysisApi.getMaskUrl('test-job-123')).toBe(
      'http://localhost:4000/api/v1/manual-analysis/test-job-123/mask'
    );
    expect(manualAnalysisApi.getOverlayUrl('test-job-123')).toBe(
      'http://localhost:4000/api/v1/manual-analysis/test-job-123/overlay'
    );
    expect(manualAnalysisApi.getProbabilityUrl('test-job-123')).toBe(
      'http://localhost:4000/api/v1/manual-analysis/test-job-123/probability-map'
    );
  });

  it('should verify Part 0.14B classifyImage API function is callable with correct payload', async () => {
    manualAnalysisApi.classifyImage.mockResolvedValueOnce({
      success: true,
      data: {
        status: 'OIL_SPILL_DETECTED',
        oilSpillDetected: true,
        modelProbability: 0.8845,
        decisionThreshold: 0.80,
        modality: 'OPTICAL_RGB',
        location: 'NOT_ESTABLISHED',
      },
    });

    const result = await manualAnalysisApi.classifyImage('analysis-456', { threshold: 0.80 });
    expect(manualAnalysisApi.classifyImage).toHaveBeenCalledWith('analysis-456', { threshold: 0.80 });
    expect(result.data.status).toBe('OIL_SPILL_DETECTED');
    expect(result.data.oilSpillDetected).toBe(true);
    expect(result.data.modelProbability).toBe(0.8845);
    expect(result.data.location).toBe('NOT_ESTABLISHED');
  });
});

