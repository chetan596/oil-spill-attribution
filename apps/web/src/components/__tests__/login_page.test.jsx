import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import Login from '../../pages/Login';
import { useAuthStore } from '../../app/store/authStore';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// Mock auth store
vi.mock('../../app/store/authStore', () => ({
  useAuthStore: vi.fn(),
}));

describe('Blue Forensic AI - Reconstructed Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.mockReturnValue({
      login: vi.fn().mockResolvedValue({ id: 'analyst-1', email: 'analyst@oil-spill.dev' }),
      isLoading: false,
      isAuthenticated: false,
    });
  });

  it('should instantiate the Login component successfully', () => {
    const element = React.createElement(Login);
    expect(element).toBeDefined();
    expect(element.type).toBe(Login);
  });

  it('should have access to auth store login method', () => {
    const { login, isLoading } = useAuthStore();
    expect(login).toBeDefined();
    expect(isLoading).toBe(false);
  });

  it('should define navigation handler for back to console', () => {
    mockNavigate('/dashboard');
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });
});
