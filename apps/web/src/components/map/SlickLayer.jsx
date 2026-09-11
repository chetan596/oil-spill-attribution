import React from 'react';

export default function SlickLayer({ slicks = [] }) {
  return (
    <div className="slick-layer" style={{ position: 'absolute', top: 50, left: 20, color: '#f72585' }}>
      <span>Active Slicks Loaded: {slicks.length}</span>
    </div>
  );
}
