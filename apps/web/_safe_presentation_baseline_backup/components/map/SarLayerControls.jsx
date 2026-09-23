import React, { useState } from 'react';
import { Layers, ChevronDown, ChevronUp, Eye, EyeOff, Info, Satellite, Check, AlertCircle } from 'lucide-react';
import EvidenceBadge from '../common/EvidenceBadge';

/**
 * SarLayerControls — Dedicated layer controls and channel switcher for SAR Analysis Mode.
 * Honestly distinguishes available geometric layers from unexposed raw raster channels.
 */
export default function SarLayerControls({
  visibleLayers = {},
  onToggleLayer = () => {},
  basemapType = 'dark',
  onChangeBasemap = () => {},
  hasFootprint = true,
}) {
  const [isOpen, setIsOpen] = useState(true);

  const availableLayers = [
    {
      id: 'slick',
      name: 'Observed Slick Boundary',
      desc: 'Observed SAR dark-spot polygon & radar centroid',
      badge: 'OBSERVED',
      enabled: visibleLayers.slick !== false,
      available: true,
    },
    {
      id: 'segmentation',
      name: 'AI Segmentation Mask',
      desc: 'U-Net neural probability boundary',
      badge: 'MODELLED',
      enabled: visibleLayers.segmentation !== false,
      available: true,
    },
    {
      id: 'sceneFootprint',
      name: 'Sentinel-1 Scene Footprint',
      desc: 'Real acquisition bounding geometry',
      badge: 'OBSERVED',
      enabled: visibleLayers.sceneFootprint !== false,
      available: hasFootprint,
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

  const unexposedRasterChannels = [
    {
      id: 'raw_sar',
      name: 'Raw SAR GeoTIFF Preview',
      desc: 'Full-resolution uncalibrated SAR raster',
      status: 'NOT EXPOSED BY CURRENT API',
    },
    {
      id: 'vv_channel',
      name: 'VV Co-Polarized Channel',
      desc: 'Vertical transmit / Vertical receive raster',
      status: 'NOT EXPOSED BY CURRENT API',
    },
    {
      id: 'vh_channel',
      name: 'VH Cross-Polarized Channel',
      desc: 'Vertical transmit / Horizontal receive raster',
      status: 'NOT EXPOSED BY CURRENT API',
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
          <Layers size={13} style={{ color: 'var(--accent-cyan)' }} />
          <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em', color: 'var(--text-primary)' }}>
            SAR LAYER STACK
          </span>
        </div>
        {isOpen ? <ChevronUp size={13} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />}
      </button>

      {isOpen && (
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '420px', overflowY: 'auto' }}>
          {/* Active Available Layers */}
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '0.05em' }}>
              ACTIVE SAR LAYERS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {availableLayers.map((layer) => (
                <div
                  key={layer.id}
                  onClick={() => layer.available && onToggleLayer(layer.id)}
                  style={{
                    padding: '5px 8px',
                    borderRadius: '3px',
                    border: '1px solid',
                    borderColor: layer.enabled ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255,255,255,0.05)',
                    background: layer.enabled ? 'rgba(56, 189, 248, 0.05)' : 'rgba(0,0,0,0.2)',
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
                    <Eye size={13} style={{ color: 'var(--accent-cyan)' }} />
                  ) : (
                    <EyeOff size={13} style={{ color: 'var(--text-muted)' }} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Unexposed Raster Channels (Honest Disclosure) */}
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>RASTER CHANNELS</span>
              <span style={{ fontSize: '0.58rem', color: '#f59e0b', fontWeight: 600 }}>API STATUS</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {unexposedRasterChannels.map((chan) => (
                <div
                  key={chan.id}
                  style={{
                    padding: '4px 6px',
                    borderRadius: '3px',
                    border: '1px dashed rgba(255, 255, 255, 0.1)',
                    background: 'rgba(0,0,0,0.2)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    opacity: 0.65,
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
                      {chan.name}
                    </div>
                    <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>
                      {chan.desc}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.55rem', color: '#94a3b8', background: 'rgba(255,255,255,0.05)', padding: '1px 4px', borderRadius: '2px', whiteSpace: 'nowrap' }}>
                    NOT EXPOSED
                  </span>
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
                    background: basemapType === b.id ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.05)',
                    color: basemapType === b.id ? '#0f172a' : 'var(--text-secondary)',
                    border: '1px solid',
                    borderColor: basemapType === b.id ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.1)',
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
