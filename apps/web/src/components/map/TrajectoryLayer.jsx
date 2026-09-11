import React from 'react';

export default function TrajectoryLayer({ trajectories = [] }) {
  return (
    <div className="trajectory-layer" style={{ position: 'absolute', top: 140, left: 20, color: '#06d6a0' }}>
      <span>Hindcast Trajectories: {trajectories.length} paths</span>
    </div>
  );
}
