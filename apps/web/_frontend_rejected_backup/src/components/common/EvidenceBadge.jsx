import React from 'react';
import { Satellite, Compass, Database, ShieldCheck } from 'lucide-react';

/**
 * EvidenceBadge — Universal data classification indicator (OBSERVED | MODELLED | DEMONSTRATION).
 */
export default function EvidenceBadge({ type = null, classification = null, label = null, size = 'sm' }) {
  const normType = ((classification || type || 'OBSERVED')).toUpperCase();

  const configs = {
    OBSERVED: {
      bg: 'rgba(16, 185, 129, 0.12)',
      border: 'rgba(16, 185, 129, 0.35)',
      text: '#34d399',
      icon: Satellite,
      defaultLabel: 'OBSERVED',
    },
    MODELLED: {
      bg: 'rgba(245, 158, 11, 0.12)',
      border: 'rgba(245, 158, 11, 0.35)',
      text: '#fbbf24',
      icon: Compass,
      defaultLabel: 'MODELLED',
    },
    DEMONSTRATION: {
      bg: 'rgba(168, 85, 247, 0.12)',
      border: 'rgba(168, 85, 247, 0.35)',
      text: '#c084fc',
      icon: Database,
      defaultLabel: 'DEMONSTRATION',
    },
    EXPERIMENTAL: {
      bg: 'rgba(56, 189, 248, 0.12)',
      border: 'rgba(56, 189, 248, 0.35)',
      text: '#38bdf8',
      icon: Satellite,
      defaultLabel: 'EXPERIMENTAL',
    },
    REPORT: {
      bg: 'rgba(148, 163, 184, 0.12)',
      border: 'rgba(148, 163, 184, 0.35)',
      text: '#94a3b8',
      icon: ShieldCheck,
      defaultLabel: 'REPORT',
    },
  };

  const config = configs[normType] || configs.OBSERVED;
  const IconComponent = config.icon;

  const fontSizes = {
    xs: '0.65rem',
    sm: '0.72rem',
    md: '0.8rem',
  };

  const iconSizes = {
    xs: 10,
    sm: 12,
    md: 14,
  };

  const paddingMap = {
    xs: '2px 6px',
    sm: '3px 8px',
    md: '4px 10px',
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: paddingMap[size] || paddingMap.sm,
        background: config.bg,
        border: `1px solid ${config.border}`,
        borderRadius: '4px',
        color: config.text,
        fontSize: fontSizes[size] || fontSizes.sm,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        fontFamily: 'var(--font-mono, monospace)',
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
      title={`Data classification: ${normType}`}
      aria-label={`Classification: ${normType}`}
    >
      <IconComponent size={iconSizes[size] || 12} />
      <span>{label || config.defaultLabel}</span>
    </span>
  );
}
