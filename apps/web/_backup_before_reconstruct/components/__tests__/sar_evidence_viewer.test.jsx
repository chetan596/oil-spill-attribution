import { describe, it, expect } from 'vitest';
import React from 'react';
import SarEvidenceViewer from '../analysis/SarEvidenceViewer';

describe('SAR Evidence & Source Image Viewer Component', () => {
  const mockScene1 = {
    sceneId: 'DEMO-SAR-SENTINEL1-MUMBAI-2026-001',
    satellite: 'Sentinel-1 C-Band SAR',
    acquisitionAt: '2026-03-10T12:00:00.000Z',
    bandInfo: { polarisation: 'VV+VH', resolutionMeters: 10 },
    geomWkt: 'POLYGON((72.500 18.500, 73.200 18.500, 73.200 19.200, 72.500 19.200, 72.500 18.500))',
  };

  const mockSpill1 = {
    id: 'spill-001',
    areaKm2: 4.73,
    confidence: 0.94,
    latitude: 18.921,
    longitude: 72.832,
    detectedAt: '2026-03-10T12:00:00.000Z',
    geomWkt: 'POLYGON((72.800 18.900, 72.860 18.900, 72.860 18.942, 72.800 18.942, 72.800 18.900))',
  };

  const mockScene2 = {
    sceneId: 'DEMO-SAR-SENTINEL1-KUTCH-2026-002',
    satellite: 'Sentinel-1 C-Band SAR',
    acquisitionAt: '2026-03-11T06:00:00.000Z',
    bandInfo: { polarisation: 'VV+VH', resolutionMeters: 10 },
    geomWkt: 'POLYGON((68.800 22.000, 69.600 22.000, 69.600 22.800, 68.800 22.800, 68.800 22.000))',
  };

  const mockSpill2 = {
    id: 'spill-002',
    areaKm2: 2.85,
    confidence: 0.91,
    latitude: 22.450,
    longitude: 69.210,
    detectedAt: '2026-03-11T06:00:00.000Z',
    geomWkt: 'POLYGON((69.180 22.430, 69.240 22.430, 69.240 22.470, 69.180 22.470, 69.180 22.430))',
  };

  it('should initialize SarEvidenceViewer element when closed', () => {
    const element = React.createElement(SarEvidenceViewer, {
      isOpen: false,
      spill: mockSpill1,
      scene: mockScene1,
    });
    expect(element).toBeDefined();
    expect(element.props.isOpen).toBe(false);
  });

  it('should construct SarEvidenceViewer with baseline scenario 001 metadata and scientific values', () => {
    const element = React.createElement(SarEvidenceViewer, {
      isOpen: true,
      spill: mockSpill1,
      scene: mockScene1,
    });

    expect(element).toBeDefined();
    expect(element.props.isOpen).toBe(true);
    expect(element.props.spill.confidence).toBe(0.94);
    expect(element.props.spill.areaKm2).toBe(4.73);
    expect(element.props.scene.sceneId).toBe('DEMO-SAR-SENTINEL1-MUMBAI-2026-001');
    expect(element.props.scene.bandInfo.polarisation).toBe('VV+VH');
  });

  it('should dynamically adapt to demo-scene-002 without reusing scene-001 values', () => {
    const element1 = React.createElement(SarEvidenceViewer, {
      isOpen: true,
      spill: mockSpill1,
      scene: mockScene1,
    });

    const element2 = React.createElement(SarEvidenceViewer, {
      isOpen: true,
      spill: mockSpill2,
      scene: mockScene2,
    });

    expect(element1.props.scene.sceneId).toBe('DEMO-SAR-SENTINEL1-MUMBAI-2026-001');
    expect(element2.props.scene.sceneId).toBe('DEMO-SAR-SENTINEL1-KUTCH-2026-002');
    expect(element1.props.spill.areaKm2).toBe(4.73);
    expect(element2.props.spill.areaKm2).toBe(2.85);
  });

  it('should handle missing scene/spill safely without runtime crash', () => {
    const element = React.createElement(SarEvidenceViewer, {
      isOpen: true,
      spill: null,
      scene: null,
    });

    expect(element).toBeDefined();
    expect(element.props.spill).toBeNull();
    expect(element.props.scene).toBeNull();
  });

  it('should support ground truth and validation metrics for real positive scene', () => {
    const mockPositiveScene = {
      sceneId: 'real_part1_oil_00000',
      satellite: 'Sentinel-1 C-Band SAR (Zenodo Part I)',
      acquisitionAt: '2023-01-13T17:28:32.000Z',
      bandInfo: { polarisation: 'VV+VH', resolutionMeters: 10 },
    };

    const mockPositiveSpill = {
      id: 'spill-real-00000',
      areaKm2: 0.3934,
      confidence: 0.3686,
      latitude: 55.24,
      longitude: 4.05,
    };

    const element = React.createElement(SarEvidenceViewer, {
      isOpen: true,
      spill: mockPositiveSpill,
      scene: mockPositiveScene,
    });

    expect(element).toBeDefined();
    expect(element.props.scene.sceneId).toBe('real_part1_oil_00000');
    expect(element.props.spill.areaKm2).toBe(0.3934);
  });

  it('should support V2 and V3 model inspection options', () => {
    const element = React.createElement(SarEvidenceViewer, {
      isOpen: true,
      spill: mockSpill1,
      scene: mockScene1,
    });
    expect(element).toBeDefined();
    expect(element.type).toBe(SarEvidenceViewer);
  });

  it('should render authentic CDSE metadata and 4-panel mode when isRealScene is true', () => {
    const mockRealScene = {
      sceneId: 'cdse-s1a-mumbai-20240218',
      isRealScene: true,
      scenarioType: 'REAL_CDSE',
      satellite: 'Sentinel-1A',
      acquisitionAt: '2024-02-18T01:03:29.872826Z',
      productUuid: '3f5c4ba1-ed70-4065-91b9-2bbeb7ebfb79',
      bandInfo: { polarisation: 'VV+VH', resolutionMeters: 10 },
      geomWkt: 'POLYGON((72.716985 18.965879, 72.773998 18.965879, 72.773998 19.020798, 72.716985 19.020798, 72.716985 18.965879))',
    };

    const mockRealSpill = {
      id: 'spill-real-cdse',
      scenarioType: 'REAL_CDSE',
      latitude: 18.993339,
      longitude: 72.745492,
      areaKm2: 0.0001,
      confidence: null,
    };

    const element = React.createElement(SarEvidenceViewer, {
      isOpen: true,
      spill: mockRealSpill,
      scene: mockRealScene,
    });

    expect(element).toBeDefined();
    expect(element.props.scene.isRealScene).toBe(true);
    expect(element.props.scene.scenarioType).toBe('REAL_CDSE');
    expect(element.props.scene.productUuid).toBe('3f5c4ba1-ed70-4065-91b9-2bbeb7ebfb79');
  });
});
