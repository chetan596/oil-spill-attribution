import React from 'react';
import ConfidenceBadge from './ConfidenceBadge';

export default function SpillCard({ spill }) {
  return (
    <div className="spill-card" style={{ border: '1px solid #1f293d', padding: '16px', borderRadius: '8px', background: '#111927', color: '#fff' }}>
      <h3>{spill?.title || 'Unidentified Marine Slick'}</h3>
      <p>Area: {spill?.areaKm2 || 0} km²</p>
      <p>Detected: {spill?.detectedAt || new Date().toISOString()}</p>
      <ConfidenceBadge score={spill?.confidence || 0.85} />
    </div>
  );
}
