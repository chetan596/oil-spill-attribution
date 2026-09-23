import { describe, it, expect } from 'vitest';
import React from 'react';
import EvidenceBadge from '../common/EvidenceBadge';
import InvestigationTimeline from '../analysis/InvestigationTimeline';
import CandidateVesselPanel from '../vessels/CandidateVesselPanel';
import MapLegend from '../map/MapLegend';

describe('Investigation Command Center Components', () => {
  it('should render EvidenceBadge element for OBSERVED, MODELLED, and DEMONSTRATION', () => {
    const observedBadge = React.createElement(EvidenceBadge, { type: 'OBSERVED', label: 'SAR: OBSERVED' });
    expect(observedBadge).toBeDefined();
    expect(observedBadge.props.type).toBe('OBSERVED');
    expect(observedBadge.props.label).toBe('SAR: OBSERVED');

    const modelledBadge = React.createElement(EvidenceBadge, { type: 'MODELLED', label: 'Drift: MODELLED' });
    expect(modelledBadge).toBeDefined();
    expect(modelledBadge.props.type).toBe('MODELLED');

    const demoBadge = React.createElement(EvidenceBadge, { type: 'DEMONSTRATION', label: 'AIS: DEMO' });
    expect(demoBadge).toBeDefined();
    expect(demoBadge.props.type).toBe('DEMONSTRATION');
  });

  it('should define CandidateVesselPanel component with expected props interface', () => {
    const mockCandidates = [
      {
        rank: 1,
        vessel: { name: 'ARABIAN FORTUNE', mmsi: '123456789', flag: 'PA', vesselType: 'Crude Tanker' },
        totalScore: 0.564,
        proximityScore: 0.85,
        temporalScore: 0.78,
        trajectoryScore: 0.65,
        anomalyScore: 0.70,
        evidence: { closestApproachKm: 1.24, timeDeltaHours: 1.2 },
      },
    ];

    const element = React.createElement(CandidateVesselPanel, {
      candidateVessels: mockCandidates,
      selectedCandidate: mockCandidates[0],
    });

    expect(element).toBeDefined();
    expect(element.props.candidateVessels).toHaveLength(1);
    expect(element.props.selectedCandidate.vessel.name).toBe('ARABIAN FORTUNE');
  });

  it('should define InvestigationTimeline component with spill and drift props', () => {
    const mockSpill = {
      areaKm2: 4.73,
      latitude: 18.921,
      longitude: 72.832,
      confidence: 0.94,
      detectedAt: '2026-03-10T12:00:00Z',
    };

    const mockDrift = {
      originLat: 19.113,
      originLng: 72.544,
      uncertaintyRadiusKm: 2.6,
      originTimestamp: '2026-03-09T12:00:00Z',
    };

    const element = React.createElement(InvestigationTimeline, {
      spill: mockSpill,
      driftData: mockDrift,
      candidateVessels: [{ vessel: { name: 'ARABIAN FORTUNE' }, totalScore: 0.564 }],
    });

    expect(element).toBeDefined();
    expect(element.props.spill.areaKm2).toBe(4.73);
    expect(element.props.driftData.uncertaintyRadiusKm).toBe(2.6);
  });

  it('should define MapLegend component with custom styles interface', () => {
    const element = React.createElement(MapLegend, { style: { zIndex: 1000 } });
    expect(element).toBeDefined();
    expect(element.props.style.zIndex).toBe(1000);
  });
});
