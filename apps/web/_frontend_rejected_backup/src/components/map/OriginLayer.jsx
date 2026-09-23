import React from 'react';
import { CircleMarker, Circle, Popup, Marker } from 'react-leaflet';
import L from 'leaflet';
import { Target, Compass, Navigation } from 'lucide-react';
import EvidenceBadge from '../common/EvidenceBadge';

// Create tactical amber crosshair icon for Modelled Origin
function createOriginCrosshairIcon() {
  const svgHtml = `
    <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
      <div style="position: absolute; width: 24px; height: 24px; border: 1.5px solid #ffb84a; border-radius: 50%; animation: og-radar-pulse 2.2s infinite ease-in-out;"></div>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#ffb84a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 6px rgba(255,184,74,0.7));">
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="3" x2="12" y2="7" />
        <line x1="12" y1="17" x2="12" y2="21" />
        <line x1="3" y1="12" x2="7" y2="12" />
        <line x1="17" y1="12" x2="21" y2="12" />
        <circle cx="12" cy="12" r="2" fill="#ffb84a" />
      </svg>
    </div>
  `;

  return L.divIcon({
    html: svgHtml,
    className: 'origin-crosshair-icon',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

export default function OriginLayer({ driftData }) {
  if (!driftData) return null;

  const lat = Number(driftData.originLat ?? driftData.latitude);
  const lng = Number(driftData.originLng ?? driftData.longitude);
  const uncertaintyRadiusKm = Number(
    driftData.uncertaintyRadiusKm ?? driftData.simulationMeta?.uncertaintyRadiusKm ?? 2.6
  );

  if (isNaN(lat) || isNaN(lng)) return null;

  const uncertaintyRadiusMeters = uncertaintyRadiusKm * 1000.0;

  return (
    <>
      {/* Modelled Origin Uncertainty Radius Circle */}
      <Circle
        center={[lat, lng]}
        radius={uncertaintyRadiusMeters}
        pathOptions={{
          color: '#ffb84a',
          weight: 1.5,
          fillColor: '#ffb84a',
          fillOpacity: 0.12,
          dashArray: '4, 4',
        }}
      />

      {/* Origin Center Point Crosshair Marker */}
      <Marker position={[lat, lng]} icon={createOriginCrosshairIcon()}>
        <Popup>
          <div style={{ color: 'var(--text-primary)', padding: '6px', minWidth: '230px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ffb84a', fontWeight: 800, fontSize: '0.88rem' }}>
                <Target size={16} />
                <span>MODELLED SPILL ORIGIN</span>
              </div>
              <EvidenceBadge type="MODELLED" size="xs" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.78rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px', background: 'var(--surface-sunken)', borderRadius: '3px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Origin Coordinates:</span>
                <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {lat.toFixed(4)}°N, {lng.toFixed(4)}°E
                </strong>
              </div>

              {driftData.originTimestamp && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px', background: 'var(--surface-sunken)', borderRadius: '3px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Discharge Time:</span>
                  <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.74rem' }}>
                    {new Date(driftData.originTimestamp).toUTCString()}
                  </strong>
                </div>
              )}

              <div style={{ margin: '4px 0', padding: '6px 8px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '4px' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Modelled Origin Uncertainty Radius</div>
                <div style={{ color: '#ffb84a', fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>
                  ±{uncertaintyRadiusKm.toFixed(1)} km
                </div>
              </div>

              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '4px' }}>
                Engine: <strong>BUILT-IN DEMONSTRATION LAGRANGIAN MODEL</strong> ({driftData.timeWindowHours || 24}h Reverse Trace)
              </div>
            </div>
          </div>
        </Popup>
      </Marker>
    </>
  );
}

