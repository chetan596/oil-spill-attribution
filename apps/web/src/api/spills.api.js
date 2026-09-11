import apiClient from './client';

export const spillsApi = {
  list: (params) => apiClient.get('/spills', { params }),
  getById: (id) => apiClient.get(`/spills/${id}`),
};
