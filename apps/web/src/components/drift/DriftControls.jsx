import React from 'react';

export default function DriftControls({ isPlaying, onTogglePlay, onReset }) {
  return (
    <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
      <button onClick={onTogglePlay} style={{ padding: '6px 14px', borderRadius: '4px', cursor: 'pointer' }}>
        {isPlaying ? 'Pause' : 'Play Simulation'}
      </button>
      <button onClick={onReset} style={{ padding: '6px 14px', borderRadius: '4px', cursor: 'pointer' }}>
        Reset
      </button>
    </div>
  );
}
