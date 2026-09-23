import apiClient from './client';

export const sentinel1Api = {
  /**
   * GET /api/v1/sentinel1/aois
   * List named maritime Areas of Interest
   */
  getAois: async () => {
    const response = await apiClient.get('/sentinel1/aois');
    if (!response) {
      throw new Error('Malformed or empty response from AOI registry service');
    }
    const aois = Array.isArray(response)
      ? response
      : (Array.isArray(response.data)
        ? response.data
        : (Array.isArray(response.data?.data)
          ? response.data.data
          : []));
    return {
      success: response.success !== false,
      data: aois,
      count: aois.length,
    };
  },

  /**
   * GET /api/v1/sentinel1/search
   * Search Copernicus Data Space Ecosystem STAC catalogue
   */
  searchAcquisitions: async (params) => {
    const response = await apiClient.get('/sentinel1/search', { params });
    if (!response) {
      throw new Error('Received empty response from Copernicus Catalogue search');
    }
    const payload = (response.data && (response.data.results || Array.isArray(response.data)))
      ? response.data
      : response;

    const rawResults = payload.results || payload.products || (Array.isArray(payload) ? payload : []);
    const results = Array.isArray(rawResults) ? rawResults : [];

    const isLiveVerified = payload.isLiveVerified ?? response.isLiveVerified ?? (results.length > 0);
    const source = payload.source || response.source || 'COPERNICUS_DATA_SPACE';
    const totalFound = typeof payload.totalFound === 'number'
      ? payload.totalFound
      : (typeof payload.count === 'number' ? payload.count : results.length);

    return {
      source,
      isLiveVerified,
      query: payload.query || response.query || params || {},
      totalFound,
      results,
      products: results,
      data: {
        results,
        products: results,
        totalFound,
        source,
        isLiveVerified,
      },
    };
  },

  /**
   * GET /api/v1/sentinel1/products/:productId
   * Retrieve normalized product metadata
   */
  getProduct: async (productId) => {
    const response = await apiClient.get(`/sentinel1/products/${encodeURIComponent(productId)}`);
    if (!response) {
      throw new Error(`Product not found or empty response for product: ${productId}`);
    }
    const product = response.product || response.data || response;
    return {
      success: response.success !== false,
      product,
      data: product,
    };
  },

  /**
   * POST /api/v1/sentinel1/download
   * Request product download and staging
   */
  downloadProduct: async (productId, options = {}) => {
    const response = await apiClient.post('/sentinel1/download', { productId, options });
    if (!response) {
      throw new Error('Product download service returned empty response');
    }
    const payload = response.data || response;
    return {
      success: response.success !== false,
      data: payload,
      ...payload,
    };
  },

  /**
   * POST /api/v1/sentinel1/process
   * Trigger analysis pipeline on real Sentinel-1 acquisition
   */
  processAcquisition: async (payload) => {
    const response = await apiClient.post('/sentinel1/process', payload);
    if (!response) {
      throw new Error('Pipeline dispatch returned empty response');
    }
    const jobId = response.jobId || response.data?.jobId;
    const analysisId = response.analysisId || response.data?.analysisId;
    if (!jobId) {
      throw new Error('Pipeline dispatch failed: No jobId returned by analysis service');
    }
    const resultPayload = {
      success: true,
      jobId,
      analysisId,
      sceneId: response.sceneId || response.data?.sceneId || payload?.sarSceneId || payload?.productId,
      source: response.source || response.data?.source || 'COPERNICUS_DATA_SPACE',
      message: response.message || response.data?.message || 'Analysis job dispatched for real Sentinel-1 acquisition',
    };
    return {
      ...resultPayload,
      data: resultPayload,
    };
  },
};
