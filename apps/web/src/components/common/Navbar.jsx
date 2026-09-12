import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../app/store/authStore';
import { Shield, PlusCircle, LayoutDashboard, FileText, LogOut, Radio, Database } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header
      style={{
        height: '60px',
        backgroundColor: '#0a0f1d',
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 1000,
      }}
      role="banner"
    >
      {/* Brand & Demo Scenario Indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #0284c7, #38bdf8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#020617',
              boxShadow: '0 0 12px rgba(56, 189, 248, 0.3)',
            }}
          >
            <Shield size={20} />
          </div>
          <div>
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#f8fafc', letterSpacing: '-0.02em' }}>
              AETHELIS <span style={{ color: '#38bdf8', fontSize: '0.75rem', fontWeight: 600 }}>SIH26143</span>
            </span>
            <span style={{ display: 'block', fontSize: '0.68rem', color: '#64748b', lineHeight: 1 }}>
              Oil Spill Detection & Attribution
            </span>
          </div>
        </div>

        {/* Demo Scenario Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.7rem',
            color: '#cbd5e1',
            background: 'rgba(30, 41, 59, 0.8)',
            border: '1px solid #334155',
            padding: '3px 8px',
            borderRadius: '12px',
          }}
          title="Active demonstration scene loaded from database"
        >
          <Database size={11} style={{ color: '#38bdf8' }} />
          <span>SCENARIO: <strong style={{ color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>demo-scene-001</strong></span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav style={{ display: 'flex', gap: '8px' }} aria-label="Main Navigation">
        <NavLink
          to="/dashboard"
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '6px',
            fontSize: '0.85rem',
            fontWeight: 500,
            textDecoration: 'none',
            color: isActive ? '#38bdf8' : '#94a3b8',
            background: isActive ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
            border: isActive ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid transparent',
            transition: 'all 0.15s ease',
          })}
        >
          <LayoutDashboard size={16} />
          <span>Dashboard</span>
        </NavLink>

        <NavLink
          to="/analysis/new"
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '6px',
            fontSize: '0.85rem',
            fontWeight: 500,
            textDecoration: 'none',
            color: isActive ? '#38bdf8' : '#94a3b8',
            background: isActive ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
            border: isActive ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid transparent',
            transition: 'all 0.15s ease',
          })}
        >
          <PlusCircle size={16} />
          <span>New Analysis</span>
        </NavLink>

        <NavLink
          to="/reports"
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '6px',
            fontSize: '0.85rem',
            fontWeight: 500,
            textDecoration: 'none',
            color: isActive ? '#38bdf8' : '#94a3b8',
            background: isActive ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
            border: isActive ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid transparent',
            transition: 'all 0.15s ease',
          })}
        >
          <FileText size={16} />
          <span>Investigation Dossiers</span>
        </NavLink>
      </nav>

      {/* User Info & Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.72rem',
            color: '#10b981',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            padding: '4px 8px',
            borderRadius: '12px',
          }}
        >
          <Radio size={11} style={{ animation: 'pulse 1.5s infinite' }} />
          <span>System Online</span>
        </div>

        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#f8fafc' }}>{user.name || user.email}</div>
              <div style={{ fontSize: '0.68rem', color: '#38bdf8', fontWeight: 600 }}>{user.role || 'ANALYST'}</div>
            </div>
            <button
              onClick={handleLogout}
              aria-label="Log Out of System"
              title="Log Out"
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#f87171',
                padding: '6px 8px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s',
              }}
            >
              <LogOut size={15} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
