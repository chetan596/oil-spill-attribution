import React from 'react';
import VesselScore from './VesselScore';

export default function VesselDetails({ vessel }) {
  if (!vessel) return <div>Select a vessel to inspect evidence details.</div>;
  return (
    <div style={{ padding: '16px', background: '#0f172a', borderRadius: '8px', color: '#e2e8f0' }}>
      <h3>{vessel.name} ({vessel.flag})</h3>
      <p>IMO: {vessel.imo} | MMSI: {vessel.mmsi}</p>
      <p>Vessel Type: {vessel.type}</p>
      <p>Speed at Incident: {vessel.speedKnots} kts</p>
      <VesselScore score={vessel.score} />
    </div>
  );
}
