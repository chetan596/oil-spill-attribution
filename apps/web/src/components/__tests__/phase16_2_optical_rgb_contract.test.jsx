/**
 * Phase 16.2 — Part 3: Optical RGB Contract & Error Isolation Tests
 *
 * Tests 1–12:
 * 1. JPEG 3-channel → OPTICAL_RGB
 * 2. PNG 3-channel → OPTICAL_RGB
 * 3. DRONE → KERF (kerf-resnet34-focaldice-v1)
 * 4. SATELLITE_RGB → MADOS RGB (mados-resnet34-rgb-v1)
 * 5. API sends correct source_type
 * 6. API sends correct model_id
 * 7. UNKNOWN source remains rejected
 * 8. Sentinel-2 model rejected for RGB
 * 9. SAR model rejected for RGB
 * 10. RGB error is fingerprint scoped
 * 11. Upload SAR clears RGB error
 * 12. Upload RGB clears SAR error
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// ── Leaflet / react-leaflet mocks ──────────────────────────────────────────
vi.mock('react-leaflet', () => ({
  Polygon: (props) => React.createElement('div', props),
  Tooltip: (props) => React.createElement('div', props),
  Popup: (props) => React.createElement('div', props),
  TileLayer: (props) => React.createElement('div', props),
  MapContainer: (props) => React.createElement('div', props),
  Marker: (props) => React.createElement('div', props),
  CircleMarker: (props) => React.createElement('div', props),
  Circle: (props) => React.createElement('div', props),
  Polyline: (props) => React.createElement('div', props),
  useMap: () => ({ fitBounds: vi.fn(), flyTo: vi.fn(), setView: vi.fn() }),
  ScaleControl: (props) => React.createElement('div', props),
  ZoomControl: (props) => React.createElement('div', props),
  LayersControl: (props) => React.createElement('div', props),
  GeoJSON: (props) => React.createElement('div', props),
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

// ── API client mock ────────────────────────────────────────────────────────
const mockPost = vi.fn();
vi.mock('../../api/client', () => ({
  default: {
    post: (...args) => mockPost(...args),
    get: vi.fn(),
  },
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────
import {
  deriveInputDescriptor,
  computeDescriptorFingerprint,
  INPUT_STATES,
  SAR_MODEL_ID,
  SENTINEL2_MODEL_ID,
  DRONE_RGB_MODEL_ID,
  SATELLITE_RGB_MODEL_ID,
} from '../../utils/inputDescriptor';

import { manualAnalysisApi } from '../../api/manual-analysis.api';

describe('Phase 16.2 Part 3 — Optical RGB Contract Tests', () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  // ---------------------------------------------------------------------------
  // Test 1: JPEG 3-channel → OPTICAL_RGB
  // ---------------------------------------------------------------------------
  it('1. JPEG 3-channel produces OPTICAL_RGB inputState with 3 channels and RGB modality', () => {
    const meta = {
      filename: 'drone_survey.jpg',
      format: 'JPEG',
      channelCount: 3,
      isTiff: false,
    };
    const desc = deriveInputDescriptor(meta, null, 'DRONE');
    expect(desc.inputState).toBe(INPUT_STATES.OPTICAL_RGB);
    expect(desc.channelCount).toBe(3);
    expect(desc.modality).toBe('OPTICAL_RGB');
    expect(desc.isOpticalRgb).toBe(true);
    expect(desc.isSar).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Test 2: PNG 3-channel → OPTICAL_RGB
  // ---------------------------------------------------------------------------
  it('2. PNG 3-channel produces OPTICAL_RGB inputState with 3 channels and RGB modality', () => {
    const meta = {
      filename: 'satellite_scene.png',
      format: 'PNG',
      channelCount: 3,
      isTiff: false,
    };
    const desc = deriveInputDescriptor(meta, null, 'SATELLITE_RGB');
    expect(desc.inputState).toBe(INPUT_STATES.OPTICAL_RGB);
    expect(desc.channelCount).toBe(3);
    expect(desc.modality).toBe('OPTICAL_RGB');
    expect(desc.isOpticalRgb).toBe(true);
    expect(desc.isSar).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Test 3: DRONE → KERF
  // ---------------------------------------------------------------------------
  it('3. Explicit DRONE source resolves to KERF model (kerf-resnet34-focaldice-v1)', () => {
    const meta = {
      filename: 'coastal_drone.png',
      format: 'PNG',
      channelCount: 3,
      isTiff: false,
    };
    const desc = deriveInputDescriptor(meta, null, 'DRONE');
    expect(desc.sourceType).toBe('DRONE');
    expect(desc.selectedModelId).toBe(DRONE_RGB_MODEL_ID);
    expect(desc.selectedModelId).toBe('kerf-resnet34-focaldice-v1');
    expect(desc.inferenceSupported).toBe(true);
    expect(desc.inferenceBlockReason).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Test 4: SATELLITE_RGB → MADOS RGB
  // ---------------------------------------------------------------------------
  it('4. Explicit SATELLITE_RGB source resolves to MADOS RGB model (mados-resnet34-rgb-v1)', () => {
    const meta = {
      filename: 'marine_satellite.jpg',
      format: 'JPEG',
      channelCount: 3,
      isTiff: false,
    };
    const desc = deriveInputDescriptor(meta, null, 'SATELLITE_RGB');
    expect(desc.sourceType).toBe('SATELLITE_RGB');
    expect(desc.selectedModelId).toBe(SATELLITE_RGB_MODEL_ID);
    expect(desc.selectedModelId).toBe('mados-resnet34-rgb-v1');
    expect(desc.inferenceSupported).toBe(true);
    expect(desc.inferenceBlockReason).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Test 5 & 6: API sends correct source_type and model_id
  // ---------------------------------------------------------------------------
  it('5 & 6. manualAnalysisApi.analyzeImage normalizes and sends canonical source_type and model_id', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        success: true,
        data: { status: 'COMPLETED', model: { modelId: 'kerf-resnet34-focaldice-v1' } },
      },
    });

    const jobId = 'job-rgb-test-123';
    await manualAnalysisApi.analyzeImage(jobId, {
      source_type: 'DRONE',
      model_id: 'kerf-resnet34-focaldice-v1',
    });

    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe(`/manual-analysis/${jobId}/analyze`);
    expect(body.source_type).toBe('DRONE');
    expect(body.model_id).toBe('kerf-resnet34-focaldice-v1');
    // Also verify camelCase boundary normalization
    expect(body.sourceType).toBe('DRONE');
    expect(body.modelId).toBe('kerf-resnet34-focaldice-v1');
  });

  it('5b & 6b. manualAnalysisApi.analyzeImage normalizes camelCase inputs to canonical API payload', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        success: true,
        data: { status: 'COMPLETED', model: { modelId: 'mados-resnet34-rgb-v1' } },
      },
    });

    const jobId = 'job-sat-test-456';
    await manualAnalysisApi.analyzeImage(jobId, {
      sourceType: 'SATELLITE_RGB',
      modelId: 'mados-resnet34-rgb-v1',
    });

    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe(`/manual-analysis/${jobId}/analyze`);
    expect(body.source_type).toBe('SATELLITE_RGB');
    expect(body.model_id).toBe('mados-resnet34-rgb-v1');
  });

  // ---------------------------------------------------------------------------
  // Test 7: UNKNOWN source remains rejected
  // ---------------------------------------------------------------------------
  it('7. UNKNOWN source remains strictly rejected with inferenceSupported: false and clear reason', () => {
    const meta = {
      filename: 'mystery_rgb.png',
      format: 'PNG',
      channelCount: 3,
      isTiff: false,
    };
    const desc = deriveInputDescriptor(meta, null, 'UNKNOWN');
    expect(desc.sourceType).toBe('UNKNOWN');
    expect(desc.selectedModelId).toBeNull();
    expect(desc.inferenceSupported).toBe(false);
    expect(desc.inferenceBlockReason).toContain('UNKNOWN');
  });

  // ---------------------------------------------------------------------------
  // Test 8: Sentinel-2 model rejected for RGB
  // ---------------------------------------------------------------------------
  it('8. Sentinel-2 selection for 3-channel RGB image is rejected (requires multispectral)', () => {
    const meta = {
      filename: 'photo_not_s2.jpg',
      format: 'JPEG',
      channelCount: 3,
      isTiff: false,
    };
    const desc = deriveInputDescriptor(meta, null, 'SENTINEL_2');
    expect(desc.sourceType).toBe('SENTINEL_2');
    expect(desc.selectedModelId).toBeNull();
    expect(desc.inferenceSupported).toBe(false);
    expect(desc.inferenceBlockReason).toContain('multispectral');
  });

  // ---------------------------------------------------------------------------
  // Test 9: SAR model rejected for RGB
  // ---------------------------------------------------------------------------
  it('9. SAR model selection for 3-channel RGB image is rejected (incompatible modality)', () => {
    const meta = {
      filename: 'drone_not_sar.png',
      format: 'PNG',
      channelCount: 3,
      isTiff: false,
    };
    const desc = deriveInputDescriptor(meta, null, 'SENTINEL1_DUAL_POL');
    expect(desc.sourceType).toBe('SENTINEL1_DUAL_POL');
    expect(desc.selectedModelId).toBeNull();
    expect(desc.inferenceSupported).toBe(false);
    expect(desc.inferenceBlockReason).toContain('incompatible');
  });

  // ---------------------------------------------------------------------------
  // Test 10: RGB error is fingerprint scoped
  // ---------------------------------------------------------------------------
  it('10. RGB error is fingerprint scoped and distinct between Drone and Satellite', () => {
    const metaDrone = {
      filename: 'survey.png',
      format: 'PNG',
      channelCount: 3,
      isTiff: false,
    };
    const descDrone = deriveInputDescriptor(metaDrone, null, 'DRONE');
    const fpDrone = computeDescriptorFingerprint(descDrone);

    const descSat = deriveInputDescriptor(metaDrone, null, 'SATELLITE_RGB');
    const fpSat = computeDescriptorFingerprint(descSat);

    expect(fpDrone).not.toBe(fpSat);
    expect(fpDrone).toContain('DRONE');
    expect(fpSat).toContain('SATELLITE_RGB');

    // Scoping simulation: an error bound to fpDrone does NOT match fpSat
    const scopedError = {
      jobId: 'job-1',
      descriptorFingerprint: fpDrone,
      message: 'Drone inference timeout',
    };
    const isVisibleForSat = scopedError.descriptorFingerprint === fpSat;
    expect(isVisibleForSat).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Test 11: Upload SAR clears RGB error
  // ---------------------------------------------------------------------------
  it('11. Uploading SAR image generates completely different fingerprint and clears RGB error', () => {
    const metaRgb = {
      filename: 'survey.png',
      format: 'PNG',
      channelCount: 3,
      isTiff: false,
    };
    const descRgb = deriveInputDescriptor(metaRgb, null, 'DRONE');
    const fpRgb = computeDescriptorFingerprint(descRgb);

    const activeError = {
      jobId: 'job-rgb-100',
      descriptorFingerprint: fpRgb,
      type: 'OPTICAL INPUT VALIDATION FAILED',
      message: 'Network issue during drone inference',
    };

    // New SAR file uploaded
    const metaSar = {
      filename: 'sentinel1_burst.tif',
      format: 'TIFF',
      channelCount: 2,
      isTiff: true,
      modality: 'SAR_DUAL_POL',
      polarizationStatus: 'ESTABLISHED',
      polarizations: ['VV', 'VH'],
    };
    const descSar = deriveInputDescriptor(metaSar, null, 'SENTINEL1_DUAL_POL');
    const fpSar = computeDescriptorFingerprint(descSar);
    const newJobId = 'job-sar-200';

    // Verify error isolation condition from ManualAnalysis.jsx
    const shouldShowError = Boolean(
      activeError &&
      (!activeError.jobId || activeError.jobId === newJobId) &&
      (!activeError.descriptorFingerprint || activeError.descriptorFingerprint === fpSar)
    );

    expect(shouldShowError).toBe(false);
    expect(fpSar).not.toBe(fpRgb);
  });

  // ---------------------------------------------------------------------------
  // Test 12: Upload RGB clears SAR error
  // ---------------------------------------------------------------------------
  it('12. Uploading RGB image clears any previous SAR error through fingerprint and jobId mismatch', () => {
    const metaSar = {
      filename: 'sentinel1_burst.tif',
      format: 'TIFF',
      channelCount: 2,
      isTiff: true,
      modality: 'SAR_DUAL_POL',
      polarizationStatus: 'ESTABLISHED',
      polarizations: ['VV', 'VH'],
    };
    const descSar = deriveInputDescriptor(metaSar, null, 'SENTINEL1_DUAL_POL');
    const fpSar = computeDescriptorFingerprint(descSar);

    const activeError = {
      jobId: 'job-sar-200',
      descriptorFingerprint: fpSar,
      type: 'SAR INFERENCE FAILED',
      message: 'SAR processing error',
    };

    // New RGB file uploaded
    const metaRgb = {
      filename: 'coastal_flight.jpg',
      format: 'JPEG',
      channelCount: 3,
      isTiff: false,
    };
    const descRgb = deriveInputDescriptor(metaRgb, null, 'DRONE');
    const fpRgb = computeDescriptorFingerprint(descRgb);
    const newJobId = 'job-rgb-300';

    const shouldShowError = Boolean(
      activeError &&
      (!activeError.jobId || activeError.jobId === newJobId) &&
      (!activeError.descriptorFingerprint || activeError.descriptorFingerprint === fpRgb)
    );

    expect(shouldShowError).toBe(false);
    expect(fpRgb).not.toBe(fpSar);
  });
});
