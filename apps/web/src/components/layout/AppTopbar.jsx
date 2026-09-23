import React, { useState, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { PlusCircle, Sparkles, Check, Share2, Layers } from 'lucide-react';
import SourceBadge from '../common/SourceBadge';

/* ────────────────────────────────────────────────
 * Derive scene context from the current route.
 * Replaces hardcoded defaults with dynamic values.
 * ──────────────────────────────────────────────── */
function deriveSceneContext(location) {
  const path = location.pathname;
  const params = new URLSearchParams(location.search);

  // Helper: determine REAL vs DEMONSTRATION from a scene ID
  const classifyMode = (id) => {
    if (!id) return 'DEMONSTRATION';
    const lower = id.toLowerCase();
    if (lower === 'real_cdse' || lower.startsWith('cdse-') || lower.includes('real')) return 'REAL';
    return 'DEMONSTRATION';
  };

  // Analysis page: /analysis/:id  (but NOT /analysis/new)
  const analysisMatch = path.match(/^\/analysis\/(.+)/);
  if (analysisMatch && analysisMatch[1] !== 'new') {
    const rawId = decodeURIComponent(analysisMatch[1]);
    const scenarioQuery = params.get('scenario');
    const isUuidOrJob =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId) ||
      rawId.startsWith('job-') ||
      rawId.startsWith('cdse-') ||
      rawId.startsWith('real-');

    let sceneId = scenarioQuery || rawId;
    let mode = classifyMode(sceneId);

    if (isUuidOrJob && !scenarioQuery) {
      sceneId = 'REAL CDSE (JOB)';
      mode = 'REAL';
    }

    return {
      sceneId,
      mode,
      sensor: mode === 'REAL' ? 'Sentinel-1 CDSE' : 'SAR VV+VH',
      drift: mode === 'REAL' ? '—' : 'Lagrangian 24h',
      subtitle: 'Investigation Workspace',
    };
  }

  // Spill details: /spills/:id
  const spillMatch = path.match(/^\/spills\/(.+)/);
  if (spillMatch) {
    const spillId = decodeURIComponent(spillMatch[1]);
    const mode = classifyMode(spillId);
    return {
      sceneId: `Spill ${spillId}`,
      mode,
      sensor: mode === 'REAL' ? 'Sentinel-1 CDSE' : 'SAR VV+VH',
      drift: 'Lagrangian 24h',
      subtitle: 'Spill Details',
    };
  }

  // Vessel details: /vessels/:mmsi
  const vesselMatch = path.match(/^\/vessels\/(.+)/);
  if (vesselMatch) {
    return {
      sceneId: `MMSI ${decodeURIComponent(vesselMatch[1])}`,
      mode: 'DEMONSTRATION',
      sensor: 'AIS Maritime',
      drift: '—',
      subtitle: 'Vessel Attribution',
    };
  }

  // New mission pages
  if (path === '/analysis/new' || path === '/new-mission' || path === '/new-analysis' || path === '/sentinel1') {
    return {
      sceneId: 'NEW MISSION',
      mode: 'SETUP',
      sensor: 'PENDING',
      drift: '—',
      subtitle: 'Mission Setup',
    };
  }

  // Dashboard (may have ?scenario= param)
  if (path.startsWith('/dashboard') || path === '/') {
    const dashScene = params.get('scenario');
    if (dashScene) {
      const mode = classifyMode(dashScene);
      return {
        sceneId: dashScene,
        mode,
        sensor: mode === 'REAL' ? 'Sentinel-1 CDSE' : 'SAR VV+VH',
        drift: 'Lagrangian 24h',
        subtitle: 'Operational Dashboard',
      };
    }
    return {
      sceneId: 'ALL SECTORS',
      mode: 'OVERVIEW',
      sensor: 'Multi-Source',
      drift: '—',
      subtitle: 'Operational Dashboard',
    };
  }

  // Reports
  if (path.startsWith('/reports') || path.startsWith('/dossier')) {
    return { sceneId: 'ARCHIVE', mode: 'REPORTS', sensor: '—', drift: '—', subtitle: 'Dossier Archive' };
  }

  // Settings
  if (path.startsWith('/settings')) {
    return { sceneId: '—', mode: 'CONFIG', sensor: '—', drift: '—', subtitle: 'Settings' };
  }

  // System status
  if (path.startsWith('/system')) {
    return { sceneId: 'SUBSYSTEMS', mode: 'STATUS', sensor: '—', drift: '—', subtitle: 'System Health' };
  }

  // Design system
  if (path.startsWith('/design-system')) {
    return { sceneId: '—', mode: 'DEV', sensor: '—', drift: '—', subtitle: 'Design System' };
  }

  // Default fallback
  return {
    sceneId: 'STANDBY',
    mode: 'DEMONSTRATION',
    sensor: 'SAR VV+VH',
    drift: 'Lagrangian 24h',
    subtitle: 'Operational Dashboard',
  };
}

