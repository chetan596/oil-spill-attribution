/**
 * InvestigationOriginPanel.jsx
 * Phase 16.4 Part 6 — Estimated Spill Origin Panel
 *
 * Displays:
 *   - ESTIMATED SPILL ORIGIN
 *   - Latitude, Longitude, Uncertainty radius
 *   - Method, Engine, Timestamp source, Provenance
 *   - Prominent DEMONSTRATION METOCEAN FORCING warning when demo forcing was used
 */

import React from 'react';
import { Compass, AlertTriangle, Crosshair, Cpu, Clock } from 'lucide-react';
import { ProvenanceBadge } from './ProvenanceLegend';

export default function InvestigationOriginPanel({ canonical, className = '' }) {
  if (!canonical) return null;

  const origin = canonical.origin || { status: 'NOT_AVAILABLE' };
  const isEstimated = origin.status === 'ESTIMATED';
  const point = origin.estimatedPoint;
  const uncertainty = typeof origin.uncertaintyRadiusKm === 'number' ? `${origin.uncertaintyRadiusKm.toFixed(2)} km` : 'N/A';
  const isDemoForcing = Boolean(canonical.drift?.environmentalData?.isDemo || canonical.drift?.environmentalData?.source === 'DEMO');

  return (
    <div
      data-testid="investigation-origin-panel"
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
          <Compass size={16} color="#F59E0B" />
          <h3 style={{ margin: 0, fontSize: '0.90rem', fontWeight: 800, color: '#F8FAFC', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Estimated Spill Origin
          </h3>
        </div>
        <ProvenanceBadge type={isEstimated ? 'MODEL_DERIVED' : 'NOT_AVAILABLE'} size="xs" />
      </div>

      {/* Demo MetOcean Warning Banner if active */}
      {isDemoForcing && (
        <div
          data-testid="demo-metocean-warning"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            borderRadius: '6px',
            background: 'rgba(168, 85, 247, 0.12)',
            border: '1px solid rgba(168, 85, 247, 0.35)',
            color: '#C084FC',
            fontSize: '0.74rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
          }}
        >
          <AlertTriangle size={14} color="#C084FC" />
          <span>DEMONSTRATION METOCEAN FORCING — NOT REAL-WORLD OCEAN CONDITIONS</span>
        </div>
      )}

      {!isEstimated ? (
        <div
          data-testid="origin-unavailable-message"
          style={{
            padding: '10px 12px',
            borderRadius: '6px',
            background: 'rgba(30, 41, 59, 0.5)',
            border: '1px solid rgba(51, 65, 85, 0.4)',
            color: '#94A3B8',
            fontSize: '0.78rem',
          }}
        >
          Origin estimation status: <span style={{ fontFamily: 'monospace', color: '#CBD5E1' }}>{origin.status}</span>.
          Requires valid georeferencing and drift simulation.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          {/* Coordinates */}
          <div style={{ padding: '10px 12px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(51, 65, 85, 0.4)', borderRadius: '6px' }}>
            <span style={{ fontSize: '0.68rem', color: '#64748B', textTransform: 'uppercase', display: 'block' }}>Estimated Origin</span>
            <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#F59E0B', fontFamily: 'monospace', display: 'block', margin: '2px 0' }}>
              {point?.latitude?.toFixed(5)}°N, {point?.longitude?.toFixed(5)}°E
            </span>
            <span style={{ fontSize: '0.70rem', color: '#94A3B8' }}>Terminal backtrack point</span>
          </div>

          {/* Uncertainty Radius */}
          <div style={{ padding: '10px 12px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(51, 65, 85, 0.4)', borderRadius: '6px' }}>
            <span style={{ fontSize: '0.68rem', color: '#64748B', textTransform: 'uppercase', display: 'block' }}>Uncertainty Radius</span>
            <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#FBBF24', fontFamily: 'monospace', display: 'block', margin: '2px 0' }}>
              ± {uncertainty}
            </span>
            <span style={{ fontSize: '0.70rem', color: '#94A3B8' }}>Spatial confidence corridor</span>
          </div>

          {/* Method & Engine */}
          <div style={{ padding: '10px 12px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(51, 65, 85, 0.4)', borderRadius: '6px' }}>
            <span style={{ fontSize: '0.68rem', color: '#64748B', textTransform: 'uppercase', display: 'block' }}>Simulation Engine</span>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#E2E8F0', fontFamily: 'monospace', display: 'block', margin: '2px 0' }}>
              {origin.engine || 'BACKTRACK_ADVECTION'}
            </span>
            <span style={{ fontSize: '0.70rem', color: '#94A3B8' }}>{origin.method || 'METOCEAN_REVERSE'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
