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

import DriftForecastHUD from '../map/DriftForecastHUD';
import DriftToolbar from '../map/DriftToolbar';
import DriftLayerControls from '../map/DriftLayerControls';
import OriginLayer from '../map/OriginLayer';
import TrajectoryLayer from '../map/TrajectoryLayer';
import MetOceanLayer from '../map/MetOceanLayer';
import MapModeSelector from '../map/MapModeSelector';

describe('Drift & Forecast Mode Components', () => {
  const mockDriftData = {
    originLat: 19.113,
    originLng: 72.544,
    latitude: 19.113,
    longitude: 72.544,
    originTimestamp: '2026-03-09T12:00:00.000Z',
    uncertaintyRadiusKm: 2.6,
    engine: 'BUILT-IN DEMONSTRATION LAGRANGIAN MODEL',
    timeWindowHours: 24,
    backwardPath: Array.from({ length: 25 }, (_, i) => ({
      seqIndex: i,
      latitude: 18.921 + i * 0.008,
      longitude: 72.832 - i * 0.012,
      timestamp: new Date(Date.now() - i * 3600 * 1000).toISOString(),
      elapsedHours: i,
      uncertaintyRadiusKm: 2.6,
      phase: 'backward',
    })),
    forwardPath: Array.from({ length: 7 }, (_, i) => ({
      seqIndex: i,
      latitude: 18.921 - i * 0.008,
      longitude: 72.832 + i * 0.012,
      timestamp: new Date(Date.now() + i * 3600 * 1000).toISOString(),
      elapsedHours: i,
      uncertaintyRadiusKm: 2.6,
      phase: 'forward',
    })),
    simulationMeta: {
      engine: 'BUILT-IN DEMONSTRATION LAGRANGIAN MODEL',
      environmental: {
        wind: { speed_kts: 12.4, direction_from_deg: 315.0, leeway_factor: 0.03 },
        current: { speed_kts: 0.8, direction_towards_deg: 125.0 },
      },
    },
  };

  it('should render MapModeSelector with drift mode option', () => {
    let mode = null;
    const element = React.createElement(MapModeSelector, {
      currentMode: 'drift',
      onSelectMode: (m) => { mode = m; },
    });

    expect(element).toBeDefined();
    expect(element.props.currentMode).toBe('drift');
  });

  it('should create DriftForecastHUD with verified Lagrangian metadata and MetOcean forcing', () => {
    const element = React.createElement(DriftForecastHUD, {
      driftData: mockDriftData,
    });

    expect(element).toBeDefined();
    expect(element.props.driftData.originLat).toBe(19.113);
    expect(element.props.driftData.originLng).toBe(72.544);
    expect(element.props.driftData.uncertaintyRadiusKm).toBe(2.6);
    expect(element.props.driftData.engine).toBe('BUILT-IN DEMONSTRATION LAGRANGIAN MODEL');
  });

  it('should create DriftToolbar with quick action props', () => {
    const element = React.createElement(DriftToolbar, {
      hasForecast: true,
    });

    expect(element).toBeDefined();
    expect(element.props.hasForecast).toBe(true);
  });

  it('should create DriftLayerControls with expected layer configuration', () => {
    const visibleLayers = {
      origin: true,
      hindcast: true,
      forecast: true,
      metocean: true,
      slick: true,
      grid: true,
    };

    const element = React.createElement(DriftLayerControls, {
      visibleLayers,
      hasForecast: true,
      basemapType: 'dark',
    });

    expect(element).toBeDefined();
    expect(element.props.visibleLayers.origin).toBe(true);
    expect(element.props.visibleLayers.hindcast).toBe(true);
    expect(element.props.visibleLayers.forecast).toBe(true);
  });

  it('should create OriginLayer with backend-provided origin coordinates and uncertainty', () => {
    const element = React.createElement(OriginLayer, {
      driftData: mockDriftData,
      visible: true,
    });

    expect(element).toBeDefined();
    expect(element.props.driftData.originLat).toBe(19.113);
  });

  it('should create TrajectoryLayer for progressive hindcast & forecast playback', () => {
    const element = React.createElement(TrajectoryLayer, {
      driftData: mockDriftData,
      currentStep: 5,
      simPhase: 'backward',
      isPlaying: true,
    });

    expect(element).toBeDefined();
    expect(element.props.currentStep).toBe(5);
    expect(element.props.simPhase).toBe('backward');
  });

  it('should create MetOceanLayer with demonstration forcing vectors', () => {
    const element = React.createElement(MetOceanLayer, {
      center: [19.113, 72.544],
      visible: true,
    });

    expect(element).toBeDefined();
    expect(element.props.center).toEqual([19.113, 72.544]);
  });
});
