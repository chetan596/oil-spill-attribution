import React from 'react';
import { Target, Droplet, Crosshair, Ship, Navigation, Maximize2 } from 'lucide-react';

export default function MapFocusActions({
  onFocusIncident,
  onFocusOrigin,
  onFocusCpa,
  onFocusVessel,
  onFocusForecast,
  onFitAll,
  hasSelectedCandidate = false,
  hasForecast = false,
  style = {},
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 950,
        background: 'rgba(11, 21, 19, 0.94)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
        padding: '3px 6px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
        pointerEvents: 'auto',
        ...style,
      }}
      aria-label="Tactical Map Focus Actions"
    >
      <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 4px' }}>
        Focus:
      </span>

      {/* Incident Focus */}
      <button
        onClick={onFocusIncident}
        className="og-btn og-btn-secondary"
        style={{ padding: '4px 8px', fontSize: '0.72rem', gap: '4px' }}
        title="Focus on Observed Potential Oil Slick"
      >
        <Droplet size={12} style={{ color: '#ff4d5e' }} />
        <span>Slick</span>
      </button>

      {/* Origin Focus */}
      <button
        onClick={onFocusOrigin}
        className="og-btn og-btn-secondary"
        style={{ padding: '4px 8px', fontSize: '0.72rem', gap: '4px' }}
        title="Focus on Modelled Spill Origin & Uncertainty"
      >
        <Target size={12} style={{ color: '#ffb84a' }} />
        <span>Origin</span>
      </button>

      {/* CPA Focus (Enabled when candidate selected) */}
      <button
        onClick={onFocusCpa}
        disabled={!hasSelectedCandidate}
        className="og-btn og-btn-secondary"
        style={{ padding: '4px 8px', fontSize: '0.72rem', gap: '4px' }}
        title="Focus on Closest Point of Approach (CPA)"
      >
        <Crosshair size={12} style={{ color: '#ffc44d' }} />
        <span>CPA</span>
      </button>

      {/* Vessel Focus */}
      <button
        onClick={onFocusVessel}
        disabled={!hasSelectedCandidate}
        className="og-btn og-btn-secondary"
        style={{ padding: '4px 8px', fontSize: '0.72rem', gap: '4px' }}
        title="Focus on Selected Candidate Vessel Position"
      >
        <Ship size={12} style={{ color: '#a56bff' }} />
        <span>Vessel</span>
      </button>

      {/* Forecast Focus */}
      {hasForecast && (
        <button
          onClick={onFocusForecast}
          className="og-btn og-btn-secondary"
          style={{ padding: '4px 8px', fontSize: '0.72rem', gap: '4px' }}
          title="Focus on Forward Forecast Drift Projection"
        >
          <Navigation size={12} style={{ color: '#43e08a' }} />
          <span>Forecast</span>
        </button>
      )}

      {/* Fit All Overview */}
      <button
        onClick={onFitAll}
        className="og-btn og-btn-secondary"
        style={{ padding: '4px 8px', fontSize: '0.72rem', gap: '4px', marginLeft: '2px' }}
        title="Reset camera to fit entire investigation boundary"
      >
        <Maximize2 size={12} style={{ color: 'var(--accent-cyan)' }} />
        <span>Overview</span>
      </button>
    </div>
  );
}
