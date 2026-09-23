import React from 'react';
import { Wind, Waves, Activity, Info } from 'lucide-react';

export default function DriftAnimation({ isPlaying, currentStep, totalSteps, simulationMeta }) {
  const progressPercent = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;

  const hasWind = simulationMeta && simulationMeta.windSpeed != null;
  const hasCurrent = simulationMeta && simulationMeta.currentSpeed != null;

  return (
    <div
      style={{
        background: 'rgba(15, 23, 42, 0.75)',
        border: '1px solid #1e293b',
        borderRadius: '8px',
        padding: '10px 14px',
        color: '#f8fafc',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={15} style={{ color: isPlaying ? '#10b981' : '#64748b' }} />
          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
            {isPlaying ? 'Modelled Trajectory Active' : 'Trajectory Paused'}
          </span>
        </div>
        <span style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
          {progressPercent}%
        </span>
      </div>

      {/* Environmental Forcing Data — strictly actual data or Not available */}
      <div style={{ borderTop: '1px solid #1e293b', paddingTop: '6px', fontSize: '0.72rem', color: '#94a3b8' }}>
        {hasWind || hasCurrent ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {hasWind && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Wind size={12} style={{ color: '#38bdf8' }} />
                <span>Wind: {simulationMeta.windSpeed} kts</span>
              </div>
            )}
            {hasCurrent && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Waves size={12} style={{ color: '#38bdf8' }} />
                <span>Current: {simulationMeta.currentSpeed} m/s</span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b' }}>
            <Info size={11} />
            <span>Environmental forcing data: Not available in demo</span>
          </div>
        )}
      </div>
    </div>
  );
}
