import apiClient from './client';

export const jobsApi = {
  /**
   * POST /api/v1/jobs
   * @param {{ sarSceneId: string, timeWindowHours?: number }} payload
   * @returns {Promise<{ success: boolean, data: { jobId: string, analysisId: string, status: string } }>}
   */
  create: (payload) => apiClient.post('/jobs', payload),

  /**
   * GET /api/v1/jobs/:id
   * @param {string} id - AnalysisJob ID
   * @returns {Promise<{ success: boolean, data: { jobId: string, analysisId: string, status: string, progress: number, ... } }>}
   */
  getById: (id) => apiClient.get(`/jobs/${id}`),
};
