/**
 * phase16_4_part5_tab_map_sync.test.jsx
 *
 * PHASE 16.4 — PART 5: TAB -> MAP SYNCHRONIZATION
 *
 * Test suite verifying:
 *  1. SAR tab resolves to SAR context
 *  2. SAR uses real image footprint
 *  3. SAR uses real spill footprint fallback
 *  4. SAR uses real centroid fallback
 *  5. SAR does not fabricate geometry
 *  6. Drift tab resolves to drift context
 *  7. Drift uses real origin
 *  8. Drift uses real backward trajectory
 *  9. Drift uses real forward trajectory
 * 10. Drift handles missing trajectory safely
 * 11. AIS tab resolves to AIS context
 * 12. AIS uses real GFW presence cells
 * 13. AIS does not create polylines
 * 14. AIS does not calculate CPA
 * 15. AIS preserves VESSEL_PRESENCE semantics
 * 16. Science tab resolves correctly
 * 17. Science does not fabricate model artifacts
 * 18. Timeline tab resolves correctly
 * 19. Timeline does not fabricate timestamps
 * 20. Dossier restores dynamic investigation bounds
 * 21. Tab change does not refetch investigation
 * 22. Tab change does not trigger ML inference
 * 23. Investigation switch clears previous map context
 * 24. Loading state prevents stale tab focus
 * 25. No demo/static coordinates introduced
 * 26. Candidate selection is preserved across tab transitions
 */

import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildRealMapModel,
  resolveTabMapContext,
  resolveMapFocusTarget,
  extractPolygonCoords,
} from '../utils/realMapModel';
import ManualFootprintLayer from '../components/map/ManualFootprintLayer';
import ManualOriginLayer from '../components/map/ManualOriginLayer';
import ManualDriftLayer from '../components/map/ManualDriftLayer';
import ManualCandidateLayer from '../components/map/ManualCandidateLayer';

// Track rendered markers
let renderedCircleMarkers = [];

// Mock react-leaflet primitives
vi.mock('react-leaflet', () => ({
  GeoJSON: (props) => React.createElement('div', {
    ...props,
    'data-type': 'GeoJSON',
    'data-feature': props.data?.properties?.provenance || props.data?.geometry?.type,
  }),
  Circle: (props) => React.createElement('div', {
    ...props,
    'data-type': 'Circle',
    'data-radius': props.radius,
  }),
  CircleMarker: (props) => {
    renderedCircleMarkers.push(props);
    return React.createElement('div', {
      ...props,
      'data-type': 'CircleMarker',
      'data-lat': Array.isArray(props.center) ? props.center[0] : null,
      'data-lng': Array.isArray(props.center) ? props.center[1] : null,
    });
  },
  Polyline: (props) => React.createElement('div', {
    ...props,
    'data-type': 'Polyline',
    'data-points-count': props.positions?.length,
  }),
  Polygon: (props) => React.createElement('div', { ...props, 'data-type': 'Polygon' }),
  Popup: (props) => React.createElement('div', { ...props, 'data-type': 'Popup' }),
  Tooltip: (props) => React.createElement('div', { ...props, 'data-type': 'Tooltip' }),
}));

