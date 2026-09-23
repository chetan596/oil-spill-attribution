import React from 'react';
import { CircleMarker, Circle, Popup } from 'react-leaflet';
import { Target, AlertCircle } from 'lucide-react';

export default function OriginLayer({ driftData }) {
  if (!driftData) return null;

  const lat = Number(driftData.originLat ?? driftData.latitude);
  const lng = Number(driftData.originLng ?? driftData.longitude);
  const uncertaintyRadiusKm = Number(driftData.uncertaintyRadiusKm ?? driftData.simulationMeta?.uncertaintyRadiusKm ?? 2.5);

  if (isNaN(lat) || isNaN(lng)) return null;

  const uncertaintyRadiusMeters = uncertaintyRadiusKm * 1000.0;

  return (
    <>
      {/* Modelled Origin Uncertainty Radius Circle */}
      <Circle
        center={[lat, lng]}
        radius={uncertaintyRadiusMeters}
        pathOptions={{
          color: '#f59e0b',
          weight: 1.5,
          fillColor: '#f59e0b',
          fillOpacity: 0.15,
          dashArray: '4, 4',
        }}
      />

      {/* Outer Pulse Ring */}
      <CircleMarker
        center={[lat, lng]}
        radius={14}
        pathOptions={{
          color: '#f59e0b',
          weight: 1.5,
          fillColor: '#f59e0b',
          fillOpacity: 0.25,
          dashArray: '2, 4',
        }}
      />

      {/* Origin Center Point */}
      <CircleMarker
        center={[lat, lng]}
        radius={7}
        pathOptions={{
          color: '#ffffff',
          weight: 2,
          fillColor: '#f59e0b',
          fillOpacity: 1,
        }}
      >
        <Popup>
          <div style={{ color: '#f8fafc', padding: '4px', minWidth: '220px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f59e0b', fontWeight: 700 }}>
              <Target size={16} />
              <span>Modelled Spill Origin</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '3px 0' }}>
              Classification: <strong style={{ color: '#f59e0b' }}>MODELLED ESTIMATE</strong>
            </div>
            <p style={{ margin: '4px 0', fontSize: '0.82rem', color: '#e2e8f0' }}>
              <strong>Origin Coords:</strong> {lat.toFixed(4)}°N, {lng.toFixed(4)}°E
            </p>
            {driftData.originTimestamp && (
              <p style={{ margin: '4px 0', fontSize: '0.82rem', color: '#e2e8f0' }}>
                <strong>Estimated Time:</strong> {new Date(driftData.originTimestamp).toUTCString()}
              </p>
            )}
            <div style={{ margin: '6px 0', padding: '4px 8px', background: '#1e293b', borderRadius: '4px', fontSize: '0.78rem' }}>
              <strong>Modelled Origin Uncertainty Radius:</strong>{' '}
              <span style={{ color: '#f59e0b', fontWeight: 700 }}>±{uncertaintyRadiusKm.toFixed(1)} km</span>
            </div>
            <div style={{ fontSize: '0.70rem', color: '#94a3b8', marginTop: '4px' }}>
              Lagrangian Reverse Hindcast ({driftData.timeWindowHours || 24}h backward)
            </div>
          </div>
        </Popup>
      </CircleMarker>
    </>
  );
}
