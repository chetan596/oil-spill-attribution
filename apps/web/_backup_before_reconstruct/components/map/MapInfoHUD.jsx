import React from 'react';
import EvidenceBadge from '../common/EvidenceBadge';
import { Target, Droplet, ShieldCheck, Activity } from 'lucide-react';

export default function MapInfoHUD({ spill, driftData, selectedCandidate, style = {} }) {
  if (!spill) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '12px',
        left: '12px',
        zIndex: 950,
        background: 'rgba(11, 21, 19, 0.94)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
        padding: '10px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        pointerEvents: 'auto',
        minWidth: '240px',
        maxWidth: '300px',
        ...style,
      }}
      aria-label="Tactical Map Telemetry HUD"
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--accent-cyan)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          INCIDENT #{spill.id.slice(0, 8).toUpperCase()}
        </div>
        <EvidenceBadge type="OBSERVED" size="xs" />
      </div>

      {/* Observed SAR Metrics */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
          <span>Observed Slick Footprint:</span>
          <strong style={{ color: '#ff4d5e', fontFamily: 'var(--font-mono)' }}>{spill.areaKm2} km²</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
          <span>Dark-spot Confidence:</span>
          <strong style={{ color: '#2dd4bf', fontFamily: 'var(--font-mono)' }}>{Math.round(spill.confidence * 100)}%</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
          <span>Centroid:</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            {Number(spill.latitude).toFixed(3)}°N, {Number(spill.longitude).toFixed(3)}°E
          </span>
        </div>
      </div>

      {/* Modelled Origin Metrics */}
      {driftData && (
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '5px', marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Modelled Origin:</span>
            <EvidenceBadge type="MODELLED" size="xs" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', color: '#ffb84a' }}>
              [{Number(driftData.originLat ?? driftData.latitude).toFixed(3)}°N, {Number(driftData.originLng ?? driftData.longitude).toFixed(3)}°E]
            </span>
            <strong style={{ color: '#ffb84a', fontFamily: 'var(--font-mono)' }}>
              &plusmn;{Number(driftData.uncertaintyRadiusKm || 2.6).toFixed(1)} km
            </strong>
          </div>
        </div>
      )}

      {/* Selected Vessel Telemetry */}
      {selectedCandidate && (
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '5px', marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Selected Candidate:</span>
            <EvidenceBadge type="DEMONSTRATION" label="DEMO AIS" size="xs" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
            <strong style={{ color: '#ffc44d' }}>{selectedCandidate.vessel?.name || 'Vessel'}</strong>
            <span style={{ color: '#ffc44d', fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
              {Math.round((selectedCandidate.totalScore ?? 0.5) * 100)}% (Rank #{selectedCandidate.rank || 1})
            </span>
          </div>
          {selectedCandidate.evidence?.distanceKm != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
              <span>CPA Distance:</span>
              <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                {selectedCandidate.evidence.distanceKm} km
              </strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
