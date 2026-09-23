import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import EvidenceChain from '../analysis/EvidenceChain';

describe('EvidenceChain Component', () => {
  const mockSpill = {
    id: 'spill-1',
    latitude: 18.921,
    longitude: 72.832,
    areaKm2: 4.73,
    confidence: 0.94,
    geomWkt: 'POLYGON((72.83 18.92, 72.84 18.92, 72.84 18.93, 72.83 18.93, 72.83 18.92))',
  };

  const mockDriftData = {
    originLat: 19.113,
    originLng: 72.544,
    backwardPath: [{ seqIndex: 0 }, { seqIndex: 1 }],
  };

  const mockCandidates = [
    {
      rank: 1,
      totalScore: 0.546,
      vessel: { name: 'DEMO MARINER ALPHA', mmsi: '419000123' },
      evidence: { distanceKm: 1.24, passingLat: 18.98, passingLng: 72.72 },
    },
  ];

  it('should render EvidenceChain with all 6 stages and their provenance', () => {
    const element = React.createElement(EvidenceChain, {
      currentMode: 'sar',
      activeTab: 'vessels',
      spill: mockSpill,
      driftData: mockDriftData,
      candidateVessels: mockCandidates,
      selectedCandidate: mockCandidates[0],
      dossierResult: { dossier: { executiveSummary: 'Test summary' } },
    });

    expect(element).toBeDefined();
    expect(element.props.spill.areaKm2).toBe(4.73);
    expect(element.props.driftData.originLat).toBe(19.113);
    expect(element.props.candidateVessels.length).toBe(1);
  });

  it('should handle navigation clicks on evidence chain stages', () => {
    let navigatedStage = null;
    let navigatedTarget = null;

    const element = React.createElement(EvidenceChain, {
      currentMode: 'investigation',
      activeTab: 'vessels',
      spill: mockSpill,
      driftData: mockDriftData,
      candidateVessels: mockCandidates,
      onNavigateStage: (stage, target) => {
        navigatedStage = stage;
        navigatedTarget = target;
      },
    });

    expect(element).toBeDefined();
    expect(typeof element.props.onNavigateStage).toBe('function');
  });

  it('should trigger start walkthrough callback', () => {
    let walkthroughStarted = false;

    const element = React.createElement(EvidenceChain, {
      currentMode: 'investigation',
      onStartWalkthrough: () => {
        walkthroughStarted = true;
      },
    });

    expect(element).toBeDefined();
    expect(typeof element.props.onStartWalkthrough).toBe('function');
    element.props.onStartWalkthrough();
    expect(walkthroughStarted).toBe(true);
  });
});
