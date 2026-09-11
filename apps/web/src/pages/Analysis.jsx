import React from 'react';
import MapView from '../components/map/MapView';
import VesselRankTable from '../components/vessels/VesselRankTable';

export default function Analysis() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', height: '100vh', background: '#020617' }}>
      <div>
        <MapView />
      </div>
      <div style={{ padding: '20px', overflowY: 'auto', borderLeft: '1px solid #1e293b' }}>
        <h2 style={{ color: '#fff' }}>Attribution Analysis Results</h2>
        <VesselRankTable rankedVessels={[]} />
      </div>
    </div>
  );
}
