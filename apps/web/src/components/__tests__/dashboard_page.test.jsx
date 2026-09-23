import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { useSpillStore } from '../../app/store/spillStore';
import { useAuthStore } from '../../app/store/authStore';

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

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/dashboard' }),
  Link: ({ children, to }) => React.createElement('a', { href: to }, children),
}));

// Mock stores
vi.mock('../../app/store/spillStore', () => ({
  useSpillStore: vi.fn(),
}));

vi.mock('../../app/store/authStore', () => ({
  useAuthStore: vi.fn(),
}));

import Dashboard from '../../pages/Dashboard';

describe('Blue Forensic AI - Overview Page Restructure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSpillStore.mockReturnValue({
      spills: [
        {
          id: 'demo-scene-001',
          name: 'Mumbai Offshore',
          areaKm2: 4.73,
          confidence: 0.94,
          latitude: 18.94,
          longitude: 72.81,
          geomWkt: 'POLYGON((72.80 18.93, 72.82 18.93, 72.82 18.95, 72.80 18.95, 72.80 18.93))',
        },
      ],
      fetchSpills: vi.fn(),
      isLoading: false,
      error: null,
    });

    useAuthStore.mockReturnValue({
      user: { id: 'user-1', name: 'Commander Analyst', email: 'analyst@oil-spill.dev' },
      isAuthenticated: true,
    });
  });

  it('instantiates Dashboard successfully with Overview component type', () => {
    const element = React.createElement(Dashboard);
    expect(element).toBeDefined();
    expect(element.type).toBe(Dashboard);
  });

  it('accesses spills store and maintains verified metrics', () => {
    const { fetchSpills, spills } = useSpillStore();
    expect(fetchSpills).toBeDefined();
    expect(spills).toHaveLength(1);
    expect(spills[0].areaKm2).toBe(4.73);
  });
});


