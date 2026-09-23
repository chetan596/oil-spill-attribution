import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import AttributionRankingPanel from '../vessels/AttributionRankingPanel';
import { dossierApi } from '../../api/dossier.api';
import apiClient from '../../api/client';

const mockDemoCandidates = [
  {
    rank: 1,
    name: 'DEMO MARINER ALPHA',
    mmsi: '111222333',
    totalScore: 0.88,
    proximityScore: 0.90,
    temporalScore: 0.85,
    trajectoryScore: 0.80,
    anomalyScore: 0.20,
    vessel: { name: 'DEMO MARINER ALPHA', mmsi: '111222333', flag: 'Panama' },
    evidence: {
      distanceKm: 1.24,
      timeDiffHours: 1.2,
      speedAtPassingKts: 14.2,
      headingAtPassingDeg: 245,
    },
  },
  {
    rank: 2,
    name: 'DEMO VOYAGER BETA',
    mmsi: '444555666',
    totalScore: 0.65,
    proximityScore: 0.60,
    temporalScore: 0.70,
    trajectoryScore: 0.65,
    anomalyScore: 0.10,
    vessel: { name: 'DEMO VOYAGER BETA', mmsi: '444555666', flag: 'Liberia' },
    evidence: {
      distanceKm: 3.50,
      timeDiffHours: 2.8,
      speedAtPassingKts: 12.0,
      headingAtPassingDeg: 190,
    },
  },
];

