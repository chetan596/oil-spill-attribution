import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach JWT Token if present
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('oil_spill_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Unwrap response data & handle 401
apiClient.interceptors.response.use(
  (response) => {
    // Return backend payload directly ({ success, data, error })
    return response.data;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('oil_spill_token');
      localStorage.removeItem('oil_spill_user');
      // If we are not on login page, redirect to login
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    const backendMessage = error.response?.data?.error?.message || error.message || 'API request failed';
    const customError = new Error(backendMessage);
    customError.status = error.response?.status;
    customError.code = error.response?.data?.error?.code;
    customError.details = error.response?.data?.error?.details;
    return Promise.reject(customError);
  }
);

export default apiClient;
