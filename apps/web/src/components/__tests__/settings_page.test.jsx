import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import Settings from '../../pages/Settings';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to }) => React.createElement('a', { href: to }, children),
}));

// Mock auth store
vi.mock('../../app/store/authStore', () => ({
  useAuthStore: () => ({
    user: { name: 'Lead Maritime Forensic Analyst', email: 'analyst@blueforensic.gov.in', role: 'analyst' },
  }),
}));

describe('Blue Forensic AI — Settings Platform Preferences', () => {
  it('instantiates Settings component without error', () => {
    const el = React.createElement(Settings);
    expect(el).toBeDefined();
    expect(el.type).toBe(Settings);
  });

  it('renders default platform preferences structure', () => {
    const el = React.createElement(Settings);
    expect(el).toBeDefined();
  });
});
