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
  },
  onToggleLayer,
  style = {},
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const layerConfigs = [
    { key: 'slick', label: 'Potential Oil Slick', color: '#f43f5e' },
    { key: 'origin', label: 'Modeled Origin', color: '#f59e0b' },
    { key: 'hindcast', label: 'Backward Hindcast', color: '#38bdf8' },
    { key: 'forecast', label: 'Forward Forecast', color: '#10b981' },
    { key: 'vessels', label: 'Candidate Vessels', color: '#0284c7' },
    { key: 'tracks', label: 'AIS Telemetry Track', color: '#a855f7' },
  ];

  return (
    <div
      style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        zIndex: 1000,
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(8px)',
        border: '1px solid #1e293b',
        borderRadius: '8px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
        color: '#f8fafc',
        fontSize: '0.8rem',
        overflow: 'hidden',
        pointerEvents: 'auto',
        minWidth: '180px',
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
          color: '#f8fafc',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: '0.8rem',
          borderBottom: isExpanded ? '1px solid #1e293b' : 'none',
        }}
        aria-expanded={isExpanded}
        aria-controls="layer-toggle-list"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8' }}>
          <SlidersHorizontal size={14} />
          <span style={{ color: '#f8fafc' }}>Layer Toggles</span>
        </div>
        {isExpanded ? <ChevronUp size={14} style={{ color: '#94a3b8' }} /> : <ChevronDown size={14} style={{ color: '#94a3b8' }} />}
      </button>

      {isExpanded && (
        <div id="layer-toggle-list" style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
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
