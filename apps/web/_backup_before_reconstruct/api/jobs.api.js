import apiClient from './client';

export const jobsApi = {
  /**
   * POST /api/v1/jobs
   * @param {{ sarSceneId: string, timeWindowHours?: number }} payload
   * @returns {Promise<{ success: boolean, jobId: string, analysisId: string, status: string, data: object }>}
   */
  create: async (payload) => {
    const response = await apiClient.post('/jobs', payload);
    const data = response?.data || response || {};
    return {
      success: true,
      jobId: data.jobId,
      analysisId: data.analysisId,
      status: data.status,
      data: data,
    };
  },

  /**
   * GET /api/v1/jobs/:id
   * @param {string} id - AnalysisJob ID
   * @returns {Promise<{ success: boolean, data: { jobId: string, analysisId: string, status: string, progress: number, ... } }>}
   */
  getById: async (id) => {
    const response = await apiClient.get(`/jobs/${id}`);
    return response?.data || response;
  },
};

