import apiClient from './client';

export const reportsApi = {
  /**
   * POST /api/v1/dossier/:analysisId/generate
   * @param {string} analysisId - Analysis or Spill ID
   */
  generate: (analysisId) => apiClient.post(`/dossier/${analysisId}/generate`),

  /**
   * GET /api/v1/dossier/:analysisId
   */
  get: (analysisId) => apiClient.get(`/dossier/${analysisId}`),
};
