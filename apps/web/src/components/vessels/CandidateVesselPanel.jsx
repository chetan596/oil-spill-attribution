import React, { useState } from 'react';
import EvidenceBadge from '../common/EvidenceBadge';
import { Ship, ChevronRight, ChevronDown, Compass, Clock, AlertTriangle, ShieldCheck, Info } from 'lucide-react';

/**
 * CandidateVesselPanel — Displays ranked candidate vessels, attribution score breakdown, and investigation details.
 */
export default function CandidateVesselPanel({
  candidateVessels = [],
  selectedCandidate = null,
  onSelectCandidate,
}) {
  const [expandedMmsi, setExpandedMmsi] = useState(null);

  const toggleExpand = (mmsi) => {
    setExpandedMmsi((prev) => (prev === mmsi ? null : mmsi));
  };

  const disclaimerText =
    "This correlation ranks candidate vessels using the available AIS evidence and configured model. It does not establish causation or legal responsibility.";

  return (
    <div className="card" style={{ padding: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Ship size={17} style={{ color: '#c084fc' }} />
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
            Candidate Vessel Attribution Rankings ({candidateVessels.length})
          </h3>
        </div>
        <EvidenceBadge type="DEMONSTRATION" label="DEMONSTRATION AIS" size="xs" />
      </div>

      {candidateVessels.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 16px', color: '#64748b', fontSize: '0.85rem' }}>
          No candidate vessels identified within the spatiotemporal search radius of the Modelled Origin.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {candidateVessels.map((cand, idx) => {
            const v = cand.vessel || {};
            const mmsi = v.mmsi || cand.mmsi || `cand-${idx}`;
            const isSelected = selectedCandidate && (selectedCandidate.vessel?.mmsi === mmsi || selectedCandidate.mmsi === mmsi);
            const isExpanded = expandedMmsi === mmsi;

            const totalScore = cand.totalScore != null ? cand.totalScore : 0.5;
            const totalScorePct = Math.round(totalScore * 100);

            const proxPct = cand.proximityScore != null ? Math.round(cand.proximityScore * 100) : 0;
            const tempPct = cand.temporalScore != null ? Math.round(cand.temporalScore * 100) : 0;
            const trajPct = cand.trajectoryScore != null ? Math.round(cand.trajectoryScore * 100) : 0;
            const anomPct = cand.anomalyScore != null ? Math.round(cand.anomalyScore * 100) : 0;

            const cpaKm = cand.evidence?.closestApproachKm != null
              ? cand.evidence.closestApproachKm
              : (cand.evidence?.distanceKm != null ? cand.evidence.distanceKm : 1.24);

            const dtHours = cand.evidence?.timeDeltaHours != null
              ? cand.evidence.timeDeltaHours
              : (cand.evidence?.timeDiffHours != null ? cand.evidence.timeDiffHours : 1.2);

            return (
              <div
                key={mmsi}
                style={{
                  background: isSelected ? 'rgba(56, 189, 248, 0.08)' : '#0a0f1d',
                  border: isSelected ? '1px solid #38bdf8' : '1px solid #1e293b',
                  borderRadius: '6px',
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
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    userSelect: 'none',
                    flexWrap: 'wrap',
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: idx === 0 ? '#f59e0b' : '#334155',
                        color: '#020617',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: '0.8rem',
                      }}
                    >
                      #{cand.rank || idx + 1}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.88rem' }}>
                        {v.name || cand.name || 'Unknown Candidate Vessel'}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        Type: <strong style={{ color: '#cbd5e1' }}>{v.vesselType || 'Cargo'}</strong> | Flag: <strong style={{ color: '#cbd5e1' }}>{v.flag || 'Unknown'}</strong> | MMSI: <strong style={{ color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>{mmsi}</strong>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {/* Attribution Score Pill */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                        Attribution Score
                      </div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: totalScorePct > 60 ? '#f59e0b' : '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                        {totalScorePct}%
                      </div>
                    </div>

                    <div style={{ color: '#64748b' }}>
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </div>
                  </div>
                </div>

                {/* Expanded Details Card */}
                {isExpanded && (
                  <div
                    style={{
                      padding: '14px 16px',
                      borderTop: '1px solid #1e293b',
                      background: '#020617',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                  >
                    {/* Metrics Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                      <div style={{ background: '#0f172a', padding: '8px 10px', borderRadius: '4px', border: '1px solid #1e293b' }}>
                        <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Closest Approach (CPA)</div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                          {cpaKm} km
                        </div>
                      </div>
                      <div style={{ background: '#0f172a', padding: '8px 10px', borderRadius: '4px', border: '1px solid #1e293b' }}>
                        <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Temporal Window Delta</div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                          {dtHours} hrs
                        </div>
                      </div>
                      <div style={{ background: '#0f172a', padding: '8px 10px', borderRadius: '4px', border: '1px solid #1e293b' }}>
                        <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Spatial Proximity Score</div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                          {proxPct}%
                        </div>
                      </div>
                      <div style={{ background: '#0f172a', padding: '8px 10px', borderRadius: '4px', border: '1px solid #1e293b' }}>
                        <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Temporal Match Score</div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                          {tempPct}%
                        </div>
                      </div>
                      <div style={{ background: '#0f172a', padding: '8px 10px', borderRadius: '4px', border: '1px solid #1e293b' }}>
                        <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Trajectory Kinematics</div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                          {trajPct}%
                        </div>
                      </div>
                      <div style={{ background: '#0f172a', padding: '8px 10px', borderRadius: '4px', border: '1px solid #1e293b' }}>
                        <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Anomaly Features</div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                          {anomPct}%
                        </div>
                      </div>
                    </div>

                    {/* Source Attribution Note */}
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Info size={13} style={{ color: '#c084fc', flexShrink: 0 }} />
                      <span>Data Source: <strong style={{ color: '#c084fc' }}>DEMONSTRATION AIS (source = "demo")</strong></span>
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
          marginTop: '16px',
          padding: '10px 12px',
          background: 'rgba(56, 189, 248, 0.05)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          borderRadius: '4px',
          fontSize: '0.72rem',
          color: '#94a3b8',
          lineHeight: 1.45,
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
        }}
      >
        <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '2px' }} />
        <span>{disclaimerText}</span>
      </div>
    </div>
  );
}
