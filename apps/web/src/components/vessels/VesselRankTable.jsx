import React, { useState } from 'react';
import VesselScore from './VesselScore';
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* AIS Demonstration Dataset Notice Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: 'var(--og-amber-soft, rgba(231, 166, 58, 0.12))',
          border: '1px solid var(--og-amber-border, rgba(231, 166, 58, 0.35))',
          borderRadius: '4px',
          fontSize: '0.75rem',
          color: 'var(--og-amber, #E7A63A)',
          fontWeight: 600,
        }}
      >
        <Database size={14} style={{ flexShrink: 0 }} />
        <span>AIS DATA SOURCE: DEMONSTRATION DATASET (SYNTHETIC AIS EVIDENCE)</span>
      </div>

      {(!rankedVessels || rankedVessels.length === 0) ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--og-text-muted, #777E87)', fontSize: '0.9rem' }}>
          No candidate vessels identified within the spatiotemporal search radius for this incident.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', color: 'var(--og-text-primary, #ECEEF1)', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--og-border-strong, #343940)', color: 'var(--og-text-muted, #777E87)', textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em' }}>
                <th style={{ padding: '10px 8px' }}>Rank</th>
                <th style={{ padding: '10px 8px' }}>Candidate Vessel</th>
                <th style={{ padding: '10px 8px' }}>MMSI / Type</th>
                <th style={{ padding: '10px 8px' }}>Spatial & Temporal Evidence</th>
                <th style={{ padding: '10px 8px' }}>Attribution Score</th>
                <th style={{ padding: '10px 8px', textAlign: 'right' }}>Action</th>
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
                        borderBottom: isExpanded ? 'none' : '1px solid var(--og-border, #25292F)',
                        backgroundColor: isSelected
                          ? 'rgba(168, 85, 247, 0.15)'
                          : isRank1
                          ? 'rgba(168, 85, 247, 0.05)'
                          : 'transparent',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s',
                      }}
                    >
                      {/* Rank Badge */}
                      <td style={{ padding: '12px 8px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '24px',
                            height: '24px',
                            borderRadius: '4px',
                            background: isRank1 ? 'var(--og-violet, #A855F7)' : 'var(--og-surface-raised, #171A1E)',
                            border: isRank1 ? 'none' : '1px solid var(--og-border, #25292F)',
                            color: isRank1 ? '#ffffff' : 'var(--og-text-secondary, #B1B6BD)',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            fontFamily: 'var(--font-mono)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {item.rank || idx + 1}
                        </span>
                      </td>

                      {/* Candidate Vessel Name & Flag */}
                      <td style={{ padding: '12px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Ship size={16} style={{ color: isRank1 ? 'var(--og-violet, #A855F7)' : 'var(--og-text-muted, #777E87)', flexShrink: 0 }} />
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--og-text-primary, #ECEEF1)' }}>{vessel.name || 'Candidate Vessel'}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--og-text-muted, #777E87)' }}>
                              Flag: {vessel.flag || 'Not available'} {vessel.lengthM ? `• ${vessel.lengthM}m` : ''}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* MMSI & Type */}
                      <td style={{ padding: '12px 8px' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--og-text-primary, #ECEEF1)', fontVariantNumeric: 'tabular-nums' }}>{vessel.mmsi || 'N/A'}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--og-text-muted, #777E87)' }}>{vessel.vesselType || 'Not available'}</div>
                      </td>

                      {/* Evidence Metrics */}
                      <td style={{ padding: '12px 8px' }}>
                        {evidence.distanceKm != null ? (
                          <div>
                            <div style={{ color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                              Min Dist: <strong>{evidence.distanceKm} km</strong>
                              {evidence.timeDiffHours != null && <span> (Δt: {evidence.timeDiffHours}h)</span>}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--og-text-muted, #777E87)', fontVariantNumeric: 'tabular-nums' }}>
                              Speed: {evidence.speedAtPassingKts != null ? `${evidence.speedAtPassingKts} kts` : 'N/A'}
                              {evidence.aisGapMinutes > 30 ? ` • Gap: ${evidence.aisGapMinutes}m` : ''}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--og-text-muted, #777E87)', fontSize: '0.75rem' }}>Modelled Spatiotemporal Co-location</span>
                        )}
                      </td>

                      {/* Attribution Score Bar */}
                      <td style={{ padding: '12px 8px' }}>
                        <VesselScore score={item.totalScore} />
                      </td>

                      {/* Action & Expand */}
                      <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectVessel && onSelectVessel(item);
                            }}
                            aria-label={`Inspect candidate vessel ${vessel.name || vessel.mmsi}`}
                            style={{
                              background: isSelected ? 'var(--og-violet, #A855F7)' : 'var(--og-surface-raised, #171A1E)',
                              color: isSelected ? '#ffffff' : 'var(--og-text-secondary, #B1B6BD)',
                              border: isSelected ? '1px solid var(--og-violet, #A855F7)' : '1px solid var(--og-border, #25292F)',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Eye size={12} /> Inspect
                          </button>
                          <button
                            type="button"
                            onClick={(e) => toggleExpand(vessel.mmsi, e)}
                            aria-label={`Toggle score breakdown for ${vessel.name || vessel.mmsi}`}
                            style={{
                              background: 'var(--og-surface-recessed, #0C0E11)',
                              color: 'var(--og-text-muted, #777E87)',
                              border: '1px solid var(--og-border, #25292F)',
                              borderRadius: '4px',
                              padding: '4px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                            }}
                          >
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expandable Score Breakdown & Evidence Detail Row */}
                    {isExpanded && (
                      <tr style={{ background: 'var(--og-surface-raised, #171A1E)', borderBottom: '1px solid var(--og-border, #25292F)' }}>
                        <td colSpan={6} style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '0.78rem', marginBottom: '12px' }}>
                            {/* Proximity Score Card */}
                            <div style={{ background: 'var(--og-surface-recessed, #0C0E11)', padding: '10px 12px', borderRadius: '4px', border: '1px solid var(--og-border, #25292F)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--og-text-muted, #777E87)', marginBottom: '4px' }}>
                                <Navigation size={12} style={{ color: 'var(--og-violet, #A855F7)' }} />
                                <span>Spatial Proximity (30%)</span>
                              </div>
                              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--og-violet, #A855F7)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                                {item.proximityScore != null ? `${Math.round(item.proximityScore * 100)}%` : 'N/A'}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--og-text-secondary, #B1B6BD)', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
                                Min Distance: <strong>{evidence.distanceKm != null ? `${evidence.distanceKm} km` : 'N/A'}</strong>
                              </div>
                            </div>

                            {/* Temporal Score Card */}
                            <div style={{ background: 'var(--og-surface-recessed, #0C0E11)', padding: '10px 12px', borderRadius: '4px', border: '1px solid var(--og-border, #25292F)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--og-text-muted, #777E87)', marginBottom: '4px' }}>
                                <Clock size={12} style={{ color: 'var(--og-violet, #A855F7)' }} />
                                <span>Temporal Correlation (25%)</span>
                              </div>
                              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--og-violet, #A855F7)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                                {item.temporalScore != null ? `${Math.round(item.temporalScore * 100)}%` : 'N/A'}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--og-text-secondary, #B1B6BD)', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
                                Time Difference: <strong>{evidence.timeDiffHours != null ? `${evidence.timeDiffHours} hrs` : 'N/A'}</strong>
                              </div>
                            </div>

                            {/* Trajectory Score Card */}
                            <div style={{ background: 'var(--og-surface-recessed, #0C0E11)', padding: '10px 12px', borderRadius: '4px', border: '1px solid var(--og-border, #25292F)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--og-text-muted, #777E87)', marginBottom: '4px' }}>
                                <Compass size={12} style={{ color: 'var(--og-violet, #A855F7)' }} />
                                <span>Trajectory Alignment (25%)</span>
                              </div>
                              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--og-violet, #A855F7)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                                {item.trajectoryScore != null ? `${Math.round(item.trajectoryScore * 100)}%` : 'N/A'}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--og-text-secondary, #B1B6BD)', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
                                CPA Distance: <strong>{evidence.cpaDistanceKm != null ? `${evidence.cpaDistanceKm} km` : 'N/A'}</strong>
                              </div>
                            </div>

                            {/* Anomaly Score Card */}
                            <div style={{ background: 'var(--og-surface-recessed, #0C0E11)', padding: '10px 12px', borderRadius: '4px', border: '1px solid var(--og-border, #25292F)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--og-text-muted, #777E87)', marginBottom: '4px' }}>
                                <Activity size={12} style={{ color: 'var(--og-violet, #A855F7)' }} />
                                <span>AIS Anomaly Feature (20%)</span>
                              </div>
                              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--og-violet, #A855F7)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                                {item.anomalyScore != null ? `${Math.round(item.anomalyScore * 100)}%` : 'N/A'}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--og-text-secondary, #B1B6BD)', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
                                Max Gap: <strong>{evidence.aisGapMinutes != null ? `${evidence.aisGapMinutes} min` : '0 min'}</strong>
                              </div>
                            </div>
                          </div>

                          {/* Extra Passing & Kinematic Details */}
                          {evidence.closestTimestamp && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--og-text-secondary, #B1B6BD)', display: 'flex', gap: '16px', flexWrap: 'wrap', borderTop: '1px solid var(--og-border-subtle, #1B1E22)', paddingTop: '8px' }}>
                              <span>Passing Time: <strong style={{ color: 'var(--og-text-primary, #ECEEF1)' }}>{new Date(evidence.closestTimestamp).toUTCString()}</strong></span>
                              {evidence.passingLat != null && <span>Closest Coordinate: <strong style={{ color: 'var(--og-text-primary, #ECEEF1)' }}>{evidence.passingLat}°N, {evidence.passingLng}°E</strong></span>}
                              {evidence.speedAtPassingKts != null && <span>Passing Speed: <strong style={{ color: 'var(--og-text-primary, #ECEEF1)' }}>{evidence.speedAtPassingKts} kts</strong></span>}
                              {evidence.speedDropDetected && <span style={{ color: 'var(--og-amber, #E7A63A)' }}>⚠️ Speed Drop Anomaly Detected</span>}
                              {evidence.courseChangeDetected && <span style={{ color: 'var(--og-amber, #E7A63A)' }}>⚠️ Course Change Detected</span>}
                            </div>
                          )}
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

      {/* Analytical Evidentiary Disclaimer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
          padding: '10px 14px',
          background: 'var(--og-surface-recessed, #0C0E11)',
          border: '1px solid var(--og-border, #25292F)',
          borderRadius: '4px',
          fontSize: '0.73rem',
          color: 'var(--og-text-secondary, #B1B6BD)',
          lineHeight: 1.45,
        }}
      >
        <AlertCircle size={15} style={{ color: 'var(--og-violet, #A855F7)', flexShrink: 0, marginTop: '2px' }} />
        <div>
          <p style={{ margin: 0, marginBottom: '4px' }}>
            <strong>Attribution Scores Disclaimer:</strong> Attribution scores represent modelled spatial, temporal, and trajectory correlations from available AIS and SAR-derived information. They do not establish legal responsibility, causation, or proof of pollution by any vessel.
          </p>
          <p style={{ margin: 0, color: 'var(--og-text-muted, #777E87)' }}>
            AIS records used in this demonstration are synthetic/demo records and do not represent actual historical vessel movements.
          </p>
        </div>
      </div>
    </div>
  );
}
