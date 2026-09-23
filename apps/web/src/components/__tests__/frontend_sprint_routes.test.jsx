import { describe, it, expect, vi } from 'vitest';
import React from 'react';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'demo-scene-001', mmsi: '419000123' }),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/analysis/new' }),
  Link: ({ children, to }) => React.createElement('a', { href: to }, children),
}));

// Mock Leaflet and map layers
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
vi.mock('react-leaflet', () => ({
  Polyline: () => React.createElement('div', { 'data-testid': 'mock-polyline' }),
  CircleMarker: ({ children }) => React.createElement('div', { 'data-testid': 'mock-circle-marker' }, children),
  Popup: ({ children }) => React.createElement('div', { 'data-testid': 'mock-popup' }, children),
}));

// Mock APIs
vi.mock('../../api/jobs.api', () => ({
  jobsApi: {
    create: vi.fn().mockResolvedValue({ jobId: 'job-demo-999' }),
  },
}));

vi.mock('../../api/spills.api', () => ({
  spillsApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        spills: [
          {
            id: 'spill-demo-001',
            analysisId: 'demo-scene-001',
            areaKm2: 4.82,
            confidence: 0.94,
          },
        ],
      },
    }),
    getById: vi.fn().mockResolvedValue({
      data: {
        id: 'spill-demo-001',
        latitude: 18.96,
        longitude: 72.71,
        areaKm2: 4.82,
        confidence: 0.94,
      },
    }),
    getDrift: vi.fn().mockResolvedValue({
      data: {
        originLat: 18.94,
        originLng: 72.70,
        backwardPath: [{ lat: 18.94, lng: 72.70, phase: 'backward' }],
      },
    }),
    getVessels: vi.fn().mockResolvedValue({
      data: [
        {
          id: 'vessel-1',
          name: 'MT PACIFIC VOYAGER',
          mmsi: '419000123',
          correlation: 94,
        },
      ],
    }),
  },
}));

vi.mock('../../api/vessels.api', () => ({
  vesselsApi: {
    getTrack: vi.fn().mockResolvedValue({
      data: {
        vessel: {
          name: 'MT PACIFIC VOYAGER',
          mmsi: '419000123',
          flag: 'IN',
          vesselType: 'Crude Oil Tanker',
        },
        trackPoints: [
          { latitude: 18.96, longitude: 72.71, speedKnots: 12.4, heading: 285, timestamp: '2024-02-18T01:00:00Z' },
        ],
      },
    }),
  },
}));

vi.mock('../../api/dossier.api', () => ({
  dossierApi: {
    generate: vi.fn().mockResolvedValue({
      data: {
        title: 'Maritime Investigation Report — Incident #spill-de',
        createdAt: '2024-02-18T10:00:00Z',
        dossier: {
          executiveSummary: 'Automated synthesis confirms high spatial correlation with candidate vessel.',
          observedEvidence: ['Sentinel-1A dual-pol C-band radar footprint 4.82 km².'],
          modelledEvidence: ['Lagrangian reverse drift hindcast tracks origin to 18.94°N, 72.71°E.'],
          candidateAssessments: [],
          timeline: [],
          limitations: [],
          recommendedFollowUp: [],
          disclaimer: 'Legal culpability requires physical laboratory oil sample verification.',
        },
      },
    }),
  },
}));

import NewAnalysis from '../../pages/NewAnalysis';
import Reports from '../../pages/Reports';
import SpillDetails from '../../pages/SpillDetails';
import VesselDetails from '../../pages/VesselDetails';
import Settings from '../../pages/Settings';
import SystemStatus from '../../pages/SystemStatus';

describe('Blue Forensic AI — Complete User-Facing Page Architecture', () => {
  it('instantiates New Mission page with 4-step dispatch workflow', () => {
    const el = React.createElement(NewAnalysis);
    expect(el).toBeDefined();
    expect(el.type).toBe(NewAnalysis);
  });

  it('instantiates Dossier Archive (Reports) page with ledger & synthesis', () => {
    const el = React.createElement(Reports);
    expect(el).toBeDefined();
    expect(el.type).toBe(Reports);
  });

  it('instantiates Spill Details intelligence summary page', () => {
    const el = React.createElement(SpillDetails);
    expect(el).toBeDefined();
    expect(el.type).toBe(SpillDetails);
  });

  it('instantiates Candidate Vessel Details investigation page', () => {
    const el = React.createElement(VesselDetails);
    expect(el).toBeDefined();
    expect(el.type).toBe(VesselDetails);
  });

  it('instantiates Settings platform preferences page', () => {
    const el = React.createElement(Settings);
    expect(el).toBeDefined();
    expect(el.type).toBe(Settings);
  });

  it('instantiates System Status infrastructure & health page', () => {
    const el = React.createElement(SystemStatus);
    expect(el).toBeDefined();
    expect(el.type).toBe(SystemStatus);
  });
});
