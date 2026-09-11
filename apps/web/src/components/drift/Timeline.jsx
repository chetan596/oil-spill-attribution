import React from 'react';

export default function Timeline({ currentTime, onTimeChange }) {
  return (
    <div style={{ padding: '12px', background: '#1e293b', borderRadius: '6px', color: '#fff' }}>
      <label>Hindcast Drift Timeline: </label>
      <input
        type="range"
        min="0"
        max="48"
        value={currentTime || 0}
        onChange={(e) => onTimeChange && onTimeChange(Number(e.target.value))}
        style={{ width: '100%' }}
      />
      <span>-{currentTime || 0} Hours Before Detection</span>
    </div>
  );
}
