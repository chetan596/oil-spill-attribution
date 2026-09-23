import React from 'react';
import { Clock, History, TrendingUp } from 'lucide-react';

export default function Timeline({
  currentStep = 0,
  maxSteps = 24,
  currentTimestamp,
  phase = 'backward',
  onStepChange,
}) {
  const isBackward = phase === 'backward';

  return (
    <div
      style={{
        background: 'var(--og-surface, #121417)',
        border: '1px solid var(--og-border, #25292F)',
        borderRadius: '6px',
        padding: '12px 16px',
        color: 'var(--og-text-primary, #ECEEF1)',
      }}
      role="region"
      aria-label="Drift Simulation Timeline"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '0.82rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: isBackward ? 'var(--og-amber, #E7A63A)' : 'var(--og-green, #4ADE80)', fontWeight: 600 }}>
          {isBackward ? <History size={15} /> : <TrendingUp size={15} />}
          <span>{isBackward ? 'Modelled Backward Hindcast (T−24h → T0)' : 'Modelled Forward Forecast (T0 → T+6h)'}</span>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--og-text-secondary, #B1B6BD)' }}>
          {isBackward ? (
            <span>
              Offset: <strong style={{ color: 'var(--og-amber, #E7A63A)', fontFamily: 'var(--font-mono)' }}>T − {currentStep}h</strong> (Discharge Origin Trace)
            </span>
          ) : (
            <span>
              Offset: <strong style={{ color: 'var(--og-green, #4ADE80)', fontFamily: 'var(--font-mono)' }}>T + {currentStep}h</strong> (Modelled Forecast)
            </span>
          )}
        </div>
      </div>

      <input
        type="range"
        min="0"
        max={maxSteps > 0 ? maxSteps - 1 : 1}
        value={currentStep}
        onChange={(e) => onStepChange && onStepChange(Number(e.target.value))}
        aria-label="Drift Simulation Step Slider"
        style={{
          width: '100%',
          accentColor: isBackward ? 'var(--og-amber, #E7A63A)' : 'var(--og-green, #4ADE80)',
          cursor: 'pointer',
          height: '6px',
          background: 'var(--og-surface-recessed, #0C0E11)',
          borderRadius: '3px',
          outline: 'none',
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.72rem', color: 'var(--og-text-muted, #777E87)' }}>
        <span>{isBackward ? 'T0 (Observed Detection)' : 'T0 (Observed Detection)'}</span>
        {currentTimestamp && (
          <span style={{ color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 600, fontFamily: 'var(--font-mono)', background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: '3px' }}>
            {new Date(currentTimestamp).toUTCString()}
          </span>
        )}
        <span>{isBackward ? 'T − 24h (Modelled Origin)' : 'T + 6h (Modelled Forecast)'}</span>
      </div>
    </div>
  );
}
