import apiClient from './client';

export const vesselsApi = {
  list: (params) => apiClient.get('/vessels', { params }),
  getAttribution: (spillId) => apiClient.get(`/vessels/attribution/${spillId}`),
};