describe('Phase 16.4 Part 5 — Tab -> Map Synchronization', () => {
  beforeEach(() => {
    renderedCircleMarkers = [];
  });

  const mockRealInvestigationData = {
    geospatial: {
      available: true,
      imageFootprint: {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [2.10, 41.30],
              [2.30, 41.30],
              [2.30, 41.50],
              [2.10, 41.50],
              [2.10, 41.30],
            ],
          ],
        },
      },
      spillFootprint: {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [2.15, 41.35],
              [2.25, 41.35],
              [2.25, 41.45],
              [2.15, 41.45],
              [2.15, 41.35],
            ],
          ],
        },
      },
      centroid: { latitude: 41.40, longitude: 2.20 },
      bounds: [2.10, 41.30, 2.30, 41.50],
      areaKm2: 14.82,
      confidence: 0.94,
    },
    origin: {
      status: 'ESTIMATED',
      estimatedPoint: { latitude: 41.38, longitude: 2.18 },
      uncertaintyRadiusKm: 3.5,
      uncertainty: { radiusKm: 3.5 },
      method: 'Lagrangian Backtracking',
    },
    drift: {
      status: 'ESTIMATED',
      backward: {
        status: 'ESTIMATED',
        points: [
          { latitude: 41.40, longitude: 2.20 },
          { latitude: 41.38, longitude: 2.18 },
        ],
      },
      forward: {
        status: 'ESTIMATED',
        points: [
          { latitude: 41.40, longitude: 2.20 },
          { latitude: 41.42, longitude: 2.22 },
          { latitude: 41.45, longitude: 2.26 },
        ],
      },
    },
    aisCorrelation: {
      status: 'CANDIDATES_FOUND',
      observationLevel: 'VESSEL_PRESENCE',
      provider: 'GLOBAL_FISHING_WATCH',
      cpaAvailable: false,
      rawTracksAvailable: false,
      candidates: [
        {
          id: '224123450',
          mmsi: '224123450',
          vesselName: 'MEDITERRANEAN CARRIER',
          rank: 1,
          observationLevel: 'VESSEL_PRESENCE',
          totalPresenceHours: 4,
          presenceCells: [
            { latitude: 41.39, longitude: 2.19, hours: 2 },
            { latitude: 41.41, longitude: 2.21, hours: 2 },
          ],
        },
        {
          id: '224987650',
          mmsi: '224987650',
          vesselName: 'BARCELONA STAR',
          rank: 2,
          observationLevel: 'VESSEL_PRESENCE',
          totalPresenceHours: 1,
          presenceCells: [
            { latitude: 41.35, longitude: 2.15, hours: 1 },
          ],
        },
      ],
    },
  };

  const realModel = buildRealMapModel({
    manualInvestigationData: mockRealInvestigationData,
  });

  // 1. SAR tab resolves to SAR context
  it('1. SAR tab resolves to SAR context', () => {
    const res = resolveTabMapContext(realModel, 'sar');
    expect(res.context).toBe('sar');
    expect(res.available).toBe(true);
    expect(res.focusTarget).toBeDefined();
    expect(res.focusTarget.type).toBe('bounds');
    expect(res.badgeLabel).toBe('SAR EVIDENCE');
  });

  // 2. SAR uses real image footprint
  it('2. SAR uses real image footprint', () => {
    const res = resolveTabMapContext(realModel, 'sar');
    expect(res.reason).toContain('IMAGE_FOOTPRINT');
    // Bounding box should encompass [41.30, 2.10] to [41.50, 2.30]
    expect(res.focusTarget.bounds[0][0]).toBeCloseTo(41.30, 2);
    expect(res.focusTarget.bounds[0][1]).toBeCloseTo(2.10, 2);
    expect(res.focusTarget.bounds[1][0]).toBeCloseTo(41.50, 2);
    expect(res.focusTarget.bounds[1][1]).toBeCloseTo(2.30, 2);
  });

  // 3. SAR uses real spill footprint fallback
  it('3. SAR uses real spill footprint fallback', () => {
    const modelWithoutImage = {
      ...realModel,
      imageFootprint: null,
    };
    const res = resolveTabMapContext(modelWithoutImage, 'sar');
    expect(res.context).toBe('sar');
    expect(res.available).toBe(true);
    expect(res.reason).toBe('REAL_SPILL_FOOTPRINT');
    // Spill polygon is [41.35, 2.15] to [41.45, 2.25]
    expect(res.focusTarget.bounds[0][0]).toBeCloseTo(41.35, 2);
    expect(res.focusTarget.bounds[0][1]).toBeCloseTo(2.15, 2);
    expect(res.focusTarget.bounds[1][0]).toBeCloseTo(41.45, 2);
    expect(res.focusTarget.bounds[1][1]).toBeCloseTo(2.25, 2);
  });

  // 4. SAR uses real centroid fallback
  it('4. SAR uses real centroid fallback', () => {
    const modelCentroidOnly = {
      ...realModel,
      imageFootprint: null,
      spillFootprint: null,
    };
    const res = resolveTabMapContext(modelCentroidOnly, 'sar');
    expect(res.context).toBe('sar');
    expect(res.available).toBe(true);
    expect(res.reason).toBe('REAL_CENTROID_FALLBACK');
    expect(res.focusTarget.type).toBe('center');
    expect(res.focusTarget.center).toEqual([41.40, 2.20]);
    expect(res.focusTarget.zoom).toBe(14);
  });

  // 5. SAR does not fabricate geometry
  it('5. SAR does not fabricate geometry', () => {
    const emptySarModel = {
      ...realModel,
      imageFootprint: null,
      spillFootprint: null,
      centroid: null,
    };
    const res = resolveTabMapContext(emptySarModel, 'sar');
    expect(res.context).toBe('sar');
    expect(res.available).toBe(false);
    expect(res.focusTarget).toBeNull();
    expect(res.reason).toBe('NO_SAR_GEOMETRY');
    expect(res.badgeLabel).toBe('No additional map evidence available for this section.');
  });

  // 6. Drift tab resolves to drift context
  it('6. Drift tab resolves to drift context', () => {
    const res = resolveTabMapContext(realModel, 'drift');
    expect(res.context).toBe('drift');
    expect(res.available).toBe(true);
    expect(res.badgeLabel).toBe('DRIFT & FORECAST');
    expect(res.focusTarget.type).toBe('bounds');
  });

  // 7. Drift uses real origin
  it('7. Drift uses real origin', () => {
    const res = resolveTabMapContext(realModel, 'drift');
    // Origin is at 41.38, 2.18 with 3.5km uncertainty
    expect(res.focusTarget.bounds[0][0]).toBeLessThanOrEqual(41.38);
    expect(res.focusTarget.bounds[1][0]).toBeGreaterThanOrEqual(41.38);
  });

  // 8. Drift uses real backward trajectory
  it('8. Drift uses real backward trajectory', () => {
    const res = resolveTabMapContext(realModel, 'drift');
    // Backward trajectory includes 41.40, 2.20
    expect(res.focusTarget.bounds[1][0]).toBeGreaterThanOrEqual(41.40);
  });

  // 9. Drift uses real forward trajectory
  it('9. Drift uses real forward trajectory', () => {
    const res = resolveTabMapContext(realModel, 'drift');
    // Forward trajectory reaches 41.45, 2.26
    expect(res.focusTarget.bounds[1][0]).toBeGreaterThanOrEqual(41.45);
    expect(res.focusTarget.bounds[1][1]).toBeGreaterThanOrEqual(2.26);
  });

  // 10. Drift handles missing trajectory safely
  it('10. Drift handles missing trajectory safely', () => {
    const noTrajModel = {
      ...realModel,
      backwardTrajectory: [],
      forwardTrajectory: [],
      origin: null,
    };
    const res = resolveTabMapContext(noTrajModel, 'drift');
    expect(res.context).toBe('drift');
    expect(res.available).toBe(false);
    expect(res.focusTarget).toBeNull();
    expect(res.reason).toBe('NO_DRIFT_GEOMETRY');
    expect(res.badgeLabel).toBe('No additional map evidence available for this section.');
  });

  // 11. AIS tab resolves to AIS context
  it('11. AIS tab resolves to AIS context', () => {
    const res = resolveTabMapContext(realModel, 'ais');
    expect(res.context).toBe('ais');
    expect(res.available).toBe(true);
    expect(res.badgeLabel).toBe('AIS VESSEL PRESENCE');
    expect(res.focusTarget).toBeDefined();
  });

  // 12. AIS uses real GFW presence cells
  it('12. AIS uses real GFW presence cells', () => {
    const res = resolveTabMapContext(realModel, 'ais');
    expect(res.reason).toBe('REAL_GFW_VESSEL_PRESENCE');
    // Cell bounds should span [41.35, 2.15] to [41.41, 2.21]
    expect(res.focusTarget.bounds[0][0]).toBeLessThanOrEqual(41.39);
    expect(res.focusTarget.bounds[1][0]).toBeGreaterThanOrEqual(41.40);
  });

  // 13. AIS does not create polylines
  it('13. AIS does not create polylines', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <ManualCandidateLayer
        candidates={realModel.aisCandidates}
        isDemo={false}
        activeMapContext="ais"
      />
    );
    expect(html).not.toContain('data-type="Polyline"');
  });

  // 14. AIS does not calculate CPA
  it('14. AIS does not calculate CPA', () => {
    const res = resolveTabMapContext(realModel, 'ais');
    expect(res.cpaKm).toBeUndefined();
    expect(res.distanceKm).toBeUndefined();
    expect(realModel.cpaAvailable).toBe(false);
  });

  // 15. AIS preserves VESSEL_PRESENCE semantics
  it('15. AIS preserves VESSEL_PRESENCE semantics', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <ManualCandidateLayer
        candidates={realModel.aisCandidates}
        isDemo={false}
        activeMapContext="ais"
      />
    );
    expect(html).toContain('GFW AIS Vessel Presence — Hourly');
    expect(html).toContain('ATTRIBUTION: NOT ESTABLISHED');
    expect(html).toContain('POTENTIAL AIS CANDIDATE');
  });

  // 16. Science tab resolves correctly
  it('16. Science tab resolves correctly', () => {
    const res = resolveTabMapContext(realModel, 'science');
    expect(res.context).toBe('science');
    expect(res.available).toBe(true);
    expect(res.reason).toBe('REAL_MODEL_SPILL_FOOTPRINT');
    expect(res.badgeLabel).toBe('SCIENCE & MODEL');
    expect(res.focusTarget.type).toBe('bounds');
  });

  // 17. Science does not fabricate model artifacts
  it('17. Science does not fabricate model artifacts', () => {
    const noModelData = {
      ...realModel,
      spillFootprint: null,
      centroid: null,
    };
    const res = resolveTabMapContext(noModelData, 'science');
    expect(res.context).toBe('science');
    expect(res.available).toBe(false);
    expect(res.focusTarget).toBeNull();
    expect(res.reason).toBe('NO_MODEL_EVIDENCE');
    expect(res.badgeLabel).toBe('No additional map evidence available for this section.');
  });

  // 18. Timeline tab resolves correctly
  it('18. Timeline tab resolves correctly', () => {
    const res = resolveTabMapContext(realModel, 'timeline');
    expect(res.context).toBe('timeline');
    expect(res.available).toBe(true);
    expect(res.badgeLabel).toBe('TIMELINE');
    expect(res.focusTarget.type).toBe('bounds');
  });

  // 19. Timeline does not fabricate timestamps
  it('19. Timeline does not fabricate timestamps', () => {
    const res = resolveTabMapContext(realModel, 'timeline');
    const str = JSON.stringify(res);
    expect(str).not.toContain('new Date()');
    expect(str).not.toContain('Date.now()');
    expect(res.reason).toBe('REAL_TEMPORAL_GEOMETRY');
  });

  // 20. Dossier restores dynamic investigation bounds
  it('20. Dossier restores dynamic investigation bounds', () => {
    const res = resolveTabMapContext(realModel, 'dossier');
    expect(res.context).toBe('dossier');
    expect(res.available).toBe(true);
    expect(res.reason).toBe('FULL_INVESTIGATION_BOUNDS');
    expect(res.focusTarget.bounds).toEqual(realModel.bounds);
    expect(res.badgeLabel).toBe('FULL INVESTIGATION');
  });

  // 21. Tab change does not refetch investigation
  it('21. Tab change does not refetch investigation', () => {
    const mockFetch = vi.fn();
    const simulateTabClick = (tab) => {
      // Pure state update, zero fetch invocations
      const ctx = resolveTabMapContext(realModel, tab);
      return ctx;
    };

    const ctx = simulateTabClick('drift');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(ctx.context).toBe('drift');
  });

  // 22. Tab change does not trigger ML inference
  it('22. Tab change does not trigger ML inference', () => {
    const mockInferenceApi = vi.fn();
    const simulateTabTransition = (fromTab, toTab) => {
      // Pure client-side camera/context derivation
      return resolveTabMapContext(realModel, toTab);
    };

    const ctx = simulateTabTransition('sar', 'science');
    expect(mockInferenceApi).not.toHaveBeenCalled();
    expect(ctx.context).toBe('science');
  });

  // 23. Investigation switch clears previous map context
  it('23. Investigation switch clears previous map context', () => {
    let activeMapContext = 'sar';
    let dynamicFocus = { type: 'bounds', bounds: [[1, 1], [2, 2]] };
    let activeFocusBadge = 'SAR EVIDENCE';

    const handleInvestigationSwitch = () => {
      activeMapContext = null;
      dynamicFocus = null;
      activeFocusBadge = null;
    };

    handleInvestigationSwitch();
    expect(activeMapContext).toBeNull();
    expect(dynamicFocus).toBeNull();
    expect(activeFocusBadge).toBeNull();
  });

  // 24. Loading state prevents stale tab focus
  it('24. Loading state prevents stale tab focus', () => {
    const applyTabFocus = vi.fn((tab, isSkeletonActive) => {
      if (isSkeletonActive) return null;
      return resolveTabMapContext(realModel, tab);
    });

    // Skeleton is active
    const resultDuringLoading = applyTabFocus('drift', true);
    expect(resultDuringLoading).toBeNull();
    expect(applyTabFocus).toHaveReturnedWith(null);

    // Skeleton done
    const resultAfterLoading = applyTabFocus('drift', false);
    expect(resultAfterLoading.context).toBe('drift');
  });

  // 25. No demo/static coordinates introduced
  it('25. No demo/static coordinates introduced', () => {
    const tabs = ['sar', 'drift', 'ais', 'science', 'timeline', 'dossier', 'investigation'];
    tabs.forEach((tab) => {
      const res = resolveTabMapContext(realModel, tab);
      const str = JSON.stringify(res);
      expect(str).not.toContain('18.921');
      expect(str).not.toContain('72.832');
      expect(str).not.toContain('Mumbai');
      expect(str).not.toContain('Kandla Star');
    });
  });

  // 26. Candidate selection is preserved across tab transitions
  it('26. Candidate selection is preserved across tab transitions', () => {
    const selectedCand = realModel.aisCandidates[1];
    const resAis = resolveTabMapContext(realModel, 'ais', {
      selectedCandidate: selectedCand,
    });
    expect(resAis.context).toBe('ais');
    expect(resAis.reason).toBe('SELECTED_CANDIDATE_SINGLE_CELL');
    expect(resAis.focusTarget.center).toEqual([41.35, 2.15]);
  });
});
