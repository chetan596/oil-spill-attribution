import React from 'react';
import { Polygon, Tooltip, Popup } from 'react-leaflet';
import EvidenceBadge from '../common/EvidenceBadge';
import { Satellite, Calendar, Layers, Maximize2 } from 'lucide-react';

/**
 * Helper to parse standard WKT POLYGON((lng lat, ...)) into Leaflet [lat, lng] array
 */
function parseWktPolygonToLatLngs(wkt) {
  if (!wkt || typeof wkt !== 'string') return null;
  try {
    const match = wkt.match(/POLYGON\s*\(\s*\((.+?)\)\s*\)/i);
    if (!match || !match[1]) return null;

    const pairs = match[1].split(',').map((s) => s.trim());
    const latLngs = [];

    for (const pair of pairs) {
      const parts = pair.split(/\s+/);
      if (parts.length >= 2) {
        const lng = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lng)) {
          latLngs.push([lat, lng]);
        }
      }
    }

    return latLngs.length >= 3 ? latLngs : null;
  } catch (err) {
    console.warn('[SceneFootprintLayer] WKT parsing failed:', err);
    return null;
  }
}

/**
 * SceneFootprintLayer — Renders Sentinel-1 SAR acquisition footprint ONLY if real geometry exists.
 */
export default function SceneFootprintLayer({
  scene = null,
  sceneWkt = null,
  visible = true,
}) {
  if (!visible) return null;

  // Real scene footprint geometry
  const wkt = sceneWkt || scene?.geomWkt;
  if (!wkt) return null;

  const positions = parseWktPolygonToLatLngs(wkt);
  if (!positions || positions.length === 0) return null;

  const sceneId = scene?.sceneId || 'DEMO-SAR-SENTINEL1-MUMBAI-2026-001';
  const satellite = scene?.satellite || 'Sentinel-1 C-Band SAR';
  const acquisitionAt = scene?.acquisitionAt
    ? new Date(scene.acquisitionAt).toUTCString()
    : '2026-03-10 12:00:00 UTC';
  const polarisation = scene?.bandInfo?.polarisation || 'VV + VH Dual-Pol';
  const resolution = scene?.bandInfo?.resolutionMeters || 10;

  return (
    <Polygon
      positions={positions}
      pathOptions={{
        color: '#38bdf8',
        weight: 1.5,
        dashArray: '6, 6',
        fillColor: '#0284c7',
        fillOpacity: 0.04,
      }}
    >
      <Tooltip sticky>
        <div style={{ padding: '2px 4px', fontSize: '0.72rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, color: '#38bdf8' }}>
            <Satellite size={12} />
            <span>Sentinel-1 Scene Footprint</span>
          </div>
          <div style={{ color: '#94a3b8', fontSize: '0.68rem', marginTop: '2px' }}>
            ID: {sceneId}
          </div>
        </div>
      </Tooltip>

      <Popup>
        <div style={{ padding: '6px', minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Sentinel-1 SAR Footprint
            </span>
            <EvidenceBadge classification="OBSERVED" size="sm" />
          </div>

          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Scene ID:</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{sceneId}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Platform / Sensor:</span>
              <span>{satellite}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Acquisition:</span>
              <span>{acquisitionAt}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Polarization:</span>
              <span>{polarisation}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Spatial Res:</span>
              <span>{resolution} m</span>
            </div>
          </div>
        </div>
      </Popup>
    </Polygon>
  );
}
