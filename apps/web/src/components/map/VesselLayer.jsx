import React from 'react';

export default function VesselLayer({ vessels = [] }) {
  return (
    <div className="vessel-layer" style={{ position: 'absolute', top: 80, left: 20, color: '#4cc9f0' }}>
      <span>Tracked AIS Vessels: {vessels.length}</span>
    </div>
  );
}
