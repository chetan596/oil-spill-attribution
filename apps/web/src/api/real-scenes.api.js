import apiClient from './client';

export const realScenesApi = {
  /**
   * GET /api/v1/real-scenes
   * List verified real CDSE Sentinel-1 scenes
   */
  list: () => apiClient.get('/real-scenes'),

  /**
   * GET /api/v1/real-scenes/:sceneId
   * Retrieve scene details
   */
  getById: (sceneId) => apiClient.get(`/real-scenes/${encodeURIComponent(sceneId)}`),

  /**
   * GET /api/v1/real-scenes/:sceneId/sar-metadata
   * Retrieve full provenance and radiometric metadata
   */
  getSarMetadata: (sceneId) => apiClient.get(`/real-scenes/${encodeURIComponent(sceneId)}/sar-metadata`),

  /**
   * GET /api/v1/real-scenes/:sceneId/diagnostics
   * Retrieve baseline inference diagnostics and co-registered MetOcean data
   */
  getDiagnostics: (sceneId) => apiClient.get(`/real-scenes/${encodeURIComponent(sceneId)}/diagnostics`),

  /**
   * Helper to build SAR preview image URL
   */
  getPreviewUrl: (sceneId) => `/api/v1/real-scenes/${encodeURIComponent(sceneId)}/sar-preview`,
};