/* ── Mode badge colors ── */
const MODE_COLORS = {
  REAL:          { color: '#4ADE80', bg: 'rgba(74, 222, 128, 0.10)', border: 'rgba(74, 222, 128, 0.25)' },
  DEMONSTRATION: { color: '#A855F7', bg: 'rgba(168, 85, 247, 0.10)', border: 'rgba(168, 85, 247, 0.25)' },
  SETUP:         { color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.10)', border: 'rgba(56, 189, 248, 0.25)' },
  OVERVIEW:      { color: '#B1B6BD', bg: 'rgba(177, 182, 189, 0.06)', border: 'rgba(177, 182, 189, 0.15)' },
  REPORTS:       { color: '#B1B6BD', bg: 'rgba(177, 182, 189, 0.06)', border: 'rgba(177, 182, 189, 0.15)' },
  CONFIG:        { color: '#B1B6BD', bg: 'rgba(177, 182, 189, 0.06)', border: 'rgba(177, 182, 189, 0.15)' },
  STATUS:        { color: '#B1B6BD', bg: 'rgba(177, 182, 189, 0.06)', border: 'rgba(177, 182, 189, 0.15)' },
  DEV:           { color: '#B1B6BD', bg: 'rgba(177, 182, 189, 0.06)', border: 'rgba(177, 182, 189, 0.15)' },
};

