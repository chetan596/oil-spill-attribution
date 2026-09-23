import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import InvestigationGuide from '../analysis/InvestigationGuide';

describe('InvestigationGuide Component', () => {
  const mockSpill = {
    id: 'spill-1',
    areaKm2: 4.73,
    confidence: 0.94,
  };

  const mockDriftData = {
    originLat: 19.113,
    originLng: 72.544,
  };

  const mockCandidates = [
    {
      rank: 1,
      totalScore: 0.546,
      vessel: { name: 'DEMO MARINER ALPHA', mmsi: '419000123' },
      evidence: { distanceKm: 1.24, passingLat: 18.98, passingLng: 72.72, closestTimestamp: '2026-03-09T21:30:00.000Z' },
    },
  ];

  it('should render InvestigationGuide when isOpen is true', () => {
    const element = React.createElement(InvestigationGuide, {
      isOpen: true,
      spill: mockSpill,
      driftData: mockDriftData,
      candidateVessels: mockCandidates,
    });

    expect(element).toBeDefined();
    expect(element.props.isOpen).toBe(true);
    expect(element.props.spill.areaKm2).toBe(4.73);
  });

  it('should not render content when isOpen is false', () => {
    const element = React.createElement(InvestigationGuide, {
      isOpen: false,
    });

    expect(element).toBeDefined();
    expect(element.props.isOpen).toBe(false);
  });

  it('should wire judge step callbacks correctly', () => {
    let sarCalled = false;
    let driftCalled = false;
    let aisCalled = false;
    let candidateCalled = false;
    let dossierCalled = false;

    const element = React.createElement(InvestigationGuide, {
      isOpen: true,
      onOpenSar: () => { sarCalled = true; },
      onOpenDrift: () => { driftCalled = true; },
      onOpenAis: () => { aisCalled = true; },
      onFocusTopCandidate: () => { candidateCalled = true; },
      onOpenDossier: () => { dossierCalled = true; },
      spill: mockSpill,
      driftData: mockDriftData,
      candidateVessels: mockCandidates,
    });

    expect(element).toBeDefined();
    element.props.onOpenSar();
    element.props.onOpenDrift();
    element.props.onOpenAis();
    element.props.onFocusTopCandidate();
    element.props.onOpenDossier();

    expect(sarCalled).toBe(true);
    expect(driftCalled).toBe(true);
    expect(aisCalled).toBe(true);
    expect(candidateCalled).toBe(true);
    expect(dossierCalled).toBe(true);
  });
});
