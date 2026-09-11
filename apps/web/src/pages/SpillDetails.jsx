import React from 'react';
import SpillDetailsComponent from '../components/spills/SpillDetails';

export default function SpillDetails() {
  return (
    <div style={{ padding: '24px', color: '#fff' }}>
      <SpillDetailsComponent spill={{ id: 'SP-2026-001', lat: 18.92, lng: 72.83, confidence: 0.94 }} />
    </div>
  );
}
