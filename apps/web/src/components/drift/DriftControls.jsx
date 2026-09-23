import React from 'react';
import { Play, Pause, RotateCcw, FastForward, History, TrendingUp } from 'lucide-react';

export default function DriftControls({
  isPlaying,
  onTogglePlay,
  onReset,
  speed = 1,
  onSpeedChange,
  phase = 'backward',
  onPhaseChange,
  hasForwardPath = false,
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      {/* Play / Pause */}
      <button
        onClick={onTogglePlay}
        className="btn-primary"
        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
        aria-label={isPlaying ? 'Pause drift simulation' : 'Play drift simulation'}
      >
        {isPlaying ? (
          <>
            <Pause size={13} /> Pause
          </>
        ) : (
          <>
            <Play size={13} /> Play Simulation
          </>
        )}
      </button>

      {/* Reset */}
      <button
        onClick={onReset}
        className="btn-secondary"
        style={{ padding: '6px 10px', fontSize: '0.8rem' }}
        title="Reset trajectory to detection point"
        aria-label="Reset trajectory"
      >
        <RotateCcw size={13} /> Reset
      </button>

      {/* Phase Toggle (Backward Hindcast vs Forward Forecast) */}
      {onPhaseChange && (
        <div style={{ display: 'flex', background: 'var(--og-surface-recessed, #0C0E11)', border: '1px solid var(--og-border, #25292F)', borderRadius: '6px', padding: '2px' }}>
          <button
            onClick={() => onPhaseChange('backward')}
            style={{
              background: phase === 'backward' ? 'var(--og-amber-soft, rgba(231, 166, 58, 0.15))' : 'transparent',
              color: phase === 'backward' ? 'var(--og-amber, #E7A63A)' : 'var(--og-text-muted, #777E87)',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <History size={11} /> Backward
          </button>
          <button
            onClick={() => onPhaseChange('forward')}
            disabled={!hasForwardPath}
            title={!hasForwardPath ? 'Forward trajectory not available in demo' : 'Modelled Forward Forecast'}
            style={{
              background: phase === 'forward' ? 'var(--og-green-soft, rgba(52, 211, 153, 0.15))' : 'transparent',
              color: phase === 'forward' ? 'var(--og-green, #34D399)' : 'var(--og-text-muted, #777E87)',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: hasForwardPath ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              opacity: hasForwardPath ? 1 : 0.6,
            }}
          >
            <TrendingUp size={11} /> Forward
          </button>
        </div>
      )}

      {/* Speed Controls */}
      {onSpeedChange && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--og-text-secondary, #B1B6BD)' }}>
          <FastForward size={13} />
          <span>Speed:</span>
          {[1, 2, 4].map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              aria-label={`Set playback speed to ${s}x`}
              style={{
                background: speed === s ? 'var(--og-amber, #E7A63A)' : 'var(--og-surface-raised, #171A1E)',
                color: speed === s ? '#0C0E11' : 'var(--og-text-secondary, #B1B6BD)',
                border: speed === s ? '1px solid var(--og-amber, #E7A63A)' : '1px solid var(--og-border, #25292F)',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '0.7rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {s}x
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
