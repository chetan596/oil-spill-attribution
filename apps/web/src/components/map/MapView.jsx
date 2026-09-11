import React from 'react';

export default function MapView({ children, center = [20.0, 70.0], zoom = 6 }) {
  return (
    <div className="map-view-container" style={{ width: '100%', height: '100%', minHeight: '500px', background: '#0b132b', position: 'relative' }}>
      <div className="map-placeholder-header" style={{ padding: '12px', color: '#64dfdf' }}>
        <strong>Interactive Marine Attribution Map</strong> (Center: {center[0]}, {center[1]} | Zoom: {zoom})
      </div>
      {children}
    </div>
  );
}
