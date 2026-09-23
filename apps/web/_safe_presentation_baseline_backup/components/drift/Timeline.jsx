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
        background: '#0a0f1d',
        border: '1px solid #1e293b',
        borderRadius: '8px',
        padding: '12px 16px',
        color: '#f8fafc',
      }}
      role="region"
      aria-label="Drift Simulation Timeline"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: isBackward ? '#38bdf8' : '#10b981', fontWeight: 600 }}>
          {isBackward ? <History size={16} /> : <TrendingUp size={16} />}
          <span>{isBackward ? 'Historical / Modelled Backward Hindcast' : 'Modelled Forward Forecast'}</span>
        </div>
        <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
          {isBackward ? (
            <span>
              Step <strong style={{ color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>T - {currentStep}h</strong> (Discharge Origin Trace)
            </span>
          ) : (
            <span>
              Step <strong style={{ color: '#10b981', fontFamily: 'var(--font-mono)' }}>T + {currentStep}h</strong> (Modelled Projection)
            </span>
          )}
        </div>
      </div>

      <input
        type="range"
        min="0"
        max={maxSteps > 0 ? maxSteps : 1}
        value={currentStep}
        onChange={(e) => onStepChange && onStepChange(Number(e.target.value))}
        aria-label="Drift Simulation Step Slider"
        style={{
          width: '100%',
          accentColor: isBackward ? '#38bdf8' : '#10b981',
          cursor: 'pointer',
          height: '6px',
          background: '#1e293b',
          borderRadius: '3px',
          outline: 'none',
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.72rem', color: '#64748b' }}>
        <span>Detection Time (T=0)</span>
        {currentTimestamp && (
          <span style={{ color: '#cbd5e1', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>
            {new Date(currentTimestamp).toUTCString()}
          </span>
        )}
        <span>{isBackward ? `T - ${maxSteps}h (Modelled Origin)` : `T + ${maxSteps}h (Forecast)`}</span>
      </div>
    </div>
  );
}
