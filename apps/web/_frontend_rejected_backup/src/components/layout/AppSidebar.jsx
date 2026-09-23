import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../app/store/authStore';
import {
  Compass,
  LayoutDashboard,
  Satellite,
  PlusCircle,
  Ship,
  FileText,
  Activity,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Shield,
  Radio,
  Sliders,
  Database,
  Waves,
} from 'lucide-react';

export default function AppSidebar({ isCollapsed, setIsCollapsed, onOpenSystemStatus }) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
    { to: '/analysis/new', label: 'New Mission', icon: PlusCircle },
    { to: '/reports', label: 'Dossier Archive', icon: FileText },
  ];

  return (
    <aside
      className="og-sidebar"
      style={{
        width: isCollapsed ? '64px' : '230px',
        backgroundColor: 'var(--og-bg-surface)',
        borderRight: '1px solid var(--og-border-default)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        flexShrink: 0,
        zIndex: 100,
        userSelect: 'none',
      }}
      aria-label="Tactical Operational Navigation"
    >
      {/* Top Branding Section */}
      <div>
        <div
          style={{
            height: '52px',
            borderBottom: '1px solid var(--og-border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'space-between',
            padding: isCollapsed ? '0' : '0 14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: 'var(--og-radius-sm)',
                backgroundColor: '#14382e',
                border: '1px solid #2a6152',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--og-observed)',
                flexShrink: 0,
              }}
            >
              <Compass size={16} />
            </div>
            {!isCollapsed && (
              <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--og-text-primary)', letterSpacing: '-0.02em' }}>
                  Ocean Guard AI
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--og-text-muted)', lineHeight: 1 }}>
                  Spill Intelligence <span style={{ color: 'var(--og-observed)', fontFamily: 'var(--og-font-mono)' }}>v0.9β</span>
                </div>
              </div>
            )}
          </div>

          {!isCollapsed && (
            <button
              onClick={() => setIsCollapsed(true)}
              className="og-btn og-btn-secondary"
              style={{ padding: '4px', border: 'none', background: 'transparent' }}
              title="Collapse Sidebar"
              aria-label="Collapse Sidebar"
            >
              <ChevronLeft size={14} />
            </button>
          )}
        </div>

        {/* Navigation Item Links */}
        <nav style={{ padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                title={isCollapsed ? item.label : undefined}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: isCollapsed ? '8px 0' : '8px 10px',
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                  borderRadius: 'var(--og-radius-sm)',
                  fontSize: '0.8125rem',
                  fontWeight: isActive ? 600 : 500,
                  textDecoration: 'none',
                  color: isActive ? 'var(--og-text-primary)' : 'var(--og-text-secondary)',
                  backgroundColor: isActive ? 'var(--og-bg-elevated)' : 'transparent',
                  border: isActive ? '1px solid var(--og-border-strong)' : '1px solid transparent',
                  transition: 'all 0.12s ease',
                })}
              >
                <Icon size={16} style={{ color: 'var(--og-observed)', flexShrink: 0 }} />
                {!isCollapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Bottom Operational Status & User Profile */}
      <div style={{ borderTop: '1px solid var(--og-border-default)', padding: '10px 8px' }}>
        {/* System Status Quick Trigger */}
        <button
          onClick={onOpenSystemStatus}
          className="og-btn og-btn-secondary"
          style={{
            width: '100%',
            justifyContent: isCollapsed ? 'center' : 'space-between',
            padding: isCollapsed ? '8px 0' : '6px 10px',
            marginBottom: '8px',
            fontSize: '0.75rem',
          }}
          title="Open System & Pipeline Status"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Radio size={13} style={{ color: 'var(--og-operational)' }} />
            {!isCollapsed && <span>System Status</span>}
          </div>
          {!isCollapsed && <span className="og-badge og-badge-observed">Online</span>}
        </button>

        {isCollapsed ? (
          <button
            onClick={() => setIsCollapsed(false)}
            className="og-btn og-btn-secondary"
            style={{ width: '100%', padding: '6px 0', justifyContent: 'center' }}
            title="Expand Sidebar"
            aria-label="Expand Sidebar"
          >
            <ChevronRight size={14} />
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px' }}>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--og-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.name || user?.email || 'Analyst Session'}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--og-observed)', fontFamily: 'var(--og-font-mono)' }}>
                {user?.role || 'STATION ANALYST'}
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="og-btn og-btn-danger"
              style={{ padding: '5px 7px' }}
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut size={13} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
aria - label="Sign Out"
  >
  <LogOut size={17} />
        </button >
      </div >
    </nav >
  );
}


