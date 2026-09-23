import React, { useState } from 'react';
import EvidenceBadge from '../common/EvidenceBadge';
import { Target, Droplet, ShieldCheck, Activity, ChevronDown, ChevronUp, Plus, Minus } from 'lucide-react';

export default function MapInfoHUD({ spill, driftData, selectedCandidate, style = {} }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!spill) return null;

  const incidentId = spill.id ? spill.id.slice(0, 8).toUpperCase() : 'UNKNOWN';
  const confidencePercent = Math.round((spill.confidence || 0.94) > 1 ? spill.confidence : (spill.confidence || 0.94) * 100);
  const centroidLat = Number(spill.latitude ?? spill.lat);
  const centroidLng = Number(spill.longitude ?? spill.lng);

  return (
    <div
      style={{
        position: 'absolute',
        top: '52px',
        left: '12px',
        zIndex: 950,
        background: 'rgba(11, 21, 19, 0.94)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--og-border, #25292F)',
        borderRadius: '6px',
        padding: '6px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        pointerEvents: 'auto',
        minWidth: '220px',
        maxWidth: '280px',
        maxHeight: '320px',
        overflowY: 'auto',
        ...style,
      }}
      aria-label="Tactical Map Telemetry HUD"
    >
      {/* Header with Collapsible Toggle (+/-) matching old screenshots */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--og-teal, #49C6C8)',
              cursor: 'pointer',
              padding: '0 2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={isExpanded ? 'Collapse incident telemetry' : 'Expand incident telemetry'}
            aria-expanded={isExpanded}
          >
            {isExpanded ? <Minus size={13} /> : <Plus size={13} />}
          </button>
          <span style={{ fontSize: '0.72rem', color: 'var(--og-teal, #49C6C8)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            INCIDENT #{incidentId}
          </span>
        </div>
        <EvidenceBadge type="OBSERVED" size="xs" />
      </div>

      {/* Concise summary line when collapsed */}
      {!isExpanded && (
        <div style={{ fontSize: '0.66rem', color: 'var(--og-text-secondary, #B1B6BD)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', paddingTop: '2px' }}>
          <span>{spill.areaKm2} km² · {confidencePercent}% conf</span>
          <span style={{ fontFamily: 'monospace' }}>{centroidLat.toFixed(2)}°N, {centroidLng.toFixed(2)}°E</span>
        </div>
      )}

      {isExpanded && (
        <>
          {/* Observed SAR Metrics */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--og-text-secondary, #B1B6BD)' }}>
              <span>Observed Slick Footprint:</span>
              <strong style={{ color: 'var(--og-text-primary, #ECEEF1)', fontFamily: 'var(--font-mono)' }}>
                {spill.areaKm2} km²
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--og-text-secondary, #B1B6BD)' }}>
              <span>Dark-spot Confidence:</span>
              <strong style={{ color: 'var(--og-teal, #49C6C8)', fontFamily: 'var(--font-mono)' }}>
                {confidencePercent}%
              </strong>
            </div>
            {!isNaN(centroidLat) && !isNaN(centroidLng) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--og-text-secondary, #B1B6BD)' }}>
                <span>Centroid:</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--og-text-primary, #ECEEF1)' }}>
                  {centroidLat.toFixed(3)}°N, {centroidLng.toFixed(3)}°E
                </span>
              </div>
            )}
          </div>

          {/* Modelled Origin Metrics */}
          {driftData && driftData.originLat != null && driftData.originLng != null && (
            <div style={{ borderTop: '1px solid var(--og-border-subtle, #1B1E22)', paddingTop: '5px', marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--og-text-muted, #777E87)', fontSize: '0.7rem' }}>Modelled Origin:</span>
                <EvidenceBadge type="MODELLED" size="xs" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--og-text-secondary, #B1B6BD)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--og-amber, #E7A63A)' }}>
                  [{Number(driftData.originLat).toFixed(3)}°N, {Number(driftData.originLng).toFixed(3)}°E]
                </span>
                <strong style={{ color: 'var(--og-amber, #E7A63A)', fontFamily: 'var(--font-mono)' }}>
                  &plusmn;{Number(driftData.uncertaintyRadiusKm || 2.6).toFixed(1)} km
                </strong>
              </div>
            </div>
          )}

          {/* Selected Candidate Telemetry */}
          {selectedCandidate && (
            <div style={{ borderTop: '1px solid var(--og-border-subtle, #1B1E22)', paddingTop: '5px', marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--og-text-muted, #777E87)', fontSize: '0.7rem' }}>Selected Candidate:</span>
                <EvidenceBadge type="DEMONSTRATION" label="DEMO AIS" size="xs" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--og-text-secondary, #B1B6BD)' }}>
                <strong style={{ color: 'var(--og-violet, #A855F7)' }}>{selectedCandidate.vessel?.name || selectedCandidate.name || 'Vessel'}</strong>
                <span style={{ color: 'var(--og-violet, #A855F7)', fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
                  {Math.round((selectedCandidate.correlation ?? (selectedCandidate.totalScore != null ? selectedCandidate.totalScore * 100 : 86)))}% (Rank #{selectedCandidate.rank || 1})
                </span>
              </div>
              {selectedCandidate.evidence?.distanceKm != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--og-text-muted, #777E87)', fontSize: '0.7rem' }}>
                  <span>CPA Distance:</span>
                  <strong style={{ color: 'var(--og-text-primary, #ECEEF1)', fontFamily: 'var(--font-mono)' }}>
                    {selectedCandidate.evidence.distanceKm} km
                  </strong>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
