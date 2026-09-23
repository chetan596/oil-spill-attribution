import React from 'react';
import { Target, Compass, Navigation, RotateCcw, Wind } from 'lucide-react';

/**
 * DriftToolbar — Quick tactical camera toolbar for Drift & Forecast Mode.
 */
export default function DriftToolbar({
  onFocusOrigin = () => {},
  onFocusHindcast = () => {},
  onFocusForecast = () => {},
  onResetView = () => {},
  hasForecast = true,
}) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: '28px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 900,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        background: 'rgba(11, 21, 19, 0.9)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        padding: '4px 8px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', borderRight: '1px solid var(--border-color)', paddingRight: '8px' }}>
        <Wind size={13} style={{ color: 'var(--accent-amber)' }} />
        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
          DRIFT TOOLBAR
        </span>
      </div>

      <button
        onClick={onFocusOrigin}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 8px',
          borderRadius: '3px',
          background: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          color: 'var(--accent-amber)',
          fontSize: '0.68rem',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        <Target size={12} />
        <span>Focus Origin</span>
      </button>

      <button
        onClick={onFocusHindcast}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 8px',
          borderRadius: '3px',
          background: 'rgba(56, 189, 248, 0.12)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          color: 'var(--accent-cyan)',
          fontSize: '0.68rem',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        <Compass size={12} />
        <span>Focus Hindcast</span>
      </button>

      {hasForecast && (
        <button
          onClick={onFocusForecast}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            borderRadius: '3px',
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: 'var(--accent-emerald)',
            fontSize: '0.68rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Navigation size={12} />
          <span>Focus Forecast</span>
        </button>
      )}

      <button
        onClick={onResetView}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 8px',
          borderRadius: '3px',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          color: 'var(--text-secondary)',
          fontSize: '0.68rem',
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        <RotateCcw size={12} />
        <span>Reset View</span>
      </button>
    </div>
  );
}
