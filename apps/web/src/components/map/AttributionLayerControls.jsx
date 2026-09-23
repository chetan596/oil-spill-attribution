import React, { useState } from 'react';
import { Layers, ChevronDown, ChevronUp, Eye, EyeOff, Ship, Target, Crosshair, AlertCircle, Compass, Radio } from 'lucide-react';
import EvidenceBadge from '../common/EvidenceBadge';

/**
 * AttributionLayerControls — Dedicated layer controls for AIS Attribution Mode.
 * Categorized by Observation, Modelled, AIS, and Context layers with Basemap selection.
 */
export default function AttributionLayerControls({
  visibleLayers = {},
  onToggleLayer = () => {},
  basemapType = 'dark',
  onChangeBasemap = () => {},
  hasFootprint = false,
  hasSelectedCandidate = false,
  style = {},
}) {
  const [isOpen, setIsOpen] = useState(false);

  const categories = [
    {
      title: 'OBSERVATION',
      items: [
        {
          id: 'slick',
          name: 'Observed Slick',
          desc: 'Observed SAR oil slick polygon',
          badge: 'OBSERVED',
          enabled: visibleLayers.slick !== false,
          available: true,
        },
      ],
    },
    {
      title: 'MODELLED',
      items: [
        {
          id: 'origin',
          name: 'Modelled Origin',
          desc: 'Estimated release point & ±2.6 km uncertainty',
          badge: 'MODELLED',
          enabled: visibleLayers.origin !== false,
          available: true,
        },
        {
          id: 'cpa',
          name: 'CPA Vector & Marker',
          desc: 'Closest Point of Approach measurement vector',
          badge: 'MODELLED',
          enabled: visibleLayers.cpa !== false,
          available: true,
        },
      ],
    },
    {
      title: 'AIS TELEMETRY',
      items: [
        {
          id: 'vessels',
          name: 'Candidate Vessels',
          desc: 'Ranked candidate vessel markers',
          badge: 'DEMONSTRATION',
          enabled: visibleLayers.vessels !== false,
          available: true,
        },
        {
          id: 'tracks',
          name: 'AIS Historical Tracks',
          desc: 'Selected vessel GPS trajectory points',
          badge: 'DEMONSTRATION',
          enabled: visibleLayers.tracks !== false,
          available: true,
        },
      ],
    },
    {
      title: 'CONTEXT',
      items: [
        {
          id: 'grid',
          name: 'Coordinate Graticule',
          desc: 'Latitude / Longitude reference grid',
          badge: null,
          enabled: visibleLayers.grid !== false,
          available: true,
        },
        {
          id: 'sceneFootprint',
          name: 'SAR Scene Footprint',
          desc: 'Sentinel-1 acquisition boundary',
          badge: 'OBSERVED',
          enabled: visibleLayers.sceneFootprint !== false,
          available: hasFootprint,
        },
      ],
    },
  ];

  return (
    <div
      style={{
        position: 'relative',
        zIndex: 900,
        width: '260px',
        background: 'rgba(11, 21, 19, 0.94)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        overflow: 'hidden',
        pointerEvents: 'auto',
        ...style,
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
            AIS LAYER STACK
          </span>
        </div>
        {isOpen ? <ChevronUp size={13} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />}
      </button>

      {isOpen && (
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '240px', overflowY: 'auto' }}>
          {categories.map((cat) => (
            <div key={cat.title}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px', letterSpacing: '0.05em' }}>
                {cat.title}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {cat.items.map((layer) => (
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
          ))}

          {/* Basemap Selection */}
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '0.05em' }}>
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
