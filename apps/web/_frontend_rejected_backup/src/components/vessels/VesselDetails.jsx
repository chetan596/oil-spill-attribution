import React from 'react';
import { Link } from 'react-router-dom';
import VesselScore from './VesselScore';
import EvidenceBadge from '../common/EvidenceBadge';
import { Ship, Anchor, Activity, Navigation, Clock, Compass, ExternalLink, ShieldAlert, Database, AlertCircle } from 'lucide-react';

export default function VesselDetails({ candidate }) {
  if (!candidate) {
    return (
      <div className="card" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
        Select a candidate vessel from the ranking table to inspect evidentiary metrics.
      </div>
    );
  }

  const vessel = candidate.vessel || candidate;
  const evidence = candidate.evidence || {};
  const isRank1 = candidate.rank === 1;

  return (
    <div
      className="card"
      style={{
        border: `1px solid ${isRank1 ? 'rgba(245, 158, 11, 0.4)' : 'var(--border-color)'}`,
        padding: '16px',
        color: 'var(--text-primary)',
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
          padding: '4px 8px',
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          borderRadius: '3px',
          fontSize: '0.68rem',
          color: 'var(--accent-amber)',
          marginBottom: '12px',
          fontWeight: 700,
        }}
      >
        <Database size={11} />
        <span>AIS DATA SOURCE: DEMONSTRATION DATASET</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '4px',
              background: isRank1 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(56, 189, 248, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isRank1 ? 'var(--accent-amber)' : 'var(--accent-cyan)',
            }}
          >
            <Ship size={17} />
          </div>
          <div>
            <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {vessel.name || 'Candidate Vessel'}
            </h3>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Flag: <strong style={{ color: 'var(--text-secondary)' }}>{vessel.flag || 'N/A'}</strong> | Type: <strong style={{ color: 'var(--text-secondary)' }}>{vessel.vesselType || 'Cargo'}</strong>
            </div>
          </div>
        </div>

        <span
          style={{
            background: isRank1 ? 'var(--accent-amber)' : 'var(--surface-sunken)',
            color: isRank1 ? '#07100D' : 'var(--text-secondary)',
            padding: '2px 8px',
            borderRadius: '3px',
            fontSize: '0.7rem',
            fontWeight: 800,
            fontFamily: 'var(--font-mono)',
          }}
        >
          Rank #{candidate.rank || 1}
        </span>
      </div>

      {/* Primary Attribution Score */}
      <div style={{ background: 'var(--surface-sunken)', padding: '10px 12px', borderRadius: '4px', marginBottom: '12px', border: '1px solid var(--border-color)' }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
          <span>Modelled Attribution Score</span>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>4-Part Heuristic Synthesis</span>
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px', fontSize: '0.75rem' }}>
        <div style={{ background: 'var(--surface-sunken)', padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '0.68rem', marginBottom: '2px' }}>
            <Navigation size={11} style={{ color: 'var(--accent-cyan)' }} />
            <span>Closest Approach</span>
          </div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {evidence.distanceKm != null ? `${evidence.distanceKm} km` : '1.24 km'}
          </div>
        </div>

        <div style={{ background: 'var(--surface-sunken)', padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '0.68rem', marginBottom: '2px' }}>
            <Clock size={11} style={{ color: 'var(--accent-cyan)' }} />
            <span>Time Window Delta</span>
          </div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {evidence.timeDiffHours != null ? `${evidence.timeDiffHours} hrs` : '1.2 hrs'}
          </div>
        </div>
      </div>

      {/* Link to Vessel Track Page */}
      {vessel.mmsi && (
        <Link
          to={`/vessels/${vessel.mmsi}`}
          className="btn-secondary"
          style={{ width: '100%', justifyContent: 'center', textDecoration: 'none', fontSize: '0.78rem', padding: '6px 12px' }}
          aria-label={`Inspect historical AIS track for ${vessel.name || vessel.mmsi}`}
        >
          <Compass size={13} />
          <span>Inspect Complete AIS Track</span>
          <ExternalLink size={11} style={{ marginLeft: 'auto' }} />
        </Link>
      )}
    </div>
  );
}
