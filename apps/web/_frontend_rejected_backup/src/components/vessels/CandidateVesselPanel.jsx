import React, { useState } from 'react';
import EvidenceBadge from '../common/EvidenceBadge';
import { Ship, ChevronRight, ChevronDown, Compass, Clock, AlertTriangle, ShieldCheck, Info, RotateCcw } from 'lucide-react';

/**
 * CandidateVesselPanel — Displays ranked candidate vessels, attribution score breakdown, and candidate selection reset.
 */
export default function CandidateVesselPanel({
  candidateVessels = [],
  selectedCandidate = null,
  onSelectCandidate,
  onClearSelection = null,
  isRealScene = false,
}) {
  const [expandedMmsi, setExpandedMmsi] = useState(null);

  if (isRealScene) {
    return (
      <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Ship size={16} style={{ color: 'var(--text-muted)' }} />
            <h3 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              VESSEL ATTRIBUTION: NOT ESTABLISHED
            </h3>
          </div>
          <EvidenceBadge type="DEMONSTRATION" label="DEMO / SIMULATED" size="xs" />
        </div>
        <div style={{ padding: '12px', background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '4px', fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          No real vessel attribution is established for this live Sentinel-1 scene.
        </div>
      </div>
    );
  }

  const toggleExpand = (mmsi) => {
    setExpandedMmsi((prev) => (prev === mmsi ? null : mmsi));
  };

  const disclaimerText =
    "This correlation ranks candidate vessels using the available AIS evidence and configured model. It does not establish causation or legal responsibility.";

  return (
    <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Ship size={16} style={{ color: 'var(--accent-purple)' }} />
          <h3 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Candidate Vessels ({candidateVessels.length})
          </h3>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {selectedCandidate && (
            <button
              onClick={() => {
                if (onClearSelection) onClearSelection();
                else if (onSelectCandidate) onSelectCandidate(null);
              }}
              style={{
                background: 'var(--surface-sunken)',
                color: 'var(--accent-cyan)',
                border: '1px solid var(--border-color)',
                borderRadius: '3px',
                padding: '2px 8px',
                fontSize: '0.7rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              aria-label="View all vessels and clear selection"
            >
              <RotateCcw size={10} />
              <span>View All Vessels</span>
            </button>
          )}
          <EvidenceBadge type="DEMONSTRATION" label="DEMO AIS" size="xs" />
        </div>
      </div>

      {candidateVessels.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          No candidate vessels identified within the spatiotemporal search radius of the Modelled Origin.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {candidateVessels.map((cand, idx) => {
            const v = cand.vessel || {};
            const mmsi = v.mmsi || cand.mmsi || `cand-${idx}`;
            const isSelected =
              selectedCandidate &&
              (selectedCandidate.vessel?.mmsi === mmsi || selectedCandidate.mmsi === mmsi);
            const isExpanded = expandedMmsi === mmsi;

            const totalScore = cand.totalScore != null ? cand.totalScore : 0.5;
            const totalScorePct = Math.round(totalScore * 100);

            const proxPct = cand.proximityScore != null ? Math.round(cand.proximityScore * 100) : 0;
            const tempPct = cand.temporalScore != null ? Math.round(cand.temporalScore * 100) : 0;
            const trajPct = cand.trajectoryScore != null ? Math.round(cand.trajectoryScore * 100) : 0;
            const anomPct = cand.anomalyScore != null ? Math.round(cand.anomalyScore * 100) : 0;

            const cpaKm =
              cand.evidence?.closestApproachKm != null
                ? cand.evidence.closestApproachKm
                : cand.evidence?.distanceKm != null
                  ? cand.evidence.distanceKm
                  : 1.24;

            const dtHours =
              cand.evidence?.timeDeltaHours != null
                ? cand.evidence.timeDeltaHours
                : cand.evidence?.timeDiffHours != null
                  ? cand.evidence.timeDiffHours
                  : 1.2;

            return (
              <div
                key={mmsi}
                style={{
                  background: isSelected ? 'rgba(56, 189, 248, 0.08)' : 'var(--surface-sunken)',
                  border: isSelected ? '1px solid var(--accent-cyan)' : '1px solid var(--border-color)',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  transition: 'all 0.15s ease',
                }}
              >
                {/* Main Summary Bar */}
                <div
                  onClick={() => {
                    if (onSelectCandidate) onSelectCandidate(cand);
                    toggleExpand(mmsi);
                  }}
                  style={{
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    userSelect: 'none',
                    gap: '10px',
                  }}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      if (onSelectCandidate) onSelectCandidate(cand);
                      toggleExpand(mmsi);
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '3px',
                        background: idx === 0 ? 'var(--accent-amber)' : 'var(--surface-raised)',
                        color: idx === 0 ? '#07100D' : 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: '0.75rem',
                        fontFamily: 'var(--font-mono)',
                        flexShrink: 0,
                      }}
                    >
                      #{cand.rank || idx + 1}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.82rem' }}>
                        {v.name || cand.name || 'Unknown Candidate Vessel'}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        MMSI: <span style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>{mmsi}</span> | Flag: <span style={{ color: 'var(--text-secondary)' }}>{v.flag || 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Attribution Score Pill */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                        Score
                      </div>
                      <div
                        style={{
                          fontSize: '0.95rem',
                          fontWeight: 800,
                          color: totalScorePct > 60 ? 'var(--accent-amber)' : 'var(--accent-cyan)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {totalScorePct}%
                      </div>
                    </div>

                    <div style={{ color: 'var(--text-muted)' }}>
                      {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </div>
                  </div>
                </div>

                {/* Expanded Details Card with backend-accurate 4-part score meters */}
                {isExpanded && (
                  <div
                    style={{
                      padding: '12px',
                      borderTop: '1px solid var(--border-color)',
                      background: 'var(--surface-base)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    {/* 4-Part Scoring Meters */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                        Attribution Heuristic Breakdown (Backend Formula)
                      </div>

                      {[
                        { label: 'Spatial Proximity (30%)', val: proxPct, color: 'var(--accent-cyan)' },
                        { label: 'Temporal Correlation (25%)', val: tempPct, color: 'var(--accent-emerald)' },
                        { label: 'Trajectory Alignment (25%)', val: trajPct, color: 'var(--accent-amber)' },
                        { label: 'AIS Anomaly Feature (20%)', val: anomPct, color: 'var(--accent-rose)' },
                      ].map((meter) => (
                        <div key={meter.label} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>{meter.label}</span>
                            <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: meter.color }}>{meter.val}%</span>
                          </div>
                          <div style={{ width: '100%', height: '4px', background: 'var(--surface-sunken)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ width: `${meter.val}%`, height: '100%', background: meter.color }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Metrics Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '4px' }}>
                      <div style={{ background: 'var(--surface-sunken)', padding: '6px 8px', borderRadius: '3px', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Closest Approach (CPA)</div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                          {cpaKm} km
                        </div>
                      </div>
                      <div style={{ background: 'var(--surface-sunken)', padding: '6px 8px', borderRadius: '3px', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Time Delta Window</div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                          {dtHours} hrs
                        </div>
                      </div>
                    </div>

                    {/* Source Attribution Note */}
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}>
                      <Info size={11} style={{ color: 'var(--accent-purple)', flexShrink: 0 }} />
                      <span>Data Source: <strong style={{ color: 'var(--accent-purple)' }}>DEMONSTRATION AIS (source = "demo")</strong></span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Mandatory Disclaimer Footer */}
      <div
        style={{
          marginTop: '6px',
          padding: '8px 10px',
          background: 'rgba(56, 189, 248, 0.04)',
          border: '1px solid rgba(56, 189, 248, 0.2)',
          borderRadius: '4px',
          fontSize: '0.68rem',
          color: 'var(--text-muted)',
          lineHeight: 1.4,
          display: 'flex',
          alignItems: 'flex-start',
          gap: '6px',
        }}
      >
        <AlertTriangle size={12} style={{ color: 'var(--accent-amber)', flexShrink: 0, marginTop: '2px' }} />
        <span>{disclaimerText}</span>
      </div>
    </div>
  );
}
