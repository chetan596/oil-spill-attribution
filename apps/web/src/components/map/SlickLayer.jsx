import React from 'react';
import { Polygon, CircleMarker, Popup } from 'react-leaflet';
import { parseWktPolygon } from '../../utils/geo';
import { Droplet } from 'lucide-react';

export default function SlickLayer({ spill }) {
  if (!spill) return null;

  const polygonCoords = parseWktPolygon(spill.geomWkt);
  const centerLat = Number(spill.latitude);
  const centerLng = Number(spill.longitude);

  return (
    <>
      {/* Spill Polygon Footprint */}
      {polygonCoords.length > 2 && (
        <Polygon
          positions={polygonCoords}
          pathOptions={{
            color: '#f43f5e',
            weight: 2,
            fillColor: '#f43f5e',
            fillOpacity: 0.35,
            dashArray: '4, 4',
          }}
        >
          <Popup>
            <div style={{ color: '#f8fafc', padding: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f43f5e', fontWeight: 700 }}>
                <Droplet size={16} />
                <span>Detected Oil Slick</span>
              </div>
              <p style={{ margin: '4px 0', fontSize: '0.85rem' }}>
                <strong>Area:</strong> {spill.areaKm2} km²
              </p>
              <p style={{ margin: '4px 0', fontSize: '0.85rem' }}>
                <strong>Confidence:</strong> {Math.round(spill.confidence * 100)}%
              </p>
              {spill.estimatedAgeHours && (
                <p style={{ margin: '4px 0', fontSize: '0.85rem' }}>
                  <strong>Est. Age:</strong> {spill.estimatedAgeHours}h before detection
                </p>
              )}
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
            color: '#ffffff',
            weight: 2,
            fillColor: '#f43f5e',
            fillOpacity: 1,
          }}
        >
          <Popup>
            <div style={{ color: '#f8fafc', padding: '4px' }}>
              <strong>Spill Centroid</strong>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                [{centerLat.toFixed(4)}, {centerLng.toFixed(4)}]
              </div>
            </div>
          </Popup>
        </CircleMarker>
      )}
    </>
  );
}
