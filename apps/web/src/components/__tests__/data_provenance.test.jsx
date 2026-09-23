import { describe, it, expect } from 'vitest';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import DataProvenance from '../common/DataProvenance';
import AttributionRankingPanel from '../vessels/AttributionRankingPanel';

describe('DataProvenance Component', () => {
  it('instantiates correctly with DEMONSTRATION status and OBSERVED evidence', () => {
    const element = React.createElement(DataProvenance, {
      status: 'DEMONSTRATION',
      evidenceClass: 'OBSERVED',
      source: 'Sentinel-1A SAR Dual-Pol VV+VH',
      dataset: 'S1A_IW_GRDH',
      processing: 'PyTorch U-Net V2 Segmentation',
      limitation: 'Surface area on 2D radar plane',
    });

    expect(element).toBeDefined();
    expect(element.props.status).toBe('DEMONSTRATION');
    expect(element.props.evidenceClass).toBe('OBSERVED');
    expect(element.props.source).toBe('Sentinel-1A SAR Dual-Pol VV+VH');

    const html = ReactDOMServer.renderToStaticMarkup(element);
    expect(html).toContain('button');
    expect(html).toContain('aria-label="Data provenance information"');
  });

  it('instantiates correctly with REAL_CDSE NOT_ESTABLISHED provenance', () => {
    const element = React.createElement(DataProvenance, {
      status: 'NOT_ESTABLISHED',
      evidenceClass: 'NOT_ESTABLISHED',
      source: 'AIS Coastal Station Ingestion',
      processing: 'Quarantined: zero synthetic vessels evaluated',
      limitation: 'Real Sentinel-1 acquisitions require authentic coastal AIS logs; synthetic demo tracks suppressed',
    });

    expect(element).toBeDefined();
    expect(element.props.status).toBe('NOT_ESTABLISHED');
    expect(element.props.evidenceClass).toBe('NOT_ESTABLISHED');
    expect(element.props.status).not.toBe('DEMONSTRATION');
    expect(element.props.status).not.toBe('REAL');

    const html = ReactDOMServer.renderToStaticMarkup(element);
    expect(html).toContain('button');
  });

  it('AttributionRankingPanel renders REAL_CDSE isolated state without synthetic vessels', () => {
    const realElement = React.createElement(AttributionRankingPanel, {
      isRealScene: true,
      candidateVessels: [],
    });

    const realHtml = ReactDOMServer.renderToStaticMarkup(realElement);
    expect(realHtml).toContain('VESSEL ATTRIBUTION: NOT ESTABLISHED');
    expect(realHtml).toContain('isolated demonstration datasets');
    // Ensure synthetic candidates are not rendered
    expect(realHtml).not.toContain('MV Kandla Star');
  });

  it('AttributionRankingPanel renders demo state with legal disclaimer and hydrocarbon clause', () => {
    const demoElement = React.createElement(AttributionRankingPanel, {
      isRealScene: false,
      candidateVessels: [
        {
          rank: 1,
          totalScore: 94,
          vessel: { name: 'MV Kandla Star', mmsi: '419001234', flag: 'IN' },
          evidence: { closestApproachKm: 0.8 },
        },
      ],
    });

    const demoHtml = ReactDOMServer.renderToStaticMarkup(demoElement);
    expect(demoHtml).toContain('Candidate Vessels (1)');
    expect(demoHtml).toContain('MV Kandla Star');
    expect(demoHtml).toContain('HEURISTIC SPATIOTEMPORAL CANDIDATE CORRELATION');
    expect(demoHtml).toContain('do NOT constitute sole legal attribution');
    expect(demoHtml).toContain('hydrocarbon fingerprinting');
  });
});
