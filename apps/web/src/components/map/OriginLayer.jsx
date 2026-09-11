import React from 'react';

export default function OriginLayer({ originPoint }) {
  if (!originPoint) return null;
  return (
    <div className="origin-layer" style={{ position: 'absolute', top: 110, left: 20, color: '#ffd166' }}>
      <span>Estimated Origin: [{originPoint.lat}, {originPoint.lng}]</span>
    </div>
  );
}
