import React from 'react';
import { Wind, Waves, Activity, Info } from 'lucide-react';

export default function DriftAnimation({
  isPlaying,
  currentStep = 0,
  totalSteps = 25,
  simulationMeta = null,
  phase = 'backward',
  activePoint = null,
}) {
  const progressPercent = totalSteps > 0 ? Math.round((currentStep / Math.max(1, totalSteps - 1)) * 100) : 0;
  const isBackward = phase === 'backward';
  const isT0 = currentStep === 0;

  // Derive explicit status label adhering to requirements
  const statusLabel = isPlaying
    ? 'Simulation Playing'
    : isT0
    ? 'Observed Time (T0)'
    : 'Trajectory Paused';

  const phaseLabel = isT0
    ? 'Observed Time'
    : isBackward
    ? 'Modelled Hindcast'
    : 'Modelled Forecast';

  const lat = activePoint ? Number(activePoint.latitude ?? activePoint.lat) : null;
  const lng = activePoint ? Number(activePoint.longitude ?? activePoint.lng) : null;
  const hasCoords = lat != null && lng != null && !isNaN(lat) && !isNaN(lng);

  return (
    <div
      style={{
        background: 'var(--og-surface, #121417)',
        border: '1px solid var(--og-border, #25292F)',
        borderRadius: '6px',
        padding: '8px 14px',
        color: 'var(--og-text-primary, #ECEEF1)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        minWidth: '280px',
      }}
    >
      {/* Top Status Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <Activity
            size={14}
            style={{
              color: isPlaying
                ? (isBackward ? 'var(--og-amber, #E7A63A)' : 'var(--og-green, #4ADE80)')
                : 'var(--og-text-muted, #777E87)',
            }}
          />
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--og-text-primary, #ECEEF1)' }}>
            {statusLabel}
          </span>
          <span
            style={{
              fontSize: '0.66rem',
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: '3px',
              background: isT0
                ? 'rgba(73, 198, 200, 0.15)'
                : isBackward
                ? 'rgba(231, 166, 58, 0.15)'
                : 'rgba(74, 222, 128, 0.15)',
              color: isT0
                ? '#49C6C8'
                : isBackward
                ? '#E7A63A'
                : '#4ADE80',
            }}
          >
            {phaseLabel}
          </span>
        </div>

        <span style={{ fontSize: '0.78rem', color: isBackward ? '#E7A63A' : '#4ADE80', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
          Step {currentStep + 1}/{totalSteps} ({progressPercent}%)
        </span>
      </div>

      {/* Trajectory Transition Pipeline Indicator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.64rem',
          fontWeight: 600,
          background: 'var(--og-surface-recessed, #0C0E11)',
          padding: '3px 8px',
          borderRadius: '4px',
          border: '1px solid var(--og-border-subtle, #1B1E22)',
        }}
      >
        <span
          style={{
            color: isBackward && !isT0 ? '#E7A63A' : 'var(--og-text-muted, #777E87)',
            fontWeight: isBackward && !isT0 ? 800 : 500,
          }}
        >
          HINDCAST (T-24h)
        </span>
        <span style={{ color: 'var(--og-text-muted, #777E87)' }}>──▶</span>
        <span
          style={{
            color: isT0 ? '#49C6C8' : 'var(--og-text-muted, #777E87)',
            fontWeight: isT0 ? 800 : 500,
          }}
        >
          OBSERVED (T0)
        </span>
        <span style={{ color: 'var(--og-text-muted, #777E87)' }}>──▶</span>
        <span
          style={{
            color: !isBackward ? '#4ADE80' : 'var(--og-text-muted, #777E87)',
            fontWeight: !isBackward ? 800 : 500,
          }}
        >
          FORECAST (+6h)
        </span>
      </div>

      {/* Coordinate & Timestamp Telemetry */}
      {hasCoords && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--og-text-secondary, #B1B6BD)', fontFamily: 'var(--font-mono)' }}>
          <span>Active Waypoint:</span>
          <span style={{ color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 600 }}>
            {lat.toFixed(4)}°N, {lng.toFixed(4)}°E
          </span>
        </div>
      )}
    </div>
  );
}
