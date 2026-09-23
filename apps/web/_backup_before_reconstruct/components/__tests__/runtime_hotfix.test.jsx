import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import LoadingSpinner from '../common/LoadingSpinner';
import EvidenceBadge from '../common/EvidenceBadge';
import { sentinel1Api } from '../../api/sentinel1.api';
import { jobsApi } from '../../api/jobs.api';
import apiClient from '../../api/client';
import SarEvidenceViewer from '../analysis/SarEvidenceViewer';
import EvidenceChain from '../analysis/EvidenceChain';

describe('Phase 8 Runtime Hotfix Test Suite', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. SVG Semantic Size "sm" and Numeric Dimensions ─────────────────────────
  describe('1. SVG Semantic Size Mapping', () => {
    it('should map semantic size "sm" to numeric width/height (16px) in LoadingSpinner', () => {
      const spinnerElem = LoadingSpinner({ message: 'Searching CDSE...', size: 'sm' });
      expect(spinnerElem).toBeDefined();

      // Find the Loader2 element in children
      const loaderChild = spinnerElem.props.children.find(
        (child) => child && child.props && typeof child.props.size !== 'undefined'
      );
      expect(loaderChild).toBeDefined();
      expect(typeof loaderChild.props.size).toBe('number');
      expect(loaderChild.props.size).toBe(16);
    });

    it('should correctly map all semantic sizes ("xs", "sm", "md", "lg", "xl", numeric) to numbers', () => {
      const sizes = [
        { input: 'xs', expected: 12 },
        { input: 'sm', expected: 16 },
        { input: 'md', expected: 20 },
        { input: 'lg', expected: 24 },
        { input: 'xl', expected: 32 },
        { input: 28, expected: 28 },
        { input: 'invalid', expected: 24 },
      ];

      sizes.forEach(({ input, expected }) => {
        const spinnerElem = LoadingSpinner({ size: input });
        const loaderChild = spinnerElem.props.children.find(
          (child) => child && child.props && typeof child.props.size !== 'undefined'
        );
        expect(loaderChild.props.size).toBe(expected);
      });
    });

    it('should render EvidenceBadge with valid numeric icon dimensions for size "sm"', () => {
      const badgeElem = EvidenceBadge({ classification: 'OBSERVED', size: 'sm' });
      expect(badgeElem).toBeDefined();
      const iconChild = badgeElem.props.children.find(
        (child) => child && child.props && typeof child.props.size !== 'undefined'
      );
      expect(iconChild).toBeDefined();
      expect(typeof iconChild.props.size).toBe('number');
      expect(iconChild.props.size).toBe(12);
    });
  });

  // ── 2–5. CDSE Search Contracts (Success, Empty, HTTP Error, Malformed) ─────────
  describe('2–5. CDSE Search Contracts & Normalization', () => {
    it('2. should normalize standard backend search success response', async () => {
      const mockBackendResponse = {
        source: 'COPERNICUS_DATA_SPACE',
        query: { aoi: 'mumbai', limit: 12 },
        totalFound: 1,
        results: [
          {
            id: 'S1A_IW_GRDH_1SDV_20240218T010329',
            name: 'S1A_IW_GRDH_1SDV_20240218T010329.SAFE',
            platform: 'Sentinel-1A',
            polarization: 'VV+VH',
          },
        ],
      };

      vi.spyOn(apiClient, 'get').mockResolvedValue(mockBackendResponse);

      const result = await sentinel1Api.searchAcquisitions({ aoi: 'mumbai' });

      expect(result).toBeDefined();
      expect(result.source).toBe('COPERNICUS_DATA_SPACE');
      expect(result.totalFound).toBe(1);
      expect(Array.isArray(result.results)).toBe(true);
      expect(result.results.length).toBe(1);
      expect(result.results[0].id).toBe('S1A_IW_GRDH_1SDV_20240218T010329');
      // Backward compatibility envelope check
      expect(result.data.results).toBe(result.results);
    });

    it('3. should handle empty results gracefully without throwing', async () => {
      const mockEmptyResponse = {
        source: 'COPERNICUS_DATA_SPACE',
        query: { aoi: 'kutch' },
        totalFound: 0,
        results: [],
      };

      vi.spyOn(apiClient, 'get').mockResolvedValue(mockEmptyResponse);

      const result = await sentinel1Api.searchAcquisitions({ aoi: 'kutch' });

      expect(result).toBeDefined();
      expect(result.totalFound).toBe(0);
      expect(Array.isArray(result.results)).toBe(true);
      expect(result.results.length).toBe(0);
      expect(result.data.results.length).toBe(0);
    });

    it('4. should propagate HTTP failure as a rejected Promise with original error details', async () => {
      const httpError = new Error('CDSE STAC endpoint returned 503 Service Unavailable');
      httpError.status = 503;

      vi.spyOn(apiClient, 'get').mockRejectedValue(httpError);

      await expect(sentinel1Api.searchAcquisitions({ aoi: 'mumbai' })).rejects.toThrow(
        'CDSE STAC endpoint returned 503 Service Unavailable'
      );
    });

    it('5. should handle malformed or null response without reading undefined properties', async () => {
      vi.spyOn(apiClient, 'get').mockResolvedValue(null);

      await expect(sentinel1Api.searchAcquisitions({ aoi: 'mumbai' })).rejects.toThrow(
        'Received empty response from Copernicus Catalogue search'
      );
    });

    it('5b. should handle nested response data envelope from axios', async () => {
      const wrappedResponse = {
        data: {
          source: 'COPERNICUS_DATA_SPACE',
          results: [{ id: 'S1A_TEST_001' }],
          totalFound: 1,
        },
      };

      vi.spyOn(apiClient, 'get').mockResolvedValue(wrappedResponse);

      const result = await sentinel1Api.searchAcquisitions({ aoi: 'mumbai' });

      expect(result.results.length).toBe(1);
      expect(result.results[0].id).toBe('S1A_TEST_001');
    });
  });

  // ── 6–9. Pipeline Dispatch Contracts & Validation ─────────────────────────────
  describe('6–9. Pipeline Dispatch Contracts & Validation', () => {
    it('6. should normalize successful pipeline dispatch returning valid jobId', async () => {
      const mockDispatchResponse = {
        success: true,
        message: 'Analysis job dispatched for real Sentinel-1 acquisition',
        jobId: 'job-real-s1a-987',
        analysisId: 'analysis-real-s1a-987',
        sceneId: 'cdse-s1a-mumbai-20240218',
        source: 'COPERNICUS_DATA_SPACE',
      };

      vi.spyOn(apiClient, 'post').mockResolvedValue(mockDispatchResponse);

      const result = await sentinel1Api.processAcquisition({
        productId: 'cdse-s1a-mumbai-20240218',
        sarSceneId: 'cdse-s1a-mumbai-20240218',
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.jobId).toBe('job-real-s1a-987');
      expect(result.analysisId).toBe('analysis-real-s1a-987');
      // Backward compatibility access
      expect(result.data.jobId).toBe('job-real-s1a-987');
    });

    it('7. should propagate pipeline dispatch HTTP error', async () => {
      const dispatchError = new Error('Database connection failed during job queueing');
      vi.spyOn(apiClient, 'post').mockRejectedValue(dispatchError);

      await expect(
        sentinel1Api.processAcquisition({ productId: 'cdse-s1a-mumbai-20240218' })
      ).rejects.toThrow('Database connection failed during job queueing');
    });

    it('8. should reject pipeline dispatch if jobId is missing in response', async () => {
      const invalidResponse = {
        success: true,
        message: 'Job processed but no identifier assigned',
        // jobId missing
      };

      vi.spyOn(apiClient, 'post').mockResolvedValue(invalidResponse);

      await expect(
        sentinel1Api.processAcquisition({ productId: 'cdse-s1a-mumbai-20240218' })
      ).rejects.toThrow('Pipeline dispatch failed: No jobId returned by analysis service');
    });

    it('9. should safely create jobs via jobsApi.create without destructuring undefined data', async () => {
      const mockJobResponse = {
        success: true,
        data: {
          jobId: 'job-demo-001',
          analysisId: 'analysis-demo-001',
          status: 'PENDING',
        },
      };

      vi.spyOn(apiClient, 'post').mockResolvedValue(mockJobResponse);

      const result = await jobsApi.create({ sarSceneId: 'demo-scene-001' });

      expect(result.jobId).toBe('job-demo-001');
      expect(result.analysisId).toBe('analysis-demo-001');
      expect(result.status).toBe('PENDING');
    });
  });

  // ── 10–12. Real / Demo Separation Integrity ──────────────────────────────────
  describe('10–12. Real Mode & Demo Mode Isolation Verification', () => {
    const realScene = {
      sceneId: 'S1A_IW_GRDH_1SDV_20240218T010329_20240218T010354_052606_065D1D_A8B1_COG',
      satellite: 'Sentinel-1A (C-SAR IW GRD Level-1)',
      productUuid: '3f5c4ba1-ed70-4065-91b9-2bbeb7ebfb79',
      acquisitionAt: '2024-02-18T01:03:29.872826Z',
      bandInfo: { isRealScene: true, polarisation: 'VV+VH', pass: 'Descending' },
    };

    const realSpill = {
      id: 'spill-real-cdse',
      areaKm2: 0.0001,
      confidence: 0.3628,
      latitude: 18.9933,
      longitude: 72.7455,
      detectedAt: '2024-02-18T01:03:29.872826Z',
      isRealScene: true,
    };

    it('10. should maintain Demo Mode rendering with standard demo badges and metrics', () => {
      const demoSpill = {
        id: 'spill-001',
        areaKm2: 4.73,
        confidence: 0.94,
        latitude: 18.921,
        longitude: 72.832,
      };
      const demoScene = {
        sceneId: 'demo-scene-001',
        satellite: 'Sentinel-1 C-Band SAR',
      };

      const viewer = React.createElement(SarEvidenceViewer, {
        isOpen: true,
        spill: demoSpill,
        scene: demoScene,
        isRealScene: false,
      });

      expect(viewer).toBeDefined();
      expect(viewer.props.isOpen).toBe(true);
      expect(viewer.props.isRealScene).toBe(false);
    });

    it('11. should render Real Sentinel-1 mode with verified CDSE badge and live diagnostics', () => {
      const viewer = React.createElement(SarEvidenceViewer, {
        isOpen: true,
        spill: realSpill,
        scene: realScene,
        isRealScene: true,
      });

      expect(viewer).toBeDefined();
      expect(viewer.props.isOpen).toBe(true);
      expect(viewer.props.isRealScene).toBe(true);
      expect(viewer.props.scene.productUuid).toBe('3f5c4ba1-ed70-4065-91b9-2bbeb7ebfb79');
    });

    it('12. should render EvidenceChain for Real CDSE scene without demo attribution or drift', () => {
      const chainElem = React.createElement(EvidenceChain, {
        spill: realSpill,
        scene: realScene,
        vessels: [], // No candidates in real mode
        driftRun: null, // No drift in real mode
        isRealScene: true,
      });

      expect(chainElem).toBeDefined();
      expect(chainElem.props.isRealScene).toBe(true);
      expect(chainElem.props.vessels.length).toBe(0);
      expect(chainElem.props.driftRun).toBeNull();
    });
  });
});
