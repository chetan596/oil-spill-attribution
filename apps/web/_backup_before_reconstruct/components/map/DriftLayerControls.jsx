import React, { useState } from 'react';
import { Layers, ChevronDown, ChevronUp, Eye, EyeOff, Wind, Target, Compass, Navigation, Waves } from 'lucide-react';
import EvidenceBadge from '../common/EvidenceBadge';

/**
 * DriftLayerControls — Dedicated layer controls for Drift & Forecast Mode.
 */
export default function DriftLayerControls({
  visibleLayers = {},
  onToggleLayer = () => {},
  basemapType = 'dark',
  onChangeBasemap = () => {},
  hasForecast = true,
}) {
  const [isOpen, setIsOpen] = useState(true);

  const layerItems = [
    {
      id: 'origin',
      name: 'Modelled Spill Origin',
      desc: 'Estimated release point & ±2.6 km uncertainty',
      badge: 'MODELLED',
      enabled: visibleLayers.origin !== false,
      available: true,
    },
    {
      id: 'hindcast',
      name: 'Backward Hindcast Track',
      desc: '24-hour backward advection trajectory',
      badge: 'MODELLED',
      enabled: visibleLayers.hindcast !== false,
      available: true,
    },
    {
      id: 'forecast',
      name: 'Forward Forecast Track',
      desc: '6-hour forward advection trajectory',
      badge: 'MODELLED',
      enabled: visibleLayers.forecast !== false,
      available: hasForecast,
    },
    {
      id: 'metocean',
      name: 'MetOcean Forcing Vectors',
      desc: 'Demonstration wind & current boundary fields',
      badge: 'DEMONSTRATION',
      enabled: visibleLayers.metocean !== false,
      available: true,
    },
    {
      id: 'slick',
      name: 'Observed Slick Boundary',
      desc: 'Observed SAR footprint context',
      badge: 'OBSERVED',
      enabled: visibleLayers.slick !== false,
      available: true,
    },
    {
      id: 'grid',
      name: 'Coordinate Grid (Graticule)',
      desc: 'Geographic latitude / longitude grid',
      badge: null,
      enabled: visibleLayers.grid !== false,
      available: true,
    },
  ];

  return (
    <div
      style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        zIndex: 900,
        width: '270px',
        background: 'rgba(11, 21, 19, 0.94)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          padding: '8px 12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          borderBottom: isOpen ? '1px solid var(--border-color)' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Layers size={13} style={{ color: 'var(--accent-amber)' }} />
          <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em', color: 'var(--text-primary)' }}>
            DRIFT LAYER STACK
          </span>
        </div>
        {isOpen ? <ChevronUp size={13} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />}
      </button>

      {isOpen && (
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '420px', overflowY: 'auto' }}>
          {/* Active Layers */}
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '0.05em' }}>
              ACTIVE DRIFT LAYERS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {layerItems.map((layer) => (
                <div
                  key={layer.id}
                  onClick={() => layer.available && onToggleLayer(layer.id)}
                  style={{
                    padding: '5px 8px',
                    borderRadius: '3px',
                    border: '1px solid',
                    borderColor: layer.enabled ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255,255,255,0.05)',
                    background: layer.enabled ? 'rgba(245, 158, 11, 0.06)' : 'rgba(0,0,0,0.2)',
                    cursor: layer.available ? 'pointer' : 'not-allowed',
                    opacity: layer.available ? 1 : 0.45,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: layer.enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {layer.name}
                      </span>
                      {layer.badge && <EvidenceBadge classification={layer.badge} size="sm" />}
                    </div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{layer.desc}</span>
                  </div>

                  {layer.enabled ? (
                    <Eye size={13} style={{ color: 'var(--accent-amber)' }} />
                  ) : (
                    <EyeOff size={13} style={{ color: 'var(--text-muted)' }} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Basemap Selection */}
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '0.05em' }}>
              BASEMAP SELECTION
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
              {[
                { id: 'dark', label: 'Dark Navy' },
                { id: 'satellite', label: 'Satellite' },
                { id: 'ocean', label: 'Bathymetry' },
              ].map((b) => (
                <button
                  key={b.id}
                  onClick={() => onChangeBasemap(b.id)}
                  style={{
                    padding: '3px 4px',
                    fontSize: '0.62rem',
                    fontWeight: basemapType === b.id ? 700 : 500,
                    background: basemapType === b.id ? 'var(--accent-amber)' : 'rgba(255,255,255,0.05)',
                    color: basemapType === b.id ? '#0f172a' : 'var(--text-secondary)',
                    border: '1px solid',
                    borderColor: basemapType === b.id ? 'var(--accent-amber)' : 'rgba(255,255,255,0.1)',
                    borderRadius: '3px',
                    cursor: 'pointer',
                  }}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
