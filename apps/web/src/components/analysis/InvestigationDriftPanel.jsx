/**
 * InvestigationDriftPanel.jsx
 * Phase 16.4 Part 6 — Drift & Backtracking Evidence Panel
 *
 * Displays:
 *   - ESTIMATED BACKTRACK
 *   - ESTIMATED FORECAST (or FORECAST NOT AVAILABLE)
 *   - Environmental forcing provenance (REAL vs DEMO)
 *   - Explicit MetOcean demonstration disclaimer
 */

import React from 'react';
import { Wind, Navigation, AlertTriangle, AlertCircle, ArrowLeft, ArrowRight } from 'lucide-react';
import { ProvenanceBadge } from './ProvenanceLegend';

export default function InvestigationDriftPanel({ canonical, className = '' }) {
  if (!canonical) return null;

  const drift = canonical.drift || { status: 'NOT_AVAILABLE' };
  const backward = drift.backward || { status: 'NOT_AVAILABLE' };
  const forward = drift.forward || { status: 'NOT_AVAILABLE' };
  const envData = drift.environmentalData || {};
  const isDemoForcing = Boolean(envData.isDemo || envData.source === 'DEMO');

  const isBackEstimated = backward.status === 'ESTIMATED';
  const isForwardEstimated = forward.status === 'ESTIMATED';

  return (
    <div
      data-testid="investigation-drift-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '16px',
        background: 'rgba(15, 23, 42, 0.7)',
        border: '1px solid rgba(51, 65, 85, 0.65)',
        borderRadius: '8px',
      }}
      className={className}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Wind size={16} color="#06B6D4" />
          <h3 style={{ margin: 0, fontSize: '0.90rem', fontWeight: 800, color: '#F8FAFC', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Drift & Backtracking Analysis
          </h3>
        </div>
        <ProvenanceBadge type={drift.provenance || 'MODEL_DERIVED'} size="xs" />
      </div>

      {/* Demo MetOcean Warning Banner */}
      {isDemoForcing && (
        <div
          data-testid="drift-demo-forcing-banner"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            padding: '10px 12px',
            borderRadius: '6px',
            background: 'rgba(168, 85, 247, 0.12)',
            border: '1px solid rgba(168, 85, 247, 0.35)',
            color: '#E9D5FF',
            fontSize: '0.74rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#C084FC' }}>
            <AlertTriangle size={14} />
            <span>DEMONSTRATION METOCEAN FORCING</span>
          </div>
          <span style={{ color: '#D8B4FE', fontSize: '0.70rem' }}>
            Environmental forcing is demonstration data and does not represent verified historical oceanographic conditions.
          </span>
        </div>
      )}

      {/* Two-Column Drift View: Backtrack vs Forecast */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
        {/* Estimated Backtrack */}
        <div
          data-testid="estimated-backtrack-card"
          style={{
            padding: '12px 14px',
            background: 'rgba(30, 41, 59, 0.5)',
            border: '1px solid rgba(51, 65, 85, 0.45)',
            borderRadius: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(51, 65, 85, 0.4)', paddingBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ArrowLeft size={14} color="#06B6D4" />
              <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#F8FAFC', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Estimated Backtrack
              </span>
            </div>
            <ProvenanceBadge type={isBackEstimated ? 'MODEL_DERIVED' : 'NOT_AVAILABLE'} size="xs" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.74rem' }}>
            <div>
              <span style={{ color: '#64748B', display: 'block', fontSize: '0.66rem', textTransform: 'uppercase' }}>Status</span>
              <span style={{ color: isBackEstimated ? '#06B6D4' : '#94A3B8', fontWeight: 700, fontFamily: 'monospace' }}>
                {backward.status}
              </span>
            </div>
            <div>
              <span style={{ color: '#64748B', display: 'block', fontSize: '0.66rem', textTransform: 'uppercase' }}>Duration</span>
              <span style={{ color: '#E2E8F0', fontWeight: 600, fontFamily: 'monospace' }}>
                {backward.durationHours ? `${backward.durationHours} hours` : 'N/A'}
              </span>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <span style={{ color: '#64748B', display: 'block', fontSize: '0.66rem', textTransform: 'uppercase' }}>Start (Detection)</span>
              <span style={{ color: '#CBD5E1', fontFamily: 'monospace', fontSize: '0.72rem' }}>
                {backward.startPoint ? `Lat ${backward.startPoint.latitude.toFixed(4)}, Lon ${backward.startPoint.longitude.toFixed(4)}` : 'N/A'}
              </span>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <span style={{ color: '#64748B', display: 'block', fontSize: '0.66rem', textTransform: 'uppercase' }}>Terminal (Origin)</span>
              <span style={{ color: '#F59E0B', fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 700 }}>
                {backward.endPoint ? `Lat ${backward.endPoint.latitude.toFixed(4)}, Lon ${backward.endPoint.longitude.toFixed(4)}` : 'N/A'}
              </span>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <span style={{ color: '#64748B', display: 'block', fontSize: '0.66rem', textTransform: 'uppercase' }}>Waypoints</span>
              <span style={{ color: '#94A3B8', fontFamily: 'monospace' }}>
                {backward.feature?.geometry?.coordinates?.length || 0} discrete integration steps
              </span>
            </div>
          </div>
        </div>

        {/* Estimated Forecast */}
        <div
          data-testid="estimated-forecast-card"
          style={{
            padding: '12px 14px',
            background: 'rgba(30, 41, 59, 0.5)',
            border: '1px solid rgba(51, 65, 85, 0.45)',
            borderRadius: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(51, 65, 85, 0.4)', paddingBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ArrowRight size={14} color="#3B82F6" />
              <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#F8FAFC', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Estimated Forecast
              </span>
            </div>
            <ProvenanceBadge type={isForwardEstimated ? 'MODEL_DERIVED' : 'NOT_AVAILABLE'} size="xs" />
          </div>

          {!isForwardEstimated ? (
            <div
              data-testid="forecast-not-available"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '12px 10px',
                color: '#94A3B8',
                fontSize: '0.76rem',
              }}
            >
              <AlertCircle size={14} color="#64748B" />
              <span>FORECAST NOT AVAILABLE</span>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.74rem' }}>
              <div>
                <span style={{ color: '#64748B', display: 'block', fontSize: '0.66rem', textTransform: 'uppercase' }}>Status</span>
                <span style={{ color: '#3B82F6', fontWeight: 700, fontFamily: 'monospace' }}>
                  {forward.status}
                </span>
              </div>
              <div>
                <span style={{ color: '#64748B', display: 'block', fontSize: '0.66rem', textTransform: 'uppercase' }}>Duration</span>
                <span style={{ color: '#E2E8F0', fontWeight: 600, fontFamily: 'monospace' }}>
                  {forward.durationHours ? `${forward.durationHours} hours` : 'N/A'}
                </span>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ color: '#64748B', display: 'block', fontSize: '0.66rem', textTransform: 'uppercase' }}>Waypoints</span>
                <span style={{ color: '#94A3B8', fontFamily: 'monospace' }}>
                  {forward.feature?.geometry?.coordinates?.length || 0} discrete dispersion steps
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
