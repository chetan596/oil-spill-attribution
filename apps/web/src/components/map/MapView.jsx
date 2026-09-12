import React, { useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import MapLegend from './MapLegend';

// Fix default Leaflet icon paths in Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function MapController({ center, zoom, bounds }) {
  const map = useMap();

  useEffect(() => {
    if (bounds && bounds.length === 2 && bounds[0] && bounds[1]) {
      try {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
      } catch (err) {
        console.warn('Could not fit bounds:', err);
      }
    } else if (center) {
      map.setView(center, zoom || 10);
    }
  }, [map, center, zoom, bounds]);

  return null;
}

export default function MapView({
  children,
  center = [18.921, 72.832], // Default to Mumbai offshore
  zoom = 10,
  bounds = null,
  showLegend = true,
  legendStyle = {},
  style = { height: '100%', width: '100%', minHeight: '450px' }
}) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '450px', borderRadius: '8px', overflow: 'hidden' }}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={style}
        scrollWheelZoom={true}
      >
        {/* Dark Mode Maritime Basemap */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          maxZoom={19}
        />
        <MapController center={center} zoom={zoom} bounds={bounds} />
        {children}
      </MapContainer>

      {/* Floating Map Legend */}
      {showLegend && <MapLegend style={legendStyle} />}
    </div>
  );
}
