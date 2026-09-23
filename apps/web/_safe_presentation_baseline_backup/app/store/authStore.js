import { create } from 'zustand';
import { authApi } from '../../api/auth.api';

export const useAuthStore = create((set, get) => ({
  token: localStorage.getItem('oil_spill_token') || null,
  user: JSON.parse(localStorage.getItem('oil_spill_user') || 'null'),
  isAuthenticated: Boolean(localStorage.getItem('oil_spill_token')),
  isLoading: false,
  error: null,

  /**
   * Log in user with email & password
   */
  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.login({ email, password });
      const { token, user } = response.data;

      localStorage.setItem('oil_spill_token', token);
      localStorage.setItem('oil_spill_user', JSON.stringify(user));

      set({
        token,
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
      return user;
    } catch (err) {
      set({
        isLoading: false,
        error: err.message || 'Login failed',
        isAuthenticated: false,
      });
      throw err;
    }
  },

  /**
   * Log out user
   */
  logout: () => {
    localStorage.removeItem('oil_spill_token');
    localStorage.removeItem('oil_spill_user');
    set({
      token: null,
      user: null,
      isAuthenticated: false,
      error: null,
    });
  },

  /**
   * Initialize and verify existing auth session
   */
  initializeAuth: async () => {
    const token = localStorage.getItem('oil_spill_token');
    if (!token) {
      set({ isAuthenticated: false, user: null });
      return;
    }

    try {
      const response = await authApi.getMe();
      const user = response.data;
      localStorage.setItem('oil_spill_user', JSON.stringify(user));
      set({ user, isAuthenticated: true });
    } catch {
      // If token expired or invalid, clear
      localStorage.removeItem('oil_spill_token');
      localStorage.removeItem('oil_spill_user');
      set({ token: null, user: null, isAuthenticated: false });
    }
  },
}));
