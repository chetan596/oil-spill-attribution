import React from 'react';

export default function VesselScore({ score = 0, showDetails = false, breakdown = null }) {
  const percentage = Math.round((Number(score) || 0) * 100);
  const color = percentage >= 80 ? 'var(--og-violet, #A855F7)' : percentage >= 60 ? 'var(--og-amber, #E7A63A)' : 'var(--og-text-muted, #777E87)';

  const formatScore = (val) => {
    if (val == null || isNaN(val)) return 'N/A';
    return `${Math.round(Number(val) * 100)}%`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '90px', height: '8px', background: 'var(--og-surface-recessed, #0C0E11)', border: '1px solid var(--og-border, #25292F)', borderRadius: '4px', overflow: 'hidden' }}>
          <div
            style={{
              width: `${Math.min(percentage, 100)}%`,
              height: '100%',
              background: color,
              borderRadius: '2px',
              transition: 'width 0.3s ease-out',
            }}
          />
        </div>
        <span style={{ fontWeight: 700, fontSize: '0.85rem', color, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
          {percentage}%
        </span>
      </div>

      {showDetails && breakdown && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '6px', fontSize: '0.72rem', color: 'var(--og-text-secondary, #B1B6BD)' }}>
          <div>Proximity: <span style={{ color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatScore(breakdown.proximityScore)}</span></div>
          <div>Temporal: <span style={{ color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatScore(breakdown.temporalScore)}</span></div>
          <div>Trajectory: <span style={{ color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatScore(breakdown.trajectoryScore)}</span></div>
          <div>Anomaly: <span style={{ color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatScore(breakdown.anomalyScore)}</span></div>
        </div>
      )}
    </div>
  );
}
