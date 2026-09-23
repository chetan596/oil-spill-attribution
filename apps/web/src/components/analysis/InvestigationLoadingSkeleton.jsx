/**
 * InvestigationLoadingSkeleton.jsx
 * Phase 16.4 Part 1 — Loading / Skeleton Screen
 *
 * Shown while a real investigation (manualInvestigationData) is being fetched.
 * Rules:
 *  - No blank page
 *  - No fake coordinates or geographic data
 *  - No demo-data leakage
 *  - No fabricated markers / slicks / vessels
 *  - Match existing Blue Forensic AI dark-theme design tokens
 *  - Pure React + CSS, zero new dependencies
 */
import React, { useState, useEffect } from 'react';
import {
  Satellite,
  Compass,
  Ship,
  Activity,
  Cpu,
  FileText,
  Crosshair,
  AlertTriangle,
} from 'lucide-react';

// ─── Shimmer keyframes injected once ────────────────────────────────────────
const SHIMMER_STYLE_ID = 'og-skeleton-shimmer';
function ensureShimmerKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(SHIMMER_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = SHIMMER_STYLE_ID;
  style.textContent = `
    @keyframes og-shimmer {
      0%   { background-position: -400px 0; }
      100% { background-position: 400px 0; }
    }
    @keyframes og-pulse-dot {
      0%, 100% { opacity: 0.3; }
      50%       { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

// ─── Design tokens (mirrors existing CSS vars; fallbacks for test env) ────────
const T = {
  bg:            'var(--og-bg, #0B1120)',
  surface:       'var(--og-surface, #111827)',
  surfaceR:      'var(--og-surface-raised, #1A2235)',
  border:        'var(--og-border, rgba(51,65,85,0.6))',
  borderSubtle:  'var(--og-border-subtle, rgba(51,65,85,0.35))',
  textPrimary:   'var(--og-text-primary, #F8FAFC)',
  textSecondary: 'var(--og-text-secondary, #94A3B8)',
  textMuted:     'var(--og-text-muted, #64748B)',
  teal:          'var(--og-teal, #22D3EE)',
  tealSubtle:    'var(--og-teal-subtle, rgba(34,211,238,0.08))',
  amber:         'var(--og-amber, #F59E0B)',
  radius:        'var(--og-radius-base, 8px)',
  radiusSm:      'var(--og-radius-sm, 4px)',
  fontDisplay:   "var(--og-font-display, 'Hanken Grotesk', sans-serif)",
  fontBody:      "var(--og-font-body, 'Schibsted Grotesk', sans-serif)",
  fontMono:      "var(--og-font-mono, 'JetBrains Mono', monospace)",
};

// ─── Shimmer block ────────────────────────────────────────────────────────────
function Shimmer({ width = '100%', height = 12, borderRadius = 4, style: extraStyle = {} }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width,
        height,
        borderRadius,
        background: `linear-gradient(90deg,
          rgba(30,41,59,0.6) 25%,
          rgba(51,65,85,0.5) 50%,
          rgba(30,41,59,0.6) 75%)`,
        backgroundSize: '400px 100%',
        animation: 'og-shimmer 1.6s ease-in-out infinite',
        flexShrink: 0,
        ...extraStyle,
      }}
    />
  );
}

// ─── Pipeline stage definitions ───────────────────────────────────────────────
const PIPELINE_STAGES = [
  { id: 'sar',       label: 'SAR Scene', icon: Satellite },
  { id: 'detection', label: 'Detection', icon: Cpu       },
  { id: 'drift',     label: 'Drift',     icon: Compass   },
  { id: 'ais',       label: 'AIS',       icon: Ship      },
  { id: 'cpa',       label: 'CPA',       icon: Crosshair },
  { id: 'dossier',   label: 'Dossier',   icon: FileText  },
];

// ─── Loading message sequence (deterministic, time-based, no fake %) ──────────
const LOADING_MESSAGES = [
  'Loading investigation...',
  'Loading SAR evidence...',
  'Loading detection geometry...',
  'Loading drift and origin...',
  'Loading historical AIS...',
  'Preparing investigation map...',
];
const MESSAGE_INTERVAL_MS = 1200;

// ─── Main component ───────────────────────────────────────────────────────────
/**
 * @param {{ jobId?: string|null, subsystems?: Record<string,'loading'|'ready'|'unavailable'> }} props
 */
export default function InvestigationLoadingSkeleton({ jobId = null, subsystems = {} }) {
  useEffect(() => { ensureShimmerKeyframes(); }, []);

  const [msgIdx, setMsgIdx] = useState(0);
  useEffect(() => {
    if (msgIdx >= LOADING_MESSAGES.length - 1) return;
    const t = setTimeout(() => setMsgIdx((i) => Math.min(i + 1, LOADING_MESSAGES.length - 1)), MESSAGE_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [msgIdx]);

  const loadingMessage = LOADING_MESSAGES[msgIdx];

  return (
    <div
      data-testid="investigation-loading-skeleton"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: T.bg,
        minHeight: 0,
      }}
    >
      {/* ── Status / Loading bar ────────────────────────────────────────────── */}
      <div
        data-testid="skeleton-status-bar"
        style={{
          height: '30px',
          minHeight: '30px',
          backgroundColor: T.surfaceR,
          borderBottom: `1px solid ${T.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 14px',
          flexShrink: 0,
          gap: '8px',
          overflowX: 'auto',
        }}
      >
        {/* Pipeline stages */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', flexShrink: 0 }}>
          {PIPELINE_STAGES.map((stage, idx) => {
            const Icon = stage.icon;
            const state = subsystems[stage.id] || 'loading';
            const color = state === 'ready' ? T.teal : state === 'unavailable' ? T.amber : T.textMuted;
            return (
              <React.Fragment key={stage.id}>
                {idx > 0 && (
                  <div style={{ width: '10px', height: '1px', backgroundColor: T.borderSubtle, flexShrink: 0 }} aria-hidden="true" />
                )}
                <div
                  data-testid={`skeleton-stage-${stage.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    padding: '2px 5px',
                    borderRadius: T.radiusSm,
                    border: `1px solid ${state === 'ready' ? 'rgba(34,211,238,0.3)' : T.borderSubtle}`,
                    backgroundColor: state === 'ready' ? T.tealSubtle : 'transparent',
                    opacity: state === 'loading' ? 0.5 : 1,
                    flexShrink: 0,
                  }}
                >
                  <Icon size={10} style={{ color }} />
                  <span style={{ fontSize: '9px', color, fontFamily: T.fontDisplay, fontWeight: 600, letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
                    {state === 'unavailable'
                      ? `${stage.label.toUpperCase()} UNAVAILABLE`
                      : stage.label.toUpperCase()}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Loading message */}
        <div
          data-testid="skeleton-loading-message"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
        >
          <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }} aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: 4, height: 4,
                  borderRadius: '50%',
                  backgroundColor: T.teal,
                  animation: `og-pulse-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: '10px', color: T.textSecondary, fontFamily: T.fontBody, fontWeight: 500, whiteSpace: 'nowrap' }}>
            {loadingMessage}
          </span>
          {jobId && (
            <span style={{ fontSize: '9px', color: T.textMuted, fontFamily: T.fontMono }}>
              [{jobId.slice(0, 8)}&hellip;]
            </span>
          )}
        </div>
      </div>

      {/* ── 3-Column Workspace ──────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '280px 1fr 300px',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <LeftPanelSkeleton subsystems={subsystems} />
        <MapShellSkeleton />
        <RightPanelSkeleton subsystems={subsystems} />
      </div>
    </div>
  );
}

// ─── Left Panel ───────────────────────────────────────────────────────────────
function LeftPanelSkeleton({ subsystems }) {
  return (
    <div
      data-testid="skeleton-left-panel"
      style={{
        borderRight: `1px solid ${T.border}`,
        backgroundColor: T.surface,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '10px',
        overflowY: 'auto',
      }}
    >
      <SkeletonCard icon={Satellite} label="SAR ACQUISITION" state={subsystems.sar || 'loading'}>
        <Shimmer height={10} width="75%" />
        <Shimmer height={10} width="55%" />
        <Shimmer height={10} width="65%" />
        <Shimmer height={10} width="45%" />
      </SkeletonCard>

      <SkeletonCard icon={Cpu} label="NEURAL DETECTION" state={subsystems.detection || 'loading'}>
        <Shimmer height={10} width="80%" />
        <Shimmer height={10} width="60%" />
        <Shimmer height={22} width="100%" />
      </SkeletonCard>

      <SkeletonCard icon={Compass} label="ORIGIN &amp; DRIFT" state={subsystems.drift || 'loading'}>
        <Shimmer height={10} width="70%" />
        <Shimmer height={10} width="50%" />
      </SkeletonCard>

      <SkeletonCard icon={Ship} label="AIS CORRELATION" state={subsystems.ais || 'loading'}>
        <Shimmer height={10} width="65%" />
        <Shimmer height={10} width="45%" />
      </SkeletonCard>
    </div>
  );
}

// ─── Map Shell ────────────────────────────────────────────────────────────────
function MapShellSkeleton() {
  return (
    <div
      data-testid="skeleton-map-shell"
      style={{
        position: 'relative',
        backgroundColor: '#0D1B2E',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Grid texture — no geographic data */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          backgroundImage: `
            linear-gradient(rgba(34,211,238,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34,211,238,0.04) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(11,17,32,0.7) 100%)',
        }}
      />

      {/* Status message */}
      <div
        style={{
          position: 'relative', zIndex: 1,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: '12px', padding: '24px', textAlign: 'center',
        }}
      >
        <div style={{ position: 'relative', width: 56, height: 56 }} aria-hidden="true">
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(34,211,238,0.15)' }} />
          <div style={{ position: 'absolute', inset: 6, borderRadius: '50%', border: '1px solid rgba(34,211,238,0.25)', animation: 'og-pulse-dot 2s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Satellite size={18} style={{ color: T.teal, opacity: 0.7 }} />
          </div>
        </div>

        <div>
          <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: T.teal, fontFamily: T.fontDisplay, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Preparing Investigation Map
          </p>
          <p style={{ margin: '4px 0 0', fontSize: '10px', color: T.textMuted, fontFamily: T.fontBody }}>
            Map will initialise once geospatial evidence is verified
          </p>
        </div>
      </div>

      {/* Focus controls skeleton — non-interactive placeholders */}
      <div
        aria-hidden="true"
        data-testid="skeleton-map-controls"
        style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: '6px',
        }}
      >
        {['SLICK', 'ORIGIN', 'VESSEL', 'RESET'].map((label) => (
          <div
            key={label}
            style={{
              padding: '4px 10px', borderRadius: T.radiusSm,
              backgroundColor: 'rgba(15,23,42,0.65)', border: `1px solid ${T.borderSubtle}`,
              fontSize: '9px', color: T.textMuted, fontFamily: T.fontDisplay, fontWeight: 700,
              letterSpacing: '0.04em', pointerEvents: 'none', userSelect: 'none',
            }}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Right Panel ──────────────────────────────────────────────────────────────
function RightPanelSkeleton({ subsystems }) {
  return (
    <div
      data-testid="skeleton-right-panel"
      style={{
        borderLeft: `1px solid ${T.border}`,
        backgroundColor: T.surface,
        display: 'flex', flexDirection: 'column',
        gap: '8px', padding: '10px', overflowY: 'auto',
      }}
    >
      <SkeletonCard icon={Activity} label="INVESTIGATION STATUS" state="loading">
        <Shimmer height={10} width="80%" />
        <Shimmer height={10} width="60%" />
        <Shimmer height={10} width="70%" />
      </SkeletonCard>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span style={{ fontSize: '9.5px', color: T.textMuted, fontFamily: T.fontDisplay, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          AIS CANDIDATES
        </span>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              backgroundColor: T.surfaceR, border: `1px solid ${T.borderSubtle}`,
              borderRadius: T.radius, padding: '8px 10px',
              display: 'flex', flexDirection: 'column', gap: '5px',
              opacity: 1 - i * 0.18,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Shimmer height={10} width="50%" />
              <Shimmer height={10} width="20%" />
            </div>
            <Shimmer height={8} width="65%" />
            <div style={{ display: 'flex', gap: '6px' }}>
              <Shimmer height={8} width="30%" />
              <Shimmer height={8} width="30%" />
            </div>
          </div>
        ))}
      </div>

      {/* Subsystem failure notices */}
      {Object.entries(subsystems)
        .filter(([, state]) => state === 'unavailable')
        .map(([key]) => (
          <div
            key={key}
            data-testid={`skeleton-subsystem-unavailable-${key}`}
            style={{
              padding: '8px 10px',
              backgroundColor: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: T.radius,
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '10px', color: T.amber, fontFamily: T.fontBody, fontWeight: 600,
            }}
          >
            <AlertTriangle size={12} />
            <span>{key.toUpperCase()} UNAVAILABLE</span>
          </div>
        ))}
    </div>
  );
}

// ─── Generic skeleton card ────────────────────────────────────────────────────
function SkeletonCard({ icon: Icon, label, state = 'loading', children }) {
  const isUnavail = state === 'unavailable';
  const isReady   = state === 'ready';
  const borderColor = isReady ? 'rgba(34,211,238,0.3)' : isUnavail ? 'rgba(245,158,11,0.25)' : T.borderSubtle;
  const headerColor = isReady ? T.teal : isUnavail ? T.amber : T.textMuted;

  return (
    <div style={{ backgroundColor: T.surfaceR, border: `1px solid ${borderColor}`, borderRadius: T.radius, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <Icon size={11} style={{ color: headerColor }} />
        <span style={{ fontSize: '9.5px', color: headerColor, fontFamily: T.fontDisplay, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {label}
        </span>
        {isUnavail && <span style={{ marginLeft: 'auto', fontSize: '8.5px', color: T.amber, fontWeight: 700 }}>UNAVAILABLE</span>}
        {isReady   && <span style={{ marginLeft: 'auto', fontSize: '8.5px', color: T.teal,  fontWeight: 700 }}>READY</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {children}
      </div>
    </div>
  );
}
