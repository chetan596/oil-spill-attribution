import React from 'react';
import VesselDetailsComponent from '../components/vessels/VesselDetails';

export default function VesselDetails() {
  return (
    <div style={{ padding: '24px', color: '#fff' }}>
      <VesselDetailsComponent vessel={{ name: 'PACIFIC DISCOVERY', imo: 9812456, mmsi: 563001240, type: 'Crude Oil Tanker', score: 0.91 }} />
    </div>
  );
}
