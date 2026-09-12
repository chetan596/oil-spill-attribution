import apiClient from './client';

export const vesselsApi = {
  /**
   * GET /api/v1/vessels/:mmsi/track
   * @param {string} mmsi - Vessel MMSI
   * @param {{ startTime?: string, endTime?: string }} [params]
   * @returns {Promise<{ success: boolean, data: { vessel: object, trackPoints: Array, count: number } }>}
   */
  getTrack: (mmsi, params = {}) => apiClient.get(`/vessels/${mmsi}/track`, { params }),
};
