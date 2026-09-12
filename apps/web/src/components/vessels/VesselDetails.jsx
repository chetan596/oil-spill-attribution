import React from 'react';
import { Link } from 'react-router-dom';
import VesselScore from './VesselScore';
import { Ship, Anchor, Activity, Navigation, Clock, Compass, ExternalLink, ShieldAlert, Database, AlertCircle } from 'lucide-react';

export default function VesselDetails({ candidate }) {
  if (!candidate) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', background: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b' }}>
        Select a candidate vessel from the ranking table to inspect evidentiary metrics.
      </div>
    );
  }

  const vessel = candidate.vessel || candidate;
  const evidence = candidate.evidence || {};
  const isRank1 = candidate.rank === 1;

  return (
    <div
      style={{
        background: '#0f172a',
        border: `1px solid ${isRank1 ? 'rgba(239, 71, 111, 0.4)' : '#1e293b'}`,
        borderRadius: '8px',
        padding: '20px',
        color: '#f8fafc',
      }}
      role="region"
      aria-label="Candidate Vessel Evidence Details"
    >
      {/* AIS Demonstration Notice */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 10px',
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          borderRadius: '4px',
          fontSize: '0.72rem',
          color: '#fbbf24',
          marginBottom: '14px',
          fontWeight: 600,
        }}
      >
        <Database size={13} />
        <span>AIS DATA SOURCE: DEMONSTRATION DATASET</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: isRank1 ? 'rgba(239, 71, 111, 0.15)' : 'rgba(56, 189, 248, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isRank1 ? '#ef476f' : '#38bdf8',
            }}
          >
            <Ship size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
              {vessel.name || 'Candidate Vessel'}
            </h3>
            <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
              Flag: <strong style={{ color: '#cbd5e1' }}>{vessel.flag || 'Not available'}</strong> | Type: <strong style={{ color: '#cbd5e1' }}>{vessel.vesselType || 'Not available'}</strong>
              {vessel.lengthM != null && <> | Length: <strong style={{ color: '#cbd5e1' }}>{vessel.lengthM}m</strong></>}
            </div>
          </div>
        </div>

        <span
          style={{
            background: isRank1 ? '#ef476f' : '#1e293b',
            color: '#ffffff',
            padding: '3px 10px',
            borderRadius: '12px',
            fontSize: '0.75rem',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
          }}
        >
          Rank #{candidate.rank || 1}
        </span>
      </div>

      {/* Primary Attribution Score */}
      <div style={{ background: '#020617', padding: '12px 16px', borderRadius: '6px', marginBottom: '16px', border: '1px solid #1e293b' }}>
        <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
          <span>Modelled Attribution Score</span>
          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>4-Component Heuristic Synthesis</span>
        </div>
        <VesselScore
          score={candidate.totalScore}
          showDetails={true}
          breakdown={{
            proximityScore: candidate.proximityScore,
            temporalScore: candidate.temporalScore,
            trajectoryScore: candidate.trajectoryScore,
            anomalyScore: candidate.anomalyScore,
          }}
        />
      </div>

      {/* Evidentiary Metrics Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px', fontSize: '0.78rem' }}>
        {/* Minimum Distance */}
        <div style={{ background: '#1e293b', padding: '8px 12px', borderRadius: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8', marginBottom: '2px' }}>
            <Navigation size={12} style={{ color: '#38bdf8' }} />
            <span>Minimum Distance</span>
          </div>
          <div style={{ fontWeight: 600, color: '#f8fafc' }}>
            {evidence.distanceKm != null ? `${evidence.distanceKm} km to origin` : 'Not available'}
          </div>
        </div>

        {/* Time Difference */}
        <div style={{ background: '#1e293b', padding: '8px 12px', borderRadius: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8', marginBottom: '2px' }}>
            <Clock size={12} style={{ color: '#38bdf8' }} />
            <span>Time Difference (Δt)</span>
          </div>
          <div style={{ fontWeight: 600, color: '#f8fafc' }}>
            {evidence.timeDiffHours != null ? `${evidence.timeDiffHours} hours` : 'Not available'}
          </div>
        </div>

        {/* Passing Speed & Heading */}
        <div style={{ background: '#1e293b', padding: '8px 12px', borderRadius: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8', marginBottom: '2px' }}>
            <Activity size={12} style={{ color: '#38bdf8' }} />
            <span>Passing Speed / Heading</span>
          </div>
          <div style={{ fontWeight: 600, color: '#f8fafc' }}>
            {evidence.speedAtPassingKts != null ? `${evidence.speedAtPassingKts} kts` : 'N/A'}
            {evidence.headingAtPassingDeg != null ? ` @ ${evidence.headingAtPassingDeg}°` : ''}
          </div>
        </div>

        {/* AIS Gap */}
        <div style={{ background: '#1e293b', padding: '8px 12px', borderRadius: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8', marginBottom: '2px' }}>
            <Clock size={12} style={{ color: '#38bdf8' }} />
            <span>AIS Time Gap</span>
          </div>
          <div style={{ fontWeight: 600, color: evidence.aisGapMinutes > 30 ? '#f59e0b' : '#f8fafc' }}>
            {evidence.aisGapMinutes != null ? `${evidence.aisGapMinutes} minutes` : '0 min'}
          </div>
        </div>

        {/* Closest Coordinate */}
        {evidence.passingLat != null && (
          <div style={{ background: '#1e293b', padding: '8px 12px', borderRadius: '6px', gridColumn: 'span 2' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8', marginBottom: '2px' }}>
              <Compass size={12} style={{ color: '#38bdf8' }} />
              <span>Closest Point Coordinate & Time</span>
            </div>
            <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.75rem' }}>
              {evidence.passingLat}°N, {evidence.passingLng}°E
              {evidence.closestTimestamp ? ` (${new Date(evidence.closestTimestamp).toUTCString()})` : ''}
            </div>
          </div>
        )}

        {/* MMSI & IMO */}
        <div style={{ background: '#1e293b', padding: '8px 12px', borderRadius: '6px', gridColumn: 'span 2' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8', marginBottom: '2px' }}>
            <Anchor size={12} style={{ color: '#38bdf8' }} />
            <span>MMSI / IMO Identifier</span>
          </div>
          <div style={{ fontWeight: 600, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
            {vessel.mmsi || 'N/A'} {vessel.imo ? `/ IMO: ${vessel.imo}` : ''}
          </div>
        </div>
      </div>

      {/* Mandatory Scientific Disclaimer */}
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.8)',
          border: '1px solid #334155',
          borderRadius: '6px',
          padding: '8px 10px',
          marginBottom: '16px',
          fontSize: '0.70rem',
          color: '#94a3b8',
          lineHeight: 1.4,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#38bdf8', fontWeight: 600, marginBottom: '2px' }}>
          <AlertCircle size={12} />
          <span>Scientific & Evidentiary Disclaimer</span>
        </div>
        Attribution scores represent modelled spatial, temporal, and trajectory correlations from available AIS and SAR-derived information. They do not establish legal responsibility, causation, or proof of pollution by any vessel.
      </div>

      {/* Link to Vessel Track Page */}
      {vessel.mmsi && (
        <Link
          to={`/vessels/${vessel.mmsi}`}
          className="btn-secondary"
          style={{ width: '100%', justifyContent: 'center', textDecoration: 'none', fontSize: '0.82rem' }}
          aria-label={`Inspect historical AIS track for ${vessel.name || vessel.mmsi}`}
        >
          <Compass size={14} />
          <span>Inspect Complete AIS Track</span>
          <ExternalLink size={12} style={{ marginLeft: 'auto' }} />
        </Link>
      )}
    </div>
  );
}
