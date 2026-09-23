import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../app/store/authStore';
import {
  Sliders,
  Eye,
  Shield,
  Bell,
  Database,
  RotateCcw,
  CheckCircle2,
  User,
  ArrowRight,
  Server,
  Globe,
} from 'lucide-react';

const STORAGE_KEY = 'ocean_guard_settings_v1';
const SIDEBAR_STORAGE_KEY = 'ocean-guard-sidebar-expanded';

const DEFAULT_SETTINGS = {
  defaultHindcastHours: 24,
  sarConfidenceThreshold: 0.50,
  defaultScenario: 'demo-scene-001',
  defaultWorkspaceTab: 'overview', // 'overview' | 'sar' | 'drift' | 'ais' | 'timeline'
  autoOpenAnalysis: true,
  highContrastHud: true,
  showProvenanceBadges: true,
  coordinateFormat: 'decimal', // 'decimal' | 'dms'
  interfaceDensity: 'comfortable', // 'compact' | 'comfortable'
  telemetryPollInterval: 15,
  diagnosticVerbosity: 'standard', // 'minimal' | 'standard' | 'verbose'
  enableMissionAlerts: true,
  enableAcquisitionAlerts: true,
  enableAnomalyAlerts: true,
  enableSystemWarnings: true,
};

export default function Settings() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('general'); // 'general' | 'investigation' | 'provenance' | 'interface' | 'alerts' | 'system'

  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [savedFeedback, setSavedFeedback] = useState(false);

  const updateSetting = (key, value) => {
    setSettings((prev) => {
      const updated = { ...prev, [key]: value };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (err) {
        console.warn('Failed to save settings to localStorage:', err);
      }
      return updated;
    });
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2000);
  };

  const handleSidebarToggle = (expanded) => {
    setSidebarExpanded(expanded);
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(expanded));
    } catch {}
  };

  const handleResetDefaults = () => {
    setSettings(DEFAULT_SETTINGS);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
    } catch {}
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2000);
  };

  const navTabs = [
    { id: 'general', label: 'OPERATOR PROFILE', icon: User },
    { id: 'investigation', label: 'INVESTIGATION DEFAULTS', icon: Sliders },
    { id: 'provenance', label: 'DATA & PROVENANCE', icon: Database },
    { id: 'interface', label: 'INTERFACE & DISPLAY', icon: Eye },
    { id: 'alerts', label: 'ALERTS & NOTIFICATIONS', icon: Bell },
    { id: 'system', label: 'SYSTEM CONNECTIONS', icon: Server },
  ];

  return (
    <div
      style={{
        backgroundColor: 'var(--og-bg)',
        color: 'var(--og-text-primary)',
        minHeight: '100%',
        padding: '24px 32px 48px',
        boxSizing: 'border-box',
        fontFamily: 'var(--og-font-body)',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* ============================================================ */}
        {/* 1. COMPACT PAGE HEADER                                      */}
        {/* ============================================================ */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
            paddingBottom: 16,
            borderBottom: '1px solid var(--og-border)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Link
                to="/dashboard"
                style={{
                  color: 'var(--og-violet)',
                  fontSize: 11,
                  fontFamily: 'var(--og-font-mono)',
                  textDecoration: 'none',
                  letterSpacing: '0.08em',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                ← OVERVIEW
              </Link>
              <span style={{ color: 'var(--og-border-strong)' }}>|</span>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--og-font-mono)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--og-text-secondary)',
                  background: 'var(--og-surface-raised)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: '1px solid var(--og-border)',
                }}
              >
                SYSTEM CONFIGURATION
              </span>
            </div>

            <h1
              style={{
                fontSize: 22,
                fontWeight: 600,
                margin: 0,
                color: 'var(--og-text-primary)',
                fontFamily: 'var(--og-font-display)',
                letterSpacing: '-0.02em',
              }}
            >
              SETTINGS
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--og-text-muted)', maxWidth: 650 }}>
              Configure operator preferences, investigation defaults, data presentation and workstation behavior.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                backgroundColor: 'var(--og-surface)',
                border: '1px solid var(--og-border)',
                fontSize: 11,
                fontFamily: 'var(--og-font-mono)',
                color: 'var(--og-success)',
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: 'var(--og-success)',
                }}
              />
              SYSTEM READY
            </div>

            {savedFeedback && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  fontFamily: 'var(--og-font-mono)',
                  color: 'var(--og-success)',
                  backgroundColor: 'rgba(74, 222, 128, 0.1)',
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(74, 222, 128, 0.25)',
                }}
              >
                <CheckCircle2 size={13} />
                <span>CHANGES SAVED</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleResetDefaults}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 12px',
                borderRadius: 8,
                backgroundColor: 'transparent',
                border: '1px solid var(--og-border-strong)',
                color: 'var(--og-text-primary)',
                fontSize: 11,
                fontFamily: 'var(--og-font-body)',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--og-surface-raised)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <RotateCcw size={13} />
              <span>RESET DEFAULTS</span>
            </button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* 2. SETTINGS TAB NAVIGATION                                   */}
        {/* ============================================================ */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            overflowX: 'auto',
            paddingBottom: 4,
            borderBottom: '1px solid var(--og-border)',
          }}
        >
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  borderRadius: 8,
                  backgroundColor: isActive ? 'var(--og-surface-raised)' : 'transparent',
                  border: isActive ? '1px solid var(--og-border-strong)' : '1px solid transparent',
                  color: isActive ? 'var(--og-text-primary)' : 'var(--og-text-muted)',
                  fontSize: 11,
                  fontFamily: 'var(--og-font-body)',
                  fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'var(--og-surface)';
                    e.currentTarget.style.color = 'var(--og-text-secondary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'var(--og-text-muted)';
                  }
                }}
              >
                <Icon size={14} style={{ color: isActive ? 'var(--og-violet)' : 'currentColor' }} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ============================================================ */}
        {/* 3. SETTINGS CONTENT PANELS                                   */}
        {/* ============================================================ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* TAB 1: GENERAL / OPERATOR PROFILE */}
          {activeTab === 'general' && (
            <div
              style={{
                backgroundColor: 'var(--og-surface)',
                border: '1px solid var(--og-border)',
                borderRadius: 8,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--og-border)', paddingBottom: 12 }}>
                <User size={16} style={{ color: 'var(--og-violet)' }} />
                <h2 style={{ fontSize: 13, fontFamily: 'var(--og-font-display)', fontWeight: 600, color: 'var(--og-text-primary)', textTransform: 'uppercase', margin: 0 }}>
                  OPERATOR PROFILE & SESSION CONTEXT
                </h2>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: 12,
                  fontSize: 11,
                  fontFamily: 'var(--og-font-body)',
                }}
              >
                <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--og-border)' }}>
                  <div style={{ color: 'var(--og-text-muted)', fontSize: 10, marginBottom: 4, fontFamily: 'var(--og-font-mono)' }}>OPERATOR IDENTITY</div>
                  <div style={{ color: 'var(--og-text-primary)', fontWeight: 600, fontSize: 13 }}>
                    {user?.name || 'Lead Maritime Forensic Analyst'}
                  </div>
                  <div style={{ color: 'var(--og-text-muted)', fontSize: 11, marginTop: 2 }}>{user?.email || 'analyst@blueforensic.gov.in'}</div>
                </div>

                <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--og-border)' }}>
                  <div style={{ color: 'var(--og-text-muted)', fontSize: 10, marginBottom: 4, fontFamily: 'var(--og-font-mono)' }}>OPERATIONAL ROLE</div>
                  <div style={{ color: 'var(--og-teal)', fontWeight: 600, fontSize: 13 }}>
                    {user?.role ? String(user.role).toUpperCase() : 'INCIDENT COMMANDER / ANALYST'}
                  </div>
                  <div style={{ color: 'var(--og-text-muted)', fontSize: 11, marginTop: 2 }}>Maritime Domain Awareness (Tier-3)</div>
                </div>

                <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--og-border)' }}>
                  <div style={{ color: 'var(--og-text-muted)', fontSize: 10, marginBottom: 4, fontFamily: 'var(--og-font-mono)' }}>SESSION STATUS</div>
                  <div style={{ color: 'var(--og-success)', fontWeight: 600, fontSize: 13 }}>
                    AUTHENTICATED (JWT Active)
                  </div>
                  <div style={{ color: 'var(--og-text-muted)', fontSize: 11, marginTop: 2 }}>Encrypted Local Session</div>
                </div>

                <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--og-border)' }}>
                  <div style={{ color: 'var(--og-text-muted)', fontSize: 10, marginBottom: 4, fontFamily: 'var(--og-font-mono)' }}>CLEARANCE LEVEL</div>
                  <div style={{ color: 'var(--og-amber)', fontWeight: 600, fontSize: 13 }}>
                    NATIONAL COASTAL SURVEILLANCE
                  </div>
                  <div style={{ color: 'var(--og-text-muted)', fontSize: 11, marginTop: 2 }}>SIH26143 Certified Workstation</div>
                </div>
              </div>

              <div
                style={{
                  backgroundColor: 'var(--og-surface-recessed)',
                  border: '1px solid var(--og-border)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 11,
                  color: 'var(--og-text-secondary)',
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ color: 'var(--og-teal)' }}>Read-Only Operator Record:</strong> Operator profiles and organizational roles are authenticated against maritime directory servers. Profile adjustments must be authorized through command credentials.
              </div>
            </div>
          )}

          {/* TAB 2: INVESTIGATION DEFAULTS */}
          {activeTab === 'investigation' && (
            <div
              style={{
                backgroundColor: 'var(--og-surface)',
                border: '1px solid var(--og-border)',
                borderRadius: 8,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--og-border)', paddingBottom: 12 }}>
                <Sliders size={16} style={{ color: 'var(--og-violet)' }} />
                <h2 style={{ fontSize: 13, fontFamily: 'var(--og-font-display)', fontWeight: 600, color: 'var(--og-text-primary)', textTransform: 'uppercase', margin: 0 }}>
                  INVESTIGATION PIPELINE DEFAULTS
                </h2>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                {/* Default Scenario */}
                <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: 14, borderRadius: 8, border: '1px solid var(--og-border)' }}>
                  <label style={{ display: 'block', fontSize: 11, fontFamily: 'var(--og-font-body)', fontWeight: 600, color: 'var(--og-text-primary)', marginBottom: 6 }}>
                    DEFAULT OPERATIONAL SCENARIO
                  </label>
                  <select
                    value={settings.defaultScenario}
                    onChange={(e) => updateSetting('defaultScenario', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      backgroundColor: 'var(--og-surface)',
                      border: '1px solid var(--og-border-strong)',
                      borderRadius: 6,
                      color: 'var(--og-text-primary)',
                      fontSize: 12,
                      fontFamily: 'var(--og-font-body)',
                      outline: 'none',
                    }}
                  >
                    <option value="demo-scene-001">001 — Mumbai Offshore Corridor</option>
                    <option value="demo-scene-002">002 — Gulf of Kutch Tanker Lane</option>
                    <option value="demo-scene-003">003 — Paradip Port Approach</option>
                    <option value="demo-scene-004">004 — Goa / Malabar Coastal Transit</option>
                  </select>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--og-text-muted)', marginTop: 6 }}>
                    Benchmark incident pre-loaded upon new mission initialization.
                  </span>
                </div>

                {/* Default Hindcast Window */}
                <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: 14, borderRadius: 8, border: '1px solid var(--og-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontSize: 11, fontFamily: 'var(--og-font-body)', fontWeight: 600, color: 'var(--og-text-primary)' }}>
                      REVERSE HINDCAST WINDOW
                    </label>
                    <span style={{ fontSize: 11, fontFamily: 'var(--og-font-mono)', color: 'var(--og-amber)', fontWeight: 600 }}>
                      {settings.defaultHindcastHours}h Simulation
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 6 }}>
                    {[6, 24, 48, 72].map((hours) => (
                      <button
                        key={hours}
                        type="button"
                        onClick={() => updateSetting('defaultHindcastHours', hours)}
                        style={{
                          padding: '6px 8px',
                          borderRadius: 6,
                          backgroundColor: settings.defaultHindcastHours === hours ? 'var(--og-violet)' : 'var(--og-surface)',
                          color: settings.defaultHindcastHours === hours ? '#FFFFFF' : 'var(--og-text-secondary)',
                          border: settings.defaultHindcastHours === hours ? '1px solid var(--og-violet)' : '1px solid var(--og-border)',
                          fontSize: 11,
                          fontFamily: 'var(--og-font-mono)',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {hours}h {hours === 24 ? '★' : ''}
                      </button>
                    ))}
                  </div>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--og-text-muted)', marginTop: 6 }}>
                    Standard 24h reverse advection window balances MetOcean precision with dispersion limits.
                  </span>
                </div>

                {/* SAR Confidence Threshold */}
                <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: 14, borderRadius: 8, border: '1px solid var(--og-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontSize: 11, fontFamily: 'var(--og-font-body)', fontWeight: 600, color: 'var(--og-text-primary)' }}>
                      SAR DARK-SURFACE THRESHOLD
                    </label>
                    <span style={{ fontSize: 11, fontFamily: 'var(--og-font-mono)', color: 'var(--og-teal)', fontWeight: 600 }}>
                      {Math.round(settings.sarConfidenceThreshold * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.3}
                    max={0.9}
                    step={0.05}
                    value={settings.sarConfidenceThreshold}
                    onChange={(e) => updateSetting('sarConfidenceThreshold', Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--og-teal)', margin: '8px 0' }}
                  />
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--og-text-muted)' }}>
                    Probability cutoff for automated polygon extraction of candidate dark-surface slicks.
                  </span>
                </div>

                {/* Auto-Open Analysis */}
                <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: 14, borderRadius: 8, border: '1px solid var(--og-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 11, fontFamily: 'var(--og-font-body)', fontWeight: 600, color: 'var(--og-text-primary)' }}>
                        AUTO-OPEN ANALYSIS AFTER DISPATCH
                      </div>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--og-text-muted)', marginTop: 2 }}>
                        Automatically route directly to the investigation workspace upon dispatch completion.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.autoOpenAnalysis}
                      onChange={(e) => updateSetting('autoOpenAnalysis', e.target.checked)}
                      style={{ accentColor: 'var(--og-violet)', width: 16, height: 16, cursor: 'pointer' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DATA & PROVENANCE (MANDATORY ISOLATION) */}
          {activeTab === 'provenance' && (
            <div
              style={{
                backgroundColor: 'var(--og-surface)',
                border: '1px solid var(--og-border)',
                borderRadius: 8,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--og-border)', paddingBottom: 12 }}>
                <Database size={16} style={{ color: 'var(--og-teal)' }} />
                <h2 style={{ fontSize: 13, fontFamily: 'var(--og-font-display)', fontWeight: 600, color: 'var(--og-text-primary)', textTransform: 'uppercase', margin: 0 }}>
                  SCIENTIFIC DATA PROVENANCE & REAL CDSE ISOLATION
                </h2>
              </div>

              {/* Provenance Architecture Display */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
                {/* Demo Benchmark Architecture */}
                <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: 16, borderRadius: 8, border: '1px solid var(--og-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--og-text-primary)', fontSize: 12, fontFamily: 'var(--og-font-display)', fontWeight: 600, marginBottom: 10 }}>
                    <Shield size={14} style={{ color: 'var(--og-success)' }} />
                    <span>DEMO BENCHMARK SCENARIOS</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11, fontFamily: 'var(--og-font-body)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--og-text-muted)' }}>SAR Slick:</span>
                      <strong style={{ color: 'var(--og-teal)', fontFamily: 'var(--og-font-mono)' }}>OBSERVED (Sentinel-1)</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--og-text-muted)' }}>Drift Trajectory:</span>
                      <strong style={{ color: 'var(--og-amber)', fontFamily: 'var(--og-font-mono)' }}>MODELLED (Lagrangian)</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--og-text-muted)' }}>AIS Correlation:</span>
                      <strong style={{ color: 'var(--og-violet)', fontFamily: 'var(--og-font-mono)' }}>DEMO CANDIDATES</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--og-text-muted)' }}>MetOcean Forcing:</span>
                      <strong style={{ color: 'var(--og-success)', fontFamily: 'var(--og-font-mono)' }}>DEMO ENVIRONMENTAL</strong>
                    </div>
                  </div>
                </div>

                {/* Real CDSE Architecture */}
                <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: 16, borderRadius: 8, border: '1px solid var(--og-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--og-text-primary)', fontSize: 12, fontFamily: 'var(--og-font-display)', fontWeight: 600, marginBottom: 10 }}>
                    <Globe size={14} style={{ color: 'var(--og-teal)' }} />
                    <span>REAL CDSE STAC INGESTION</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11, fontFamily: 'var(--og-font-body)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--og-text-muted)' }}>SAR Slick:</span>
                      <strong style={{ color: 'var(--og-teal)', fontFamily: 'var(--og-font-mono)' }}>OBSERVED / CDSE STAC</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--og-text-muted)' }}>Drift Trajectory:</span>
                      <strong style={{ color: 'var(--og-text-muted)', fontFamily: 'var(--og-font-mono)' }}>NOT ESTABLISHED</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--og-text-muted)' }}>AIS Correlation:</span>
                      <strong style={{ color: 'var(--og-text-muted)', fontFamily: 'var(--og-font-mono)' }}>NOT ESTABLISHED</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--og-text-muted)' }}>MetOcean Forcing:</span>
                      <strong style={{ color: 'var(--og-teal)', fontFamily: 'var(--og-font-mono)' }}>SOURCE DEPENDENT</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Provenance Tag Display Option */}
              <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: 14, borderRadius: 8, border: '1px solid var(--og-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 11, fontFamily: 'var(--og-font-body)', fontWeight: 600, color: 'var(--og-text-primary)' }}>
                      RENDER SCIENTIFIC PROVENANCE BADGES
                    </div>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--og-text-muted)', marginTop: 2 }}>
                      Enforce explicit evidentiary labels ([OBSERVED], [MODELLED], [DEMO], [CDSE]) across all headers.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.showProvenanceBadges}
                    onChange={(e) => updateSetting('showProvenanceBadges', e.target.checked)}
                    style={{ accentColor: 'var(--og-violet)', width: 16, height: 16, cursor: 'pointer' }}
                  />
                </div>
              </div>

              <div
                style={{
                  backgroundColor: 'rgba(231, 166, 58, 0.08)',
                  border: '1px solid rgba(231, 166, 58, 0.25)',
                  borderRadius: 8,
                  padding: '12px 14px',
                  fontSize: 11,
                  color: 'var(--og-amber)',
                  lineHeight: 1.5,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 2, fontFamily: 'var(--og-font-display)' }}>SCIENTIFIC INTEGRITY RULE:</div>
                Real Copernicus CDSE SAR acquisitions are strictly isolated from synthetic demo AIS candidates and unvalidated drift origins. This non-bypassable policy prevents synthetic evidence leakage into real maritime operations.
              </div>
            </div>
          )}

          {/* TAB 4: INTERFACE & DISPLAY */}
          {activeTab === 'interface' && (
            <div
              style={{
                backgroundColor: 'var(--og-surface)',
                border: '1px solid var(--og-border)',
                borderRadius: 8,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--og-border)', paddingBottom: 12 }}>
                <Eye size={16} style={{ color: 'var(--og-violet)' }} />
                <h2 style={{ fontSize: 13, fontFamily: 'var(--og-font-display)', fontWeight: 600, color: 'var(--og-text-primary)', textTransform: 'uppercase', margin: 0 }}>
                  INTERFACE & WORKSTATION PREFERENCES
                </h2>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
                {/* Sidebar State */}
                <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: 14, borderRadius: 8, border: '1px solid var(--og-border)' }}>
                  <label style={{ display: 'block', fontSize: 11, fontFamily: 'var(--og-font-body)', fontWeight: 600, color: 'var(--og-text-primary)', marginBottom: 6 }}>
                    TACTICAL SIDEBAR MODE
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
                    <button
                      type="button"
                      onClick={() => handleSidebarToggle(false)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        backgroundColor: !sidebarExpanded ? 'var(--og-violet)' : 'var(--og-surface)',
                        color: !sidebarExpanded ? '#FFFFFF' : 'var(--og-text-secondary)',
                        border: !sidebarExpanded ? '1px solid var(--og-violet)' : '1px solid var(--og-border)',
                        fontSize: 11,
                        fontFamily: 'var(--og-font-body)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      Collapsed (56px)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSidebarToggle(true)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        backgroundColor: sidebarExpanded ? 'var(--og-violet)' : 'var(--og-surface)',
                        color: sidebarExpanded ? '#FFFFFF' : 'var(--og-text-secondary)',
                        border: sidebarExpanded ? '1px solid var(--og-violet)' : '1px solid var(--og-border)',
                        fontSize: 11,
                        fontFamily: 'var(--og-font-body)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      Expanded (232px)
                    </button>
                  </div>
                </div>

                {/* Coordinate Format */}
                <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: 14, borderRadius: 8, border: '1px solid var(--og-border)' }}>
                  <label style={{ display: 'block', fontSize: 11, fontFamily: 'var(--og-font-body)', fontWeight: 600, color: 'var(--og-text-primary)', marginBottom: 6 }}>
                    COORDINATE FORMAT
                  </label>
                  <select
                    value={settings.coordinateFormat}
                    onChange={(e) => updateSetting('coordinateFormat', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      backgroundColor: 'var(--og-surface)',
                      border: '1px solid var(--og-border-strong)',
                      borderRadius: 6,
                      color: 'var(--og-text-primary)',
                      fontSize: 12,
                      fontFamily: 'var(--og-font-body)',
                      outline: 'none',
                    }}
                  >
                    <option value="decimal">Decimal Degrees (18.964°N, 72.715°E)</option>
                    <option value="dms">Degrees Minutes Seconds (18°57'50"N, 72°42'54"E)</option>
                  </select>
                </div>

                {/* High Contrast HUD */}
                <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: 14, borderRadius: 8, border: '1px solid var(--og-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 11, fontFamily: 'var(--og-font-body)', fontWeight: 600, color: 'var(--og-text-primary)' }}>
                        HIGH-CONTRAST TACTICAL HUD
                      </div>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--og-text-muted)', marginTop: 2 }}>
                        Sharpen borders and emphasize active telemetry vectors.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.highContrastHud}
                      onChange={(e) => updateSetting('highContrastHud', e.target.checked)}
                      style={{ accentColor: 'var(--og-violet)', width: 16, height: 16, cursor: 'pointer' }}
                    />
                  </div>
                </div>

                {/* Telemetry Refresh Rate */}
                <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: 14, borderRadius: 8, border: '1px solid var(--og-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontSize: 11, fontFamily: 'var(--og-font-body)', fontWeight: 600, color: 'var(--og-text-primary)' }}>
                      AIS POLLING INTERVAL
                    </label>
                    <span style={{ fontSize: 11, fontFamily: 'var(--og-font-mono)', color: 'var(--og-amber)', fontWeight: 600 }}>
                      Every {settings.telemetryPollInterval}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={60}
                    step={5}
                    value={settings.telemetryPollInterval}
                    onChange={(e) => updateSetting('telemetryPollInterval', Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--og-amber)', margin: '8px 0' }}
                  />
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--og-text-muted)' }}>
                    Frequency of client polling for vessel AIS updates.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: ALERTS & NOTIFICATIONS */}
          {activeTab === 'alerts' && (
            <div
              style={{
                backgroundColor: 'var(--og-surface)',
                border: '1px solid var(--og-border)',
                borderRadius: 8,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--og-border)', paddingBottom: 12 }}>
                <Bell size={16} style={{ color: 'var(--og-violet)' }} />
                <h2 style={{ fontSize: 13, fontFamily: 'var(--og-font-display)', fontWeight: 600, color: 'var(--og-text-primary)', textTransform: 'uppercase', margin: 0 }}>
                  OPERATIONAL ALERT & EVENT NOTIFICATIONS
                </h2>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: 14, borderRadius: 8, border: '1px solid var(--og-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 11, fontFamily: 'var(--og-font-body)', fontWeight: 600, color: 'var(--og-text-primary)' }}>
                      MISSION COMPLETION NOTIFICATIONS
                    </div>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--og-text-muted)', marginTop: 2 }}>
                      Alert when SAR segmentation, Lagrangian drift, and AIS candidate matching finish.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.enableMissionAlerts}
                    onChange={(e) => updateSetting('enableMissionAlerts', e.target.checked)}
                    style={{ accentColor: 'var(--og-violet)', width: 16, height: 16, cursor: 'pointer' }}
                  />
                </div>

                <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: 14, borderRadius: 8, border: '1px solid var(--og-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 11, fontFamily: 'var(--og-font-body)', fontWeight: 600, color: 'var(--og-text-primary)' }}>
                      SAR ACQUISITION FAILURES
                    </div>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--og-text-muted)', marginTop: 2 }}>
                      Notify if Copernicus CDSE Level-1 STAC queries fail or timeout.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.enableAcquisitionAlerts}
                    onChange={(e) => updateSetting('enableAcquisitionAlerts', e.target.checked)}
                    style={{ accentColor: 'var(--og-violet)', width: 16, height: 16, cursor: 'pointer' }}
                  />
                </div>

                <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: 14, borderRadius: 8, border: '1px solid var(--og-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 11, fontFamily: 'var(--og-font-body)', fontWeight: 600, color: 'var(--og-text-primary)' }}>
                      VESSEL ANOMALY & CPA CROSSING ALERTS
                    </div>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--og-text-muted)', marginTop: 2 }}>
                      Broadcast alert when candidate vessels cross within 1.0 km of candidate discharge origin.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.enableAnomalyAlerts}
                    onChange={(e) => updateSetting('enableAnomalyAlerts', e.target.checked)}
                    style={{ accentColor: 'var(--og-violet)', width: 16, height: 16, cursor: 'pointer' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: SYSTEM CONNECTIONS */}
          {activeTab === 'system' && (
            <div
              style={{
                backgroundColor: 'var(--og-surface)',
                border: '1px solid var(--og-border)',
                borderRadius: 8,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--og-border)', paddingBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Server size={16} style={{ color: 'var(--og-violet)' }} />
                  <h2 style={{ fontSize: 13, fontFamily: 'var(--og-font-display)', fontWeight: 600, color: 'var(--og-text-primary)', textTransform: 'uppercase', margin: 0 }}>
                    SUBSYSTEM CONNECTIONS & HEALTH
                  </h2>
                </div>

                <Link
                  to="/system"
                  style={{
                    color: 'var(--og-violet)',
                    fontSize: 11,
                    fontFamily: 'var(--og-font-body)',
                    fontWeight: 600,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span>VIEW DETAILED SYSTEM STATUS</span>
                  <ArrowRight size={13} />
                </Link>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: 12,
                  fontSize: 11,
                  fontFamily: 'var(--og-font-body)',
                }}
              >
                <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: 12, borderRadius: 8, border: '1px solid var(--og-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontFamily: 'var(--og-font-mono)' }}>
                    <span style={{ color: 'var(--og-text-muted)' }}>BACKEND API:</span>
                    <strong style={{ color: 'var(--og-success)' }}>OPERATIONAL</strong>
                  </div>
                  <div style={{ color: 'var(--og-text-primary)' }}>Node.js Express / Port 4000</div>
                </div>

                <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: 12, borderRadius: 8, border: '1px solid var(--og-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontFamily: 'var(--og-font-mono)' }}>
                    <span style={{ color: 'var(--og-text-muted)' }}>SPATIAL DATABASE:</span>
                    <strong style={{ color: 'var(--og-success)' }}>OPERATIONAL</strong>
                  </div>
                  <div style={{ color: 'var(--og-text-primary)' }}>PostgreSQL 15 + PostGIS</div>
                </div>

                <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: 12, borderRadius: 8, border: '1px solid var(--og-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontFamily: 'var(--og-font-mono)' }}>
                    <span style={{ color: 'var(--og-text-muted)' }}>SAR ML SERVICE:</span>
                    <strong style={{ color: 'var(--og-success)' }}>BASELINE ACTIVE</strong>
                  </div>
                  <div style={{ color: 'var(--og-text-primary)' }}>PyTorch U-Net v2</div>
                </div>

                <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: 12, borderRadius: 8, border: '1px solid var(--og-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontFamily: 'var(--og-font-mono)' }}>
                    <span style={{ color: 'var(--og-text-muted)' }}>COPERNICUS STAC:</span>
                    <strong style={{ color: 'var(--og-teal)' }}>AUTHENTICATED</strong>
                  </div>
                  <div style={{ color: 'var(--og-text-primary)' }}>CDSE Level-1 GRD Gateway</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

