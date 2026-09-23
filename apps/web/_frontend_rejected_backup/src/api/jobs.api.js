import apiClient from './client';

export const jobsApi = {
  /**
   * POST /api/v1/jobs
   * @param {{ sarSceneId: string, timeWindowHours?: number }} payload
   * @returns {Promise<{ success: boolean, jobId: string, analysisId?: string, status?: string, data: object }>}
   */
  create: async (payload) => {
    const response = await apiClient.post('/jobs', payload);
    if (!response) {
      throw new Error('Job creation returned empty response');
    }
    const data = response.data || response;
    const jobId = data.jobId || response.jobId;
    if (!jobId) {
      throw new Error('Job creation failed: No jobId returned');
    }
    return {
      success: response.success !== false,
      jobId,
      analysisId: data.analysisId,
      status: data.status || 'PENDING',
      data,
    };
  },

  /**
   * GET /api/v1/jobs/:id
   * @param {string} id - AnalysisJob ID
   * @returns {Promise<{ success: boolean, data: object, status: string, progress: number }>}
   */
  getById: async (id) => {
    const response = await apiClient.get(`/jobs/${id}`);
    if (!response) {
      throw new Error(`Job status request returned empty response for job: ${id}`);
    }
    const data = response.data || response;
    return {
      success: response.success !== false,
      data,
      status: data?.status || 'unknown',
      progress: data?.progress || 0,
      errorMessage: data?.errorMessage || null,
      analysisId: data?.analysisId || null,
      jobId: data?.jobId || id,
      ...data,
    };
  },
};
