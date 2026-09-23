/**
 * ProvenanceLegend.jsx
 * Phase 16.4 Part 6 — Investigation Provenance Legend
 *
 * Displays standardized semantic classifications across the workspace:
 *   ● REAL
 *   ● MODEL-DERIVED
 *   ● DEMO
 *   ● NOT AVAILABLE
 *   ● ESTIMATION TIME PROXY
 */

import React from 'react';
import { ShieldCheck, Cpu, Database, AlertCircle, Clock } from 'lucide-react';

export const PROVENANCE_CONFIGS = {
  REAL: {
    label: 'REAL',
    bg: 'rgba(34, 197, 94, 0.12)',
    border: 'rgba(34, 197, 94, 0.3)',
    color: '#4ADE80',
    dot: '#22C55E',
    icon: ShieldCheck,
    desc: 'Verified physical or sensor-grounded telemetry',
  },
  MODEL_DERIVED: {
    label: 'MODEL-DERIVED',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.3)',
    color: '#FBBF24',
    dot: '#F59E0B',
    icon: Cpu,
    desc: 'Inferred via deep neural network or hydrodynamic drift simulation',
  },
  DEMO: {
    label: 'DEMO',
    bg: 'rgba(168, 85, 247, 0.12)',
    border: 'rgba(168, 85, 247, 0.3)',
    color: '#C084FC',
    dot: '#A855F7',
    icon: Database,
    desc: 'Simulated demonstration dataset for validation only',
  },
  NOT_AVAILABLE: {
    label: 'NOT AVAILABLE',
    bg: 'rgba(100, 116, 139, 0.12)',
    border: 'rgba(100, 116, 139, 0.25)',
    color: '#94A3B8',
    dot: '#64748B',
    icon: AlertCircle,
    desc: 'Metric or layer is not available or unsupported for this input',
  },
  ESTIMATION_TIME_PROXY: {
    label: 'TIME PROXY',
    bg: 'rgba(251, 146, 60, 0.12)',
    border: 'rgba(251, 146, 60, 0.3)',
    color: '#FB923C',
    dot: '#EA580C',
    icon: Clock,
    desc: 'Estimated timestamp proxy due to missing raster acquisition header',
  },
};

export function ProvenanceBadge({ type = 'NOT_AVAILABLE', size = 'sm', customLabel = null }) {
  const normKey = String(type).toUpperCase().replace(/[\s-]+/g, '_');
  const cfg = PROVENANCE_CONFIGS[normKey] || PROVENANCE_CONFIGS.NOT_AVAILABLE;
  const Icon = cfg.icon;

  const isSmall = size === 'xs' || size === 'sm';

  return (
    <span
      data-testid={`provenance-badge-${normKey.toLowerCase()}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: isSmall ? '2px 7px' : '4px 10px',
        borderRadius: '4px',
        fontSize: isSmall ? '0.70rem' : '0.80rem',
        fontWeight: 600,
        fontFamily: 'monospace',
        letterSpacing: '0.04em',
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        color: cfg.color,
        lineHeight: 1.2,
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: cfg.dot,
          boxShadow: `0 0 6px ${cfg.dot}`,
          flexShrink: 0,
        }}
      />
      <Icon size={isSmall ? 11 : 13} style={{ opacity: 0.85 }} />
      <span>{customLabel || cfg.label}</span>
    </span>
  );
}

export default function ProvenanceLegend({ className = '' }) {
  return (
    <div
      data-testid="provenance-legend"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 14px',
        background: 'rgba(15, 23, 42, 0.65)',
        border: '1px solid rgba(51, 65, 85, 0.6)',
        borderRadius: '6px',
        backdropFilter: 'blur(8px)',
      }}
      className={className}
    >
      <span
        style={{
          fontSize: '0.68rem',
          fontWeight: 700,
          color: '#64748B',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginRight: '4px',
        }}
      >
        Provenance:
      </span>
      {Object.keys(PROVENANCE_CONFIGS).map((key) => {
        const item = PROVENANCE_CONFIGS[key];
        return (
          <div
            key={key}
            title={item.desc}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'help' }}
          >
            <ProvenanceBadge type={key} size="xs" />
          </div>
        );
      })}
    </div>
  );
}
