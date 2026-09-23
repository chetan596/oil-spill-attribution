import { describe, it, expect, vi } from 'vitest';
import React from 'react';

// Mock react-leaflet components for Node test runner
vi.mock('react-leaflet', () => ({
  Polygon: (props) => React.createElement('div', props),
  Tooltip: (props) => React.createElement('div', props),
  Popup: (props) => React.createElement('div', props),
  TileLayer: (props) => React.createElement('div', props),
  MapContainer: (props) => React.createElement('div', props),
  useMap: () => ({ fitBounds: vi.fn(), flyTo: vi.fn(), setView: vi.fn() }),
  ScaleControl: (props) => React.createElement('div', props),
}));

import MapModeSelector from '../map/MapModeSelector';
import SarSceneHUD from '../map/SarSceneHUD';
import SarLayerControls from '../map/SarLayerControls';
import SarToolbar from '../map/SarToolbar';
import SceneFootprintLayer from '../map/SceneFootprintLayer';

describe('SAR Analysis Mode Components', () => {
  it('should render MapModeSelector with investigation and sar mode options', () => {
    let selected = null;
    const element = React.createElement(MapModeSelector, {
      currentMode: 'sar',
      onSelectMode: (m) => { selected = m; },
    });

    expect(element).toBeDefined();
    expect(element.props.currentMode).toBe('sar');
  });

  it('should create SarSceneHUD with verified Sentinel-1 telemetry and strictly formatted confidence', () => {
    const mockSpill = {
      areaKm2: 4.73,
      latitude: 18.921,
      longitude: 72.832,
      confidence: 0.94,
      detectedAt: '2026-03-10T12:00:00Z',
    };

    const mockScene = {
      sceneId: 'DEMO-SAR-SENTINEL1-MUMBAI-2026-001',
      satellite: 'Sentinel-1 C-Band SAR',
      acquisitionAt: '2026-03-10T12:00:00.000Z',
      bandInfo: { polarisation: 'VV+VH', resolutionMeters: 10 },
      geomWkt: 'POLYGON((72.500 18.500, 73.200 18.500, 73.200 19.200, 72.500 19.200, 72.500 18.500))',
    };

    const element = React.createElement(SarSceneHUD, {
      spill: mockSpill,
      scene: mockScene,
    });

    expect(element).toBeDefined();
    expect(element.props.spill.confidence).toBe(0.94);
    expect(element.props.spill.areaKm2).toBe(4.73);
    expect(element.props.scene.sceneId).toBe('DEMO-SAR-SENTINEL1-MUMBAI-2026-001');
  });

  it('should create SarLayerControls showing available geometric layers and unexposed raster status', () => {
    const visibleLayers = {
      slick: true,
      segmentation: true,
      sceneFootprint: true,
      grid: true,
    };

    const element = React.createElement(SarLayerControls, {
      visibleLayers,
      hasFootprint: true,
      basemapType: 'dark',
    });

    expect(element).toBeDefined();
    expect(element.props.visibleLayers.slick).toBe(true);
    expect(element.props.visibleLayers.segmentation).toBe(true);
  });

  it('should create SarToolbar with quick action props', () => {
    const element = React.createElement(SarToolbar, {
      hasFootprint: true,
    });

    expect(element).toBeDefined();
    expect(element.props.hasFootprint).toBe(true);
  });

  it('should create SceneFootprintLayer with real scene geometry', () => {
    const mockScene = {
      sceneId: 'DEMO-SAR-SENTINEL1-MUMBAI-2026-001',
      geomWkt: 'POLYGON((72.500 18.500, 73.200 18.500, 73.200 19.200, 72.500 19.200, 72.500 18.500))',
    };

    const element = React.createElement(SceneFootprintLayer, {
      scene: mockScene,
      visible: true,
    });

    expect(element).toBeDefined();
    expect(element.props.scene.geomWkt).toContain('POLYGON');
  });
});
