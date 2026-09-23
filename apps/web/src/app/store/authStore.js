import { create } from 'zustand';
import { authApi } from '../../api/auth.api';

const getInitialToken = () => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem('oil_spill_token') : null;
  } catch {
    return null;
  }
};

const getInitialUser = () => {
  try {
    return typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('oil_spill_user') || 'null') : null;
  } catch {
    return null;
  }
};

export const useAuthStore = create((set, get) => ({
  token: getInitialToken(),
  user: getInitialUser(),
  isAuthenticated: Boolean(getInitialToken()),
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

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('oil_spill_token', token);
        localStorage.setItem('oil_spill_user', JSON.stringify(user));
      }

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
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('oil_spill_token');
      localStorage.removeItem('oil_spill_user');
    }
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
    const token = getInitialToken();
    if (!token) {
      set({ isAuthenticated: false, user: null });
      return;
    }

    try {
      const response = await authApi.getMe();
      const user = response.data;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('oil_spill_user', JSON.stringify(user));
      }
      set({ user, isAuthenticated: true });
    } catch {
      // If token expired or invalid, clear
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('oil_spill_token');
        localStorage.removeItem('oil_spill_user');
      }
      set({ token: null, user: null, isAuthenticated: false });
    }
  },
}));
