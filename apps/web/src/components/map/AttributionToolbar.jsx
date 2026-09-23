import React from 'react';
import { Ship, Crosshair, Target, RotateCcw, AlertCircle, Compass, Radio } from 'lucide-react';

/**
 * AttributionToolbar — Quick tactical camera toolbar for AIS Attribution Mode.
 * Enables 1-click focus on Slick, Modelled Origin, Closest Point of Approach (CPA), Selected Vessel, and Overview.
 */
export default function AttributionToolbar({
  onFocusSlick = () => {},
  onFocusOrigin = () => {},
  onFocusCpa = () => {},
  onFocusVessel = () => {},
  onClearSelection = () => {},
  onResetView = () => {},
  hasSelectedCandidate = false,
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
        background: 'rgba(11, 21, 19, 0.92)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        padding: '4px 8px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', borderRight: '1px solid var(--border-color)', paddingRight: '8px' }}>
        <Ship size={13} style={{ color: 'var(--accent-amber)' }} />
        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
          AIS TOOLBAR
        </span>
      </div>

      <button
        onClick={onFocusSlick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 8px',
          borderRadius: '3px',
          background: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: 'var(--accent-rose)',
          fontSize: '0.68rem',
          fontWeight: 600,
          cursor: 'pointer',
        }}
        title="Focus observed SAR oil slick centroid"
      >
        <AlertCircle size={12} />
        <span>Focus Slick</span>
      </button>

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
        title="Focus modelled release point"
      >
        <Target size={12} />
        <span>Focus Origin</span>
      </button>

      {hasSelectedCandidate && (
        <>
          <button
            onClick={onFocusCpa}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '3px',
              background: 'rgba(255, 196, 77, 0.18)',
              border: '1px solid rgba(255, 196, 77, 0.5)',
              color: '#ffc44d',
              fontSize: '0.68rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
            title="Focus Closest Point of Approach (CPA) on candidate track"
          >
            <Crosshair size={12} />
            <span>Focus CPA</span>
          </button>

          <button
            onClick={onFocusVessel}
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
            title="Focus candidate vessel position"
          >
            <Radio size={12} />
            <span>Focus Vessel</span>
          </button>

          <button
            onClick={onClearSelection}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '3px',
              background: 'rgba(168, 85, 247, 0.12)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              color: 'var(--accent-purple)',
              fontSize: '0.68rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            title="Deselect vessel and view all candidate tracks"
          >
            <RotateCcw size={12} />
            <span>Clear Selection</span>
          </button>
        </>
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
        title="Reset camera to overview bounds"
      >
        <Compass size={12} />
        <span>Overview</span>
      </button>
    </div>
  );
}
