import React, { useState } from 'react';
import { Eye, EyeOff, SlidersHorizontal, ChevronDown, ChevronUp, Layers, MapPin } from 'lucide-react';

export default function LayerControls({
  layers = {
    slick: true,
    origin: true,
    hindcast: true,
    forecast: true,
    vessels: true,
    tracks: true,
    metocean: false,
    grid: true,
  },
  onToggleLayer,
  basemapType = 'dark',
  onChangeBasemap,
  style = {},
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const layerSections = [
    {
      title: 'OBSERVATION',
      items: [
        { key: 'slick', label: 'Potential Oil Slick (SAR)', color: '#ff4d5e' },
      ],
    },
    {
      title: 'MODELLED DRIFT',
      items: [
        { key: 'origin', label: 'Modelled Origin (±2.6 km)', color: '#ffb84a' },
        { key: 'hindcast', label: '24h Reverse Hindcast', color: '#33d6ff' },
        { key: 'forecast', label: '6h Forward Forecast', color: '#43e08a' },
      ],
    },
    {
      title: 'MARITIME & AIS',
      items: [
        { key: 'vessels', label: 'Candidate Vessels', color: '#a56bff' },
        { key: 'tracks', label: 'AIS Telemetry & CPA Line', color: '#ffc44d' },
      ],
    },
    {
      title: 'ENVIRONMENT (DEMO)',
      items: [
        { key: 'metocean', label: 'Wind & Current Vectors', color: '#2dd4bf' },
      ],
    },
    {
      title: 'CONTEXT',
      items: [
        { key: 'grid', label: 'Lat/Long Coordinate Grid', color: '#334d44' },
      ],
    },
  ];

  return (
    <div
      style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        zIndex: 950,
        backgroundColor: 'rgba(11, 21, 19, 0.95)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
        color: 'var(--text-primary)',
        fontSize: '0.78rem',
        overflow: 'hidden',
        pointerEvents: 'auto',
        minWidth: '220px',
        maxWidth: '260px',
        ...style,
      }}
      aria-label="Map Layer Visibility Controls"
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: 'none',
          border: 'none',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          fontWeight: 700,
          fontSize: '0.78rem',
          borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none',
        }}
        aria-expanded={isExpanded}
        aria-controls="layer-toggle-list"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-cyan)' }}>
          <SlidersHorizontal size={13} />
          <span style={{ color: 'var(--text-primary)' }}>Map Layers & Grid</span>
        </div>
        {isExpanded ? <ChevronUp size={13} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />}
      </button>

      {isExpanded && (
        <div id="layer-toggle-list" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '420px', overflowY: 'auto' }}>
          {/* Basemap Selection */}
          {onChangeBasemap && (
            <div style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                BASEMAP
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => onChangeBasemap('dark')}
                  style={{
                    padding: '4px 6px',
                    fontSize: '0.72rem',
                    borderRadius: '3px',
                    border: `1px solid ${basemapType === 'dark' ? 'var(--accent-cyan)' : 'var(--border-color)'}`,
                    background: basemapType === 'dark' ? 'rgba(56, 189, 248, 0.15)' : 'var(--surface-sunken)',
                    color: basemapType === 'dark' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  Maritime Dark
                </button>
                <button
                  type="button"
                  onClick={() => onChangeBasemap('satellite')}
                  style={{
                    padding: '4px 6px',
                    fontSize: '0.72rem',
                    borderRadius: '3px',
                    border: `1px solid ${basemapType === 'satellite' ? 'var(--accent-cyan)' : 'var(--border-color)'}`,
                    background: basemapType === 'satellite' ? 'rgba(56, 189, 248, 0.15)' : 'var(--surface-sunken)',
                    color: basemapType === 'satellite' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  Satellite
                </button>
              </div>
            </div>
          )}

          {/* Categorized Layers */}
          {layerSections.map((section, sIdx) => (
            <div key={sIdx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ fontSize: '0.66rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {section.title}
              </div>
              {section.items.map(({ key, label, color }) => {
                const isVisible = layers[key] !== false;
                return (
                  <label
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      padding: '2px 0',
                      userSelect: 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          backgroundColor: color,
                          opacity: isVisible ? 1 : 0.35,
                        }}
                      />
                      <span style={{ fontSize: '0.73rem', color: isVisible ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {label}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onToggleLayer && onToggleLayer(key)}
                      aria-label={`Toggle ${label} visibility`}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: isVisible ? 'var(--accent-cyan)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '2px',
                      }}
                    >
                      {isVisible ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