export default function AppTopbar({
  activeScene,       // prop override (optional — falls back to route-derived)
  sceneMeta,         // prop override (optional)
  mode: modeProp,    // prop override (optional)
  provenanceState,
  onOpenSystemStatus,
  onSynthesizeDossier,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [copied, setCopied] = useState(false);

  // Derive from route, with prop overrides
  const ctx = useMemo(() => deriveSceneContext(location), [location.pathname, location.search]);
  const displayScene = activeScene || ctx.sceneId;
  const displayMode  = modeProp || ctx.mode;
  const displaySensor = ctx.sensor;
  const displayDrift  = ctx.drift;
  const modeStyle     = MODE_COLORS[displayMode] || MODE_COLORS.DEMONSTRATION;

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSynthesize = () => {
    if (onSynthesizeDossier) {
      onSynthesizeDossier();
    } else {
      navigate('/reports');
    }
  };

  return (
    <header
      style={{
        height: '48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 18px',
        background: 'var(--og-surface, #121417)',
        borderBottom: '1px solid var(--og-border-subtle, rgba(255, 255, 255, 0.055))',
        userSelect: 'none',
        flexShrink: 0,
        zIndex: 30,
        fontFamily: "var(--og-font-body, 'Schibsted Grotesk', -apple-system, sans-serif)",
      }}
      role="banner"
    >
      {/* Left: Brand Identity + Subtitle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: 'var(--og-surface-elevated, #1D2025)',
            border: '1px solid var(--og-border-strong, #343940)',
            color: 'var(--og-text-primary, #ECEEF1)',
            fontWeight: 700,
            fontSize: '10.5px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            letterSpacing: '-0.02em',
            flexShrink: 0,
          }}
        >
          BF
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span
            style={{
              fontFamily: "var(--og-font-display, 'Hanken Grotesk', sans-serif)",
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--og-text-primary, #ECEEF1)',
              letterSpacing: '-0.01em',
            }}
          >
            Blue Forensic AI
          </span>
          <span style={{ fontSize: '11px', color: 'var(--og-text-muted, #777E87)', fontWeight: 400 }}>
            {ctx.subtitle}
          </span>
        </div>
      </div>

      {/* Center: Dynamic Status Pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} className="hidden md:flex">
        {/* Mode badge */}
        <div
          style={{
            background: modeStyle.bg,
            border: `1px solid ${modeStyle.border}`,
            borderRadius: 'var(--og-radius-sm, 4px)',
            padding: '3px 8px',
            fontSize: '10px',
            fontWeight: 700,
            fontFamily: "var(--og-font-mono, 'Schibsted Grotesk', monospace)",
            color: modeStyle.color,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {displayMode}
        </div>

        {/* Scene pill */}
        <div
          style={{
            background: 'var(--og-surface-raised, #171A1E)',
            border: '1px solid var(--og-border, #25292F)',
            borderRadius: 'var(--og-radius-sm, 4px)',
            padding: '3px 8px',
            fontSize: '10.5px',
            fontFamily: "var(--og-font-mono, 'Schibsted Grotesk', monospace)",
            color: 'var(--og-text-muted, #777E87)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            maxWidth: '200px',
            overflow: 'hidden',
          }}
        >
          <span>SCENE:</span>
          <strong style={{ color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayScene}</strong>
        </div>

        {/* Sensor pill — only show when relevant */}
        {displaySensor !== '—' && (
          <div
            style={{
              background: 'var(--og-surface-raised, #171A1E)',
              border: '1px solid var(--og-border, #25292F)',
              borderRadius: 'var(--og-radius-sm, 4px)',
              padding: '3px 8px',
              fontSize: '10.5px',
              fontFamily: "var(--og-font-mono, 'Schibsted Grotesk', monospace)",
              color: 'var(--og-text-muted, #777E87)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>SENSOR:</span>
            <strong style={{ color: 'var(--og-teal-soft, #78DADD)', fontWeight: 500 }}>{displaySensor}</strong>
          </div>
        )}

        {/* Drift pill — only show when relevant */}
        {displayDrift !== '—' && (
          <div
            style={{
              background: 'var(--og-surface-raised, #171A1E)',
              border: '1px solid var(--og-border, #25292F)',
              borderRadius: 'var(--og-radius-sm, 4px)',
              padding: '3px 8px',
              fontSize: '10.5px',
              fontFamily: "var(--og-font-mono, 'Schibsted Grotesk', monospace)",
              color: 'var(--og-text-muted, #777E87)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>DRIFT:</span>
            <strong style={{ color: 'var(--og-amber-soft, #F2BC62)', fontWeight: 500 }}>{displayDrift}</strong>
          </div>
        )}
      </div>

      {/* Right: Station Status + Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Station Ready Button */}
        <button
          type="button"
          onClick={onOpenSystemStatus}
          style={{
            background: 'transparent',
            border: '1px solid var(--og-border-strong, #343940)',
            borderRadius: 'var(--og-radius-base, 8px)',
            padding: '4px 10px',
            color: 'var(--og-text-primary, #ECEEF1)',
            fontSize: '11px',
            fontWeight: 500,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          title="Click to view full subsystem architecture and health status"
        >
          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--og-success, #4ADE80)' }} />
          <span>STATION READY</span>
        </button>

        {/* Synthesize Dossier */}
        <button
          type="button"
          onClick={handleSynthesize}
          style={{
            background: 'var(--og-violet, #A855F7)',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 'var(--og-radius-base, 8px)',
            padding: '0 14px',
            height: '32px',
            fontSize: '12px',
            fontWeight: 500,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            transition: 'background 0.15s ease',
            fontFamily: "var(--og-font-body, 'Schibsted Grotesk', sans-serif)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--og-violet-soft, #C084FC)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--og-violet, #A855F7)')}
        >
          <Sparkles size={12} />
          <span>Synthesize Dossier</span>
        </button>

        {/* New Mission */}
        <Link
          to="/analysis/new"
          style={{
            background: 'transparent',
            color: 'var(--og-text-primary, #ECEEF1)',
            border: '1px solid var(--og-border-strong, #343940)',
            borderRadius: 'var(--og-radius-base, 8px)',
            padding: '0 12px',
            height: '32px',
            fontSize: '12px',
            fontWeight: 500,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            textDecoration: 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--og-surface-raised, #171A1E)';
            e.currentTarget.style.borderColor = '#464C54';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = 'var(--og-border-strong, #343940)';
          }}
        >
          <PlusCircle size={12} />
          <span>New Mission</span>
        </Link>
      </div>
    </header>
  );
}
