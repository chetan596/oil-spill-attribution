import React from 'react';
import { Target, Maximize2, RotateCcw, Satellite, Layers, ShieldCheck } from 'lucide-react';

/**
 * SarToolbar — Quick tactical action bar for SAR Analysis Mode.
 */
export default function SarToolbar({
  onFocusSlick = () => {},
  onFocusScene = () => {},
  onResetView = () => {},
  onOpenSarEvidence = () => {},
  hasFootprint = true,
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
        <Satellite size={13} style={{ color: 'var(--accent-cyan)' }} />
        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
          SAR TOOLBAR
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
          color: '#f87171',
          fontSize: '0.68rem',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        <Target size={12} />
        <span>Focus Slick</span>
      </button>

      {hasFootprint && (
        <button
          onClick={onFocusScene}
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
          <Maximize2 size={12} />
          <span>Focus Scene</span>
        </button>
      )}

      <button
        onClick={onOpenSarEvidence}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 8px',
          borderRadius: '3px',
          background: 'rgba(45, 212, 191, 0.15)',
          border: '1px solid rgba(45, 212, 191, 0.4)',
          color: 'var(--accent-emerald)',
          fontSize: '0.68rem',
          fontWeight: 700,
          cursor: 'pointer',
        }}
        title="Inspect SAR source image, channels, and AI segmentation"
      >
        <Layers size={12} />
        <span>SAR Evidence</span>
      </button>

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
