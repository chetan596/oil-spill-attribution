import React from 'react';

export default function DriftAnimation({ isPlaying, progress }) {
  return (
    <div className="drift-animation-indicator" style={{ color: '#38bdf8', padding: '8px' }}>
      Status: {isPlaying ? 'Playing Backward Simulation...' : 'Paused'} ({Math.round(progress * 100)}%)
    </div>
  );
}
