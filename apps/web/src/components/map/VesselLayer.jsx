import React from 'react';
import { CircleMarker, Popup, Polyline } from 'react-leaflet';
import { Ship, Database } from 'lucide-react';

export default function VesselLayer({ candidateVessels = [], selectedVessel, onSelectVessel, vesselTrack }) {
  if (!candidateVessels || candidateVessels.length === 0) return null;

  return (
    <>
      {/* AIS Historical Track for Selected Vessel */}
      {vesselTrack && vesselTrack.track && vesselTrack.track.length > 1 && (
        <Polyline
          positions={vesselTrack.track.map((pt) => [Number(pt.latitude), Number(pt.longitude)])}
          pathOptions={{
            color: '#a855f7',
            weight: 3,
            opacity: 0.9,
            dashArray: '4, 6',
          }}
        />
      )}
      {vesselTrack && vesselTrack.trackPoints && vesselTrack.trackPoints.length > 1 && (
        <Polyline
          positions={vesselTrack.trackPoints.map((pt) => [Number(pt.latitude), Number(pt.longitude)])}
          pathOptions={{
            color: '#a855f7',
            weight: 3,
            opacity: 0.9,
            dashArray: '4, 6',
          }}
        />
      )}

      {/* Candidate Vessel Markers */}
      {candidateVessels.map((item, idx) => {
        const vessel = item.vessel || item;
        const evidence = item.evidence || {};
        const isRank1 = item.rank === 1 || idx === 0;
        const isSelected = selectedVessel && (selectedVessel.vessel?.mmsi === vessel.mmsi || selectedVessel.mmsi === vessel.mmsi);

        // Approximate or exact vessel position from passing coordinate / evidence
        const lat = Number(evidence.passingLat ?? evidence.latitude ?? (18.98 + idx * 0.04));
        const lng = Number(evidence.passingLng ?? evidence.longitude ?? (72.72 - idx * 0.05));

        if (isNaN(lat) || isNaN(lng)) return null;

        const scorePercent = Math.round((item.totalScore ?? 0) * 100);

        return (
          <CircleMarker
            key={vessel.mmsi || idx}
            center={[lat, lng]}
            radius={isSelected ? 10 : isRank1 ? 8 : 6}
            pathOptions={{
              color: isSelected ? '#ffffff' : isRank1 ? '#ef476f' : '#38bdf8',
              weight: isSelected ? 3 : 2,
              fillColor: isRank1 ? '#ef476f' : '#0284c7',
              fillOpacity: 0.9,
            }}
            eventHandlers={{
              click: () => onSelectVessel && onSelectVessel(item),
            }}
          >
            <Popup>
              <div style={{ color: '#f8fafc', padding: '4px', minWidth: '200px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: isRank1 ? '#ef476f' : '#38bdf8', fontWeight: 700 }}>
                  <Ship size={16} />
                  <span>{vessel.name || 'Candidate Vessel'}</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '2px 0' }}>
                  MMSI: {vessel.mmsi} | Flag: {vessel.flag || 'N/A'}
                </div>
                <div style={{ margin: '6px 0', padding: '4px 8px', background: '#1e293b', borderRadius: '4px', fontSize: '0.82rem' }}>
                  <strong>Attribution Score:</strong>{' '}
                  <span style={{ color: isRank1 ? '#ef476f' : '#38bdf8', fontWeight: 700 }}>
                    {scorePercent}% (Rank #{item.rank || idx + 1})
                  </span>
                </div>
                {evidence.distanceKm != null && (
                  <div style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                    Distance to Origin: <strong>{evidence.distanceKm} km</strong>
                  </div>
                )}
                {evidence.speedAtPassingKts != null && (
                  <div style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                    Passing Speed: <strong>{evidence.speedAtPassingKts} kts</strong>
                  </div>
                )}
                <div style={{ fontSize: '0.68rem', color: '#fbbf24', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Database size={10} />
                  <span>DEMO AIS DATASET</span>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}
