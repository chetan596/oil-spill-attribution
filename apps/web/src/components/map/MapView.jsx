import React, { useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Globe } from 'lucide-react';
import MapLegend from './MapLegend';

// Fix default Leaflet icon paths in Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function MapController({ center, zoom, bounds, maxBoundsZoom = 14, scenarioKey }) {
  const map = useMap();

  useEffect(() => {
    // Invalidate map size so dynamic layout and viewport dimensions stay synchronized
    try {
      map.invalidateSize();
    } catch {
      // ignore
    }

    if (bounds && bounds.length === 2 && bounds[0] && bounds[1]) {
      try {
        map.fitBounds(bounds, { padding: [45, 45], maxZoom: maxBoundsZoom, animate: true });
      } catch {
        try {
          map.fitBounds(bounds, { padding: [45, 45], maxZoom: maxBoundsZoom, animate: false });
        } catch (err) {
          console.warn('Could not fit bounds:', err);
        }
      }
    } else if (center && center.length === 2 && !isNaN(center[0]) && !isNaN(center[1])) {
      try {
        map.flyTo(center, zoom || 10, { animate: true, duration: 0.6 });
      } catch {
        map.setView(center, zoom || 10, { animate: false });
      }
    }
  }, [map, center, zoom, bounds, maxBoundsZoom, scenarioKey]);

  return null;
}

export default function MapView({
  children,
  center = null,
  zoom = 10,
  bounds = null,
  maxBoundsZoom = 14,
  showLegend = false,
  legendStyle = {},
  style = { height: '100%', width: '100%', minHeight: '100%' },
  mapMode = 'operational',
  scenarioKey = null,
}) {
  const hasCoordinates = Boolean(
    (center && center.length === 2 && !isNaN(center[0]) && !isNaN(center[1])) ||
    (bounds && bounds.length === 2 && bounds[0] && bounds[1])
  );
  const initialCenter = hasCoordinates ? (center || (bounds ? undefined : [0, 0])) : [0, 0];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '8px', overflow: 'hidden', background: '#0A0B0D' }}>
      {!hasCoordinates && (
        <div
          data-testid="geospatial-unlocated-overlay"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(10, 11, 13, 0.94)',
            zIndex: 1000,
            gap: '12px',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              padding: '16px',
              borderRadius: '50%',
              background: 'rgba(100, 116, 139, 0.15)',
              border: '1px solid rgba(100, 116, 139, 0.3)',
            }}
          >
            <Globe size={36} color="#64748B" />
          </div>
          <div
            style={{
              fontSize: '0.90rem',
              fontWeight: 800,
              letterSpacing: '0.08em',
              color: '#F1F5F9',
              textTransform: 'uppercase',
              fontFamily: "var(--og-font-mono, 'JetBrains Mono', monospace)",
            }}
          >
            GEOSPATIAL LOCATION NOT AVAILABLE
          </div>
          <p
            style={{
              margin: 0,
              fontSize: '0.78rem',
              color: '#94A3B8',
              maxWidth: '380px',
              lineHeight: '1.5',
            }}
          >
            The analyzed imagery lacks embedded geographic coordinates (CRS / affine geotransform). Real-world map layers cannot be positioned.
          </p>
        </div>
      )}
      <MapContainer
        key={scenarioKey || 'default-map'}
        center={initialCenter}
        bounds={hasCoordinates && bounds ? bounds : undefined}
        zoom={zoom}
        style={style}
        scrollWheelZoom={hasCoordinates}
        zoomControl={hasCoordinates}
      >
        {mapMode === 'satellite' ? (
          <>
            <TileLayer
              key="satellite-base"
              attribution='&copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={17}
            />
            <TileLayer
              key="satellite-ref"
              attribution=""
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              maxZoom={17}
            />
          </>
        ) : mapMode === 'terrain' ? (
          <>
            <TileLayer
              key="terrain-base"
              attribution='&copy; <a href="https://www.esri.com/">Esri</a>, GEBCO, NOAA'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}"
              maxZoom={13}
            />
            <TileLayer
              key="terrain-ref"
              attribution=""
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}"
              maxZoom={13}
            />
          </>
        ) : (
          <>
            {/* Clean, Watermark-Free Dark Maritime Basemap (Esri World Dark Gray Canvas) */}
            <TileLayer
              key="operational-base"
              attribution='&copy; <a href="https://www.esri.com/">Esri</a> &copy; OpenStreetMap contributors'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
              maxZoom={16}
            />
            {/* Crisp Maritime & Coastal Boundary Reference Layer */}
            <TileLayer
              key="operational-ref"
              attribution=""
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
              maxZoom={16}
            />
          </>
        )}
        <MapController center={center} zoom={zoom} bounds={bounds} maxBoundsZoom={maxBoundsZoom} scenarioKey={scenarioKey} />
        {children}
      </MapContainer>

      {/* Floating Map Legend */}
      {showLegend && <MapLegend style={legendStyle} />}
    </div>
  );
}
