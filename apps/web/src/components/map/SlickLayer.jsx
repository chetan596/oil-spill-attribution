import React from 'react';
import { Polygon, CircleMarker, Popup } from 'react-leaflet';
import { parseWktPolygon } from '../../utils/geo';
import { Droplet } from 'lucide-react';

export default function SlickLayer({ spill, showIncidentZone = false }) {
  if (!spill) return null;

  const polygonCoords = parseWktPolygon(spill.geomWkt);
  const centerLat = Number(spill.latitude ?? spill.lat);
  const centerLng = Number(spill.longitude ?? spill.lng);
  const confidencePercent = Math.round((spill.confidence || 0.94) > 1 ? spill.confidence : (spill.confidence || 0.94) * 100);

  return (
    <>
      {/* Restrained Secondary Incident Detection Zone (Analysis only) */}
      {showIncidentZone && polygonCoords.length > 2 && (
        <Polygon
          positions={polygonCoords}
          pathOptions={{
            color: 'rgba(248, 113, 113, 0.5)',
            weight: 1.5,
            fillColor: 'rgba(248, 113, 113, 0.06)',
            fillOpacity: 0.08,
            dashArray: '6, 6',
          }}
        />
      )}

      {/* Observed Potential Oil Slick Footprint (#49C6C8 Observed Teal) */}
      {polygonCoords.length > 2 && (
        <Polygon
          positions={polygonCoords}
          pathOptions={{
            color: '#49C6C8',
            weight: 2,
            fillColor: '#49C6C8',
            fillOpacity: 0.24,
          }}
        >
          <Popup autoPan={true} autoPanPadding={[24, 24]} maxWidth={220} minWidth={160}>
            <div style={{ color: '#FFFFFF', padding: '4px', fontFamily: "'Schibsted Grotesk', -apple-system, sans-serif", minWidth: '180px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '4px', marginBottom: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#49C6C8', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>
                  <Droplet size={13} />
                  <span>Potential Slick</span>
                </div>
                <span style={{ fontSize: '9px', fontWeight: 700, color: '#49C6C8', background: 'rgba(73, 198, 200, 0.15)', padding: '1px 5px', borderRadius: '3px' }}>
                  OBSERVED
                </span>
              </div>
              <div style={{ fontSize: '10px', color: '#828282', fontFamily: 'monospace', marginBottom: '3px' }}>
                {centerLat.toFixed(4)}°N, {centerLng.toFixed(4)}°E
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', margin: '2px 0' }}>
                <span style={{ color: '#828282' }}>Area:</span>
                <strong style={{ color: '#FFFFFF' }}>{spill.areaKm2} km²</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', margin: '2px 0' }}>
                <span style={{ color: '#828282' }}>Confidence:</span>
                <strong style={{ color: '#49C6C8' }}>{confidencePercent}%</strong>
              </div>
              <div style={{ marginTop: '6px', paddingTop: '4px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <a
                  href={`/analysis/${spill.id || 'demo-scene-001'}?tab=sar`}
                  style={{ color: '#49C6C8', fontSize: '11px', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}
                >
                  Analyze →
                </a>
              </div>
            </div>
          </Popup>
        </Polygon>
      )}

      {/* Spill Centroid Marker */}
      {!isNaN(centerLat) && !isNaN(centerLng) && (
        <CircleMarker
          center={[centerLat, centerLng]}
          radius={6}
          pathOptions={{
            color: '#FFFFFF',
            weight: 2,
            fillColor: '#49C6C8',
            fillOpacity: 1,
          }}
        >
          <Popup autoPan={true} autoPanPadding={[24, 24]} maxWidth={220} minWidth={160}>
            <div style={{ color: '#FFFFFF', padding: '4px', fontFamily: "'Schibsted Grotesk', -apple-system, sans-serif", minWidth: '170px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '4px', marginBottom: '4px' }}>
                <strong style={{ color: '#49C6C8', fontSize: '11px', textTransform: 'uppercase' }}>Spill Centroid</strong>
                <span style={{ fontSize: '9px', fontWeight: 700, color: '#49C6C8', background: 'rgba(73, 198, 200, 0.15)', padding: '1px 5px', borderRadius: '3px' }}>
                  OBSERVED
                </span>
              </div>
              <div style={{ fontSize: '10px', color: '#828282', fontFamily: 'monospace', margin: '2px 0' }}>
                [{centerLat.toFixed(4)}°N, {centerLng.toFixed(4)}°E]
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#DCDCDC', margin: '2px 0' }}>
                <span style={{ color: '#828282' }}>Confidence:</span>
                <strong style={{ color: '#49C6C8' }}>{confidencePercent}%</strong>
              </div>
              <div style={{ marginTop: '6px', paddingTop: '4px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <a
                  href={`/analysis/${spill.id || 'demo-scene-001'}?tab=sar`}
                  style={{ color: '#49C6C8', fontSize: '11px', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}
                >
                  Analyze →
                </a>
              </div>
            </div>
          </Popup>
        </CircleMarker>
      )}
    </>
  );
}
