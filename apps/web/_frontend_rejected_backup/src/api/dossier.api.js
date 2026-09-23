import apiClient from './client';

export const dossierApi = {
  /**
   * POST /api/v1/dossier/:analysisId/generate
   * Synthesize and persist an Analytical Investigation Dossier.
   * @param {string} analysisId
   * @returns {Promise<{ success: boolean, data: { reportId: string, analysisId: string, title: string, dossier: object }, dossier: object, reportId: string, title: string }>}
   */
  generate: async (analysisId) => {
    const res = await apiClient.post(`/dossier/${analysisId}/generate`);
    return {
      success: true,
      data: res?.data || res,
      dossier: res?.data?.dossier || res?.dossier || null,
      reportId: res?.data?.reportId || res?.reportId || null,
      title: res?.data?.title || res?.title || null,
    };
  },

  /**
   * GET /api/v1/dossier/:analysisId
   * Retrieve an existing dossier.
   * Gracefully returns { exists: false, status: 404, data: null, dossier: null } if no report has been generated yet.
   * @param {string} analysisId
   * @returns {Promise<{ success: boolean, exists: boolean, status: number, data: object|null, dossier: object|null, reportId: string|null, title: string|null }>}
   */
  get: async (analysisId) => {
    if (!analysisId) {
      return {
        success: true,
        exists: false,
        status: 404,
        data: null,
        dossier: null,
        reportId: null,
        title: null,
      };
    }
    try {
      const res = await apiClient.get(`/dossier/${analysisId}`);
      return {
        success: true,
        exists: true,
        status: 200,
        data: res?.data || res,
        dossier: res?.data?.dossier || res?.dossier || null,
        reportId: res?.data?.reportId || res?.reportId || null,
        title: res?.data?.title || res?.title || null,
      };
    } catch (err) {
      // Differentiate legitimate 404 (dossier not generated yet) from server / network failure
      if (err.status === 404 || err.response?.status === 404) {
        return {
          success: true,
          exists: false,
          status: 404,
          data: null,
          dossier: null,
          reportId: null,
          title: null,
        };
      }
      throw err;
    }
  },
};

