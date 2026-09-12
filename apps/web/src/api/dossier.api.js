import apiClient from './client';

export const dossierApi = {
  /**
   * POST /api/v1/dossier/:analysisId/generate
   * Synthesize and persist an Analytical Investigation Dossier.
   * @param {string} analysisId
   * @returns {Promise<{ success: boolean, data: { reportId: string, analysisId: string, title: string, dossier: object } }>}
   */
  generate: (analysisId) => apiClient.post(`/dossier/${analysisId}/generate`),

  /**
   * GET /api/v1/dossier/:analysisId
   * Retrieve an existing dossier.
   * @param {string} analysisId
   * @returns {Promise<{ success: boolean, data: { reportId: string, analysisId: string, title: string, dossier: object } }>}
   */
  get: (analysisId) => apiClient.get(`/dossier/${analysisId}`),
};
