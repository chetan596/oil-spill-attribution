import React from 'react';

export default function VesselScore({ score = 0, showDetails = false, breakdown = null }) {
  const percentage = Math.round((Number(score) || 0) * 100);
  const color = percentage >= 80 ? '#ef476f' : percentage >= 60 ? '#f59e0b' : '#38bdf8';

  const formatScore = (val) => {
    if (val == null || isNaN(val)) return 'N/A';
    return `${Math.round(Number(val) * 100)}%`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '90px', height: '8px', background: '#1e293b', borderRadius: '4px', overflow: 'hidden' }}>
          <div
            style={{
              width: `${Math.min(percentage, 100)}%`,
              height: '100%',
              background: color,
              borderRadius: '4px',
              transition: 'width 0.4s ease-out',
            }}
          />
        </div>
        <span style={{ fontWeight: 700, fontSize: '0.85rem', color, fontFamily: 'var(--font-mono)' }}>
          {percentage}%
        </span>
      </div>

      {showDetails && breakdown && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '6px', fontSize: '0.72rem', color: '#94a3b8' }}>
          <div>Proximity: <span style={{ color: '#f8fafc', fontWeight: 600 }}>{formatScore(breakdown.proximityScore)}</span></div>
          <div>Temporal: <span style={{ color: '#f8fafc', fontWeight: 600 }}>{formatScore(breakdown.temporalScore)}</span></div>
          <div>Trajectory: <span style={{ color: '#f8fafc', fontWeight: 600 }}>{formatScore(breakdown.trajectoryScore)}</span></div>
          <div>Anomaly: <span style={{ color: '#f8fafc', fontWeight: 600 }}>{formatScore(breakdown.anomalyScore)}</span></div>
        </div>
      )}
    </div>
  );
}
