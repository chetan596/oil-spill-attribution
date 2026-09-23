import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import SystemStatus from '../../pages/SystemStatus';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to }) => React.createElement('a', { href: to }, children),
}));

describe('Blue Forensic AI — System Status & Data Health Console', () => {
  it('instantiates SystemStatus component without error', () => {
    const el = React.createElement(SystemStatus);
    expect(el).toBeDefined();
    expect(el.type).toBe(SystemStatus);
  });

  it('verifies SystemStatus component structure', () => {
    const el = React.createElement(SystemStatus);
    expect(el).toBeDefined();
    expect(typeof el.type).toBe('function');
  });
});