describe('Phase 8.1 Runtime Stability Test Suite', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── PART 1 & 2: AttributionRankingPanel Hooks & Real/Demo Modes ─────────────
  describe('AttributionRankingPanel: Hooks Stability and Mode Separation', () => {
    it('1. Demo mode renders candidate ranking properly', () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        <AttributionRankingPanel
          candidateVessels={mockDemoCandidates}
          isRealScene={false}
          scenarioType="DEMO"
        />
      );

      expect(html).toContain('Candidate Vessels (2)');
      expect(html).toContain('DEMO MARINER ALPHA');
      expect(html).toContain('DEMO VOYAGER BETA');
      expect(html).toContain('88.0%');
      expect(html).toContain('MMSI:');
    });

    it('2. Real mode renders VESSEL ATTRIBUTION: NOT ESTABLISHED', () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        <AttributionRankingPanel
          candidateVessels={mockDemoCandidates}
          isRealScene={true}
          scenarioType="REAL_CDSE"
        />
      );

      expect(html).toContain('VESSEL ATTRIBUTION: NOT ESTABLISHED');
      expect(html).toContain('No real AIS correlation has been established for this live Sentinel-1 scene.');
      expect(html).toContain('AIS Telemetry Separation');
    });

    it('3. Real mode renders ZERO demo candidate vessels', () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        <AttributionRankingPanel
          candidateVessels={mockDemoCandidates}
          isRealScene={true}
          scenarioType="REAL_CDSE"
        />
      );

      expect(html).not.toContain('DEMO MARINER ALPHA');
      expect(html).not.toContain('DEMO VOYAGER BETA');
      expect(html).not.toContain('DEMO CARRIER GAMMA');
      expect(html).not.toContain('DEMO EXPRESS EPSILON');
      expect(html).not.toContain('88.0%');
      expect(html).not.toContain('Candidate Vessels (2)');
    });

    it('4. Component executes all top-level hooks without throwing hook errors across mode changes', () => {
      expect(() => {
        ReactDOMServer.renderToStaticMarkup(
          <AttributionRankingPanel
            candidateVessels={mockDemoCandidates}
            isRealScene={true}
            scenarioType="REAL_CDSE"
          />
        );

        ReactDOMServer.renderToStaticMarkup(
          <AttributionRankingPanel
            candidateVessels={mockDemoCandidates}
            isRealScene={false}
            scenarioType="DEMO"
          />
        );

        ReactDOMServer.renderToStaticMarkup(
          <AttributionRankingPanel
            candidateVessels={[]}
            isRealScene={true}
            scenarioType="REAL_CDSE"
          />
        );

        ReactDOMServer.renderToStaticMarkup(
          <AttributionRankingPanel
            candidateVessels={mockDemoCandidates}
            selectedCandidate={mockDemoCandidates[0]}
            isRealScene={false}
            scenarioType="DEMO"
          />
        );
      }).not.toThrow();
    });

    it('5. Empty state works in demo mode when no vessels are found', () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        <AttributionRankingPanel
          candidateVessels={[]}
          isRealScene={false}
          scenarioType="DEMO"
        />
      );

      expect(html).toContain('No candidate vessels identified within the spatiotemporal search radius of the Modelled Origin.');
    });

    it('6. Selected candidate details and clear selection button render in demo mode', () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        <AttributionRankingPanel
          candidateVessels={mockDemoCandidates}
          selectedCandidate={mockDemoCandidates[0]}
          isRealScene={false}
          scenarioType="DEMO"
        />
      );

      expect(html).toContain('Clear Selection');
      expect(html).toContain('Spatial Proximity (30%)');
      expect(html).toContain('Temporal Correlation (25%)');
      expect(html).toContain('Trajectory Alignment (25%)');
      expect(html).toContain('AIS Anomaly Feature (20%)');
      expect(html).toContain('CLOSEST POINT OF APPROACH (CPA)');
    });
  });

  // ── PART 3, 4 & 5: Dossier API 404 and Normalization ──────────────────────────
  describe('Dossier API Contract & Error Handling', () => {
    it('8. Existing dossier loads successfully and is returned cleanly', async () => {
      const mockDossierPayload = {
        success: true,
        data: {
          reportId: 'rep-123',
          analysisId: 'ana-123',
          title: 'Analytical Investigation Dossier',
          dossier: {
            executiveSummary: 'Verified Sentinel-1A SAR observation.',
            observedEvidence: ['Sentinel-1A SAR'],
            modelledEvidence: ['unet-dual-pol-sar-v2 baseline'],
            candidateAssessments: [],
          },
        },
      };

      vi.spyOn(apiClient, 'get').mockResolvedValueOnce(mockDossierPayload);

      const result = await dossierApi.get('ana-123');
      expect(result.success).toBe(true);
      expect(result.exists).toBe(true);
      expect(result.status).toBe(200);
      expect(result.data).toBeDefined();
      expect(result.dossier?.executiveSummary).toBe('Verified Sentinel-1A SAR observation.');
      expect(result.reportId).toBe('rep-123');
    });

    it('9. Missing dossier (HTTP 404) returns clean typed state without throwing uncaught exception', async () => {
      const error404 = new Error('Analytical Investigation Dossier not found');
      error404.status = 404;
      vi.spyOn(apiClient, 'get').mockRejectedValueOnce(error404);

      const result = await dossierApi.get('non-existent-analysis-id');
      expect(result.success).toBe(true);
      expect(result.exists).toBe(false);
      expect(result.status).toBe(404);
      expect(result.data).toBeNull();
      expect(result.dossier).toBeNull();
    });

    it('10. Missing or empty analysisId returns clean 404 state immediately', async () => {
      const result = await dossierApi.get(null);
      expect(result.success).toBe(true);
      expect(result.exists).toBe(false);
      expect(result.status).toBe(404);
      expect(result.data).toBeNull();
    });

    it('11. Server failure (HTTP 500) propagates as an exception and is NOT silently swallowed', async () => {
      const error500 = new Error('Database internal connection failure');
      error500.status = 500;
      vi.spyOn(apiClient, 'get').mockRejectedValueOnce(error500);

      await expect(dossierApi.get('ana-500')).rejects.toThrow('Database internal connection failure');
    });

    it('12. dossierApi.generate synthesizes dossier and normalizes output', async () => {
      const mockGenerated = {
        success: true,
        data: {
          reportId: 'rep-real-999',
          analysisId: 'ana-real-999',
          title: 'Real-Scene Observational Dossier',
          dossier: {
            executiveSummary: 'Real CDSE Sentinel-1A Level-1 GRD SAR acquisition.',
            observedEvidence: ['Sentinel-1A (C-SAR IW GRD)', 'Copernicus Data Space Ecosystem'],
            modelledEvidence: ['unet-dual-pol-sar-v2', 'ECMWF ERA5 (2.79 m/s)', 'NOAA CRW (26.30 °C)'],
            candidateAssessments: [],
            limitations: ['Unlabelled Live Scene', 'No Vessel Attribution'],
            disclaimer: 'Real Sentinel-1 observation verified via CDSE.',
          },
        },
      };

      vi.spyOn(apiClient, 'post').mockResolvedValueOnce(mockGenerated);

      const result = await dossierApi.generate('ana-real-999');
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.dossier?.executiveSummary).toContain('Real CDSE Sentinel-1A');
      expect(result.reportId).toBe('rep-real-999');
      expect(result.dossier?.candidateAssessments.length).toBe(0);
    });
  });
});
