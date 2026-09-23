import React from 'react';
import { Polygon, CircleMarker, Popup, Circle } from 'react-leaflet';
import { parseWktPolygon } from '../../utils/geo';
import { Droplet, Satellite, Clock, Compass } from 'lucide-react';
import EvidenceBadge from '../common/EvidenceBadge';

export default function SlickLayer({ spill }) {
  if (!spill) return null;

  const polygonCoords = parseWktPolygon(spill.geomWkt);
  const centerLat = Number(spill.latitude);
  const centerLng = Number(spill.longitude);

  return (
    <>
      {/* Spill Polygon Footprint (Translucent Crimson Fill & Bright Crisp Border) */}
      {polygonCoords.length > 2 && (
        <Polygon
          positions={polygonCoords}
          pathOptions={{
            color: '#ff4d5e',
            weight: 2.5,
            opacity: 0.95,
            fillColor: '#ff4d5e',
            fillOpacity: 0.35,
            className: 'slick-polygon-glow',
          }}
        >
          <Popup>
            <div style={{ color: 'var(--text-primary)', padding: '6px', minWidth: '220px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ff4d5e', fontWeight: 800, fontSize: '0.88rem' }}>
                  <Droplet size={16} />
                  <span>POTENTIAL OIL SLICK</span>
                </div>
                <EvidenceBadge type="OBSERVED" size="xs" />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.78rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px', background: 'var(--surface-sunken)', borderRadius: '3px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Area Footprint:</span>
                  <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{spill.areaKm2} km²</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px', background: 'var(--surface-sunken)', borderRadius: '3px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Dark-spot Detection Confidence:</span>
                  <strong style={{ color: '#2dd4bf', fontFamily: 'var(--font-mono)' }}>{Math.round(spill.confidence * 100)}%</strong>
                </div>

                {spill.estimatedAgeHours && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px', background: 'var(--surface-sunken)', borderRadius: '3px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Estimated Slick Age:</span>
                    <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{spill.estimatedAgeHours}h</strong>
                  </div>
                )}

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '6px', marginTop: '2px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Satellite size={12} style={{ color: 'var(--accent-cyan)' }} />
                    <span>Sensor: <strong>Sentinel-1 C-Band SAR</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                    <Compass size={12} style={{ color: 'var(--accent-cyan)' }} />
                    <span>Polarization: <strong>VV + VH Dual-Pol</strong></span>
                  </div>
                  {spill.detectedAt && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                      <Clock size={12} style={{ color: 'var(--accent-cyan)' }} />
                      <span>Acquired: <strong style={{ fontFamily: 'var(--font-mono)' }}>{new Date(spill.detectedAt).toUTCString()}</strong></span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Popup>
        </Polygon>
      )}

      {/* Spill Centroid Marker with Subtle Pulse */}
      {!isNaN(centerLat) && !isNaN(centerLng) && (
        <>
          {/* Centroid Outer Radar Pulse */}
          <CircleMarker
            center={[centerLat, centerLng]}
            radius={12}
            pathOptions={{
              color: '#ff4d5e',
              weight: 1.5,
              fillColor: '#ff4d5e',
              fillOpacity: 0.15,
              dashArray: '3, 3',
            }}
          />

          <CircleMarker
            center={[centerLat, centerLng]}
            radius={5.5}
            pathOptions={{
              color: '#ffffff',
              weight: 2,
              fillColor: '#ff4d5e',
              fillOpacity: 1,
            }}
          >
            <Popup>
              <div style={{ color: 'var(--text-primary)', padding: '4px' }}>
                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#ff4d5e' }}>Spill Centroid (Observed)</div>
                <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  [{centerLat.toFixed(4)}°N, {centerLng.toFixed(4)}°E]
                </div>
              </div>
            </Popup>
          </CircleMarker>
        </>
      )}
    </>
  );
}

