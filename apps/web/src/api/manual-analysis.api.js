import apiClient from './client';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';

export const manualAnalysisApi = {
  /**
   * Upload image and extract metadata foundation (Part 1).
   * Sets READY_FOR_ANALYSIS state without triggering AI.
   * @param {File} file
   * @param {(progressEvent: ProgressEvent) => void} [onUploadProgress]
   */
  uploadOnly: async (file, options = {}, onUploadProgress) => {
    let progressCb = onUploadProgress;
    let opts = options;
    if (typeof options === 'function') {
      progressCb = options;
      opts = {};
    }

    const formData = new FormData();
    formData.append('image', file);
    if (opts.investigationTimestamp || opts.acquisitionTimestamp) {
      formData.append('investigationTimestamp', opts.investigationTimestamp || opts.acquisitionTimestamp);
      formData.append('acquisitionTimestamp', opts.investigationTimestamp || opts.acquisitionTimestamp);
    }

    const response = await apiClient.post('/manual-analysis/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: progressCb,
    });

    return response?.data || response;
  },

  /**
   * Phase 16.1: Authoritative backend source declaration for 2-channel SAR rasters.
   * @param {string} jobId
   * @param {{ sourceType: string, polarizations: string[] }} payload
   */
  declareSource: async (jobId, payload = { sourceType: 'SENTINEL1_DUAL_POL', polarizations: ['VV', 'VH'] }) => {
    const response = await apiClient.post(`/manual-analysis/${jobId}/declare-source`, payload);
    return response?.data || response;
  },

  /**
   * Part 0.14D: Execute end-to-end Optical AI Analysis (Classifier + Segmentation + Visual Annotation).
   * @param {string} jobId
   * @param {{ source_type?: string, threshold?: number, investigationTimestamp?: string, acquisitionTimestamp?: string }} [options]
   */
  analyzeImage: async (jobId, options = {}) => {
    const payload = {
      source_type: options.source_type || options.sourceType || options.selectedSourceType,
      sourceType: options.sourceType || options.source_type || options.selectedSourceType,
      model_id: options.model_id || options.modelId || options.selectedModelId,
      modelId: options.modelId || options.model_id || options.selectedModelId,
      investigationTimestamp: options.investigationTimestamp || options.acquisitionTimestamp,
      acquisitionTimestamp: options.acquisitionTimestamp || options.investigationTimestamp,
      ...options,
    };
    const response = await apiClient.post(`/manual-analysis/${jobId}/analyze`, payload);
    return response?.data || response;
  },

  /**
   * Part 0.14B: Execute RGB Oil vs Non-Oil binary classification.
   * @param {string} jobId
   * @param {{ threshold?: number }} [options]
   */
  classifyImage: async (jobId, options = {}) => {
    const response = await apiClient.post(`/manual-analysis/${jobId}/classify`, options);
    return response?.data || response;
  },

  /**
   * Upload image and initiate manual analysis job.
   * @param {File} file
   * @param {{ threshold?: number, polarization?: string, investigationTimestamp?: string, acquisitionTimestamp?: string }} options
   * @param {(progressEvent: ProgressEvent) => void} [onUploadProgress]
   */
  uploadAndAnalyze: async (file, options = {}, onUploadProgress) => {
    const formData = new FormData();
    formData.append('image', file);
    if (options.threshold !== undefined) {
      formData.append('threshold', options.threshold.toString());
    }
    if (options.polarization) {
      formData.append('polarization', options.polarization);
    }
    if (options.investigationTimestamp || options.acquisitionTimestamp) {
      formData.append('investigationTimestamp', options.investigationTimestamp || options.acquisitionTimestamp);
      formData.append('acquisitionTimestamp', options.investigationTimestamp || options.acquisitionTimestamp);
    }

    const response = await apiClient.post('/manual-analysis', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress,
    });

    return response?.data || response;
  },

  /**
   * Get job progress & execution status (or canonical payload when complete).
   * @param {string} jobId
   */
  getStatus: async (jobId) => {
    const response = await apiClient.get(`/manual-analysis/${jobId}`);
    return response?.data || response;
  },

  /**
   * Alias for getStatus to fetch manual analysis job.
   * @param {string} jobId
   */
  getJob: async (jobId) => {
    const response = await apiClient.get(`/manual-analysis/${jobId}`);
    return response?.data || response;
  },

  /**
   * Get full structured forensic & segmentation result.
   * @param {string} jobId
   */
  getResult: async (jobId) => {
    const response = await apiClient.get(`/manual-analysis/${jobId}/result`);
    return response?.data || response;
  },

  /**
   * Get technical report dossier.
   * @param {string} jobId
   */
  getReport: async (jobId) => {
    const response = await apiClient.get(`/manual-analysis/${jobId}/report`);
    return response?.data || response;
  },

  /**
   * Phase 14: Developer Mode - Compare optical models side-by-side on the same image.
   * @param {string} jobId
   * @param {{ threshold?: number }} [options]
   */
  compareModels: async (jobId, options = {}) => {
    const response = await apiClient.post(`/manual-analysis/${jobId}/compare-models`, options);
    return response?.data || response;
  },

  /**
   * Phase 15: Execute downstream geospatial investigation for georeferenced GeoTIFF spills.
   * @param {string} jobId
   */
  investigateSpill: async (jobId) => {
    const response = await apiClient.post(`/manual-analysis/${jobId}/investigate`);
    return response?.data || response;
  },

  /**
   * Phase 16.4 Part 6: Multi-format exports
   */
  exportJson: async (jobId) => {
    const response = await apiClient.get(`/manual-analysis/${jobId}/export/json`);
    return response?.data || response;
  },

  exportGeoJson: async (jobId) => {
    const response = await apiClient.get(`/manual-analysis/${jobId}/export/geojson`);
    return response?.data || response;
  },

  exportReport: async (jobId, format = 'markdown') => {
    const response = await apiClient.get(`/manual-analysis/${jobId}/export/report`, {
      params: { format },
      responseType: format === 'json' ? 'json' : 'text',
    });
    return response?.data || response;
  },

  exportManifest: async (jobId) => {
    const response = await apiClient.get(`/manual-analysis/${jobId}/export/manifest`);
    return response?.data || response;
  },

  /**
   * Export download URLs for direct browser downloading.
   */
  getExportJsonUrl: (jobId) => `${API_BASE}/manual-analysis/${jobId}/export/json`,
  getExportGeoJsonUrl: (jobId) => `${API_BASE}/manual-analysis/${jobId}/export/geojson`,
  getExportReportUrl: (jobId) => `${API_BASE}/manual-analysis/${jobId}/export/report`,
  getExportManifestUrl: (jobId) => `${API_BASE}/manual-analysis/${jobId}/export/manifest`,

  /**
   * Artifact URLs for visual rendering in UI.
   */
  getMaskUrl: (jobId) => `${API_BASE}/manual-analysis/${jobId}/mask`,
  getAnnotatedUrl: (jobId) => `${API_BASE}/manual-analysis/${jobId}/annotated`,
  getOverlayUrl: (jobId) => `${API_BASE}/manual-analysis/${jobId}/overlay`,
  getProbabilityUrl: (jobId) => `${API_BASE}/manual-analysis/${jobId}/probability-map`,
  getOriginalUrl: (jobId) => `${API_BASE}/manual-analysis/${jobId}/original`,
  getPreviewUrl: (jobId) => `${API_BASE}/manual-analysis/${jobId}/preview`,
  getChannel1PreviewUrl: (jobId) => `${API_BASE}/manual-analysis/${jobId}/channel1-preview`,
  getChannel2PreviewUrl: (jobId) => `${API_BASE}/manual-analysis/${jobId}/channel2-preview`,
  getVvUrl: (jobId) => `${API_BASE}/manual-analysis/${jobId}/vv`,
  getVhUrl: (jobId) => `${API_BASE}/manual-analysis/${jobId}/vh`,
};

export default manualAnalysisApi;

