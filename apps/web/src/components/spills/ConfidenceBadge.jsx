import React from 'react';

export default function ConfidenceBadge({ score = 0.8 }) {
  const percentage = Math.round(score * 100);
  const color = percentage > 75 ? '#06d6a0' : percentage > 50 ? '#ffd166' : '#ef476f';

  return (
    <span style={{ backgroundColor: color, color: '#000', padding: '4px 10px', borderRadius: '12px', fontWeight: 'bold', fontSize: '12px' }}>
      {percentage}% Confidence
    </span>
  );
}
