import React from 'react';
import { Satellite, Compass, Database, ShieldCheck, Sparkles, AlertCircle } from 'lucide-react';

/**
 * EvidenceBadge — Universal data classification indicator (OBSERVED | MODELLED | DEMONSTRATION | SYNTHESIS | VERIFIED | ERROR | NOT_ESTABLISHED).
 */
export default function EvidenceBadge({ type, classification, label = null, size = 'sm' }) {
  const normType = String(type || classification || 'OBSERVED').toUpperCase().replace(/\s+/g, '_');

  const configs = {
    OBSERVED: {
      bg: 'rgba(73, 198, 200, 0.10)',
      border: 'rgba(73, 198, 200, 0.24)',
      text: 'var(--og-teal, #49C6C8)',
      icon: Satellite,
      defaultLabel: 'OBSERVED',
    },
    VERIFIED: {
      bg: 'rgba(74, 222, 128, 0.10)',
      border: 'rgba(74, 222, 128, 0.22)',
      text: 'var(--og-success, #4ADE80)',
      icon: ShieldCheck,
      defaultLabel: 'VERIFIED',
    },
    READY: {
      bg: 'rgba(74, 222, 128, 0.10)',
      border: 'rgba(74, 222, 128, 0.22)',
      text: 'var(--og-success, #4ADE80)',
      icon: ShieldCheck,
      defaultLabel: 'READY',
    },
    HEALTHY: {
      bg: 'rgba(74, 222, 128, 0.10)',
      border: 'rgba(74, 222, 128, 0.22)',
      text: 'var(--og-success, #4ADE80)',
      icon: ShieldCheck,
      defaultLabel: 'HEALTHY',
    },
    MODELLED: {
      bg: 'rgba(231, 166, 58, 0.10)',
      border: 'rgba(231, 166, 58, 0.24)',
      text: 'var(--og-amber, #E7A63A)',
      icon: Compass,
      defaultLabel: 'MODELLED',
    },
    MODELLED_CORRELATION: {
      bg: 'rgba(231, 166, 58, 0.10)',
      border: 'rgba(231, 166, 58, 0.24)',
      text: 'var(--og-amber, #E7A63A)',
      icon: Compass,
      defaultLabel: 'MODELLED',
    },
    ANALYTICAL: {
      bg: 'rgba(168, 85, 247, 0.10)',
      border: 'rgba(168, 85, 247, 0.24)',
      text: 'var(--og-violet, #A855F7)',
      icon: Database,
      defaultLabel: 'ANALYTICAL',
    },
    AIS: {
      bg: 'rgba(168, 85, 247, 0.10)',
      border: 'rgba(168, 85, 247, 0.24)',
      text: 'var(--og-violet, #A855F7)',
      icon: Database,
      defaultLabel: 'AIS',
    },
    DEMONSTRATION: {
      bg: 'rgba(168, 85, 247, 0.10)',
      border: 'rgba(168, 85, 247, 0.24)',
      text: 'var(--og-violet, #A855F7)',
      icon: Database,
      defaultLabel: 'DEMONSTRATION',
    },
    SYNTHESIS: {
      bg: 'rgba(236, 72, 153, 0.12)',
      border: 'rgba(236, 72, 153, 0.25)',
      text: 'var(--og-magenta, #EC4899)',
      icon: Sparkles,
      defaultLabel: 'SYNTHESIS',
    },
    ERROR: {
      bg: 'rgba(248, 113, 113, 0.12)',
      border: 'rgba(248, 113, 113, 0.25)',
      text: 'var(--og-error, #F87171)',
      icon: AlertCircle,
      defaultLabel: 'ERROR',
    },
    FAILED: {
      bg: 'rgba(248, 113, 113, 0.12)',
      border: 'rgba(248, 113, 113, 0.25)',
      text: 'var(--og-error, #F87171)',
      icon: AlertCircle,
      defaultLabel: 'FAILED',
    },
    CRITICAL: {
      bg: 'rgba(248, 113, 113, 0.12)',
      border: 'rgba(248, 113, 113, 0.25)',
      text: 'var(--og-error, #F87171)',
      icon: AlertCircle,
      defaultLabel: 'CRITICAL',
    },
    NOT_ESTABLISHED: {
      bg: 'rgba(255, 255, 255, 0.045)',
      border: 'rgba(255, 255, 255, 0.08)',
      text: 'var(--og-text-secondary, #B1B6BD)',
      icon: Database,
      defaultLabel: 'NOT ESTABLISHED',
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
        fontFamily: "var(--og-font-mono, 'JetBrains Mono', monospace)",
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
      title={`Data classification: ${normType}`}
      aria-label={`Classification: ${label || config.defaultLabel}`}
    >
      <IconComponent size={iconSizes[size] || 12} />
      <span>{label || config.defaultLabel}</span>
    </span>
  );
}
