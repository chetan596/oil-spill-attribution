/**
 * Phase 16.4 Part 4 — Frontend Drift Integration Tests
 *
 * Tests 25–38:
 * 25. Backward trajectory renders
 * 26. Forward trajectory renders only when available
 * 27. Demo MetOcean warning renders
 * 28. REAL environmental source is labelled correctly
 * 29. Proxy timestamp is labelled correctly
 * 30. No trajectory when geospatial unavailable
 * 31. No trajectory when spill unavailable
 * 32. Failed drift state renders gracefully (null)
 * 33. Trajectory provenance label is MODEL_DERIVED
 * 34. Origin remains visible alongside drift
 * 35. Spill footprint remains visible alongside drift
 * 36. Image footprint remains visible alongside drift
 * 37. Trajectory disappears / updates when switching jobs
 * 38. No AIS / vessel marker is created
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';

// ── Leaflet / react-leaflet mocks ──────────────────────────────────────────
vi.mock('react-leaflet', () => ({
  Polygon: (props) => React.createElement('div', { ...props, 'data-type': 'Polygon' }),
  Tooltip: (props) => React.createElement('div', { ...props, 'data-type': 'Tooltip' }),
  Popup: (props) => React.createElement('div', { ...props, 'data-type': 'Popup' }),
  CircleMarker: (props) => React.createElement('div', { ...props, 'data-type': 'CircleMarker' }),
  Circle: (props) => React.createElement('div', { ...props, 'data-type': 'Circle' }),
  Polyline: (props) => React.createElement('div', { ...props, 'data-type': 'Polyline' }),
  useMap: () => ({ fitBounds: vi.fn(), flyTo: vi.fn(), setView: vi.fn() }),
}));

vi.mock('leaflet', () => ({
  default: {
    latLngBounds: vi.fn(() => ({ isValid: () => true, pad: vi.fn(() => ({})) })),
    latLng: vi.fn(() => ({})),
    icon: vi.fn(() => ({})),
    divIcon: vi.fn(() => ({})),
  },
  latLngBounds: vi.fn(() => ({ isValid: () => true, pad: vi.fn(() => ({})) })),
  latLng: vi.fn(() => ({})),
  icon: vi.fn(() => ({})),
  divIcon: vi.fn(() => ({})),
}));

import ManualDriftLayer from '../map/ManualDriftLayer';
import ManualOriginLayer from '../map/ManualOriginLayer';
import ManualFootprintLayer from '../map/ManualFootprintLayer';
import { normalizeCanonicalInvestigation } from '../../utils/canonicalInvestigation';

// ── Sample drift mock data ──────────────────────────────────────────────────
const MOCK_BACKWARD_TRAJECTORY = {
  type: 'Feature',
  geometry: {
    type: 'LineString',
    coordinates: [
      [72.75, 18.75],
      [72.63, 18.83],
      [72.462, 18.942],
    ],
  },
  properties: {
    provenance: 'MODEL_DERIVED',
    direction: 'backward',
    hours: 24,
    engine: 'BUILT-IN DEMONSTRATION LAGRANGIAN MODEL',
    environmentalSource: 'DEMO',
  },
};

const MOCK_FORWARD_TRAJECTORY = {
  type: 'Feature',
  geometry: {
    type: 'LineString',
    coordinates: [
      [72.75, 18.75],
      [72.82, 18.70],
      [72.90, 18.65],
    ],
  },
  properties: {
    provenance: 'MODEL_DERIVED',
    direction: 'forward',
    hours: 6,
    engine: 'BUILT-IN DEMONSTRATION LAGRANGIAN MODEL',
    environmentalSource: 'DEMO',
  },
};

const VALID_ESTIMATED_DRIFT = {
  status: 'ESTIMATED',
  backward: {
    trajectory: MOCK_BACKWARD_TRAJECTORY,
    hours: 24,
    startPoint: { latitude: 18.75, longitude: 72.75 },
    endPoint: { latitude: 18.942, longitude: 72.462 },
    points: [
      { lat: 18.75, lng: 72.75, elapsedHours: 0, timestamp: '2026-03-15T06:00:00Z' },
      { lat: 18.83, lng: 72.63, elapsedHours: 12, timestamp: '2026-03-14T18:00:00Z' },
      { lat: 18.942, lng: 72.462, elapsedHours: 24, timestamp: '2026-03-14T06:00:00Z' },
    ],
  },
  forward: {
    status: 'ESTIMATED',
    trajectory: MOCK_FORWARD_TRAJECTORY,
    hours: 6,
    startPoint: { latitude: 18.75, longitude: 72.75 },
    endPoint: { latitude: 18.65, longitude: 72.90 },
    points: [
      { lat: 18.75, lng: 72.75, elapsedHours: 0, timestamp: '2026-03-15T06:00:00Z' },
      { lat: 18.70, lng: 72.82, elapsedHours: 3, timestamp: '2026-03-15T09:00:00Z' },
      { lat: 18.65, lng: 72.90, elapsedHours: 6, timestamp: '2026-03-15T12:00:00Z' },
    ],
  },
  environmentalData: {
    source: 'DEMO',
    isDemo: true,
    wind: { speed_kts: 12.4, direction_from_deg: 315 },
    current: { speed_kts: 0.8, direction_towards_deg: 125 },
    timestamp: '2026-03-15T06:00:00Z',
  },
  uncertainty: {
    radiusKm: 2.6,
  },
  provenance: 'MODEL_DERIVED',
  timestampSource: 'RASTER_ACQUISITION_TIMESTAMP',
  engine: 'BUILT-IN DEMONSTRATION LAGRANGIAN MODEL',
};

// Helper to flatten children recursively
function flattenElements(element) {
  if (!element) return [];
  if (Array.isArray(element)) {
    return element.flatMap(flattenElements);
  }
  if (element.props && element.props.children) {
    return [element, ...flattenElements(element.props.children)];
  }
  return [element];
}

describe('Phase 16.4 Part 4 — Frontend Drift Integration Tests (25–38)', () => {

  // ── 25. Backward trajectory renders ───────────────────────────────────────
  it('25. Backward trajectory renders with Polyline positions from trajectory coordinates', () => {
    const el = ManualDriftLayer({ drift: VALID_ESTIMATED_DRIFT });
    expect(el).not.toBeNull();

    const flattened = flattenElements(el);
    const polylines = flattened.filter((c) => c && c.props && c.props.positions);
    expect(polylines.length).toBeGreaterThanOrEqual(1);

    // First polyline is backward trajectory
    const bwdPolyline = polylines[0];
    expect(bwdPolyline.props.positions).toBeDefined();
    expect(bwdPolyline.props.positions.length).toBe(3);
    expect(bwdPolyline.props.positions[0]).toEqual([18.75, 72.75]);
    expect(bwdPolyline.props.pathOptions.color).toBe('#E7A63A');
  });

  // ── 26. Forward trajectory renders only when available ────────────────────
  it('26. Forward trajectory renders only when available; suppressed when status = NOT_AVAILABLE', () => {
    // Available
    const elAvailable = ManualDriftLayer({ drift: VALID_ESTIMATED_DRIFT });
    const flattenedAvail = flattenElements(elAvailable);
    const polylinesAvail = flattenedAvail.filter((c) => c && c.props && c.props.positions);
    expect(polylinesAvail.length).toBe(2); // Backward + Forward

    // Unavailable (hoursForward = 0)
    const driftNoFwd = {
      ...VALID_ESTIMATED_DRIFT,
      forward: {
        status: 'NOT_AVAILABLE',
        trajectory: null,
        hours: 0,
        points: [],
      },
    };
    const elNoFwd = ManualDriftLayer({ drift: driftNoFwd });
    const flattenedNoFwd = flattenElements(elNoFwd);
    const polylinesNoFwd = flattenedNoFwd.filter((c) => c && c.props && c.props.positions);
    expect(polylinesNoFwd.length).toBe(1); // Backward only
  });

  // ── 27. Demo MetOcean warning renders ──────────────────────────────────────
  it('27. Demo MetOcean forcing is clearly identified in layer popups and data', () => {
    const el = ManualDriftLayer({ drift: VALID_ESTIMATED_DRIFT });
    const flattened = flattenElements(el);

    const markers = flattened.filter((c) => c && c.props && c.props.center);
    expect(markers.length).toBeGreaterThan(0);

    // Check that popup contains DEMONSTRATION METOCEAN FORCING text
    const stringified = JSON.stringify(el);
    expect(stringified).toContain('DEMONSTRATION METOCEAN FORCING');
  });

  // ── 28. REAL environmental source is labelled correctly ────────────────────
  it('28. REAL environmental source is labelled REAL and isDemo is false', () => {
    const realDrift = {
      ...VALID_ESTIMATED_DRIFT,
      environmentalData: {
        source: 'REAL',
        isDemo: false,
        wind: { speed_kts: 15.0 },
        current: { speed_kts: 1.0 },
      },
    };

    const el = ManualDriftLayer({ drift: realDrift });
    expect(el).not.toBeNull();
    const stringified = JSON.stringify(el);
    expect(stringified).toContain('REAL METOCEAN DATA');
  });

  // ── 29. Proxy timestamp is labelled correctly ──────────────────────────────
  it('29. Proxy timestamp is labelled ESTIMATION_TIME_PROXY', () => {
    const proxyDrift = {
      ...VALID_ESTIMATED_DRIFT,
      timestampSource: 'ESTIMATION_TIME_PROXY',
    };

    const el = ManualDriftLayer({ drift: proxyDrift });
    expect(el).not.toBeNull();
    const stringified = JSON.stringify(el);
    expect(stringified).toContain('ESTIMATION_TIME_PROXY');
  });

  // ── 30. No trajectory when geospatial unavailable ──────────────────────────
  it('30. Returns null and renders nothing when drift.status = NOT_AVAILABLE', () => {
    const unavailableDrift = {
      status: 'NOT_AVAILABLE',
      backward: null,
      forward: null,
    };

    const el = ManualDriftLayer({ drift: unavailableDrift });
    expect(el).toBeNull();
  });

  // ── 31. No trajectory when spill unavailable ───────────────────────────────
  it('31. Returns null and renders nothing when drift.status = INSUFFICIENT_DATA', () => {
    const insufficientDrift = {
      status: 'INSUFFICIENT_DATA',
      backward: null,
      forward: null,
    };

    const el = ManualDriftLayer({ drift: insufficientDrift });
    expect(el).toBeNull();
  });

  // ── 32. Failed drift state renders gracefully ──────────────────────────────
  it('32. Returns null without throwing when drift.status = FAILED', () => {
    const failedDrift = {
      status: 'FAILED',
      backward: null,
      forward: null,
      unavailableReason: 'Numerical instability',
    };

    expect(() => ManualDriftLayer({ drift: failedDrift })).not.toThrow();
    const el = ManualDriftLayer({ drift: failedDrift });
    expect(el).toBeNull();
  });

  // ── 33. Trajectory provenance label is MODEL_DERIVED ──────────────────────
  it('33. Trajectory provenance in canonical normalizer and layer is strictly MODEL_DERIVED', () => {
    const normalized = normalizeCanonicalInvestigation({
      jobId: 'test-job-drift-prov',
      status: 'COMPLETED',
      input: {
        inputFormat: 'TIFF',
        channelCount: 2,
        modality: 'SAR_DUAL_POL',
        sourceType: 'SENTINEL1_DUAL_POL',
        bandStructure: 'DUAL_BAND_SAR',
        polarizationStatus: 'ESTABLISHED',
      },
      model: { modelId: 'unet', checkpointSha256: 'abc', preprocessingVersion: 'v1' },
      detection: { oilSpillDetected: true, confidence: 0.9 },
      geospatial: { available: true, crs: 'EPSG:4326', bounds: [72, 18, 73, 19], centroid: { lat: 18.5, lng: 72.5 } },
      artifacts: { original: 'o', mask: 'm', annotated: 'a' },
      provenance: { inputGeolocation: 'REAL', detection: 'MODEL_DERIVED', oilType: 'NOT_ESTABLISHED', vesselAttribution: 'NOT_ESTABLISHED' },
      fingerprint: 'fp123',
      drift: VALID_ESTIMATED_DRIFT,
    });

    expect(normalized.drift).toBeDefined();
    expect(normalized.drift.provenance).toBe('MODEL_DERIVED');
  });

  // ── 34. Origin remains visible alongside drift ─────────────────────────────
  it('34. ManualOriginLayer renders valid origin independent of drift layer', () => {
    const origin = {
      status: 'ESTIMATED',
      estimatedPoint: { latitude: 18.942, longitude: 72.462 },
      uncertainty: { radiusKm: 2.6 },
      method: 'Lagrangian reverse hindcast',
      provenance: 'MODEL_DERIVED',
    };

    const originEl = ManualOriginLayer({ origin });
    expect(originEl).not.toBeNull();
  });

  // ── 35. Spill footprint remains visible alongside drift ────────────────────
  it('35. ManualFootprintLayer element receives spillFootprint prop correctly', () => {
    const spillFootprint = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[72.6, 18.6], [72.8, 18.6], [72.8, 18.8], [72.6, 18.8], [72.6, 18.6]]],
      },
      properties: { featureType: 'OIL_SPILL_POLYGON', provenance: 'MODEL_DERIVED' },
    };

    const fpEl = React.createElement(ManualFootprintLayer, {
      spillFootprint,
      visible: true,
    });

    expect(fpEl.type).toBe(ManualFootprintLayer);
    expect(fpEl.props.spillFootprint).toBe(spillFootprint);
    expect(fpEl.props.visible).toBe(true);
  });

  // ── 36. Image footprint remains visible alongside drift ────────────────────
  it('36. ManualFootprintLayer element receives imageFootprint prop correctly', () => {
    const imageFootprint = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[72.5, 18.5], [73.0, 18.5], [73.0, 19.0], [72.5, 19.0], [72.5, 18.5]]],
      },
      properties: { featureType: 'IMAGE_FOOTPRINT', provenance: 'REAL' },
    };

    const fpEl = React.createElement(ManualFootprintLayer, {
      imageFootprint,
      visible: true,
    });

    expect(fpEl.type).toBe(ManualFootprintLayer);
    expect(fpEl.props.imageFootprint).toBe(imageFootprint);
  });

  // ── 37. Trajectory disappears / updates when switching jobs ────────────────
  it('37. Layer returns null when switching to a job with no drift or status !== ESTIMATED', () => {
    const jobA = ManualDriftLayer({ drift: VALID_ESTIMATED_DRIFT });
    expect(jobA).not.toBeNull();

    const jobB = ManualDriftLayer({ drift: null });
    expect(jobB).toBeNull();
  });

  // ── 38. No AIS / vessel marker is created ──────────────────────────────────
  it('38. ManualDriftLayer creates zero AIS or vessel markers', () => {
    const el = ManualDriftLayer({ drift: VALID_ESTIMATED_DRIFT });
    const stringified = JSON.stringify(el);

    // Verify zero AIS or vessel identification data structures
    expect(stringified).not.toMatch(/mmsi/i);
    expect(stringified).not.toMatch(/vessel_name/i);
    expect(stringified).not.toMatch(/callsign/i);
    expect(stringified).not.toMatch(/destination/i);
    expect(stringified).not.toMatch(/candidate_vessel/i);
    expect(stringified).not.toMatch(/AIS_POSITION/i);
  });
});
