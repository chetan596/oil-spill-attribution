import React, { useState } from 'react';
import VesselScore from './VesselScore';
import EvidenceBadge from '../common/EvidenceBadge';
import { Ship, Eye, ChevronDown, ChevronUp, AlertCircle, Database, Navigation, Clock, Activity, Compass } from 'lucide-react';

export default function VesselRankTable({
  rankedVessels = [],
  selectedVessel,
  onSelectVessel,
}) {
  const [expandedMmsi, setExpandedMmsi] = useState(null);

  const toggleExpand = (mmsi, e) => {
    e.stopPropagation();
    setExpandedMmsi(expandedMmsi === mmsi ? null : mmsi);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* AIS Demonstration Dataset Notice Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 10px',
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          borderRadius: '4px',
          fontSize: '0.72rem',
          color: 'var(--accent-amber)',
          fontWeight: 700,
        }}
      >
        <Database size={13} style={{ flexShrink: 0 }} />
        <span>AIS DATA SOURCE: DEMONSTRATION DATASET (SYNTHETIC AIS EVIDENCE)</span>
      </div>

      {(!rankedVessels || rankedVessels.length === 0) ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          No candidate vessels identified within the spatiotemporal search radius for this incident.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', color: 'var(--text-primary)', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.04em' }}>
                <th style={{ padding: '8px 6px' }}>Rank</th>
                <th style={{ padding: '8px 6px' }}>Candidate Vessel</th>
                <th style={{ padding: '8px 6px' }}>MMSI / Type</th>
                <th style={{ padding: '8px 6px' }}>Evidence</th>
                <th style={{ padding: '8px 6px' }}>Score</th>
                <th style={{ padding: '8px 6px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rankedVessels.map((item, idx) => {
                const vessel = item.vessel || item;
                const evidence = item.evidence || {};
                const isRank1 = item.rank === 1 || idx === 0;
                const isSelected = selectedVessel && (selectedVessel.vessel?.mmsi === vessel.mmsi || selectedVessel.mmsi === vessel.mmsi);
                const isExpanded = expandedMmsi === vessel.mmsi;

                return (
                  <React.Fragment key={vessel.mmsi || idx}>
                    <tr
                      onClick={() => onSelectVessel && onSelectVessel(item)}
                      style={{
                        borderBottom: isExpanded ? 'none' : '1px solid var(--border-color)',
                        backgroundColor: isSelected
                          ? 'rgba(56, 189, 248, 0.08)'
                          : isRank1
                          ? 'rgba(245, 158, 11, 0.04)'
                          : 'transparent',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s',
                      }}
                    >
                      {/* Rank Badge */}
                      <td style={{ padding: '10px 6px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '22px',
                            height: '22px',
                            borderRadius: '3px',
                            background: isRank1 ? 'var(--accent-amber)' : 'var(--surface-sunken)',
                            color: isRank1 ? '#07100D' : 'var(--text-secondary)',
                            fontWeight: 800,
                            fontSize: '0.72rem',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {item.rank || idx + 1}
                        </span>
                      </td>

                      {/* Candidate Vessel Name & Flag */}
                      <td style={{ padding: '10px 6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Ship size={14} style={{ color: isRank1 ? 'var(--accent-amber)' : 'var(--accent-cyan)', flexShrink: 0 }} />
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{vessel.name || 'Candidate Vessel'}</div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                              Flag: {vessel.flag || 'N/A'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* MMSI & Type */}
                      <td style={{ padding: '10px 6px' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-primary)' }}>{vessel.mmsi || 'N/A'}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{vessel.vesselType || 'Cargo'}</div>
                      </td>

                      {/* Evidence Metrics */}
                      <td style={{ padding: '10px 6px' }}>
                        {evidence.distanceKm != null ? (
                          <div>
                            <div style={{ color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.74rem' }}>
                              CPA: <strong>{evidence.distanceKm} km</strong>
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                              Speed: {evidence.speedAtPassingKts != null ? `${evidence.speedAtPassingKts} kts` : 'N/A'}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Co-located</span>
                        )}
                      </td>

                      {/* Attribution Score Bar */}
                      <td style={{ padding: '10px 6px' }}>
                        <VesselScore score={item.totalScore} />
                      </td>

                      {/* Action & Expand */}
                      <td style={{ padding: '10px 6px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectVessel && onSelectVessel(item);
                            }}
                            aria-label={`Inspect candidate vessel ${vessel.name || vessel.mmsi}`}
                            style={{
                              background: isSelected ? 'var(--accent-cyan)' : 'var(--surface-sunken)',
                              color: isSelected ? '#07100D' : 'var(--text-secondary)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '3px',
                              padding: '3px 6px',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                            }}
                          >
                            <Eye size={11} /> Inspect
                          </button>
                          <button
                            type="button"
                            onClick={(e) => toggleExpand(vessel.mmsi, e)}
                            aria-label={`Toggle score breakdown for ${vessel.name || vessel.mmsi}`}
                            style={{
                              background: 'var(--surface-sunken)',
                              color: 'var(--text-muted)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '3px',
                              padding: '3px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                            }}
                          >
                            {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expandable Score Breakdown & Evidence Detail Row */}
                    {isExpanded && (
                      <tr style={{ background: 'var(--surface-base)', borderBottom: '1px solid var(--border-color)' }}>
                        <td colSpan={6} style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', fontSize: '0.74rem', marginBottom: '8px' }}>
                            <div style={{ background: 'var(--surface-sunken)', padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                              <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>Spatial Proximity (40%)</div>
                              <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                                {item.proximityScore != null ? `${Math.round(item.proximityScore * 100)}%` : 'N/A'}
                              </div>
                            </div>
                            <div style={{ background: 'var(--surface-sunken)', padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                              <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>Temporal Delta (30%)</div>
                              <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)' }}>
                                {item.temporalScore != null ? `${Math.round(item.temporalScore * 100)}%` : 'N/A'}
                              </div>
                            </div>
                            <div style={{ background: 'var(--surface-sunken)', padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                              <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>Trajectory Kinematics (20%)</div>
                              <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--accent-amber)', fontFamily: 'var(--font-mono)' }}>
                                {item.trajectoryScore != null ? `${Math.round(item.trajectoryScore * 100)}%` : 'N/A'}
                              </div>
                            </div>
                            <div style={{ background: 'var(--surface-sunken)', padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                              <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>Speed Anomaly (10%)</div>
                              <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--accent-rose)', fontFamily: 'var(--font-mono)' }}>
                                {item.anomalyScore != null ? `${Math.round(item.anomalyScore * 100)}%` : 'N/A'}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
