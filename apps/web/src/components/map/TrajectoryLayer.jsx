import React from 'react';
import { Polyline, CircleMarker, Popup } from 'react-leaflet';
import { Compass, Waves, Navigation } from 'lucide-react';

export default function TrajectoryLayer({ driftData }) {
  if (!driftData) return null;

  const rawBackward = driftData.backwardPath || (driftData.points || []).filter((p) => p.phase === 'backward');
  const rawForward = driftData.forwardPath || (driftData.points || []).filter((p) => p.phase === 'forward');

  const backwardPoints = rawBackward.map((pt) => [
    Number(pt.latitude ?? pt.lat),
    Number(pt.longitude ?? pt.lng),
  ]).filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng));

  const forwardPoints = rawForward.map((pt) => [
    Number(pt.latitude ?? pt.lat),
    Number(pt.longitude ?? pt.lng),
  ]).filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng));

  return (
    <>
      {/* Modelled Backward Reverse Hindcast Path */}
      {backwardPoints.length > 1 && (
        <>
          <Polyline
            positions={backwardPoints}
            pathOptions={{
              color: '#38bdf8',
              weight: 3,
              opacity: 0.85,
              dashArray: '6, 6',
            }}
          />
          {/* Waypoint markers along backward path */}
          {rawBackward.map((pt, idx) => {
            const lat = Number(pt.latitude ?? pt.lat);
            const lng = Number(pt.longitude ?? pt.lng);
            if (isNaN(lat) || isNaN(lng) || idx % 4 !== 0) return null;
            const uncertainty = pt.uncertaintyRadiusKm ?? pt.uncertainty_radius_km ?? 1.5;
            return (
              <CircleMarker
                key={`bwd-${idx}`}
                center={[lat, lng]}
                radius={3.5}
                pathOptions={{
                  color: '#38bdf8',
                  weight: 1,
                  fillColor: '#0284c7',
                  fillOpacity: 1,
                }}
              >
                <Popup>
                  <div style={{ color: '#f8fafc', fontSize: '0.8rem', minWidth: '180px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#38bdf8', fontWeight: 700 }}>
                      <Compass size={14} />
                      <span>Modelled Backward Step #{idx} (-{idx}h)</span>
                    </div>
                    <div style={{ margin: '2px 0', color: '#cbd5e1' }}>
                      Time: {new Date(pt.timestamp).toLocaleTimeString()}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                      Coords: [{lat.toFixed(4)}, {lng.toFixed(4)}]
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                      Uncertainty Radius: ±{Number(uncertainty).toFixed(1)} km
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </>
      )}

      {/* Modelled Forward Forecast Drift Path */}
      {forwardPoints.length > 1 && (
        <>
          <Polyline
            positions={forwardPoints}
            pathOptions={{
              color: '#10b981',
              weight: 2.5,
              opacity: 0.85,
            }}
          />
          {/* Forward forecast endpoint marker */}
          {rawForward.length > 0 && (
            <CircleMarker
              center={[
                Number(rawForward[rawForward.length - 1].latitude ?? rawForward[rawForward.length - 1].lat),
                Number(rawForward[rawForward.length - 1].longitude ?? rawForward[rawForward.length - 1].lng),
              ]}
              radius={5}
              pathOptions={{
                color: '#ffffff',
                weight: 1.5,
                fillColor: '#10b981',
                fillOpacity: 1,
              }}
            >
              <Popup>
                <div style={{ color: '#f8fafc', fontSize: '0.8rem', minWidth: '180px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#10b981', fontWeight: 700 }}>
                    <Navigation size={14} />
                    <span>Modelled Forward Forecast Endpoint</span>
                  </div>
                  <div style={{ margin: '2px 0', color: '#cbd5e1' }}>
                    Projection (+{rawForward.length - 1}h): {new Date(rawForward[rawForward.length - 1].timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          )}
        </>
      )}
    </>
  );
}
