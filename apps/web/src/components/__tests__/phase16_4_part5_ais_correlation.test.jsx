/**
 * Phase 16.4 Part 5 — Frontend AIS Correlation Tests
 *
 * Tests 1–17:
 *  1. ManualCandidateLayer renders valid candidates
 *  2. Historical AIS track polyline is rendered for each candidate
 *  3. Candidate vessel marker (CircleMarker) is rendered at closest approach
 *  4. CPA line connects closest approach to estimated origin
 *  5. Candidate status is strictly "POTENTIAL AIS CANDIDATE"
 *  6. Final vessel attribution strictly displays "NOT ESTABLISHED"
 *  7. DEMO AIS shows prominent "DEMONSTRATION AIS DATA" warning
 *  8. REAL AIS does not show DEMO warning
 *  9. Empty candidates array renders null (no phantom markers)
 * 10. Null / undefined candidates render null
 * 11. Corridor entry correctly reflects closestApproachKm <= originUncertaintyKm
 * 12. normalizeCanonicalInvestigation preserves aisCorrelation block intact
 * 13. validateCanonicalInvestigation succeeds for valid POTENTIAL_CANDIDATE
 * 14. validateCanonicalInvestigation rejects forbidden polluter fields
 * 15. Switching jobs / nulling candidates unmounts candidate layer cleanly
 * 16. Sidebar evidence metrics display closest approach, corridor, and score
 * 17. Origin, drift, and candidate layers coexist without collision
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

import ManualCandidateLayer from '../map/ManualCandidateLayer';
import ManualOriginLayer from '../map/ManualOriginLayer';
import ManualDriftLayer from '../map/ManualDriftLayer';
import {
  normalizeCanonicalInvestigation,
  validateCanonicalInvestigation,
} from '../../utils/canonicalInvestigation';

// ── Mock candidate fixtures ────────────────────────────────────────────────
const MOCK_ORIGIN = {
  status: 'ESTIMATED',
  estimatedPoint: { latitude: 19.22, longitude: 72.50, provenance: 'MODEL_DERIVED' },
  uncertainty: { radiusKm: 2.5, method: 'DIFFUSION_MODEL' },
  originTimestamp: '2026-03-09T20:00:00.000Z',
  timestampSource: 'RASTER_ACQUISITION_TIMESTAMP',
  provenance: 'MODEL_DERIVED',
};

const MOCK_CANDIDATE_1 = {
  vesselId: {
    mmsi: '999001001',
    imo: 'IMO9123456',
    name: 'DEMO TANKER ALPHA',
    callsign: 'ABCD1',
    flag: 'Panama',
    vesselType: 'Crude Oil Tanker',
    lengthM: 245,
  },
  status: 'POTENTIAL_CANDIDATE',
  rank: 1,
  correlation: {
    closestApproachKm: 1.45,
    closestApproachTimestamp: '2026-03-09T20:15:00.000Z',
    enteredOriginUncertaintyCorridor: true,
    temporalOverlap: true,
    trajectoryConsistency: 'SUPPORTED',
    score: 0.885,
    metrics: {
      proximityScore: 0.95,
      temporalScore: 0.90,
      trajectoryScore: 0.85,
      anomalyScore: 0.70,
    },
  },
  aisEvidence: {
    positionCount: 3,
    firstSeen: '2026-03-09T19:00:00.000Z',
    lastSeen: '2026-03-09T21:00:00.000Z',
    source: 'DEMO',
    provenance: 'DEMO',
    track: [
      { latitude: 19.24, longitude: 72.49, timestamp: '2026-03-09T19:30:00.000Z' },
      { latitude: 19.225, longitude: 72.504, timestamp: '2026-03-09T20:15:00.000Z' },
      { latitude: 19.21, longitude: 72.513, timestamp: '2026-03-09T20:30:00.000Z' },
    ],
  },
  attribution: {
    status: 'NOT_ESTABLISHED',
  },
};

const MOCK_CANDIDATE_2 = {
  vesselId: {
    mmsi: '999002002',
    name: 'DEMO CARGO BETA',
    vesselType: 'General Cargo',
  },
  status: 'POTENTIAL_CANDIDATE',
  rank: 2,
  correlation: {
    closestApproachKm: 12.8,
    closestApproachTimestamp: '2026-03-09T18:00:00.000Z',
    enteredOriginUncertaintyCorridor: false, // > 2.5 km uncertainty
    trajectoryConsistency: 'INCONCLUSIVE',
    score: 0.52,
    metrics: {
      proximityScore: 0.50,
      temporalScore: 0.60,
      trajectoryScore: 0.45,
      anomalyScore: 0.50,
    },
  },
  aisEvidence: {
    positionCount: 2,
    track: [
      { latitude: 19.10, longitude: 72.40, timestamp: '2026-03-09T17:30:00.000Z' },
      { latitude: 19.05, longitude: 72.35, timestamp: '2026-03-09T18:00:00.000Z' },
    ],
  },
  attribution: {
    status: 'NOT_ESTABLISHED',
  },
};

describe('Phase 16.4 Part 5 — Frontend AIS Correlation + Potential Vessel Candidates', () => {
  it('1. ManualCandidateLayer renders valid candidates', () => {
    const el = ManualCandidateLayer({
      candidates: [MOCK_CANDIDATE_1, MOCK_CANDIDATE_2],
      origin: MOCK_ORIGIN,
      isDemo: true,
      searchRadiusKm: 50,
    });

    expect(el).not.toBeNull();
    expect(React.isValidElement(el)).toBe(true);
  });

  it('2. Historical AIS track polyline is rendered for each candidate', () => {
    const el = ManualCandidateLayer({
      candidates: [MOCK_CANDIDATE_1],
      origin: MOCK_ORIGIN,
      isDemo: true,
    });

    const json = JSON.stringify(el);
    // Polyline positions and color
    expect(json).toContain('#A855F7');
    expect(json).toContain('19.24');
    expect(json).toContain('72.49');
  });

  it('3. Candidate vessel marker (CircleMarker) is rendered at closest approach', () => {
    const el = ManualCandidateLayer({
      candidates: [MOCK_CANDIDATE_1],
      origin: MOCK_ORIGIN,
      isDemo: true,
    });

    const json = JSON.stringify(el);
    // Center coords matching CPA point [19.225, 72.504]
    expect(json).toContain('19.225');
    expect(json).toContain('72.504');
  });

  it('4. CPA line connects closest approach to estimated origin', () => {
    const el = ManualCandidateLayer({
      candidates: [MOCK_CANDIDATE_1],
      origin: MOCK_ORIGIN,
      isDemo: true,
    });

    const json = JSON.stringify(el);
    // Origin lat 19.22 and lng 72.50 in CPA connection line
    expect(json).toContain('19.22');
    expect(json).toContain('72.5');
  });

  it('5. Candidate status is strictly "POTENTIAL AIS CANDIDATE"', () => {
    const el = ManualCandidateLayer({
      candidates: [MOCK_CANDIDATE_1],
      origin: MOCK_ORIGIN,
      isDemo: true,
    });

    const json = JSON.stringify(el);
    expect(json).toContain('POTENTIAL AIS CANDIDATE');
    expect(json).not.toContain('CONFIRMED POLLUTER');
    expect(json).not.toContain('RESPONSIBLE VESSEL');
  });

  it('6. Final vessel attribution strictly displays "NOT ESTABLISHED"', () => {
    const el = ManualCandidateLayer({
      candidates: [MOCK_CANDIDATE_1],
      origin: MOCK_ORIGIN,
      isDemo: true,
    });

    const json = JSON.stringify(el);
    expect(json).toContain('ATTRIBUTION: NOT ESTABLISHED');
    expect(json).toContain('does NOT establish responsibility');
  });

  it('7. DEMO AIS shows prominent "DEMONSTRATION AIS DATA" warning', () => {
    const el = ManualCandidateLayer({
      candidates: [MOCK_CANDIDATE_1],
      origin: MOCK_ORIGIN,
      isDemo: true,
    });

    const json = JSON.stringify(el);
    expect(json).toContain('DEMONSTRATION AIS DATA');
    expect(json).toContain('NOT REAL-WORLD AIS EVIDENCE');
  });

  it('8. REAL AIS does not show DEMO warning', () => {
    const el = ManualCandidateLayer({
      candidates: [MOCK_CANDIDATE_1],
      origin: MOCK_ORIGIN,
      isDemo: false, // REAL AIS
    });

    const json = JSON.stringify(el);
    expect(json).not.toContain('DEMONSTRATION AIS DATA');
  });

  it('9. Empty candidates array renders null (no phantom markers)', () => {
    const el = ManualCandidateLayer({
      candidates: [],
      origin: MOCK_ORIGIN,
      isDemo: true,
    });

    expect(el).toBeNull();
  });

  it('10. Null / undefined candidates render null', () => {
    const el = ManualCandidateLayer({
      candidates: null,
      origin: MOCK_ORIGIN,
      isDemo: true,
    });

    expect(el).toBeNull();
  });

  it('11. Corridor entry correctly reflects closestApproachKm <= originUncertaintyKm', () => {
    // Candidate 1 (1.45 km <= 2.5 km) inside corridor
    const el1 = ManualCandidateLayer({
      candidates: [MOCK_CANDIDATE_1],
      origin: MOCK_ORIGIN,
      isDemo: true,
    });
    expect(JSON.stringify(el1)).toContain('Inside Corridor');

    // Candidate 2 (12.8 km > 2.5 km) outside corridor
    const el2 = ManualCandidateLayer({
      candidates: [MOCK_CANDIDATE_2],
      origin: MOCK_ORIGIN,
      isDemo: true,
    });
    expect(JSON.stringify(el2)).toContain('Outside Corridor');
  });

  it('12. normalizeCanonicalInvestigation preserves aisCorrelation block intact', () => {
    const rawPayload = {
      jobId: 'job-ais-frontend-test',
      status: 'COMPLETED',
      input: {
        filename: 'sar.tif',
        inputFormat: 'TIFF',
        channelCount: 2,
        modality: 'SAR_DUAL_POL',
        sourceType: 'SENTINEL1_DUAL_POL',
        bandStructure: 'DUAL_BAND_SAR',
        polarizationStatus: 'ESTABLISHED',
      },
      model: {
        modelId: 'unet-dual-pol-sar-v09d-residual-loss',
        checkpointSha256: '1e25e1dfcbe109268f6a394c8e718b5b3fecfc62507663dece55452d377b21e8',
        preprocessingVersion: 'sentinel1_sigma0_db_v1',
      },
      detection: { oilSpillDetected: true, confidence: 0.94 },
      geospatial: { available: true, crs: 'EPSG:4326', bounds: [72, 18, 73, 19], centroid: { latitude: 18.5, longitude: 72.5 } },
      fingerprint: 'fp-12345',
      origin: MOCK_ORIGIN,
      aisCorrelation: {
        status: 'CANDIDATES_FOUND',
        source: 'DEMO',
        isDemo: true,
        candidates: [MOCK_CANDIDATE_1],
      },
    };

    const normalized = normalizeCanonicalInvestigation(rawPayload);
    expect(normalized.aisCorrelation).toBeDefined();
    expect(normalized.aisCorrelation.status).toBe('CANDIDATES_FOUND');
    expect(normalized.aisCorrelation.candidates.length).toBe(1);
  });

  it('13. validateCanonicalInvestigation succeeds for valid POTENTIAL_CANDIDATE', () => {
    const validCanonical = {
      jobId: 'job-val-ok',
      status: 'COMPLETED',
      input: {
        filename: 'sar.tif',
        inputFormat: 'TIFF',
        channelCount: 2,
        modality: 'SAR_DUAL_POL',
        sourceType: 'SENTINEL1_DUAL_POL',
        bandStructure: 'DUAL_BAND_SAR',
        polarizationStatus: 'ESTABLISHED',
      },
      model: {
        modelId: 'unet-sar',
        checkpointSha256: 'sha-xxx',
        preprocessingVersion: 'v1',
      },
      detection: { oilSpillDetected: true, confidence: 0.94 },
      artifacts: { original: '/orig', mask: '/mask', annotated: '/ann' },
      geospatial: { available: true, crs: 'EPSG:4326', bounds: [72, 18, 73, 19], centroid: { latitude: 18.5, longitude: 72.5 } },
      provenance: {
        inputGeolocation: 'REAL',
        detection: 'MODEL_DERIVED',
        footprint: 'MODEL_DERIVED',
        oilType: 'NOT_ESTABLISHED',
        vesselAttribution: 'NOT_ESTABLISHED',
      },
      fingerprint: 'fp-val-ok',
      aisCorrelation: {
        status: 'CANDIDATES_FOUND',
        source: 'DEMO',
        isDemo: true,
        candidates: [MOCK_CANDIDATE_1],
      },
    };

    const validation = validateCanonicalInvestigation(validCanonical);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  it('14. validateCanonicalInvestigation rejects forbidden polluter fields', () => {
    const invalidCanonical = {
      jobId: 'job-val-forbidden',
      status: 'COMPLETED',
      input: {
        filename: 'sar.tif',
        inputFormat: 'TIFF',
        channelCount: 2,
        modality: 'SAR_DUAL_POL',
        sourceType: 'SENTINEL1_DUAL_POL',
        bandStructure: 'DUAL_BAND_SAR',
        polarizationStatus: 'ESTABLISHED',
      },
      model: {
        modelId: 'unet-sar',
        checkpointSha256: 'sha-xxx',
        preprocessingVersion: 'v1',
      },
      detection: { oilSpillDetected: true, confidence: 0.94 },
      artifacts: { original: '/orig', mask: '/mask', annotated: '/ann' },
      geospatial: { available: true, crs: 'EPSG:4326', bounds: [72, 18, 73, 19], centroid: { latitude: 18.5, longitude: 72.5 } },
      provenance: {
        inputGeolocation: 'REAL',
        detection: 'MODEL_DERIVED',
        footprint: 'MODEL_DERIVED',
        oilType: 'NOT_ESTABLISHED',
        vesselAttribution: 'NOT_ESTABLISHED',
      },
      fingerprint: 'fp-forbidden',
      responsibleVessel: 'DEMO TANKER ALPHA', // FORBIDDEN!
      aisCorrelation: {
        status: 'CANDIDATES_FOUND',
        candidates: [
          {
            ...MOCK_CANDIDATE_1,
            confirmedPolluter: true, // FORBIDDEN!
          },
        ],
      },
    };

    const validation = validateCanonicalInvestigation(invalidCanonical);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('Forbidden polluter attribution field'))).toBe(true);
  });

  it('15. Switching jobs / nulling candidates unmounts candidate layer cleanly', () => {
    // Initial mount
    const mounted = ManualCandidateLayer({
      candidates: [MOCK_CANDIDATE_1],
      origin: MOCK_ORIGIN,
      isDemo: true,
    });
    expect(mounted).not.toBeNull();

    // Switched to job without AIS correlation
    const unmounted = ManualCandidateLayer({
      candidates: [],
      origin: null,
      isDemo: false,
    });
    expect(unmounted).toBeNull();
  });

  it('16. Sidebar evidence metrics display closest approach, corridor, and score', () => {
    const el = ManualCandidateLayer({
      candidates: [MOCK_CANDIDATE_1],
      origin: MOCK_ORIGIN,
      isDemo: true,
    });

    const json = JSON.stringify(el);
    expect(json).toContain('CLOSEST DISTANCE');
    expect(json).toContain('1.45');
    expect(json).toContain('km');
    expect(json).toContain('UNCERTAINTY CORRIDOR');
    expect(json).toContain('EVIDENCE METRIC');
  });

  it('17. Origin, drift, and candidate layers coexist without collision', () => {
    const originEl = ManualOriginLayer({ origin: MOCK_ORIGIN });
    const driftEl = ManualDriftLayer({
      drift: {
        status: 'ESTIMATED',
        backward: {
          status: 'ESTIMATED',
          trajectory: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [[72.50, 19.22], [72.55, 19.25]],
            },
          },
        },
        environmentalData: { source: 'DEMO', isDemo: true },
        uncertainty: { radiusKm: 2.5 },
      },
    });
    const candidateEl = ManualCandidateLayer({
      candidates: [MOCK_CANDIDATE_1],
      origin: MOCK_ORIGIN,
      isDemo: true,
    });

    expect(originEl).not.toBeNull();
    expect(driftEl).not.toBeNull();
    expect(candidateEl).not.toBeNull();
  });
});
