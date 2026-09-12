import React from 'react';
import { ShieldCheck, AlertTriangle } from 'lucide-react';

export default function ConfidenceBadge({ score = 0, label = 'Confidence' }) {
  const percentage = Math.round((Number(score) || 0) * 100);
  const isHigh = percentage >= 80;
  const isMedium = percentage >= 50 && percentage < 80;

  const bg = isHigh ? 'rgba(16, 185, 129, 0.15)' : isMedium ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)';
  const border = isHigh ? 'rgba(16, 185, 129, 0.3)' : isMedium ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)';
  const color = isHigh ? '#10b981' : isMedium ? '#f59e0b' : '#ef476f';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        backgroundColor: bg,
        border: `1px solid ${border}`,
        color: color,
        padding: '3px 8px',
        borderRadius: '12px',
        fontWeight: 600,
        fontSize: '0.72rem',
        fontFamily: 'var(--font-mono)',
      }}
    >
      {isHigh ? <ShieldCheck size={12} /> : <AlertTriangle size={12} />}
      <span>{percentage}% {label}</span>
    </span>
  );
}
