import React from 'react';
import VesselScore from './VesselScore';

export default function VesselRankTable({ rankedVessels = [] }) {
  return (
    <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', color: '#fff' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #334155' }}>
          <th>Rank</th>
          <th>Vessel Name</th>
          <th>MMSI</th>
          <th>Type</th>
          <th>Attribution Score</th>
        </tr>
      </thead>
      <tbody>
        {rankedVessels.map((v, idx) => (
          <tr key={v.mmsi || idx} style={{ borderBottom: '1px solid #1e293b' }}>
            <td>#{idx + 1}</td>
            <td>{v.name}</td>
            <td>{v.mmsi}</td>
            <td>{v.type}</td>
            <td><VesselScore score={v.score} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
