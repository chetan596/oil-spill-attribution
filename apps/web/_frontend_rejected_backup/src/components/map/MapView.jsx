import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, useMap, ScaleControl } from 'react-leaflet';
import L from 'leaflet';
import MapLegend from './MapLegend';
import { Compass } from 'lucide-react';

// Fix default Leaflet icon paths in Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function MapController({ center, zoom, bounds, flyToTarget }) {
  const map = useMap();

  useEffect(() => {
    if (flyToTarget) {
      if (flyToTarget.bounds && flyToTarget.bounds.length === 2) {
        try {
          map.fitBounds(flyToTarget.bounds, { padding: [60, 60], maxZoom: 13 });
        } catch (err) {
          console.warn('Could not fit target bounds:', err);
        }
      } else if (flyToTarget.center) {
        map.flyTo(flyToTarget.center, flyToTarget.zoom || 12, {
          duration: 1.2,
          easeLinearity: 0.25,
        });
      }
    } else if (bounds && bounds.length === 2 && bounds[0] && bounds[1]) {
      try {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
      } catch (err) {
        console.warn('Could not fit bounds:', err);
      }
    } else if (center) {
      map.setView(center, zoom || 10);
    }
  }, [map, center, zoom, bounds, flyToTarget]);

  return null;
}

export default function MapView({
  children,
  center = [18.921, 72.832], // Default to Mumbai offshore
  zoom = 10,
  bounds = null,
  flyToTarget = null,
  showLegend = true,
  legendStyle = {},
  basemapType = 'dark', // 'dark', 'satellite', 'ocean'
  style = { height: '100%', width: '100%', minHeight: '520px' },
}) {
  const cartoApiKey = import.meta.env?.VITE_CARTO_API_KEY;

  // Primary dark maritime basemap: Esri World Dark Gray Canvas (high-reliability, zero watermark)
  // or Carto Dark with API key if configured
  const getTileConfig = () => {
    if (basemapType === 'satellite') {
      return {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
        maxZoom: 18,
      };
    }
    if (basemapType === 'ocean') {
      return {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Tiles &copy; Esri &mdash; GEBCO, NOAA, National Geographic',
        maxZoom: 16,
      };
    }

    if (cartoApiKey) {
      return {
        url: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?api_key=${cartoApiKey}`,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
      };
    }

    // Default clean dark maritime canvas (zero watermark, perfect dark ocean)
    return {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ &bull; Ocean Guard AI',
      maxZoom: 16,
    };
  };

  const tileConfig = getTileConfig();

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '520px', borderRadius: '4px', overflow: 'hidden' }}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={style}
        scrollWheelZoom={true}
      >
        {/* Clean Maritime Basemap (Zero Watermark) */}
        <TileLayer
          key={basemapType}
          attribution={tileConfig.attribution}
          url={tileConfig.url}
          maxZoom={tileConfig.maxZoom}
        />

        {/* Tactical Reference Overlay for Dark Base (Labels & Coastlines) */}
        {basemapType === 'dark' && !cartoApiKey && (
          <TileLayer
            attribution=""
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
            maxZoom={16}
            opacity={0.8}
          />
        )}

        {/* Scale Indicator */}
        <ScaleControl position="bottomleft" imperial={false} metric={true} />

        <MapController center={center} zoom={zoom} bounds={bounds} flyToTarget={flyToTarget} />
        {children}
      </MapContainer>

      {/* Tactical North Arrow / Compass Indicator */}
      <div
        style={{
          position: 'absolute',
          bottom: '28px',
          left: '12px',
          zIndex: 900,
          background: 'rgba(11, 21, 19, 0.88)',
          backdropFilter: 'blur(6px)',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          padding: '4px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          color: 'var(--text-secondary)',
          fontSize: '0.7rem',
          fontFamily: 'var(--font-mono)',
          pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>N</span>
          <div style={{ width: '1.5px', height: '10px', background: 'var(--accent-cyan)' }} />
        </div>
        <span>TRUE NORTH &bull; WGS84</span>
      </div>

      {/* Floating Map Legend */}
      {showLegend && <MapLegend style={legendStyle} />}
    </div>
  );
}

