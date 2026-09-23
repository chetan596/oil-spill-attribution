import React, { useState } from 'react';
import { Eye, EyeOff, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react';

export default function LayerControls({
  layers = {
    slick: true,
    origin: true,
    hindcast: true,
    forecast: true,
    vessels: true,
    tracks: true,
    grid: false,
  },
  onToggleLayer,
  style = {},
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const layerConfigs = [
    { key: 'slick', label: 'Potential Oil Slick', color: '#49C6C8' },
    { key: 'origin', label: 'Modeled Origin', color: '#E7A63A' },
    { key: 'hindcast', label: 'Backward Hindcast', color: '#E7A63A' },
    { key: 'forecast', label: 'Forward Forecast (Modelled)', color: '#4ADE80' },
    { key: 'vessels', label: 'Candidate Vessels', color: '#A855F7' },
    { key: 'tracks', label: 'AIS Telemetry Track', color: '#A855F7' },
    { key: 'grid', label: 'Coordinate Graticule', color: '#777E87' },
  ];

  const activeCount = layerConfigs.filter((c) => layers[c.key] !== false).length;

  return (
    <div
      style={{
        backgroundColor: 'rgba(11, 21, 19, 0.94)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--og-border, #25292F)',
        borderRadius: '6px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
        color: 'var(--og-text-primary, #ECEEF1)',
        fontSize: '0.78rem',
        overflow: 'hidden',
        pointerEvents: 'auto',
        minWidth: '170px',
        maxWidth: '210px',
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
          padding: '6px 10px',
          background: 'none',
          border: 'none',
          color: '#f8fafc',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: '0.75rem',
          borderBottom: isExpanded ? '1px solid #1e293b' : 'none',
        }}
        aria-expanded={isExpanded}
        aria-controls="layer-toggle-list"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--og-teal, #49C6C8)' }}>
          <SlidersHorizontal size={13} />
          <span style={{ color: '#f8fafc' }}>
            {isExpanded ? 'Layer Toggles' : `Layers (${activeCount})`}
          </span>
        </div>
        {isExpanded ? <ChevronUp size={13} style={{ color: '#94a3b8' }} /> : <ChevronDown size={13} style={{ color: '#94a3b8' }} />}
      </button>

      {isExpanded && (
        <div id="layer-toggle-list" style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '220px', overflowY: 'auto' }}>
          {layerConfigs.map(({ key, label, color }) => {
            const isVisible = layers[key] !== false;
            return (
              <label
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  padding: '4px 0',
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: color,
                      opacity: isVisible ? 1 : 0.4,
                    }}
                  />
                  <span style={{ fontSize: '0.75rem', color: isVisible ? '#f8fafc' : '#64748b' }}>
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
                    color: isVisible ? '#38bdf8' : '#475569',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '2px',
                  }}
                >
                  {isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
