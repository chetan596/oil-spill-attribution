import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../app/store/authStore';
import {
  LayoutGrid,
  PlusCircle,
  FileText,
  Settings,
  Activity,
  LogOut,
  ChevronRight,
  ChevronLeft,
  Scan,
} from 'lucide-react';

const STORAGE_KEY = 'ocean-guard-sidebar-expanded';

export default function AppSidebar({ onOpenSystemStatus }) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  // Initialize state from localStorage (defaults to false / collapsed)
  const [isExpanded, setIsExpanded] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggleExpanded = () => {
    setIsExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Ignore storage errors in restricted contexts
      }
      return next;
    });
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/dashboard', label: 'Overview', icon: LayoutGrid, exact: true },
    { to: '/analysis/new', label: 'New Mission', icon: PlusCircle },
    { to: '/analysis/manual', label: 'Manual SAR Analysis', icon: Scan },
    { to: '/reports', label: 'Dossier Archive', icon: FileText },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav
      style={{
        width: isExpanded ? '232px' : '56px',
        backgroundColor: '#0A0B0D',
        borderRight: '1px solid rgba(255, 255, 255, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'space-between',
        padding: isExpanded ? '14px 10px' : '14px 0',
        flexShrink: 0,
        zIndex: 40,
        userSelect: 'none',
        boxSizing: 'border-box',
        transition: 'width 200ms ease-out, padding 200ms ease-out',
        overflow: 'hidden',
      }}
      aria-label="Primary Tactical Navigation"
    >
      {/* Top Header: Brand Mark + Toggle Button + Navigation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%' }}>
        {/* Brand & Toggle Container */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: isExpanded ? 'space-between' : 'center',
            padding: isExpanded ? '0 4px' : '0',
            height: '32px',
            position: 'relative',
          }}
        >
          {/* Brand Mark (OG Monogram) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div
              title="Blue Forensic AI"
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                backgroundColor: 'var(--og-surface-elevated, #1D2025)',
                border: '1px solid var(--og-border-strong, #343940)',
                color: 'var(--og-text-primary, #ECEEF1)',
                fontWeight: 700,
                fontSize: '11.5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                letterSpacing: '-0.02em',
                cursor: 'default',
                flexShrink: 0,
              }}
            >
              BF
            </div>

            {/* Expanded Product Text */}
            {isExpanded && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                }}
              >
                <span
                  style={{
                    fontFamily: "'Hanken Grotesk', sans-serif",
                    fontWeight: 700,
                    fontSize: '13.5px',
                    color: '#FFFFFF',
                    letterSpacing: '-0.01em',
                    lineHeight: 1.2,
                  }}
                >
                  Blue Forensic AI
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    color: '#828282',
                    fontWeight: 500,
                    lineHeight: 1.2,
                  }}
                >
                  Spill Intelligence
                </span>
              </div>
            )}
          </div>

          {/* Expand / Collapse Toggle Button */}
          <button
            type="button"
            onClick={toggleExpanded}
            title={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-expanded={isExpanded}
            style={{
              width: isExpanded ? '24px' : '22px',
              height: isExpanded ? '24px' : '22px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isExpanded ? 'var(--og-surface-raised, #171A1E)' : 'transparent',
              border: '1px solid var(--og-border, #25292F)',
              color: 'var(--og-text-muted, #777E87)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              outline: 'none',
              padding: 0,
              flexShrink: 0,
              margin: isExpanded ? '0' : '0 auto',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--og-text-primary, #ECEEF1)';
              e.currentTarget.style.backgroundColor = 'var(--og-surface-elevated, #1D2025)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--og-text-muted, #777E87)';
              e.currentTarget.style.backgroundColor = isExpanded ? 'var(--og-surface-raised, #171A1E)' : 'transparent';
            }}
          >
            {isExpanded ? <ChevronLeft size={14} /> : <ChevronRight size={13} />}
          </button>
        </div>

        {/* Subtle Divider */}
        <div
          style={{
            height: '1px',
            backgroundColor: 'var(--og-border-subtle, rgba(255, 255, 255, 0.055))',
            margin: isExpanded ? '0 4px' : '0 auto',
            width: isExpanded ? 'calc(100% - 8px)' : '24px',
            transition: 'width 200ms ease-out',
          }}
        />

        {/* Navigation Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);

            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={!isExpanded ? item.label : undefined}
                style={{
                  height: '38px',
                  borderRadius: 'var(--og-radius-base, 8px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: isExpanded ? 'flex-start' : 'center',
                  padding: isExpanded ? '0 12px' : '0',
                  gap: isExpanded ? '12px' : '0',
                  backgroundColor: isActive ? 'var(--og-surface-elevated, #1D2025)' : 'transparent',
                  border: isActive ? '1px solid var(--og-border-strong, #343940)' : '1px solid transparent',
                  color: isActive ? 'var(--og-text-primary, #ECEEF1)' : 'var(--og-text-muted, #777E87)',
                  transition: 'all 0.15s ease',
                  textDecoration: 'none',
                  cursor: 'pointer',
                  width: isExpanded ? '100%' : '38px',
                  margin: isExpanded ? '0' : '0 auto',
                  boxSizing: 'border-box',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = 'var(--og-text-primary, #ECEEF1)';
                    e.currentTarget.style.backgroundColor = 'var(--og-surface-raised, #171A1E)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = 'var(--og-text-muted, #777E87)';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={18} style={{ flexShrink: 0 }} />
                {isExpanded && (
                  <span
                    style={{
                      fontSize: '12.5px',
                      fontWeight: isActive ? 600 : 500,
                      color: isActive ? '#FFFFFF' : '#DCDCDC',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {item.label}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
      </div>

      {/* Bottom Controls: System Status Inspector & Logout */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
        {/* System Status Modal Trigger */}
        <button
          type="button"
          onClick={onOpenSystemStatus}
          title={!isExpanded ? 'System Status' : undefined}
          style={{
            height: '38px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: isExpanded ? 'flex-start' : 'center',
            padding: isExpanded ? '0 12px' : '0',
            gap: isExpanded ? '12px' : '0',
            backgroundColor: 'transparent',
            border: '1px solid transparent',
            color: '#828282',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            width: isExpanded ? '100%' : '38px',
            margin: isExpanded ? '0' : '0 auto',
            boxSizing: 'border-box',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--og-text-primary, #ECEEF1)';
            e.currentTarget.style.backgroundColor = 'var(--og-surface-raised, #171A1E)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--og-text-muted, #777E87)';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          aria-label="Open System Status"
        >
          <Activity size={18} style={{ flexShrink: 0 }} />
          {isExpanded && (
            <span
              style={{
                fontSize: '12.5px',
                fontWeight: 500,
                color: 'var(--og-text-primary, #ECEEF1)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              System Status
            </span>
          )}
        </button>

        {/* Logout Button */}
        <button
          type="button"
          onClick={handleLogout}
          title={!isExpanded ? 'Sign Out' : undefined}
          style={{
            height: '38px',
            borderRadius: 'var(--og-radius-base, 8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: isExpanded ? 'flex-start' : 'center',
            padding: isExpanded ? '0 12px' : '0',
            gap: isExpanded ? '12px' : '0',
            backgroundColor: 'transparent',
            border: '1px solid transparent',
            color: 'var(--og-text-muted, #777E87)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            width: isExpanded ? '100%' : '38px',
            margin: isExpanded ? '0' : '0 auto',
            boxSizing: 'border-box',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--og-error, #F87171)';
            e.currentTarget.style.backgroundColor = 'var(--og-error-subtle, rgba(248, 113, 113, 0.10))';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--og-text-muted, #777E87)';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          aria-label="Sign Out"
        >
          <LogOut size={18} style={{ flexShrink: 0 }} />
          {isExpanded && (
            <span
              style={{
                fontSize: '12.5px',
                fontWeight: 500,
                color: 'var(--og-text-primary, #ECEEF1)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              Logout
            </span>
          )}
        </button>
      </div>
    </nav>
  );
}
