import React, { useState } from 'react';
import { Layers, ChevronDown, ChevronUp, Info } from 'lucide-react';

export default function MapLegend({ style = {} }) {
  const [isExpanded, setIsExpanded] = useState(true);

  const legendItems = [
    {
      label: 'Observed Potential Oil Slick',
      description: 'Sentinel-1 SAR segmented slick polygon',
      color: '#ef4444',
      symbol: (
        <span
          style={{
            display: 'inline-block',
            width: '12px',
            height: '12px',
            backgroundColor: 'rgba(239, 68, 68, 0.45)',
            border: '1.5px solid #ef4444',
            borderRadius: '2px',
          }}
        />
      ),
    },
    {
      label: 'Modelled Spill Origin',
      description: 'Lagrangian reverse hindcast origin',
      color: '#f59e0b',
      symbol: (
        <span
          style={{
            display: 'inline-block',
            width: '10px',
            height: '10px',
            backgroundColor: '#f59e0b',
            border: '1.5px solid #ffffff',
            borderRadius: '50%',
            boxShadow: '0 0 6px #f59e0b',
          }}
        />
      ),
    },
    {
      label: 'Modelled Origin Uncertainty Radius',
      description: '±2.6 km turbulent diffusion dispersion',
      color: '#fbbf24',
      symbol: (
        <span
          style={{
            display: 'inline-block',
            width: '12px',
            height: '12px',
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            border: '1.5px dashed #f59e0b',
            borderRadius: '50%',
          }}
        />
      ),
    },
    {
      label: 'Modelled Backward Trajectory',
      description: '24h Lagrangian reverse hindcast',
      color: '#38bdf8',
      symbol: (
        <span
          style={{
            display: 'inline-block',
            width: '16px',
            height: '0',
            borderTop: '2px dashed #38bdf8',
          }}
        />
      ),
    },
    {
      label: 'Modelled Forward Forecast',
      description: '6h forward drift projection',
      color: '#10b981',
      symbol: (
        <span
          style={{
            display: 'inline-block',
            width: '16px',
            height: '0',
            borderTop: '2px solid #10b981',
          }}
        />
      ),
    },
    {
      label: 'Candidate Vessel AIS Tracks',
      description: 'Historical vessel telemetry path',
      color: '#a855f7',
      symbol: (
        <span
          style={{
            display: 'inline-block',
            width: '16px',
            height: '0',
            borderTop: '2px solid #a855f7',
          }}
        />
      ),
    },
  ];

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '24px',
        left: '24px',
        zIndex: 1000,
        backgroundColor: 'rgba(11, 21, 19, 0.95)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
        color: 'var(--text-primary)',
        maxWidth: '240px',
        fontSize: '0.78rem',
        overflow: 'hidden',
        pointerEvents: 'auto',
        ...style,
      }}
      aria-label="Map Legend"
    >
      {/* Header / Toggle */}
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
        aria-controls="map-legend-items"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-cyan)' }}>
          <Layers size={13} />
          <span style={{ color: 'var(--text-primary)' }}>Map Legend</span>
        </div>
        {isExpanded ? <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} /> : <ChevronUp size={13} style={{ color: 'var(--text-muted)' }} />}
      </button>

      {/* Legend Items */}
      {isExpanded && (
        <div id="map-legend-items" style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {legendItems.map((item) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '18px', display: 'flex', justifyContent: 'center' }}>
                {item.symbol}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {item.label}
                </div>
                <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.description}
                </div>
              </div>
            </div>
          ))}

          <div
            style={{
              marginTop: '4px',
              paddingTop: '6px',
              borderTop: '1px solid var(--border-color)',
              fontSize: '0.66rem',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '4px',
              lineHeight: 1.2,
            }}
          >
            <Info size={10} style={{ color: 'var(--accent-cyan)', flexShrink: 0, marginTop: '2px' }} />
            <span>Deterministic demo scenario layers.</span>
          </div>
        </div>
      )}
    </div>
  );
}
