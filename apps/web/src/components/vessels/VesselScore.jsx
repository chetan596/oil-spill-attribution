import React from 'react';

export default function VesselScore({ score = 0.5 }) {
  const percentage = Math.round(score * 100);
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ width: '100px', height: '8px', background: '#334155', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: `${percentage}%`, height: '100%', background: percentage > 70 ? '#ef476f' : '#38bdf8' }} />
      </div>
      <span style={{ fontWeight: 'bold' }}>{percentage}%</span>
    </div>
  );
}
