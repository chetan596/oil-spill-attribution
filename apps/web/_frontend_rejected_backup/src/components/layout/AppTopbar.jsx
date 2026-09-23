import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Satellite, Database, Activity, PlusCircle, Compass, Radio, Layers } from 'lucide-react';

export default function AppTopbar({ activeScene = 'demo-scene-001' }) {
  const location = useLocation();

  // Dynamic context title based on route
  let pageTitle = 'Operational Dashboard';
  let isAnalysisPage = false;
  if (location.pathname.startsWith('/analysis/new')) {
    pageTitle = 'Mission Dispatch & Ingestion';
  } else if (location.pathname.startsWith('/analysis/')) {
    pageTitle = 'Investigation Command Center';
    isAnalysisPage = true;
  } else if (location.pathname.startsWith('/reports')) {
    pageTitle = 'Investigation Dossier Archive';
  } else if (location.pathname.startsWith('/vessels/')) {
    pageTitle = 'Candidate Vessel Telemetry';
  } else if (location.pathname.startsWith('/spills/')) {
    pageTitle = 'Incident Forensic Profile';
  }

  return (
    <header
      className="og-topbar"
      style={{
        height: '52px',
        backgroundColor: 'var(--og-bg-surface)',
        borderBottom: '1px solid var(--og-border-default)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        flexShrink: 0,
        zIndex: 90,
      }}
      role="banner"
    >
      {/* Left: Section Context & Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <h1 style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--og-text-primary)', margin: 0 }}>
          {pageTitle}
        </h1>

        {isAnalysisPage && (
          <span
            className="og-badge og-badge-observed font-mono"
            style={{ fontSize: '0.6875rem' }}
          >
            ACTIVE RUN
          </span>
        )}
      </div>

      {/* Center: Scientific Provenance & Scenario Metadata Chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {activeScene && (activeScene.includes('cdse') || activeScene.includes('S1A_IW_GRDH')) ? (
          <>
            <div
              className="og-panel"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 8px',
                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                fontSize: '0.75rem',
              }}
              title="Forensically verified authentic Sentinel-1 SAR acquisition from Copernicus CDSE"
            >
              <Satellite size={12} style={{ color: 'var(--og-observed)' }} />
              <span style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>REAL SENTINEL-1 SCENE</span>
              <span className="font-mono" style={{ color: 'var(--og-text-primary)', fontSize: '0.70rem' }}>
                CDSE S1A IW
              </span>
            </div>

            <div
              className="og-panel"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 8px',
                backgroundColor: 'var(--og-bg-base)',
                border: '1px solid var(--og-border-subtle)',
                fontSize: '0.75rem',
              }}
              title="Dual-polarization Sentinel-1 radar channels"
            >
              <Database size={12} style={{ color: 'var(--og-observed)' }} />
              <span style={{ color: 'var(--og-text-muted)' }}>SENSOR:</span>
              <span className="font-mono" style={{ color: 'var(--og-text-primary)' }}>
                S1A C-SAR (VV+VH)
              </span>
            </div>

            <div
              className="og-panel"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 8px',
                backgroundColor: 'var(--og-bg-base)',
                border: '1px solid var(--og-border-subtle)',
                fontSize: '0.75rem',
              }}
              title="Drift modeling omitted for unlabelled live scene"
            >
              <Compass size={12} style={{ color: 'var(--og-text-muted)' }} />
              <span style={{ color: 'var(--og-text-muted)' }}>DRIFT:</span>
              <span className="font-mono" style={{ color: 'var(--og-text-muted)' }}>
                NOT RUN (Real Mode)
              </span>
            </div>
          </>
        ) : (
          <>
            <div
              className="og-panel"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 8px',
                backgroundColor: 'var(--og-bg-base)',
                border: '1px solid var(--og-border-subtle)',
                fontSize: '0.75rem',
              }}
              title="Active demonstration scene loaded from PostGIS database"
            >
              <Database size={12} style={{ color: 'var(--og-observed)' }} />
              <span style={{ color: 'var(--og-text-muted)' }}>SCENE:</span>
              <span className="font-mono" style={{ color: 'var(--og-text-primary)', fontWeight: 600 }}>
                {activeScene}
              </span>
            </div>

            <div
              className="og-panel"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 8px',
                backgroundColor: 'var(--og-bg-base)',
                border: '1px solid var(--og-border-subtle)',
                fontSize: '0.75rem',
              }}
              title="Dual-polarization Sentinel-1 radar channels"
            >
              <Satellite size={12} style={{ color: 'var(--og-observed)' }} />
              <span style={{ color: 'var(--og-text-muted)' }}>SENSOR:</span>
              <span className="font-mono" style={{ color: 'var(--og-text-primary)' }}>
                SAR VV+VH
              </span>
            </div>

            <div
              className="og-panel"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 8px',
                backgroundColor: 'var(--og-bg-base)',
                border: '1px solid var(--og-border-subtle)',
                fontSize: '0.75rem',
              }}
              title="Active Hydrodynamic Lagrangian Drift Simulation Engine"
            >
              <Compass size={12} style={{ color: 'var(--og-modelled)' }} />
              <span style={{ color: 'var(--og-text-muted)' }}>DRIFT:</span>
              <span className="font-mono" style={{ color: 'var(--og-modelled)' }}>
                Lagrangian 24h
              </span>
            </div>
          </>
        )}
      </div>

      {/* Right: Quick Action & Live Station Beacon */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.72rem',
            color: 'var(--og-operational)',
            background: 'var(--og-forecast-bg)',
            border: '1px solid var(--og-forecast-border)',
            padding: '3px 8px',
            borderRadius: 'var(--og-radius-sm)',
          }}
        >
          <Radio size={11} />
          <span style={{ fontWeight: 600 }}>STATION READY</span>
        </div>

        <Link
          to="/analysis/new"
          className="og-btn og-btn-primary"
          style={{ textDecoration: 'none', padding: '5px 10px', fontSize: '0.75rem' }}
          title="Dispatch new Sentinel-1 SAR analysis"
        >
          <PlusCircle size={13} />
          <span>New Mission</span>
        </Link>
      </div>
    </header>
  );
}
