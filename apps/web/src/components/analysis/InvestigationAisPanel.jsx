/**
 * InvestigationAisPanel.jsx
 * Phase 16.4 Part 6 — AIS Correlation Evidence Panel
 *
 * Displays:
 *   - AIS Correlation telemetry & status
 *   - Candidate count & cards strictly labeled "POTENTIAL AIS CANDIDATE"
 *   - Evidence metrics (proximity, temporal, trajectory, anomaly)
 *   - Highly visible "DEMONSTRATION AIS DATA" warning when demo data is used
 *   - Final attribution status strictly "NOT ESTABLISHED"
 *   - ZERO polluter or responsibility terminology
 */

import React, { useState } from 'react';
import { Ship, AlertTriangle, Crosshair, Clock, ShieldCheck, ShieldAlert, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { ProvenanceBadge } from './ProvenanceLegend';

export default function InvestigationAisPanel({ canonical, className = '' }) {
  if (!canonical) return null;

  const ais = canonical.aisCorrelation || { status: 'NOT_AVAILABLE' };
  const isFound = ais.status === 'CANDIDATES_FOUND';
  const candidates = Array.isArray(ais.candidates) ? ais.candidates : [];
  const isDemo = Boolean(ais.isDemo || ais.source === 'DEMO');
  const temporalRef = canonical.temporalReference || ais.temporalReference || null;
  const queryWindow = ais.queryWindow || null;
  const allObservationsCount = ais.coverage?.totalObservationsCount ?? ais.allObservationsCount ?? (isFound ? candidates.reduce((acc, c) => acc + (c.aisEvidence?.positionCount || 0), 0) : 0);

  const [expandedRank, setExpandedRank] = useState(1);
  const [activeSubTab, setActiveSubTab] = useState('CANDIDATES'); // 'CANDIDATES' | 'ALL_TRACKS'

  const isVesselPresence = ais.observationLevel === 'VESSEL_PRESENCE' || ais.provider === 'GLOBAL_FISHING_WATCH';
  const allTracks = Array.isArray(ais.tracks) ? ais.tracks : [];
  const presenceVessels = Array.isArray(ais.presenceVessels) ? ais.presenceVessels : [];
  const uniqueVesselCount = ais.uniqueVesselCount ?? ais.diagnostics?.uniqueVesselCount ?? (allTracks.length > 0 ? allTracks.length : (presenceVessels.length > 0 ? presenceVessels.length : candidates.length));
  const providerProduct = ais.providerProduct || ais.dataset || (isVesselPresence ? 'public-global-presence:latest' : 'exactAIS:HVP');
  const providerProtocol = ais.providerProtocol || (isVesselPresence ? 'REST_4WINGS' : 'WFS_1_1_0');

  return (
    <div
      data-testid="investigation-ais-panel"
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
          <Ship size={16} color="#C084FC" />
          <h3 style={{ margin: 0, fontSize: '0.90rem', fontWeight: 800, color: '#F8FAFC', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            {isVesselPresence ? 'GFW AIS Vessel Presence — Hourly' : 'Historical AIS Correlation Evidence'}
          </h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.66rem', fontFamily: 'monospace', color: '#94A3B8', background: 'rgba(30, 41, 59, 0.6)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(51, 65, 85, 0.5)' }}>
            {providerProduct} ({providerProtocol})
          </span>
          {isVesselPresence ? (
            <span
              data-testid="gfw-provider-badge"
              style={{
                fontSize: '0.66rem',
                fontWeight: 800,
                color: '#38BDF8',
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                padding: '2px 8px',
                borderRadius: '4px',
                letterSpacing: '0.04em',
                fontFamily: 'monospace',
              }}
            >
              REAL · GFW AIS
            </span>
          ) : (
            <ProvenanceBadge type={isDemo ? 'DEMO' : (isFound ? 'REAL' : 'NOT_AVAILABLE')} size="xs" />
          )}
        </div>
      </div>

      {/* Demo AIS Warning Banner */}
      {isDemo && (
        <div
          data-testid="demo-ais-warning"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
            padding: '10px 12px',
            borderRadius: '6px',
            background: 'rgba(168, 85, 247, 0.15)',
            border: '1px solid rgba(168, 85, 247, 0.4)',
            color: '#E9D5FF',
            fontSize: '0.74rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: '#C084FC' }}>
            <AlertTriangle size={15} />
            <span>DEMONSTRATION AIS DATA — NOT REAL-WORLD AIS EVIDENCE</span>
          </div>
          <span style={{ color: '#D8B4FE', fontSize: '0.70rem' }}>
            AIS tracks are bundled test fixtures. Do not use for maritime enforcement or real-world assertions.
          </span>
        </div>
      )}

      {/* Truncation / Partial Data Warning Banner */}
      {ais.isTruncated && (
        <div
          data-testid="ais-truncated-banner"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 10px',
            borderRadius: '6px',
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            color: '#FDE68A',
            fontSize: '0.74rem',
          }}
        >
          <AlertTriangle size={15} color="#FBBF24" />
          <span>PARTIAL DATA: {ais.truncationReason || 'Historical observations were truncated due to provider safety limits.'}</span>
        </div>
      )}

      {/* Temporal Reference Conflict Warning Banner */}
      {temporalRef?.conflict && (
        <div
          data-testid="temporal-conflict-banner"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 10px',
            borderRadius: '6px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#FCA5A5',
            fontSize: '0.74rem',
            fontWeight: 600,
          }}
        >
          <AlertTriangle size={15} color="#F87171" />
          <span>TEMPORAL CONFLICT: Analyst timestamp differed from authentic satellite product metadata. Authentic metadata was retained.</span>
        </div>
      )}

      {/* Attribution Guardrail Box */}
      <div
        data-testid="attribution-guardrail-box"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          padding: '14px',
          borderRadius: '6px',
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          color: '#FDE68A',
          fontSize: '0.74rem',
          lineHeight: 1.45,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(245, 158, 11, 0.25)', paddingBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldAlert size={16} color="#F59E0B" />
            <span style={{ fontWeight: 800, color: '#FBBF24', letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: '0.80rem' }}>
              ATTRIBUTION GUARDRAIL & SCIENTIFIC LIMITATIONS
            </span>
          </div>
          <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#F59E0B', background: 'rgba(245, 158, 11, 0.2)', padding: '2px 6px', borderRadius: '4px' }}>
            POTENTIAL CANDIDATE ONLY
          </span>
        </div>

        <div style={{ color: '#FEF3C7', fontSize: '0.73rem' }}>
          All vessels identified above are classified strictly as <strong>POTENTIAL CANDIDATE</strong>.
        </div>

        {/* AIS EVIDENCE SOURCE */}
        <div style={{ background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(51, 65, 85, 0.6)', borderRadius: '6px', padding: '10px' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#38BDF8', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '8px' }}>
            AIS EVIDENCE SOURCE
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', fontSize: '0.70rem', fontFamily: 'monospace' }}>
            <div>
              <span style={{ color: '#94A3B8', display: 'block', fontSize: '0.62rem' }}>PROVIDER</span>
              <span style={{ color: '#F8FAFC', fontWeight: 700 }}>
                {ais.provider === 'GLOBAL_FISHING_WATCH' || isVesselPresence ? 'GLOBAL FISHING WATCH' : (ais.provider || 'GLOBAL FISHING WATCH')}
              </span>
            </div>
            <div>
              <span style={{ color: '#94A3B8', display: 'block', fontSize: '0.62rem' }}>DATASET</span>
              <span style={{ color: '#F8FAFC', fontWeight: 700 }}>{providerProduct}</span>
            </div>
            <div>
              <span style={{ color: '#94A3B8', display: 'block', fontSize: '0.62rem' }}>OBSERVATION</span>
              <span style={{ color: '#38BDF8', fontWeight: 700 }}>
                {isVesselPresence ? 'GFW AIS VESSEL PRESENCE — HOURLY' : 'RAW AIS TELEMETRY'}
              </span>
            </div>
            <div>
              <span style={{ color: '#94A3B8', display: 'block', fontSize: '0.62rem' }}>INVESTIGATION WINDOW</span>
              <span style={{ color: '#F8FAFC', fontWeight: 700 }}>T0 ± 24 HOURS</span>
            </div>
            <div>
              <span style={{ color: '#94A3B8', display: 'block', fontSize: '0.62rem' }}>T0</span>
              <span style={{ color: '#F8FAFC', fontWeight: 700 }}>
                {ais.queryWindow?.t0 ? (ais.queryWindow.t0.replace('T', ' ').replace(/\.\d+Z$/, ' UTC').replace('Z', ' UTC')) : (canonical.origin?.estimatedReleaseTime ? canonical.origin.estimatedReleaseTime.replace('T', ' ').replace(/\.\d+Z$/, ' UTC').replace('Z', ' UTC') : '2019-09-09 03:51:25 UTC')}
              </span>
            </div>
            <div>
              <span style={{ color: '#94A3B8', display: 'block', fontSize: '0.62rem' }}>SPATIAL AOI</span>
              <span style={{ color: '#F8FAFC', fontWeight: 700 }}>{ais.searchRadiusKm || 50} KM</span>
            </div>
            <div>
              <span style={{ color: '#94A3B8', display: 'block', fontSize: '0.62rem' }}>PRESENCE RECORDS</span>
              <span style={{ color: '#F8FAFC', fontWeight: 700 }}>{allObservationsCount.toLocaleString()}</span>
            </div>
            <div>
              <span style={{ color: '#94A3B8', display: 'block', fontSize: '0.62rem' }}>POTENTIAL CANDIDATES</span>
              <span style={{ color: '#C084FC', fontWeight: 700 }}>{candidates.length}</span>
            </div>
            <div>
              <span style={{ color: '#94A3B8', display: 'block', fontSize: '0.62rem' }}>RAW AIS TRACKS</span>
              <span style={{ color: '#EF4444', fontWeight: 700 }}>NOT AVAILABLE</span>
            </div>
            <div>
              <span style={{ color: '#94A3B8', display: 'block', fontSize: '0.62rem' }}>CPA</span>
              <span style={{ color: '#EF4444', fontWeight: 700 }}>NOT AVAILABLE</span>
            </div>
            <div>
              <span style={{ color: '#94A3B8', display: 'block', fontSize: '0.62rem' }}>HEADING / SPEED</span>
              <span style={{ color: '#EF4444', fontWeight: 700 }}>NOT AVAILABLE</span>
            </div>
            <div>
              <span style={{ color: '#94A3B8', display: 'block', fontSize: '0.62rem' }}>ATTRIBUTION</span>
              <span style={{ color: '#F59E0B', fontWeight: 700 }}>NOT ESTABLISHED</span>
            </div>
          </div>
        </div>

        {/* Expandable Scientific Limitation & Legal Guardrail Details */}
        <details style={{ marginTop: '2px', cursor: 'pointer' }}>
          <summary style={{ fontSize: '0.72rem', fontWeight: 700, color: '#F59E0B', outline: 'none' }}>
            View Scientific Limitations & Legal Guardrails
          </summary>
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px', color: '#CBD5E1', fontSize: '0.70rem', lineHeight: 1.45 }}>
            <div style={{ background: 'rgba(15, 23, 42, 0.45)', padding: '8px 10px', borderRadius: '4px', border: '1px solid rgba(51, 65, 85, 0.4)' }}>
              <strong style={{ color: '#FBBF24', display: 'block', marginBottom: '4px' }}>SCIENTIFIC LIMITATION</strong>
              GFW public-global-presence provides aggregated hourly vessel presence within spatial cells. It does not provide the raw high-frequency AIS telemetry required for genuine vessel trajectory reconstruction or CPA.
              <div style={{ marginTop: '4px' }}>
                Therefore Ocean Guard AI does NOT infer:
                <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                  <li>exact vessel trajectory</li>
                  <li>exact closest point of approach</li>
                  <li>vessel heading</li>
                  <li>vessel speed</li>
                  <li>vessel manoeuvre anomaly</li>
                </ul>
                from GFW presence data.
              </div>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.45)', padding: '8px 10px', borderRadius: '4px', border: '1px solid rgba(51, 65, 85, 0.4)' }}>
              <strong style={{ color: '#FBBF24', display: 'block', marginBottom: '4px' }}>LEGAL / ATTRIBUTION GUARDRAIL</strong>
              All vessels are classified strictly as: <strong>POTENTIAL CANDIDATE</strong>. A potential candidate indicates spatial/temporal correlation with the investigation only.
              <div style={{ marginTop: '4px' }}>
                Confirmed polluter status requires independent forensic or legal evidence, such as physical boarding, oil fingerprinting (GC-MS), or competent maritime authority adjudication.
              </div>
              <div style={{ marginTop: '4px', fontWeight: 700, color: '#F87171' }}>
                Ocean Guard AI never labels a vessel as: "CONFIRMED POLLUTER"
              </div>
            </div>
          </div>
        </details>
      </div>

      {/* Correlation Telemetry Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', fontSize: '0.74rem' }}>
        <div style={{ padding: '8px 10px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(51, 65, 85, 0.4)', borderRadius: '4px' }}>
          <span style={{ color: '#64748B', display: 'block', fontSize: '0.66rem', textTransform: 'uppercase' }}>AIS Status</span>
          <span style={{ color: isFound ? '#C084FC' : '#94A3B8', fontWeight: 700, fontFamily: 'monospace' }}>
            {ais.status}
          </span>
        </div>
        <div style={{ padding: '8px 10px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(51, 65, 85, 0.4)', borderRadius: '4px' }}>
          <span style={{ color: '#64748B', display: 'block', fontSize: '0.66rem', textTransform: 'uppercase' }}>Acquisition Time (T₀)</span>
          <span style={{ color: temporalRef?.isAuthoritative ? '#38BDF8' : '#F87171', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.70rem' }}>
            {temporalRef?.timestamp ? new Date(temporalRef.timestamp).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : 'NOT_AVAILABLE'}
          </span>
        </div>
        <div style={{ padding: '8px 10px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(51, 65, 85, 0.4)', borderRadius: '4px' }}>
          <span style={{ color: '#64748B', display: 'block', fontSize: '0.66rem', textTransform: 'uppercase' }}>Observations in Window</span>
          <span style={{ color: '#F8FAFC', fontWeight: 700, fontFamily: 'monospace' }}>
            {allObservationsCount} records
          </span>
        </div>
        <div style={{ padding: '8px 10px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(51, 65, 85, 0.4)', borderRadius: '4px' }}>
          <span style={{ color: '#64748B', display: 'block', fontSize: '0.66rem', textTransform: 'uppercase' }}>Unique Vessels</span>
          <span style={{ color: '#F8FAFC', fontWeight: 700, fontFamily: 'monospace' }}>
            {uniqueVesselCount} vessels
          </span>
        </div>
        <div style={{ padding: '8px 10px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(51, 65, 85, 0.4)', borderRadius: '4px' }}>
          <span style={{ color: '#64748B', display: 'block', fontSize: '0.66rem', textTransform: 'uppercase' }}>Potential Candidates</span>
          <span style={{ color: '#C084FC', fontWeight: 700, fontFamily: 'monospace' }}>
            {candidates.length} identified
          </span>
        </div>
        <div style={{ padding: '8px 10px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(51, 65, 85, 0.4)', borderRadius: '4px' }}>
          <span style={{ color: '#64748B', display: 'block', fontSize: '0.66rem', textTransform: 'uppercase' }}>Provider</span>
          <span style={{ color: '#E2E8F0', fontWeight: 600, fontFamily: 'monospace' }}>
            {ais.provider || 'exactAIS_GWS'}
          </span>
        </div>
        <div style={{ padding: '8px 10px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(51, 65, 85, 0.4)', borderRadius: '4px' }}>
          <span style={{ color: '#64748B', display: 'block', fontSize: '0.66rem', textTransform: 'uppercase' }}>Spatial AOI</span>
          <span style={{ color: '#E2E8F0', fontWeight: 600, fontFamily: 'monospace' }}>
            Radius: {ais.searchRadiusKm || 50} km
          </span>
        </div>
        <div style={{ padding: '8px 10px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(51, 65, 85, 0.4)', borderRadius: '4px' }}>
          <span style={{ color: '#64748B', display: 'block', fontSize: '0.66rem', textTransform: 'uppercase' }}>Origin Uncertainty</span>
          <span style={{ color: '#F59E0B', fontWeight: 600, fontFamily: 'monospace' }}>
            ± {ais.originUncertaintyKm || 2.5} km
          </span>
        </div>
      </div>

      {/* Section 14 Mandate: Sub-navigation between Candidates & All Tracks */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid rgba(51, 65, 85, 0.6)', paddingBottom: '6px' }}>
        <button
          type="button"
          onClick={() => setActiveSubTab('CANDIDATES')}
          style={{
            padding: '4px 10px',
            fontSize: '0.74rem',
            fontWeight: 700,
            borderRadius: '4px',
            border: activeSubTab === 'CANDIDATES' ? '1px solid #A855F7' : '1px solid transparent',
            background: activeSubTab === 'CANDIDATES' ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
            color: activeSubTab === 'CANDIDATES' ? '#C084FC' : '#94A3B8',
            cursor: 'pointer',
          }}
        >
          CORRELATED POTENTIAL CANDIDATES ({candidates.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('ALL_TRACKS')}
          style={{
            padding: '4px 10px',
            fontSize: '0.74rem',
            fontWeight: 700,
            borderRadius: '4px',
            border: activeSubTab === 'ALL_TRACKS' ? '1px solid #38BDF8' : '1px solid transparent',
            background: activeSubTab === 'ALL_TRACKS' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
            color: activeSubTab === 'ALL_TRACKS' ? '#38BDF8' : '#94A3B8',
            cursor: 'pointer',
          }}
        >
          {isVesselPresence
            ? `GFW VESSEL PRESENCE IN AOI (${presenceVessels.length > 0 ? presenceVessels.length : uniqueVesselCount})`
            : `ALL HISTORICAL AIS TRACKS (${allTracks.length > 0 ? allTracks.length : uniqueVesselCount})`}
        </button>
      </div>

      {/* All Tracks or GFW Presence View */}
      {activeSubTab === 'ALL_TRACKS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {isVesselPresence
              ? 'Global Fishing Watch Hourly Vessel Presence in AOI'
              : 'Retrieved Historical Vessel Tracks in AOI'}
          </span>
          {(isVesselPresence ? (presenceVessels.length === 0 && allTracks.length === 0) : allTracks.length === 0) ? (
            <div style={{ padding: '10px 12px', background: 'rgba(30, 41, 59, 0.3)', borderRadius: '4px', color: '#94A3B8', fontSize: '0.74rem' }}>
              {isVesselPresence
                ? 'No vessel presence records cached for display.'
                : 'No individual track records cached for display.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '220px', overflowY: 'auto' }}>
              {(isVesselPresence && presenceVessels.length > 0 ? presenceVessels : allTracks).map((trk, tIdx) => (
                <div
                  key={`track-row-${trk.mmsi || tIdx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    borderRadius: '4px',
                    background: 'rgba(30, 41, 59, 0.45)',
                    border: '1px solid rgba(51, 65, 85, 0.35)',
                    fontSize: '0.72rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Ship size={13} color="#94A3B8" />
                    <span style={{ fontWeight: 700, color: '#F8FAFC' }}>{trk.vesselName || trk.name || 'UNKNOWN'}</span>
                    <span style={{ fontFamily: 'monospace', color: '#CBD5E1' }}>MMSI: {trk.mmsi}</span>
                    {trk.vesselType && <span style={{ color: '#64748B' }}>({trk.vesselType})</span>}
                    {trk.flag && <span style={{ color: '#94A3B8' }}>[{trk.flag}]</span>}
                  </div>
                  <span style={{ color: '#38BDF8', fontFamily: 'monospace' }}>
                    {isVesselPresence
                      ? `${trk.presenceHours || (trk.presenceCells?.length || 1)} hrs presence`
                      : `${trk.trackPoints?.length || 0} observations`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Candidate Cards List (shown when activeSubTab === 'CANDIDATES') */}
      {activeSubTab === 'CANDIDATES' && (candidates.length === 0 ? (
        <div
          data-testid="no-candidates-message"
          style={{
            padding: '12px 14px',
            borderRadius: '6px',
            background: 'rgba(30, 41, 59, 0.4)',
            border: '1px solid rgba(51, 65, 85, 0.4)',
            color: '#94A3B8',
            fontSize: '0.76rem',
            lineHeight: 1.5,
          }}
        >
          {(ais.status === 'AIS_PROVIDER_UNAVAILABLE' || ais.status === 'AIS_DATA_UNAVAILABLE' || ais.status === 'PROVIDER_UNAVAILABLE' || (typeof ais.status === 'string' && ais.status.includes('UNAVAILABLE'))) && (
            <div data-testid="ais-provider-unavailable" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <strong style={{ color: '#F87171', fontSize: '0.80rem' }}>HISTORICAL AIS UNAVAILABLE · Historical AIS provider unavailable.</strong>
              <div style={{ color: '#E2E8F0' }}>Provider: <strong>{isVesselPresence ? 'GLOBAL FISHING WATCH' : (ais.provider || 'exactAIS_GWS')}</strong></div>
              <div style={{ color: '#CBD5E1' }}>Reason: {ais.unavailableReason || ais.providerError || 'Historical AIS provider is unreachable or credentials are unconfigured.'}</div>
              <div style={{ color: '#F87171', fontSize: '0.70rem', fontFamily: 'monospace' }}>Status: {ais.status}</div>
            </div>
          )}
          {(ais.status === 'AIS_NO_DATA_FOR_QUERY' || ais.status === 'NO_CANDIDATES' || ais.status === 'NO_CANDIDATES_FOUND' || ais.status === 'NO_MATCHING_PRESENCE' || (isVesselPresence && isFound && candidates.length === 0) || (isVesselPresence && candidates.length === 0 && !ais.status?.includes('UNAVAILABLE'))) && (
            <div data-testid="no-matching-presence" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ color: '#38BDF8', fontWeight: 700, fontSize: '0.80rem' }}>
                AIS PROVIDER SUCCESSFUL · NO MATCHING PRESENCE
              </div>
              <div style={{ color: '#E2E8F0' }}>
                GFW historical AIS query completed successfully, but no matching vessel presence was found for this investigation.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '0.70rem', color: '#94A3B8', fontFamily: 'monospace' }}>
                <span>Provider: <strong style={{ color: '#E2E8F0' }}>GLOBAL FISHING WATCH</strong></span>
                <span>Dataset: <strong style={{ color: '#E2E8F0' }}>{providerProduct}</strong></span>
                <span>Status: <strong style={{ color: '#F59E0B' }}>NO_MATCHING_PRESENCE</strong></span>
              </div>
            </div>
          )}
          {ais.status === 'TEMPORAL_REFERENCE_UNAVAILABLE' && (
            <span>
              <strong style={{ color: '#F87171' }}>REQUIRES TEMPORAL REFERENCE:</strong> Real historical AIS correlation requires an authoritative raster acquisition timestamp. Embedded GeoTIFF metadata was absent, and no verified analyst timestamp was provided.
            </span>
          )}
          {ais.status === 'HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED' && (
            <span>
              <strong style={{ color: '#FBBF24' }}>HISTORICAL PROVIDER CONFIGURATION REQUIRED:</strong> Historical AIS provider ({ais.provider || 'global'}) is unconfigured. Set AIS_HISTORICAL_PROVIDER, AIS_HISTORICAL_API_URL, and credentials in the server environment. ZERO candidate vessels shown.
            </span>
          )}
          {ais.status === 'HISTORICAL_PROVIDER_API_CONTRACT_REQUIRED' && (
            <span>
              <strong style={{ color: '#F87171' }}>HISTORICAL PROVIDER API CONTRACT REQUIRED:</strong> Provider at {ais.provider || 'configured URL'} does not expose the required exactAIS:HVP layer or WFS 1.1.0 capability. ZERO candidate vessels shown.
            </span>
          )}
          {ais.status === 'AIS_PROVIDER_TIMEOUT' && (
            <span>
              <strong style={{ color: '#F87171' }}>AIS PROVIDER TIMEOUT:</strong> The telemetry query to the real AIS provider timed out. Zero vessels shown.
            </span>
          )}
          {ais.status === 'AIS_HISTORICAL_DATA_UNAVAILABLE' && (
            <span>
              <strong style={{ color: '#F87171' }}>HISTORICAL AIS DATA UNAVAILABLE:</strong> Real AIS provider is active, but historical telemetry cannot be retrieved for this investigation window/tier. ZERO candidate vessels shown.
            </span>
          )}
          {ais.status === 'AIS_CURRENT_DATA_ONLY' && (
            <span>
              <strong style={{ color: '#FBBF24' }}>REAL CURRENT AIS AVAILABLE:</strong> Real AIS provider is active with current fleet telemetry, but cannot satisfy the historical investigation window. ZERO candidate vessels shown.
            </span>
          )}
          {(![
            'TEMPORAL_REFERENCE_UNAVAILABLE',
            'HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED',
            'HISTORICAL_PROVIDER_API_CONTRACT_REQUIRED',
            'AIS_DATA_UNAVAILABLE',
            'AIS_PROVIDER_UNAVAILABLE',
            'AIS_PROVIDER_TIMEOUT',
            'AIS_NO_DATA_FOR_QUERY',
            'NO_CANDIDATES',
            'NO_MATCHING_PRESENCE',
            'AIS_HISTORICAL_DATA_UNAVAILABLE',
            'AIS_CURRENT_DATA_ONLY',
          ].includes(ais.status)) && (
            <span>
              {ais.unavailableReason || 'No vessels with historical AIS telemetry correlated within the spatiotemporal search corridor.'}
            </span>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Ranked Potential Candidates ({candidates.length})
          </span>

          {candidates.map((cand, idx) => {
            const rank = cand.rank || idx + 1;
            const isExpanded = expandedRank === rank;
            const enteredCorridor = Boolean(cand.enteredOriginUncertaintyCorridor || cand.correlation?.enteredOriginUncertaintyCorridor);
            const candName = cand.name || cand.vesselName || cand.vesselId?.name || 'UNKNOWN VESSEL';
            const candMmsi = cand.mmsi || cand.vesselId?.mmsi || 'N/A';
            const candType = cand.vesselType || cand.vesselId?.vesselType || 'Commercial Vessel';
            const candPresenceHours = cand.totalPresenceHours ?? cand.hours ?? cand.aisEvidence?.presenceHours ?? cand.presenceHours ?? (Array.isArray(cand.presenceCells) ? cand.presenceCells.reduce((sum, c) => sum + (c.hours || 0), 0) : 1);

            const closestCoords = cand.correlation?.closestCellCoordinates || cand.closestCell;
            const closestCellCoordStr = closestCoords
              ? `${(closestCoords.latitude ?? closestCoords.lat).toFixed(4)}°, ${(closestCoords.longitude ?? closestCoords.lon).toFixed(4)}°`
              : (cand.latitude != null && cand.longitude != null ? `${Number(cand.latitude).toFixed(4)}°, ${Number(cand.longitude).toFixed(4)}°` : 'N/A');

            const distKm = cand.correlation?.closestApproachKm ?? cand.correlation?.closestCellDistanceKm ?? cand.evidence?.distanceKm;
            const distToOriginStr = distKm != null ? `${Number(distKm).toFixed(2)} km` : 'N/A';

            let timeDeltaStr = 'N/A';
            const cellTs = cand.correlation?.closestCellTimestamp || cand.aisEvidence?.firstSeen;
            const t0Ts = temporalRef?.timestamp;
            if (cellTs && t0Ts) {
              const diffH = Math.abs(new Date(cellTs).getTime() - new Date(t0Ts).getTime()) / (3600 * 1000);
              if (!isNaN(diffH)) timeDeltaStr = `${diffH.toFixed(1)} hrs`;
            } else if (cand.evidence?.timeDiffHours != null) {
              timeDeltaStr = `${Number(cand.evidence.timeDiffHours).toFixed(1)} hrs`;
            } else if (cand.correlation?.temporalDeltaHours != null) {
              timeDeltaStr = `${Number(cand.correlation.temporalDeltaHours).toFixed(1)} hrs`;
            }

            const rawScore = cand.correlation?.score ?? cand.totalScore ?? cand.correlation?.metrics?.spatialPresenceScore;
            const presenceScoreStr = rawScore != null ? Number(rawScore).toFixed(3) : 'N/A';

            return (
              <div
                key={cand.mmsi || rank}
                data-testid={`candidate-card-${cand.mmsi || rank}`}
                style={{
                  border: '1px solid rgba(168, 85, 247, 0.3)',
                  background: 'rgba(30, 41, 59, 0.65)',
                  borderRadius: '6px',
                  overflow: 'hidden',
                }}
              >
                {/* Header / Summary Bar */}
                <div
                  onClick={() => setExpandedRank(isExpanded ? null : rank)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    cursor: 'pointer',
                    background: isExpanded ? 'rgba(168, 85, 247, 0.12)' : 'transparent',
                    borderBottom: isExpanded ? '1px solid rgba(168, 85, 247, 0.25)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: '#A855F7',
                        color: '#FFFFFF',
                        fontSize: '0.70rem',
                        fontWeight: 800,
                        fontFamily: 'monospace',
                      }}
                    >
                      #{rank}
                    </span>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#F8FAFC' }}>
                          {candName}
                        </span>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '3px',
                            background: 'rgba(168, 85, 247, 0.2)',
                            color: '#C084FC',
                            fontFamily: 'monospace',
                          }}
                        >
                          POTENTIAL AIS CANDIDATE
                        </span>
                      </div>
                      <span style={{ fontSize: '0.70rem', color: '#94A3B8' }}>
                        MMSI: <span style={{ fontFamily: 'monospace', color: '#CBD5E1' }}>{candMmsi}</span>
                        {cand.imo ? ` • IMO: ${cand.imo}` : ''}
                        {cand.flag ? ` • Flag: ${cand.flag}` : ''}
                        {candType ? ` • Type: ${candType}` : ''}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ display: 'block', fontSize: '0.64rem', color: '#64748B', textTransform: 'uppercase' }}>
                        {isVesselPresence ? 'PRESENCE' : 'CPA'}
                      </span>
                      <span style={{ fontSize: '0.80rem', fontWeight: 700, color: enteredCorridor ? '#F59E0B' : '#E2E8F0', fontFamily: 'monospace' }}>
                        {isVesselPresence
                          ? `${candPresenceHours} hrs in AOI`
                          : (typeof cand.closestApproachKm === 'number' ? `${cand.closestApproachKm.toFixed(2)} km` : 'N/A')}
                      </span>
                      {isVesselPresence && (
                        <span style={{ display: 'block', fontSize: '0.62rem', color: '#94A3B8' }}>
                          CPA: NOT AVAILABLE
                        </span>
                      )}
                    </div>
                    {isExpanded ? <ChevronUp size={16} color="#94A3B8" /> : <ChevronDown size={16} color="#94A3B8" />}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.74rem' }}>
                    {isVesselPresence ? (
                      <>
                        {/* GFW Specification Banner */}
                        <div
                          style={{
                            padding: '8px 10px',
                            borderRadius: '4px',
                            background: 'rgba(56, 189, 248, 0.1)',
                            border: '1px solid rgba(56, 189, 248, 0.3)',
                            color: '#BAE6FD',
                            fontSize: '0.72rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                          }}
                        >
                          <div style={{ fontWeight: 700, color: '#38BDF8' }}>
                            GLOBAL FISHING WATCH — {providerProduct}
                          </div>
                          <div>Observation Level: <strong>VESSEL PRESENCE (Hourly)</strong> • Coverage: 2012 → ~96h ago</div>
                          <div>Raw Vessel Track: <strong>NOT AVAILABLE</strong> • CPA: <strong>NOT AVAILABLE</strong> • Attribution: <strong>NOT ESTABLISHED</strong></div>
                        </div>

                        {/* Spatial Corridor Alert */}
                        <div
                          style={{
                            padding: '6px 10px',
                            borderRadius: '4px',
                            background: enteredCorridor ? 'rgba(245, 158, 11, 0.12)' : 'rgba(100, 116, 139, 0.12)',
                            border: `1px solid ${enteredCorridor ? 'rgba(245, 158, 11, 0.3)' : 'rgba(100, 116, 139, 0.25)'}`,
                            color: enteredCorridor ? '#FBBF24' : '#94A3B8',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                          }}
                        >
                          {enteredCorridor
                            ? `✓ Closest presence cell within origin uncertainty corridor (≤ ${ais.originUncertaintyKm || 2.5} km)`
                            : `Closest presence cell outside origin uncertainty corridor (> ${ais.originUncertaintyKm || 2.5} km)`}
                        </div>

                        {/* Metrics Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '6px' }}>
                          <div style={{ padding: '6px 8px', background: 'rgba(15, 23, 42, 0.5)', borderRadius: '4px' }}>
                            <span style={{ color: '#64748B', display: 'block', fontSize: '0.64rem', textTransform: 'uppercase' }}>Rank</span>
                            <span style={{ color: '#C084FC', fontWeight: 700, fontFamily: 'monospace' }}>#{rank}</span>
                          </div>
                          <div style={{ padding: '6px 8px', background: 'rgba(15, 23, 42, 0.5)', borderRadius: '4px' }}>
                            <span style={{ color: '#64748B', display: 'block', fontSize: '0.64rem', textTransform: 'uppercase' }}>Vessel Name</span>
                            <span style={{ color: '#F8FAFC', fontWeight: 700 }}>{candName}</span>
                          </div>
                          <div style={{ padding: '6px 8px', background: 'rgba(15, 23, 42, 0.5)', borderRadius: '4px' }}>
                            <span style={{ color: '#64748B', display: 'block', fontSize: '0.64rem', textTransform: 'uppercase' }}>MMSI</span>
                            <span style={{ color: '#CBD5E1', fontWeight: 700, fontFamily: 'monospace' }}>{candMmsi}</span>
                          </div>
                          <div style={{ padding: '6px 8px', background: 'rgba(15, 23, 42, 0.5)', borderRadius: '4px' }}>
                            <span style={{ color: '#64748B', display: 'block', fontSize: '0.64rem', textTransform: 'uppercase' }}>Vessel Type</span>
                            <span style={{ color: '#E2E8F0', fontWeight: 600 }}>{candType}</span>
                          </div>
                          <div style={{ padding: '6px 8px', background: 'rgba(15, 23, 42, 0.5)', borderRadius: '4px' }}>
                            <span style={{ color: '#64748B', display: 'block', fontSize: '0.64rem', textTransform: 'uppercase' }}>Presence Hours</span>
                            <span style={{ color: '#38BDF8', fontWeight: 700, fontFamily: 'monospace' }}>{candPresenceHours} hrs</span>
                          </div>
                          <div style={{ padding: '6px 8px', background: 'rgba(15, 23, 42, 0.5)', borderRadius: '4px' }}>
                            <span style={{ color: '#64748B', display: 'block', fontSize: '0.64rem', textTransform: 'uppercase' }}>Closest Presence Cell</span>
                            <span style={{ color: '#38BDF8', fontWeight: 700, fontFamily: 'monospace' }}>{closestCellCoordStr}</span>
                          </div>
                          <div style={{ padding: '6px 8px', background: 'rgba(15, 23, 42, 0.5)', borderRadius: '4px' }}>
                            <span style={{ color: '#64748B', display: 'block', fontSize: '0.64rem', textTransform: 'uppercase' }}>Distance to Origin</span>
                            <span style={{ color: '#38BDF8', fontWeight: 700, fontFamily: 'monospace' }}>{distToOriginStr}</span>
                          </div>
                          <div style={{ padding: '6px 8px', background: 'rgba(15, 23, 42, 0.5)', borderRadius: '4px' }}>
                            <span style={{ color: '#64748B', display: 'block', fontSize: '0.64rem', textTransform: 'uppercase' }}>Time Delta</span>
                            <span style={{ color: '#38BDF8', fontWeight: 700, fontFamily: 'monospace' }}>{timeDeltaStr}</span>
                          </div>
                          <div style={{ padding: '6px 8px', background: 'rgba(15, 23, 42, 0.5)', borderRadius: '4px' }}>
                            <span style={{ color: '#64748B', display: 'block', fontSize: '0.64rem', textTransform: 'uppercase' }}>Presence Score</span>
                            <span style={{ color: '#38BDF8', fontWeight: 700, fontFamily: 'monospace' }}>{presenceScoreStr}</span>
                          </div>
                          <div style={{ padding: '6px 8px', background: 'rgba(15, 23, 42, 0.5)', borderRadius: '4px' }}>
                            <span style={{ color: '#64748B', display: 'block', fontSize: '0.64rem', textTransform: 'uppercase' }}>CPA</span>
                            <span style={{ color: '#EF4444', fontWeight: 700, fontFamily: 'monospace' }}>NOT AVAILABLE</span>
                          </div>
                          <div style={{ padding: '6px 8px', background: 'rgba(15, 23, 42, 0.5)', borderRadius: '4px' }}>
                            <span style={{ color: '#64748B', display: 'block', fontSize: '0.64rem', textTransform: 'uppercase' }}>Legal Classification</span>
                            <span style={{ color: '#F59E0B', fontWeight: 700 }}>POTENTIAL CANDIDATE</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Spatial Corridor Alert */}
                        <div
                          style={{
                            padding: '6px 10px',
                            borderRadius: '4px',
                            background: enteredCorridor ? 'rgba(245, 158, 11, 0.12)' : 'rgba(100, 116, 139, 0.12)',
                            border: `1px solid ${enteredCorridor ? 'rgba(245, 158, 11, 0.3)' : 'rgba(100, 116, 139, 0.25)'}`,
                            color: enteredCorridor ? '#FBBF24' : '#94A3B8',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                          }}
                        >
                          {enteredCorridor
                            ? `✓ Entered origin uncertainty corridor (CPA ≤ ${ais.originUncertaintyKm || 2.5} km)`
                            : `Did not enter origin uncertainty corridor (CPA > ${ais.originUncertaintyKm || 2.5} km)`}
                        </div>

                        {/* Metrics Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '6px' }}>
                          <div style={{ padding: '6px 8px', background: 'rgba(15, 23, 42, 0.5)', borderRadius: '4px' }}>
                            <span style={{ color: '#64748B', display: 'block', fontSize: '0.64rem', textTransform: 'uppercase' }}>Proximity Score</span>
                            <span style={{ color: '#38BDF8', fontWeight: 700, fontFamily: 'monospace' }}>
                              {cand.evidenceMetrics?.proximityScore?.toFixed(3) || 'N/A'}
                            </span>
                          </div>
                          <div style={{ padding: '6px 8px', background: 'rgba(15, 23, 42, 0.5)', borderRadius: '4px' }}>
                            <span style={{ color: '#64748B', display: 'block', fontSize: '0.64rem', textTransform: 'uppercase' }}>Temporal Score</span>
                            <span style={{ color: '#38BDF8', fontWeight: 700, fontFamily: 'monospace' }}>
                              {cand.evidenceMetrics?.temporalScore?.toFixed(3) || 'N/A'}
                            </span>
                          </div>
                          <div style={{ padding: '6px 8px', background: 'rgba(15, 23, 42, 0.5)', borderRadius: '4px' }}>
                            <span style={{ color: '#64748B', display: 'block', fontSize: '0.64rem', textTransform: 'uppercase' }}>Trajectory Score</span>
                            <span style={{ color: '#38BDF8', fontWeight: 700, fontFamily: 'monospace' }}>
                              {cand.evidenceMetrics?.trajectoryScore?.toFixed(3) || 'N/A'}
                            </span>
                          </div>
                          <div style={{ padding: '6px 8px', background: 'rgba(15, 23, 42, 0.5)', borderRadius: '4px' }}>
                            <span style={{ color: '#64748B', display: 'block', fontSize: '0.64rem', textTransform: 'uppercase' }}>Anomaly Signal</span>
                            <span style={{ color: cand.evidenceMetrics?.anomalyScore > 0 ? '#F87171' : '#10B981', fontWeight: 700, fontFamily: 'monospace' }}>
                              {cand.evidenceMetrics?.anomalyScore?.toFixed(3) || '0.000'}
                            </span>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Scientific Disclaimer */}
                    <p style={{ margin: 0, fontSize: '0.68rem', color: '#94A3B8', fontStyle: 'italic', lineHeight: 1.4 }}>
                      Spatial/temporal correlation does NOT establish responsibility for the spill. Legal attribution requires forensic chemical confirmation or direct observation.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
