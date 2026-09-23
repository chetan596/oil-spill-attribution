import apiClient from './client';

export const spillsApi = {
  /**
   * GET /api/v1/spills
   * @param {{ limit?: number, offset?: number }} [params]
   * @returns {Promise<{ success: boolean, data: { spills: Array, total: number, limit: number, offset: number } }>}
   */
  list: (params = {}) => apiClient.get('/spills', { params }),

  /**
   * GET /api/v1/spills/:id
   * @param {string} id - Spill ID
   * @returns {Promise<{ success: boolean, data: object }>}
   */
  getById: (id) => apiClient.get(`/spills/${id}`),

  /**
   * GET /api/v1/spills/by-analysis/:analysisId
   * @param {string} analysisId - Analysis ID
   * @returns {Promise<{ success: boolean, data: object }>}
   */
  getByAnalysisId: (analysisId) => apiClient.get(`/spills/by-analysis/${analysisId}`),

  /**
   * GET /api/v1/spills/:id/drift
   * @param {string} id - Spill ID
   * @returns {Promise<{ success: boolean, data: { id: string, originLat: number, originLng: number, originTimestamp: string, backwardPath: Array, forwardPath: Array, simulationMeta: object } }>}
   */
  getDrift: (id) => apiClient.get(`/spills/${id}/drift`),

  /**
   * GET /api/v1/spills/:id/vessels
   * @param {string} id - Spill ID
   * @returns {Promise<{ success: boolean, data: Array<{ rank: number, totalScore: number, proximityScore: number, temporalScore: number, trajectoryScore: number, anomalyScore: number, vessel: object, evidence: object }> }>}
   */
  getVessels: (id) => apiClient.get(`/spills/${id}/vessels`),
};
