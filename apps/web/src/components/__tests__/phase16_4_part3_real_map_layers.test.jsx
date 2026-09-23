/**
 * phase16_4_part3_real_map_layers.test.jsx
 *
 * PHASE 16.4 — PART 3: REAL INVESTIGATION MAP LAYER INTEGRATION
 *
 * Test suite verifying:
 *  1. real footprint renders
 *  2. missing footprint does not fabricate
 *  3. spill geometry renders
 *  4. centroid renders
 *  5. origin renders
 *  6. missing origin does not fabricate
 *  7. backward trajectory array renders
 *  8. backward GeoJSON renders
 *  9. forward trajectory array renders
 * 10. forward GeoJSON renders
 * 11. GFW presence cells render
 * 12. latitude/longitude fields resolve correctly
 * 13. candidates render
 * 14. demo candidates never render in real mode
 * 15. map bounds include origin
 * 16. map bounds include AIS cells
 * 17. map bounds include trajectories
 * 18. stale layers disappear after investigation switch
 * 19. missing data does not generate fallback layers
 * 20. VESSEL_PRESENCE never generates raw track
 * 21. CPA never generated when cpaAvailable=false
 * 22. legend reflects actual available layers
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import ReactDOMServer from 'react-dom/server';

// Mock react-leaflet primitives
vi.mock('react-leaflet', () => ({
  GeoJSON: (props) => React.createElement('div', {
    ...props,
    'data-type': 'GeoJSON',
    'data-test-feature': props.data?.properties?.provenance || props.data?.geometry?.type,
  }),
  CircleMarker: (props) => React.createElement('div', {
    ...props,
    'data-type': 'CircleMarker',
    'data-lat': Array.isArray(props.center) ? props.center[0] : null,
    'data-lng': Array.isArray(props.center) ? props.center[1] : null,
  }),
  Circle: (props) => React.createElement('div', {
    ...props,
    'data-type': 'Circle',
    'data-radius': props.radius,
  }),
  Polyline: (props) => React.createElement('div', {
    ...props,
    'data-type': 'Polyline',
    'data-points-count': props.positions?.length,
  }),
  Polygon: (props) => React.createElement('div', { ...props, 'data-type': 'Polygon' }),
  Tooltip: (props) => React.createElement('div', { ...props, 'data-type': 'Tooltip' }),
  Popup: (props) => React.createElement('div', { ...props, 'data-type': 'Popup' }),
  useMap: () => ({ fitBounds: vi.fn(), flyTo: vi.fn(), setView: vi.fn(), invalidateSize: vi.fn() }),
  MapContainer: (props) => React.createElement('div', { ...props, 'data-type': 'MapContainer' }),
  TileLayer: (props) => React.createElement('div', { ...props, 'data-type': 'TileLayer' }),
}));

vi.mock('leaflet', () => ({
  default: {
    latLngBounds: vi.fn(() => ({ isValid: () => true, pad: vi.fn(() => ({})) })),
    latLng: vi.fn(() => ({})),
    icon: vi.fn(() => ({})),
    divIcon: vi.fn(() => ({})),
    Icon: {
      Default: {
        prototype: { _getIconUrl: vi.fn() },
        mergeOptions: vi.fn(),
      },
    },
  },
  latLngBounds: vi.fn(() => ({ isValid: () => true, pad: vi.fn(() => ({})) })),
  latLng: vi.fn(() => ({})),
  icon: vi.fn(() => ({})),
  divIcon: vi.fn(() => ({})),
  Icon: {
    Default: {
      prototype: { _getIconUrl: vi.fn() },
      mergeOptions: vi.fn(),
    },
  },
}));

import ManualFootprintLayer from '../map/ManualFootprintLayer';
import ManualOriginLayer from '../map/ManualOriginLayer';
import ManualDriftLayer from '../map/ManualDriftLayer';
import ManualCandidateLayer from '../map/ManualCandidateLayer';
import ManualMapLegend from '../map/ManualMapLegend';
import {
  buildRealMapModel,
  normalizeTrajectoryCoords,
  normalizeImageFootprint,
  normalizeSpillFootprint,
  normalizeCentroid,
  normalizeOrigin,
  normalizeAisPresence,
  calculateRealMapBounds,
} from '../../utils/realMapModel';

// Realistic Oregon Coast Sentinel-1 Investigation Fixture
const OREGON_INVESTIGATION = {
  investigationId: '47351f7f-00d0-4dfe-bfb1-d4c788b55ff6',
  status: 'COMPLETED',
  geospatial: {
    available: true,
    crs: 'EPSG:4326',
    bounds: [-125.644, 45.772, -125.464, 45.955],
    centroid: [45.8635, -125.554],
    areaKm2: 14.82,
    imageFootprint: {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-125.644, 45.772],
            [-125.464, 45.772],
            [-125.464, 45.955],
            [-125.644, 45.955],
            [-125.644, 45.772],
          ],
        ],
      },
      properties: { provenance: 'REAL', crs: 'EPSG:4326' },
    },
    spillFootprint: {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-125.58, 45.84],
            [-125.52, 45.84],
            [-125.52, 45.88],
            [-125.58, 45.88],
            [-125.58, 45.84],
          ],
        ],
      },
      properties: { provenance: 'MODEL_DERIVED' },
    },
  },
  detection: {
    oilSpillDetected: true,
    confidence: 0.94,
  },
  origin: {
    status: 'ESTIMATED',
    provenance: 'MODEL_DERIVED',
    estimatedPoint: { latitude: 46.1306, longitude: -126.1164 },
    estimatedReleaseTime: '2019-09-08T03:51:25.000Z',
    uncertainty: { radiusKm: 2.5 },
  },
  drift: {
    status: 'ESTIMATED',
    backward: {
      status: 'ESTIMATED',
      points: [
        { latitude: 45.8635, longitude: -125.554, timestamp: '2019-09-09T03:51:25.000Z' },
        { latitude: 45.997, longitude: -125.835, timestamp: '2019-09-08T15:51:25.000Z' },
        { latitude: 46.1306, longitude: -126.1164, timestamp: '2019-09-08T03:51:25.000Z' },
      ],
    },
    forward: {
      status: 'ESTIMATED',
      points: [
        { latitude: 45.8635, longitude: -125.554, timestamp: '2019-09-09T03:51:25.000Z' },
        { latitude: 45.72, longitude: -125.31, timestamp: '2019-09-09T15:51:25.000Z' },
      ],
    },
  },
  aisCorrelation: {
    status: 'CANDIDATES_FOUND',
    provider: 'GLOBAL_FISHING_WATCH',
    observationLevel: 'VESSEL_PRESENCE',
    candidates: [
      {
        vesselId: {
          mmsi: '367713340',
          name: 'PACIFIC HORIZON',
          flag: 'USA',
          vesselType: 'Fishing Vessel',
        },
        rank: 1,
        correlation: {
          score: 0.78,
          closestApproachKm: null,
          closestCellDistanceKm: 1.84,
          closestCellCoordinates: { latitude: 46.12, longitude: -126.10 },
        },
        aisEvidence: {
          observationLevel: 'VESSEL_PRESENCE',
          presenceHours: 5,
          presenceCells: [
            { latitude: 46.12, longitude: -126.10, hours: 3 },
            { latitude: 46.14, longitude: -126.08, hours: 2 },
          ],
        },
      },
    ],
  },
};

describe('Phase 16.4 Part 3 — Real Investigation Map Layer Integration', () => {
  // Test 1: Real footprint renders
  it('1. real footprint renders', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <ManualFootprintLayer
        imageFootprint={OREGON_INVESTIGATION.geospatial.imageFootprint}
        spillFootprint={null}
        centroid={null}
        visible={true}
      />
    );
    expect(html).toContain('Image Footprint');
    expect(html).toContain('REAL INPUT GEOLOCATION');
    expect(html).toContain('EPSG:4326');
  });

  // Test 2: Missing footprint does not fabricate
  it('2. missing footprint does not fabricate', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <ManualFootprintLayer
        imageFootprint={null}
        spillFootprint={null}
        centroid={[45.86, -125.55]}
        visible={true}
      />
    );
    expect(html).not.toContain('Image Footprint');
    expect(html).not.toContain('REAL INPUT GEOLOCATION');
    // Ensure no polygon is drawn for image
    const norm = normalizeImageFootprint(null, null);
    expect(norm).toBeNull();
  });

  // Test 3: Spill geometry renders
  it('3. spill geometry renders', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <ManualFootprintLayer
        imageFootprint={null}
        spillFootprint={OREGON_INVESTIGATION.geospatial.spillFootprint}
        centroid={null}
        areaKm2={14.82}
        confidence={0.94}
        visible={true}
      />
    );
    expect(html).toContain('Oil Spill Footprint');
    expect(html).toContain('MODEL_DERIVED');
    expect(html).toContain('14.8200 km²');
    expect(html).toContain('94%');
  });

  // Test 4: Centroid renders
  it('4. centroid renders', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <ManualFootprintLayer
        imageFootprint={null}
        spillFootprint={null}
        centroid={[45.8635, -125.554]}
        visible={true}
      />
    );
    expect(html).toContain('Spill Centroid');
    expect(html).toContain('45.86350');
    expect(html).toContain('-125.55400');
    expect(html).toContain('data-lat="45.8635"');
  });

  // Test 5: Origin renders
  it('5. origin renders', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <ManualOriginLayer origin={OREGON_INVESTIGATION.origin} />
    );
    expect(html).toContain('ESTIMATED SPILL ORIGIN');
    expect(html).toContain('data-lat="46.1306"');
    expect(html).toContain('data-lng="-126.1164"');
    expect(html).toContain('data-radius="2500"'); // 2.5 km -> 2500m
  });

  // Test 6: Missing origin does not fabricate
  it('6. missing origin does not fabricate', () => {
    const htmlNull = ReactDOMServer.renderToStaticMarkup(
      <ManualOriginLayer origin={null} />
    );
    expect(htmlNull).toBe('');

    const htmlNotEst = ReactDOMServer.renderToStaticMarkup(
      <ManualOriginLayer origin={{ status: 'NOT_ESTABLISHED' }} />
    );
    expect(htmlNotEst).toBe('');

    const norm = normalizeOrigin({ status: 'NOT_ESTABLISHED' });
    expect(norm).toBeNull();
  });

  // Test 7: Backward trajectory array renders
  it('7. backward trajectory array renders', () => {
    const driftShapeA = {
      status: 'ESTIMATED',
      backward: {
        points: [
          { latitude: 45.86, longitude: -125.55 },
          { latitude: 46.00, longitude: -125.80 },
        ],
      },
    };
    const html = ReactDOMServer.renderToStaticMarkup(
      <ManualDriftLayer drift={driftShapeA} />
    );
    expect(html).toContain('ESTIMATED BACKTRACK');
    expect(html).toContain('data-type="Polyline"');
    expect(html).toContain('data-points-count="2"');
  });

  // Test 8: Backward GeoJSON renders
  it('8. backward GeoJSON renders', () => {
    const driftShapeB = {
      status: 'ESTIMATED',
      backward: {
        trajectory: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [-125.55, 45.86],
              [-125.80, 46.00],
              [-126.11, 46.13],
            ],
          },
        },
      },
    };
    const html = ReactDOMServer.renderToStaticMarkup(
      <ManualDriftLayer drift={driftShapeB} />
    );
    expect(html).toContain('ESTIMATED BACKTRACK');
    expect(html).toContain('data-type="Polyline"');
    expect(html).toContain('data-points-count="3"');
  });

  // Test 9: Forward trajectory array renders
  it('9. forward trajectory array renders', () => {
    const driftForward = {
      status: 'ESTIMATED',
      forward: {
        points: [
          { latitude: 45.86, longitude: -125.55 },
          { latitude: 45.72, longitude: -125.31 },
        ],
      },
    };
    const html = ReactDOMServer.renderToStaticMarkup(
      <ManualDriftLayer drift={driftForward} />
    );
    expect(html).toContain('ESTIMATED FORECAST');
    expect(html).toContain('data-type="Polyline"');
  });

  // Test 10: Forward GeoJSON renders
  it('10. forward GeoJSON renders', () => {
    const driftForwardGeoJson = {
      status: 'ESTIMATED',
      forward: {
        trajectory: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [-125.55, 45.86],
              [-125.31, 45.72],
            ],
          },
        },
      },
    };
    const coords = normalizeTrajectoryCoords(driftForwardGeoJson.forward);
    expect(coords).toEqual([
      [45.86, -125.55],
      [45.72, -125.31],
    ]);
    const html = ReactDOMServer.renderToStaticMarkup(
      <ManualDriftLayer drift={driftForwardGeoJson} />
    );
    expect(html).toContain('ESTIMATED FORECAST');
    expect(html).toContain('data-points-count="2"');
  });

  // Test 11: GFW presence cells render
  it('11. GFW presence cells render', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <ManualCandidateLayer
        candidates={OREGON_INVESTIGATION.aisCorrelation.candidates}
        origin={OREGON_INVESTIGATION.origin}
        isDemo={false}
      />
    );
    expect(html).toContain('GFW AIS VESSEL PRESENCE — HOURLY');
    expect(html).toContain('PACIFIC HORIZON');
    expect(html).toContain('MMSI:');
    expect(html).toContain('367713340');
    expect(html).toContain('46.12');
    expect(html).toContain('-126.10');
  });

  // Test 12: Latitude/longitude fields resolve correctly
  it('12. latitude/longitude fields resolve correctly', () => {
    const mixedCells = [
      { latitude: 45.1, longitude: -125.1, hours: 2 },
      { lat: 45.2, lon: -125.2, hours: 3 },
      { lat: 45.3, lng: -125.3, hours: 1 },
    ];
    const aisData = normalizeAisPresence({
      observationLevel: 'VESSEL_PRESENCE',
      candidates: [
        {
          vesselId: { mmsi: '999888777', name: 'TEST MIXED' },
          presenceCells: mixedCells,
        },
      ],
    });
    expect(aisData.presenceCells.length).toBe(3);
    expect(aisData.presenceCells[0].latitude).toBe(45.1);
    expect(aisData.presenceCells[0].longitude).toBe(-125.1);
    expect(aisData.presenceCells[1].latitude).toBe(45.2);
    expect(aisData.presenceCells[1].longitude).toBe(-125.2);
    expect(aisData.presenceCells[2].latitude).toBe(45.3);
    expect(aisData.presenceCells[2].longitude).toBe(-125.3);
  });

  // Test 13: Candidates render
  it('13. candidates render', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <ManualCandidateLayer
        candidates={OREGON_INVESTIGATION.aisCorrelation.candidates}
        origin={OREGON_INVESTIGATION.origin}
        isDemo={false}
      />
    );
    expect(html).toContain('PACIFIC HORIZON');
    expect(html).toContain('367713340');
    expect(html).toContain('POTENTIAL AIS CANDIDATE');
    expect(html).toContain('RANK #1');
  });

  // Test 14: Demo candidates never render in real mode
  it('14. demo candidates never render in real mode', () => {
    const model = buildRealMapModel({
      manualInvestigationData: OREGON_INVESTIGATION,
    });
    const html = ReactDOMServer.renderToStaticMarkup(
      <ManualCandidateLayer
        candidates={model.aisCandidates}
        origin={model.origin}
        isDemo={false}
      />
    );
    expect(html).not.toContain('MV Kandla Star');
    expect(html).not.toContain('MT Indrayani');
    expect(html).not.toContain('Unknown trawler');
    expect(html).not.toContain('419001234');
    expect(html).not.toContain('419005678');
    expect(html).not.toContain('419009999');
  });

  // Test 15: Map bounds include origin
  it('15. map bounds include origin', () => {
    const model = buildRealMapModel({
      manualInvestigationData: OREGON_INVESTIGATION,
    });
    expect(model.bounds).not.toBeNull();
    const [[south, west], [north, east]] = model.bounds;
    const originLat = OREGON_INVESTIGATION.origin.estimatedPoint.latitude;
    const originLng = OREGON_INVESTIGATION.origin.estimatedPoint.longitude;

    expect(south).toBeLessThanOrEqual(originLat);
    expect(north).toBeGreaterThanOrEqual(originLat);
    expect(west).toBeLessThanOrEqual(originLng);
    expect(east).toBeGreaterThanOrEqual(originLng);
  });

  // Test 16: Map bounds include AIS cells
  it('16. map bounds include AIS cells', () => {
    const model = buildRealMapModel({
      manualInvestigationData: OREGON_INVESTIGATION,
    });
    const [[south, west], [north, east]] = model.bounds;
    const cellLat = 46.14;
    const cellLng = -126.08;

    expect(south).toBeLessThanOrEqual(cellLat);
    expect(north).toBeGreaterThanOrEqual(cellLat);
    expect(west).toBeLessThanOrEqual(cellLng);
    expect(east).toBeGreaterThanOrEqual(cellLng);
  });

  // Test 17: Map bounds include trajectories
  it('17. map bounds include trajectories', () => {
    const model = buildRealMapModel({
      manualInvestigationData: OREGON_INVESTIGATION,
    });
    const [[south, west], [north, east]] = model.bounds;

    // Forward trajectory point: 45.72, -125.31
    expect(south).toBeLessThanOrEqual(45.72);
    expect(east).toBeGreaterThanOrEqual(-125.31);
  });

  // Test 18: Stale layers disappear after investigation switch
  it('18. stale layers disappear after investigation switch', () => {
    const investigationA = {
      investigationId: 'investigation-A',
      geospatial: {
        available: true,
        centroid: [45.86, -125.55],
      },
      origin: {
        status: 'ESTIMATED',
        estimatedPoint: { latitude: 46.13, longitude: -126.11 },
      },
    };

    const investigationB = {
      investigationId: 'investigation-B',
      geospatial: {
        available: true,
        centroid: [28.25, -89.15], // Gulf of Mexico
      },
      origin: {
        status: 'NOT_ESTABLISHED',
      },
    };

    const modelA = buildRealMapModel({ manualInvestigationData: investigationA });
    const modelB = buildRealMapModel({ manualInvestigationData: investigationB });

    expect(modelA.centroid).toEqual([45.86, -125.55]);
    expect(modelA.origin).not.toBeNull();

    expect(modelB.centroid).toEqual([28.25, -89.15]);
    expect(modelB.origin).toBeNull();
    expect(modelB.bounds[0][0]).toBeCloseTo(28.25, 1);
    expect(modelB.bounds[0][1]).toBeCloseTo(-89.15, 1);
  });

  // Test 19: Missing data does not generate fallback layers
  it('19. missing data does not generate fallback layers', () => {
    const bareInvestigation = {
      investigationId: 'bare-1',
      geospatial: {
        available: true,
        centroid: [12.34, 56.78],
      },
    };
    const model = buildRealMapModel({ manualInvestigationData: bareInvestigation });
    expect(model.imageFootprint).toBeNull();
    expect(model.spillFootprint).toBeNull();
    expect(model.origin).toBeNull();
    expect(model.backwardTrajectory).toEqual([]);
    expect(model.forwardTrajectory).toEqual([]);
    expect(model.aisPresenceCells).toEqual([]);
    expect(model.aisCandidates).toEqual([]);
  });

  // Test 20: VESSEL_PRESENCE never generates raw track
  it('20. VESSEL_PRESENCE never generates raw track', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <ManualCandidateLayer
        candidates={OREGON_INVESTIGATION.aisCorrelation.candidates}
        origin={OREGON_INVESTIGATION.origin}
        isDemo={false}
      />
    );
    // Should NOT have a candidate polyline
    expect(html).not.toContain('Historical AIS Track');
    // Polyline should not be rendered for candidates in VESSEL_PRESENCE mode
    const hasCandidatePolyline = html.includes('data-type="Polyline"');
    expect(hasCandidatePolyline).toBe(false);
  });

  // Test 21: CPA never generated when cpaAvailable=false
  it('21. CPA never generated when cpaAvailable=false', () => {
    const model = buildRealMapModel({
      manualInvestigationData: OREGON_INVESTIGATION,
    });
    expect(model.cpaAvailable).toBe(false);
    expect(model.rawTracksAvailable).toBe(false);

    const html = ReactDOMServer.renderToStaticMarkup(
      <ManualCandidateLayer
        candidates={model.aisCandidates}
        origin={model.origin}
        isDemo={false}
      />
    );
    expect(html).toContain('CPA DISTANCE');
    expect(html).toContain('NOT AVAILABLE');
    expect(html).toContain('ATTRIBUTION: NOT ESTABLISHED');
  });

  // Test 22: Legend reflects actual available layers
  it('22. legend reflects actual available layers', () => {
    const model = buildRealMapModel({
      manualInvestigationData: OREGON_INVESTIGATION,
    });
    const html = ReactDOMServer.renderToStaticMarkup(
      <ManualMapLegend canonical={model} />
    );

    // Active layers: Image Footprint, Spill Footprint, Centroid, Estimated Origin, Backtrack, Forecast, GFW AIS Vessel Presence, Potential AIS Candidate
    expect(html).toContain('Image Footprint');
    expect(html).toContain('Spill Footprint');
    expect(html).toContain('Centroid');
    expect(html).toContain('Estimated Origin');
    expect(html).toContain('Backtrack Trajectory');
    expect(html).toContain('Forecast Trajectory');
    expect(html).toContain('GFW AIS Vessel Presence');
    expect(html).toContain('Potential AIS Candidate');

    // Inactive or prohibited layers in VESSEL_PRESENCE mode must NOT appear
    expect(html).not.toContain('AIS Candidate Track');
  });
});
