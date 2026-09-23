import React, { useState } from 'react';
import { Layers, ChevronDown, ChevronUp, Info } from 'lucide-react';

export default function MapLegend({ isReal = false, activeMode = 'investigation', style = {} }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const allLegendItems = [
    {
      id: 'slick',
      modes: ['investigation', 'sar', 'drift', 'ais'],
      label: 'Observed Potential Oil Slick',
      description: 'Sentinel-1 SAR segmented slick polygon',
      color: '#49C6C8',
      symbol: (
        <span
          style={{
            display: 'inline-block',
            width: '14px',
            height: '14px',
            backgroundColor: 'rgba(73, 198, 200, 0.25)',
            border: '2px solid #49C6C8',
            borderRadius: '2px',
          }}
        />
      ),
    },
    {
      id: 'footprint',
      modes: ['sar'],
      label: 'Sentinel-1 Scene Footprint',
      description: 'Acquisition bounding geometry (IW GRDH)',
      color: '#38BDF8',
      symbol: (
        <span
          style={{
            display: 'inline-block',
            width: '14px',
            height: '14px',
            backgroundColor: 'rgba(56, 189, 248, 0.1)',
            border: '1.5px dashed #38BDF8',
            borderRadius: '2px',
          }}
        />
      ),
    },
    {
      id: 'origin',
      modes: ['investigation', 'drift', 'ais'],
      label: isReal ? 'Spill Origin (Not Established)' : 'Modelled Spill Origin',
      description: isReal ? 'Not run for authentic CDSE scene' : 'Lagrangian reverse hindcast origin',
      color: '#E7A63A',
      symbol: (
        <span
          style={{
            display: 'inline-block',
            width: '12px',
            height: '12px',
            backgroundColor: '#E7A63A',
            border: '2px solid #ffffff',
            borderRadius: '50%',
            boxShadow: '0 0 6px rgba(231, 166, 58, 0.6)',
          }}
        />
      ),
    },
    {
      id: 'uncertainty',
      modes: ['drift'],
      label: isReal ? 'Origin Uncertainty (N/A)' : 'Modelled Origin Uncertainty Radius',
      description: isReal ? 'Not established' : '±2.6 km turbulent diffusion dispersion',
      color: '#E7A63A',
      symbol: (
        <span
          style={{
            display: 'inline-block',
            width: '14px',
            height: '14px',
            backgroundColor: 'rgba(231, 166, 58, 0.12)',
            border: '2px dashed #E7A63A',
            borderRadius: '50%',
          }}
        />
      ),
    },
    {
      id: 'hindcast',
      modes: ['investigation', 'drift'],
      label: isReal ? 'Backward Trajectory (Not Run)' : 'Modelled Backward Trajectory',
      description: isReal ? 'Not established' : '24h Lagrangian reverse hindcast',
      color: '#E7A63A',
      symbol: (
        <span
          style={{
            display: 'inline-block',
            width: '18px',
            height: '0',
            borderTop: '2px dashed #E7A63A',
          }}
        />
      ),
    },
    {
      id: 'forecast',
      modes: ['investigation', 'drift'],
      label: isReal ? 'Forward Forecast (Not Run)' : 'Modelled Forward Forecast',
      description: isReal ? 'Not established' : '6h forward numerical drift projection (Modelled)',
      color: '#4ADE80',
      symbol: (
        <span
          style={{
            display: 'inline-block',
            width: '18px',
            height: '0',
            borderTop: '2px dashed #4ADE80',
          }}
        />
      ),
    },
    {
      id: 'vessels',
      modes: ['investigation', 'ais'],
      label: isReal ? 'Candidate Vessels (Not Established)' : 'Candidate Vessel AIS Tracks',
      description: isReal ? 'Synthetic AIS isolated from CDSE' : 'Historical vessel telemetry path',
      color: '#A855F7',
      symbol: (
        <span
          style={{
            display: 'inline-block',
            width: '18px',
            height: '0',
            borderTop: '2px dashed #A855F7',
          }}
        />
      ),
    },
    {
      id: 'cpa',
      modes: ['investigation', 'ais'],
      label: isReal ? 'CPA (Not Established)' : 'Closest Point of Approach (CPA)',
      description: isReal ? 'Authoritative CPA unavailable' : 'Authoritative closest approach vector',
      color: '#A855F7',
      symbol: (
        <span
          style={{
            display: 'inline-block',
            width: '18px',
            height: '0',
            borderTop: '2px dotted #A855F7',
          }}
        />
      ),
    },
    {
      id: 'grid',
      modes: ['sar'],
      label: 'Coordinate Graticule',
      description: 'Geographic latitude / longitude grid',
      color: '#777E87',
      symbol: (
        <span
          style={{
            display: 'inline-block',
            width: '18px',
            height: '0',
            borderTop: '1px dashed #777E87',
          }}
        />
      ),
    },
  ];

  const legendItems = allLegendItems.filter((item) => item.modes.includes(activeMode));

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '16px',
        left: '16px',
        zIndex: 1000,
        backgroundColor: 'rgba(11, 21, 19, 0.94)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--og-border, #25292F)',
        borderRadius: '6px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
        color: 'var(--og-text-primary, #ECEEF1)',
        maxWidth: '255px',
        fontSize: '0.8rem',
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
          padding: '7px 12px',
          background: 'none',
          border: 'none',
          color: 'var(--og-text-primary, #ECEEF1)',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: '0.78rem',
          borderBottom: isExpanded ? '1px solid var(--og-border, #25292F)' : 'none',
        }}
        aria-expanded={isExpanded}
        aria-controls="map-legend-items"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--og-teal, #49C6C8)' }}>
          <Layers size={13} />
          <span style={{ color: 'var(--og-text-primary, #ECEEF1)' }}>
            {isExpanded ? 'Map Legend' : `Legend (${legendItems.length})`}
          </span>
        </div>
        {isExpanded ? <ChevronDown size={13} style={{ color: 'var(--og-text-muted, #777E87)' }} /> : <ChevronUp size={13} style={{ color: 'var(--og-text-muted, #777E87)' }} />}
      </button>

      {/* Legend Items */}
      {isExpanded && (
        <div id="map-legend-items" style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
          {legendItems.map((item) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '20px', display: 'flex', justifyContent: 'center' }}>
                {item.symbol}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--og-text-primary, #ECEEF1)' }}>
                  {item.label}
                </div>
                <div style={{ fontSize: '0.64rem', color: 'var(--og-text-muted, #777E87)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.description}
                </div>
              </div>
            </div>
          ))}

          <div
            style={{
              marginTop: '4px',
              paddingTop: '6px',
              borderTop: '1px solid var(--og-border-subtle, #1B1E22)',
              fontSize: '0.65rem',
              color: 'var(--og-text-muted, #777E87)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '4px',
              lineHeight: 1.2,
            }}
          >
            <Info size={10} style={{ color: 'var(--og-teal, #49C6C8)', flexShrink: 0, marginTop: '2px' }} />
            <span>{isReal ? 'Copernicus CDSE authentic acquisition context.' : 'Deterministic demo scenario layers.'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
