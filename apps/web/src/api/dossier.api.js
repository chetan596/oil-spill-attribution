import apiClient from './client';

export const dossierApi = {
  /**
   * POST /api/v1/dossier/:analysisId/generate
   * Synthesize and persist an Analytical Investigation Dossier.
   * @param {string} analysisId
   * @param {object} [options]
   * @returns {Promise<{ success: boolean, reportId: string, dossierId: string, analysisId: string, title: string, dossier: object, data: object }>}
   */
  generate: async (analysisId, options = {}) => {
    if (!analysisId) {
      throw new Error('analysisId is required to generate a dossier');
    }
    const response = await apiClient.post(`/dossier/${analysisId}/generate`, options);
    const payload = response?.data || response || {};
    return {
      success: true,
      data: payload,
      reportId: payload.reportId || payload.id,
      dossierId: payload.dossierId || payload.dossier?.dossierId,
      analysisId: payload.analysisId || analysisId,
      title: payload.title,
      dossier: payload.dossier || payload,
    };
  },

  /**
   * GET /api/v1/dossier/:analysisId
   * Retrieve an existing dossier.
   * @param {string} analysisId
   * @returns {Promise<{ success: boolean, exists: boolean, status: number, reportId?: string, dossierId?: string, analysisId?: string, title?: string, dossier?: object, data?: object }>}
   */
  get: async (analysisId) => {
    if (!analysisId) {
      return {
        success: true,
        exists: false,
        status: 404,
        data: null,
        dossier: null,
      };
    }
    try {
      const response = await apiClient.get(`/dossier/${analysisId}`);
      const payload = response?.data || response || {};
      return {
        success: true,
        exists: true,
        status: 200,
        data: payload,
        reportId: payload.reportId || payload.id,
        dossierId: payload.dossierId || payload.dossier?.dossierId,
        analysisId: payload.analysisId || analysisId,
        title: payload.title,
        dossier: payload.dossier || payload,
      };
    } catch (err) {
      if (
        err.status === 404 ||
        err.response?.status === 404 ||
        (err.message && err.message.includes('404')) ||
        (err.message && err.message.includes('not found'))
      ) {
        return {
          success: true,
          exists: false,
          status: 404,
          data: null,
          dossier: null,
        };
      }
      throw err;
    }
  },

  /**
   * GET /api/v1/dossier
   * List all persisted investigation dossiers.
   * @returns {Promise<Array<object>>}
   */
  list: async () => {
    const response = await apiClient.get('/dossier');
    return response?.data || response || [];
  },

  /**
   * GET /api/v1/dossier/:analysisId/pdf
   * Download the formal investigation PDF report.
   * @param {string} analysisId
   * @returns {Promise<Blob>}
   */
  downloadPdf: async (analysisId) => {
    if (!analysisId) {
      throw new Error('analysisId is required to download PDF');
    }
    const response = await apiClient.get(`/dossier/${analysisId}/pdf`, {
      responseType: 'blob',
    });
    return response;
  },
};

