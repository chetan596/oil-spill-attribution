import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Wind, Waves } from 'lucide-react';
import EvidenceBadge from '../common/EvidenceBadge';

// Create SVG Arrow icon for Wind / Current vectors
function createVectorIcon(label, speed, angleDeg, color) {
  const svgHtml = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: auto;">
      <div style="transform: rotate(${angleDeg}deg); transform-origin: center; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 4px ${color});">
          <line x1="12" y1="19" x2="12" y2="5" />
          <polyline points="5 12 12 5 19 12" />
        </svg>
      </div>
      <div style="background: rgba(11,21,19,0.9); border: 1px solid ${color}; border-radius: 3px; padding: 1px 4px; font-size: 9px; font-family: monospace; font-weight: 700; color: ${color}; white-space: nowrap; margin-top: 2px;">
        ${label} ${speed}
      </div>
    </div>
  `;

  return L.divIcon({
    html: svgHtml,
    className: 'metocean-vector-icon',
    iconSize: [60, 48],
    iconAnchor: [30, 24],
  });
}

export default function MetOceanLayer({ center = [19.05, 72.6] }) {
  if (!center || isNaN(center[0]) || isNaN(center[1])) return null;

  // Real demonstration MetOcean boundary forcing: NW Wind (12.4 kts, 315 deg blowing to 135) + SE Current (0.8 kts, 135 deg)
  const windPos = [center[0] + 0.08, center[1] - 0.12];
  const currentPos = [center[0] - 0.06, center[1] + 0.1];

  return (
    <>
      {/* Wind Vector (Cyan) */}
      <Marker position={windPos} icon={createVectorIcon('WIND', '12.4kt NW', 135, '#33d6ff')}>
        <Popup>
          <div style={{ color: 'var(--text-primary)', padding: '4px', minWidth: '190px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#33d6ff', fontWeight: 800, fontSize: '0.82rem' }}>
                <Wind size={14} />
                <span>WIND FORCING</span>
              </div>
              <EvidenceBadge type="DEMONSTRATION" size="xs" />
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <div>Velocity: <strong style={{ color: 'var(--text-primary)' }}>12.4 knots (6.4 m/s)</strong></div>
              <div>Direction: <strong style={{ color: 'var(--text-primary)' }}>North-West (315&deg;)</strong></div>
              <div>Windage Transfer Factor: <strong style={{ color: 'var(--text-primary)' }}>3.0%</strong></div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Demonstration boundary MetOcean input
              </div>
            </div>
          </div>
        </Popup>
      </Marker>

      {/* Ocean Surface Current Vector (Teal) */}
      <Marker position={currentPos} icon={createVectorIcon('CURRENT', '0.8kt SE', 135, '#2dd4bf')}>
        <Popup>
          <div style={{ color: 'var(--text-primary)', padding: '4px', minWidth: '190px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#2dd4bf', fontWeight: 800, fontSize: '0.82rem' }}>
                <Waves size={14} />
                <span>SURFACE CURRENT</span>
              </div>
              <EvidenceBadge type="DEMONSTRATION" size="xs" />
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <div>Velocity: <strong style={{ color: 'var(--text-primary)' }}>0.8 knots (0.41 m/s)</strong></div>
              <div>Direction: <strong style={{ color: 'var(--text-primary)' }}>South-East (135&deg;)</strong></div>
              <div>Advection Factor: <strong style={{ color: 'var(--text-primary)' }}>100%</strong></div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Demonstration boundary MetOcean input
              </div>
            </div>
          </div>
        </Popup>
      </Marker>
    </>
  );
}
