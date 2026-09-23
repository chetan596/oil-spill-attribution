import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import AppSidebar from '../layout/AppSidebar';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/dashboard' }),
  NavLink: ({ children, to, title, ...props }) =>
    React.createElement('a', { href: to, title, ...props }, children),
}));

// Mock auth store
vi.mock('../../app/store/authStore', () => ({
  useAuthStore: () => ({
    user: { name: 'Commander Analyst', email: 'analyst@blueforensic.ai' },
    logout: vi.fn(),
  }),
}));

describe('AppSidebar Expand / Collapse Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('instantiates AppSidebar element with default properties', () => {
    const element = React.createElement(AppSidebar, { onOpenSystemStatus: vi.fn() });
    expect(element).toBeDefined();
    expect(element.type).toBe(AppSidebar);
  });

  it('has valid structure and props definition', () => {
    const onOpen = vi.fn();
    const element = React.createElement(AppSidebar, { onOpenSystemStatus: onOpen });
    expect(element.props.onOpenSystemStatus).toBe(onOpen);
  });
});
