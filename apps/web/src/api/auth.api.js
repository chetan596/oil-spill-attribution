import apiClient from './client';

export const authApi = {
  /**
   * POST /api/v1/auth/login
   * @param {{ email: string, password: string }} credentials
   * @returns {Promise<{ success: boolean, data: { token: string, user: object } }>}
   */
  login: (credentials) => apiClient.post('/auth/login', credentials),

  /**
   * GET /api/v1/auth/me
   * @returns {Promise<{ success: boolean, data: object }>}
   */
  getMe: () => apiClient.get('/auth/me'),
};
