import React, { useState } from 'react';
import EvidenceBadge from '../common/EvidenceBadge';
import { Ship, Target, Crosshair, AlertCircle, ShieldAlert, Clock, Navigation } from 'lucide-react';

/**
 * AttributionHUD — Top-left tactical telemetry card for AIS Attribution Mode.
 * Displays candidate vessel count, top candidate score, CPA metrics, and mandatory evidentiary disclaimer.
 */
export default function AttributionHUD({
  candidateVessels = [],
  selectedCandidate = null,
  spill = null,
  driftData = null,
  onFocusCandidate = null,
  onFocusCpa = null,
  isRealScene = false,
}) {
  const isReal = isRealScene || spill?.scenarioType === 'REAL_CDSE' || spill?.analysis?.scenarioType === 'REAL_CDSE' || spill?.sceneId?.includes('cdse');

  if (isReal) {
    return (
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          zIndex: 900,
          background: 'rgba(11, 21, 19, 0.94)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          borderRadius: '4px',
          padding: '12px 14px',
          width: '320px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Ship size={14} style={{ color: 'var(--accent-amber)' }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-primary)' }}>
              AIS DATA: DEMONSTRATION / SIMULATED
            </span>
          </div>
          <EvidenceBadge classification="DEMONSTRATION" size="sm" />
        </div>

        <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '4px', padding: '8px 10px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-amber)', marginBottom: '4px' }}>
            VESSEL ATTRIBUTION: NOT ESTABLISHED
          </div>
          <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            No real vessel attribution is established for this live Sentinel-1 scene. AIS data present in the platform is simulated demonstration telemetry and is not correlated with this authentic Copernicus CDSE acquisition.
          </p>
        </div>
      </div>
    );
  }

  const topCandidate = candidateVessels?.[0];
  const activeCandidate = selectedCandidate || topCandidate;

  const candidateCount = candidateVessels?.length || 0;
  const searchRadiusKm = activeCandidate?.evidence?.searchRadiusKm || 50;
  const vesselName = activeCandidate?.vessel?.name || activeCandidate?.name || 'N/A';
  const vesselType = activeCandidate?.vessel?.vesselType || activeCandidate?.type || 'Vessel';
  const mmsi = activeCandidate?.vessel?.mmsi || activeCandidate?.mmsi || 'N/A';

  const totalScore = activeCandidate?.totalScore != null
    ? Math.round(activeCandidate.totalScore * 100)
    : 0;

  const cpaDistance = activeCandidate?.evidence?.distanceKm != null
    ? Number(activeCandidate.evidence.distanceKm).toFixed(2)
    : (activeCandidate?.evidence?.closestApproachKm != null ? Number(activeCandidate.evidence.closestApproachKm).toFixed(2) : '1.24');

  const passingLat = activeCandidate?.evidence?.passingLat;
  const passingLng = activeCandidate?.evidence?.passingLng;
  const cpaCoords = passingLat != null && passingLng != null
    ? `${Number(passingLat).toFixed(4)}°N, ${Number(passingLng).toFixed(4)}°E`
    : 'NOT ESTABLISHED';

  const cpaTime = activeCandidate?.evidence?.closestTimestamp
    ? new Date(activeCandidate.evidence.closestTimestamp).toUTCString()
    : 'NOT ESTABLISHED';

  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      style={{
        position: 'absolute',
        top: '52px',
        left: '12px',
        zIndex: 900,
        background: 'rgba(11, 21, 19, 0.94)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
        padding: '6px 12px',
        width: '280px',
        maxHeight: '340px',
        overflowY: 'auto',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      {/* Header with Collapsible Toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none', paddingBottom: isExpanded ? '6px' : '0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-amber)',
              cursor: 'pointer',
              padding: '0 2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={isExpanded ? 'Collapse telemetry' : 'Expand telemetry'}
            aria-expanded={isExpanded}
          >
            <Ship size={13} style={{ color: 'var(--accent-amber)' }} />
          </button>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-primary)' }}>
            AIS ATTRIBUTION
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <EvidenceBadge classification="DEMONSTRATION" size="xs" />
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '11px',
              padding: '0 2px',
              fontWeight: 700,
            }}
          >
            {isExpanded ? '−' : '+'}
          </button>
        </div>
      </div>

      {/* Concise summary line when collapsed */}
      {!isExpanded && (
        <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{candidateCount} Vessels · Top: <strong style={{ color: 'var(--text-primary)' }}>{vesselName}</strong></span>
          <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>{totalScore}%</span>
        </div>
      )}

      {isExpanded && (
        <>
          {/* Candidate Overview */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.7rem' }}>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.62rem' }}>CANDIDATES CORRELATED</div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                {candidateCount} Vessels Identified
              </div>
            </div>

            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.62rem' }}>SEARCH RADIUS</div>
              <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                {searchRadiusKm} km around Origin
              </div>
            </div>
          </div>
        </>
      )}

      {/* Selected / Top Candidate Card */}
      <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '3px', padding: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent-amber)' }}>
            {selectedCandidate ? 'SELECTED CANDIDATE' : 'TOP RANKED CANDIDATE (#1)'}
          </span>
          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent-amber)' }}>
            {totalScore}% Score
          </span>
        </div>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
          {vesselName}
        </div>
        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
          {vesselType} &bull; MMSI: {mmsi}
        </div>
      </div>

      {/* CPA Coordinates & Distance */}
      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '6px', display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.68rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>Closest Approach (CPA):</span>
          <span style={{ fontWeight: 700, color: 'var(--accent-amber)' }}>{cpaDistance} km to Origin</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>CPA Coordinates:</span>
          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-secondary)' }}>{cpaCoords}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>CPA Timestamp:</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.64rem' }}>{cpaTime.replace('GMT', 'UTC')}</span>
        </div>
      </div>

      {/* Mandatory Scientific Disclaimer */}
      <div style={{ background: 'rgba(0,0,0,0.3)', padding: '4px 6px', borderRadius: '3px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.58rem', color: 'var(--text-muted)', lineHeight: '1.25' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 700, color: '#f59e0b', marginBottom: '2px' }}>
          <AlertCircle size={10} />
          <span>EVIDENTIARY DISCLAIMER</span>
        </div>
        Scores represent modelled correlations. They do not establish legal responsibility, causation, or proof of discharge.
      </div>

      {/* Quick Focus Actions */}
      <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
        {onFocusCandidate && (
          <button
            onClick={onFocusCandidate}
            className="btn btn-secondary btn-sm"
            style={{ flex: 1, fontSize: '0.65rem', padding: '3px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}
          >
            <Ship size={11} />
            <span>Focus Vessel</span>
          </button>
        )}
        {onFocusCpa && (
          <button
            onClick={onFocusCpa}
            className="btn btn-secondary btn-sm"
            style={{ flex: 1, fontSize: '0.65rem', padding: '3px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}
          >
            <Crosshair size={11} />
            <span>Focus CPA</span>
          </button>
        )}
      </div>
    </div>
  );
}
