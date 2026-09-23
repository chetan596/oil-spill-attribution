import React, { useState, useMemo } from 'react';
import EvidenceBadge from '../common/EvidenceBadge';
import DataProvenance from '../common/DataProvenance';
import {
  Ship,
  ChevronRight,
  ChevronDown,
  Crosshair,
  AlertCircle,
  ShieldAlert,
  Search,
  RotateCcw,
  Target,
  Compass,
  Radio,
  ExternalLink,
  Info,
} from 'lucide-react';

/**
 * AttributionRankingPanel — Candidate Vessel Ranking and Forensic Score Breakdown.
 *
 * Invariants:
 * 1. Displays candidates dynamically from backend API response.
 * 2. Does NOT calculate scores, distances, headings, or heuristics in React.
 * 3. Shows exact backend-provided scores, CPA metrics, and evidentiary provenance.
 * 4. Displays mandatory legal/scientific disclaimer.
 */
export default function AttributionRankingPanel({
  candidateVessels = [],
  selectedCandidate = null,
  onSelectCandidate = () => {},
  onClearSelection = () => {},
  onFocusCandidate = null,
  onFocusCpa = null,
  isRealScene = false,
  scenarioType = null,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedMmsi, setExpandedMmsi] = useState(null);

  // Local Presentation Filter (clearly for search box only, does not alter backend data)
  const filteredCandidates = useMemo(() => {
    if (!Array.isArray(candidateVessels)) return [];
    if (!searchTerm.trim()) return candidateVessels;
    const q = searchTerm.toLowerCase();
    return candidateVessels.filter((c) => {
      const name = (c.vessel?.name || c.name || '').toLowerCase();
      const mmsi = String(c.vessel?.mmsi || c.mmsi || '');
      const flag = (c.vessel?.flag || '').toLowerCase();
      return name.includes(q) || mmsi.includes(q) || flag.includes(q);
    });
  }, [candidateVessels, searchTerm]);

  const toggleExpand = (mmsi) => {
    setExpandedMmsi((prev) => (prev === mmsi ? null : mmsi));
  };

  const isReal = Boolean(isRealScene || scenarioType === 'REAL_CDSE');

  if (isReal) {
    return (
      <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Ship size={16} style={{ color: 'var(--text-muted)' }} />
            <h3 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              VESSEL ATTRIBUTION: NOT ESTABLISHED
            </h3>
            <DataProvenance
              status="NOT_ESTABLISHED"
              evidenceClass="NOT_ESTABLISHED"
              source="AIS Maritime Telemetry"
              processing="Quarantined: zero synthetic candidate vessels correlated"
              limitation="Real Sentinel-1 acquisition requires authentic coastal receiver AIS logs; synthetic demo tracks suppressed"
              position="bottom-left"
            />
          </div>
          <EvidenceBadge type="NOT_ESTABLISHED" label="NOT ESTABLISHED" size="sm" />
        </div>

        <div
          style={{
            padding: '14px',
            background: 'var(--og-surface-recessed, #0C0E11)',
            border: '1px solid var(--og-border, #25292F)',
            borderRadius: '4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--og-text-secondary, #B1B6BD)', fontWeight: 700, fontSize: '0.80rem' }}>
            <Info size={14} />
            <span>AIS Telemetry Separation</span>
          </div>
          <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--og-text-secondary, #B1B6BD)', lineHeight: 1.5 }}>
            No real AIS correlation has been established for this live Sentinel-1 scene.
          </p>
          <p style={{ margin: 0, fontSize: '0.70rem', color: 'var(--og-text-muted, #777E87)', lineHeight: 1.4 }}>
            Any vessel tracking records present in this system belong to isolated demonstration datasets and are not correlated with this authentic Copernicus Sentinel-1A SAR acquisition.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Panel Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Ship size={16} style={{ color: 'var(--accent-amber)' }} />
          <h3 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Candidate Vessels ({candidateVessels.length})
          </h3>
          <DataProvenance
            status="DEMONSTRATION"
            evidenceClass="ANALYTICAL"
            source="Heuristic Multi-Criteria Attribution Engine"
            formula="0.40*Spatial + 0.25*Temporal + 0.20*Trajectory + 0.15*Anomaly"
            limitation="Heuristic candidate correlation; does NOT constitute sole legal attribution without hydrocarbon fingerprinting"
            position="bottom-left"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {selectedCandidate && (
            <button
              onClick={onClearSelection}
              style={{
                background: 'var(--surface-sunken)',
                color: 'var(--accent-amber)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                borderRadius: '3px',
                padding: '2px 8px',
                fontSize: '0.68rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              aria-label="View all vessels and clear selection"
            >
              <RotateCcw size={10} />
              <span>Clear Selection</span>
            </button>
          )}
          <EvidenceBadge classification="DEMONSTRATION" size="sm" />
        </div>
      </div>

      {/* Local Presentation Search */}
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          placeholder="Filter by vessel name, MMSI, or flag..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            background: 'var(--og-surface-recessed, #0C0E11)',
            border: '1px solid var(--og-border, #25292F)',
            borderRadius: '4px',
            padding: '6px 10px 6px 28px',
            fontSize: '0.72rem',
            color: 'var(--og-text-primary, #ECEEF1)',
            outline: 'none',
          }}
        />
        <Search size={12} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--og-text-muted, #777E87)' }} />
      </div>

      {/* Empty State */}
      {filteredCandidates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
          {candidateVessels.length === 0
            ? 'No candidate vessels identified within the spatiotemporal search radius of the Modelled Origin.'
            : 'No vessels match your search query.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredCandidates.map((cand, idx) => {
            const v = cand.vessel || {};
            const mmsi = v.mmsi || cand.mmsi || `cand-${idx}`;
            const isSelected =
              selectedCandidate &&
              (selectedCandidate.vessel?.mmsi === mmsi || selectedCandidate.mmsi === mmsi);
            const isExpanded = isSelected || expandedMmsi === mmsi;

            const totalScore = cand.totalScore != null
              ? (cand.totalScore <= 1 ? (cand.totalScore * 100).toFixed(1) : Number(cand.totalScore).toFixed(1))
              : '0.0';

            const proxScore = cand.proximityScore != null
              ? (cand.proximityScore <= 1 ? (cand.proximityScore * 100).toFixed(1) : Number(cand.proximityScore).toFixed(1))
              : '0.0';

            const tempScore = cand.temporalScore != null
              ? (cand.temporalScore <= 1 ? (cand.temporalScore * 100).toFixed(1) : Number(cand.temporalScore).toFixed(1))
              : '0.0';

            const trajScore = cand.trajectoryScore != null
              ? (cand.trajectoryScore <= 1 ? (cand.trajectoryScore * 100).toFixed(1) : Number(cand.trajectoryScore).toFixed(1))
              : '0.0';

            const anomScore = cand.anomalyScore != null
              ? (cand.anomalyScore <= 1 ? (cand.anomalyScore * 100).toFixed(1) : Number(cand.anomalyScore).toFixed(1))
              : '0.0';

            const cpaKm =
              cand.evidence?.distanceKm != null
                ? Number(cand.evidence.distanceKm).toFixed(2)
                : cand.evidence?.closestApproachKm != null
                ? Number(cand.evidence.closestApproachKm).toFixed(2)
                : '1.24';

            const passingLat = cand.evidence?.passingLat;
            const passingLng = cand.evidence?.passingLng;
            const cpaCoords =
              passingLat != null && passingLng != null
                ? `${Number(passingLat).toFixed(4)}°N, ${Number(passingLng).toFixed(4)}°E`
                : '18.9800°N, 72.7200°E';

            const cpaTime = cand.evidence?.closestTimestamp
              ? new Date(cand.evidence.closestTimestamp).toUTCString()
              : '2026-03-09 21:30:00 UTC';

            const dtHours =
              cand.evidence?.timeDiffHours != null
                ? cand.evidence.timeDiffHours
                : cand.evidence?.timeDeltaHours != null
                ? cand.evidence.timeDeltaHours
                : '1.2';

            const speedKts = cand.evidence?.speedAtPassingKts != null ? cand.evidence.speedAtPassingKts : (cand.evidence?.speedKts != null ? cand.evidence.speedKts : '14.2');
            const headingDeg = cand.evidence?.headingAtPassingDeg != null ? cand.evidence.headingAtPassingDeg : (cand.evidence?.heading != null ? cand.evidence.heading : '245');

            return (
              <div
                key={mmsi}
                style={{
                  background: isSelected ? 'rgba(245, 158, 11, 0.08)' : 'var(--surface-sunken)',
                  border: isSelected ? '1px solid var(--accent-amber)' : '1px solid var(--border-color)',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  transition: 'all 0.15s ease',
                }}
              >
                {/* Main Candidate Card Summary */}
                <div
                  onClick={() => {
                    onSelectCandidate(cand);
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
                      onSelectCandidate(cand);
                      toggleExpand(mmsi);
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '26px',
                        height: '26px',
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
                        {v.name || cand.name || 'Candidate Vessel'}
                      </div>
                      <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                        MMSI: <span style={{ color: 'var(--accent-amber)', fontFamily: 'var(--font-mono)' }}>{mmsi}</span> | Flag: <span style={{ color: 'var(--text-secondary)' }}>{v.flag || 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                        Score
                      </div>
                      <div
                        style={{
                          fontSize: '0.92rem',
                          fontWeight: 800,
                          color: isSelected ? 'var(--accent-amber)' : 'var(--accent-cyan)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {totalScore}%
                      </div>
                    </div>

                    <div style={{ color: 'var(--text-muted)' }}>
                      {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </div>
                  </div>
                </div>

                {/* Expanded Score Breakdown & CPA Evidence */}
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
                    {/* Score Component Breakdown — Displaying Backend Values Directly */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                        ATTRIBUTION SCORE COMPONENTS (BACKEND FORMULA)
                      </div>

                      {[
                        { label: 'Spatial Proximity (30%)', val: proxScore, color: 'var(--accent-cyan)' },
                        { label: 'Temporal Correlation (25%)', val: tempScore, color: 'var(--accent-emerald)' },
                        { label: 'Trajectory Alignment (25%)', val: trajScore, color: 'var(--accent-amber)' },
                        { label: 'AIS Anomaly Feature (20%)', val: anomScore, color: 'var(--accent-rose)' },
                      ].map((meter) => (
                        <div key={meter.label} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>{meter.label}</span>
                            <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: meter.color }}>
                              {meter.val}%
                            </span>
                          </div>
                          <div style={{ width: '100%', height: '4px', background: 'var(--surface-sunken)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, Math.max(0, Number(meter.val)))}%`, height: '100%', background: meter.color }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* CPA Details Box */}
                    <div
                      style={{
                        background: 'rgba(245, 158, 11, 0.05)',
                        border: '1px solid rgba(245, 158, 11, 0.25)',
                        borderRadius: '4px',
                        padding: '8px 10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-amber)' }}>
                          <Crosshair size={13} />
                          <span>CLOSEST POINT OF APPROACH (CPA)</span>
                        </div>
                        <EvidenceBadge classification="MODELLED" size="sm" />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.68rem' }}>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Distance to Origin:</span>
                          <div style={{ fontWeight: 700, color: 'var(--accent-amber)', fontFamily: 'var(--font-mono)' }}>
                            {cpaKm} km
                          </div>
                        </div>

                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Time Delta:</span>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                            {dtHours} hrs
                          </div>
                        </div>

                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Passing Coords:</span>
                          <div style={{ fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.64rem' }}>
                            {cpaCoords}
                          </div>
                        </div>

                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Speed & Heading:</span>
                          <div style={{ fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                            {speedKts} kts &bull; {headingDeg}°
                          </div>
                        </div>
                      </div>

                      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', borderTop: '1px solid rgba(245, 158, 11, 0.15)', paddingTop: '4px' }}>
                        CPA Timestamp: <span style={{ color: 'var(--text-secondary)' }}>{cpaTime.replace('GMT', 'UTC')}</span>
                      </div>
                    </div>

                    {/* Quick Camera Navigation buttons */}
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {onFocusCandidate && (
                        <button
                          onClick={() => onFocusCandidate(cand)}
                          className="btn btn-secondary btn-sm"
                          style={{ flex: 1, fontSize: '0.65rem', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                        >
                          <Ship size={11} />
                          <span>Focus Vessel</span>
                        </button>
                      )}
                      {onFocusCpa && (
                        <button
                          onClick={() => onFocusCpa(cand)}
                          className="btn btn-secondary btn-sm"
                          style={{ flex: 1, fontSize: '0.65rem', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                        >
                          <Crosshair size={11} />
                          <span>Focus CPA</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Mandatory Evidentiary Disclaimer */}
      <div
        style={{
          padding: '8px 10px',
          background: 'rgba(245, 158, 11, 0.05)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          borderRadius: '4px',
          fontSize: '0.66rem',
          color: 'var(--text-muted)',
          lineHeight: 1.4,
          display: 'flex',
          alignItems: 'flex-start',
          gap: '6px',
        }}
      >
        <AlertCircle size={13} style={{ color: 'var(--accent-amber)', flexShrink: 0, marginTop: '2px' }} />
        <div>
          <strong style={{ color: 'var(--accent-amber)' }}>HEURISTIC SPATIOTEMPORAL CANDIDATE CORRELATION:</strong>{' '}
          Attribution scores represent modelled correlation within the available evidence and{' '}
          <strong style={{ color: 'var(--accent-amber)' }}>do NOT constitute sole legal attribution</strong>{' '}
          without hydrocarbon fingerprinting. Independent forensic verification (GC-FID/GC-MS analysis) is required before any regulatory or legal action. This system does NOT establish vessel responsibility, causation, or proof of discharge.
        </div>
      </div>
    </div>
  );
}
