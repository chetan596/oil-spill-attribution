import React from 'react';
import { ShieldCheck, AlertTriangle } from 'lucide-react';

export default function ConfidenceBadge({ score = 0, label = 'Confidence' }) {
  const percentage = Math.round((Number(score) || 0) * 100);
  const isHigh = percentage >= 80;
  const isMedium = percentage >= 50 && percentage < 80;

  const bg = isHigh ? 'var(--og-success-soft, rgba(52, 211, 153, 0.15))' : isMedium ? 'var(--og-amber-soft, rgba(231, 166, 58, 0.15))' : 'var(--og-error-soft, rgba(248, 113, 113, 0.15))';
  const border = isHigh ? 'var(--og-success-border, rgba(52, 211, 153, 0.3))' : isMedium ? 'var(--og-amber-border, rgba(231, 166, 58, 0.3))' : 'var(--og-error-border, rgba(248, 113, 113, 0.3))';
  const color = isHigh ? 'var(--og-success, #34D399)' : isMedium ? 'var(--og-amber, #E7A63A)' : 'var(--og-error, #F87171)';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        backgroundColor: bg,
        border: `1px solid ${border}`,
        color: color,
        padding: '3px 7px',
        borderRadius: '4px',
        fontWeight: 600,
        fontSize: '0.72rem',
        fontFamily: 'var(--font-mono)',
        fontVariantNumeric: 'tabular-nums',
      }}
      aria-label={`${label}: ${percentage}%`}
    >
      {isHigh ? <ShieldCheck size={12} /> : <AlertTriangle size={12} />}
      <span>{percentage}% {label}</span>
    </span>
  );
}
