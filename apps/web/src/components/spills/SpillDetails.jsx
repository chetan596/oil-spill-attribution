import React from 'react';
import ConfidenceBadge from './ConfidenceBadge';

export default function SpillDetails({ spill }) {
  return (
    <div className="spill-details" style={{ padding: '20px', background: '#0d1520', color: '#e2e8f0', borderRadius: '8px' }}>
      <h2>Spill Incident #{spill?.id || 'N/A'}</h2>
      <p><strong>Sensor:</strong> {spill?.sensor || 'Sentinel-1 SAR C-Band'}</p>
      <p><strong>Coordinates:</strong> {spill?.lat}, {spill?.lng}</p>
      <p><strong>Estimated Spill Age:</strong> {spill?.estimatedAgeHours || 12} hours</p>
      <ConfidenceBadge score={spill?.confidence || 0.92} />
    </div>
  );
}
