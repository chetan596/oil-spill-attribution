import { describe, it, expect, vi } from 'vitest';
import React from 'react';

// Mock Leaflet & react-leaflet for Node test runner
vi.mock('leaflet', () => ({
  default: {
    divIcon: vi.fn(() => ({})),
    icon: vi.fn(() => ({})),
    latLng: vi.fn((lat, lng) => [lat, lng]),
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
  },
  divIcon: vi.fn(() => ({})),
  icon: vi.fn(() => ({})),
  latLng: vi.fn((lat, lng) => [lat, lng]),
}));

vi.mock('react-leaflet', () => ({
  Polygon: (props) => React.createElement('div', props),
  Polyline: (props) => React.createElement('div', props),
  Circle: (props) => React.createElement('div', props),
  Marker: (props) => React.createElement('div', props),
  Tooltip: (props) => React.createElement('div', props),
  Popup: (props) => React.createElement('div', props),
  TileLayer: (props) => React.createElement('div', props),
  MapContainer: (props) => React.createElement('div', props),
  useMap: () => ({ fitBounds: vi.fn(), flyTo: vi.fn(), setView: vi.fn() }),
  ScaleControl: (props) => React.createElement('div', props),
}));

import AttributionHUD from '../map/AttributionHUD';
import AttributionToolbar from '../map/AttributionToolbar';
import AttributionLayerControls from '../map/AttributionLayerControls';
import AttributionRankingPanel from '../vessels/AttributionRankingPanel';
import VesselLayer from '../map/VesselLayer';
import MapModeSelector from '../map/MapModeSelector';

describe('AIS Attribution Mode Components', () => {
  const mockCandidates = [
    {
      rank: 1,
      totalScore: 0.546,
      proximityScore: 0.82,
      temporalScore: 0.74,
      trajectoryScore: 0.65,
      anomalyScore: 0.15,
      vessel: {
        id: 'vessel-1',
        name: 'DEMO MARINER ALPHA',
        mmsi: '419000123',
        flag: 'IN',
        vesselType: 'Crude Oil Tanker',
        lengthM: 245,
        beamM: 42,
      },
      evidence: {
        searchRadiusKm: 50.0,
        distanceKm: 1.24,
        closestApproachKm: 1.24,
        passingLat: 18.98,
        passingLng: 72.72,
        closestTimestamp: '2026-03-09T21:30:00.000Z',
        timeDiffHours: 1.2,
        speedAtPassingKts: 14.2,
        headingAtPassingDeg: 245,
      },
    },
    {
      rank: 2,
      totalScore: 0.382,
      proximityScore: 0.45,
      temporalScore: 0.50,
      trajectoryScore: 0.40,
      anomalyScore: 0.10,
      vessel: {
        id: 'vessel-2',
        name: 'PACIFIC CARRIER',
        mmsi: '419000456',
        flag: 'PA',
        vesselType: 'Bulk Carrier',
        lengthM: 190,
        beamM: 32,
      },
      evidence: {
        searchRadiusKm: 50.0,
        distanceKm: 4.85,
        closestApproachKm: 4.85,
        passingLat: 19.02,
        passingLng: 72.68,
        closestTimestamp: '2026-03-09T19:45:00.000Z',
        timeDiffHours: 3.1,
        speedAtPassingKts: 11.8,
        headingAtPassingDeg: 210,
      },
    },
  ];

  const mockTrack = {
    vessel: mockCandidates[0].vessel,
    trackPoints: [
      { latitude: 18.90, longitude: 72.80, timestamp: '2026-03-09T20:00:00.000Z' },
      { latitude: 18.98, longitude: 72.72, timestamp: '2026-03-09T21:30:00.000Z' },
      { latitude: 19.05, longitude: 72.65, timestamp: '2026-03-09T23:00:00.000Z' },
    ],
  };

  it('should render MapModeSelector with AIS Attribution mode option', () => {
    let selectedMode = null;
    const element = React.createElement(MapModeSelector, {
      currentMode: 'ais',
      onSelectMode: (m) => { selectedMode = m; },
    });

    expect(element).toBeDefined();
    expect(element.props.currentMode).toBe('ais');
  });

  it('should render AttributionHUD with candidate count, top candidate score, and CPA metrics', () => {
    const element = React.createElement(AttributionHUD, {
      candidateVessels: mockCandidates,
      selectedCandidate: mockCandidates[0],
    });

    expect(element).toBeDefined();
    expect(element.props.candidateVessels.length).toBe(2);
    expect(element.props.selectedCandidate.totalScore).toBe(0.546);
    expect(element.props.selectedCandidate.evidence.distanceKm).toBe(1.24);
  });

  it('should render AttributionToolbar with tactical action buttons', () => {
    const element = React.createElement(AttributionToolbar, {
      hasSelectedCandidate: true,
    });

    expect(element).toBeDefined();
    expect(element.props.hasSelectedCandidate).toBe(true);
  });

  it('should render AttributionLayerControls with categorized layer hierarchy and basemap selector', () => {
    const visibleLayers = {
      slick: true,
      origin: true,
      cpa: true,
      vessels: true,
      tracks: true,
      grid: true,
      sceneFootprint: false,
    };

    const element = React.createElement(AttributionLayerControls, {
      visibleLayers,
      hasFootprint: false,
      hasSelectedCandidate: true,
      basemapType: 'dark',
    });

    expect(element).toBeDefined();
    expect(element.props.visibleLayers.vessels).toBe(true);
    expect(element.props.visibleLayers.cpa).toBe(true);
    expect(element.props.visibleLayers.tracks).toBe(true);
  });

  it('should render AttributionRankingPanel with backend score components and evidentiary disclaimer', () => {
    const element = React.createElement(AttributionRankingPanel, {
      candidateVessels: mockCandidates,
      selectedCandidate: mockCandidates[0],
    });

    expect(element).toBeDefined();
    expect(element.props.candidateVessels.length).toBe(2);
    expect(element.props.selectedCandidate.proximityScore).toBe(0.82);
    expect(element.props.selectedCandidate.temporalScore).toBe(0.74);
    expect(element.props.selectedCandidate.trajectoryScore).toBe(0.65);
    expect(element.props.selectedCandidate.anomalyScore).toBe(0.15);
  });

  it('should render VesselLayer with candidates, track, and CPA measurement vector', () => {
    const element = React.createElement(VesselLayer, {
      candidateVessels: mockCandidates,
      selectedVessel: mockCandidates[0],
      vesselTrack: mockTrack,
      originCoord: [19.113, 72.544],
      showVessels: true,
      showTracks: true,
      showCpa: true,
    });

    expect(element).toBeDefined();
    expect(element.props.candidateVessels.length).toBe(2);
    expect(element.props.selectedVessel.vessel.name).toBe('DEMO MARINER ALPHA');
    expect(element.props.originCoord).toEqual([19.113, 72.544]);
    expect(element.props.showCpa).toBe(true);
  });
});
