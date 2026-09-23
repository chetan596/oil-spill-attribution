import React from 'react';
import ConfidenceBadge from './ConfidenceBadge';
import EvidenceBadge from '../common/EvidenceBadge';
import { Droplet, Satellite, MapPin, Clock, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function SpillDetails({ spill }) {
  if (!spill) return null;

  const lat = Number(spill.latitude);
  const lng = Number(spill.longitude);

  return (
    <div
      className="card"
      style={{
        padding: '16px',
        color: 'var(--text-primary)',
      }}
      role="region"
      aria-label="Spill Incident Details"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '4px',
              background: 'rgba(244, 63, 94, 0.12)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-rose)',
            }}
          >
            <Droplet size={17} />
          </div>
          <div>
            <h3 style={{ fontSize: '0.92rem', fontWeight: 700, margin: 0 }}>
              Potential Oil Slick <code style={{ color: 'var(--accent-cyan)', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}>#{spill.id.slice(0, 8)}</code>
            </h3>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Database Record ID: <span style={{ fontFamily: 'var(--font-mono)' }}>{spill.id}</span>
            </div>
          </div>
        </div>

        <ConfidenceBadge score={spill.confidence} label="Detection" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', marginBottom: '14px', fontSize: '0.78rem' }}>
        <div style={{ background: 'var(--surface-sunken)', padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '0.68rem', marginBottom: '2px' }}>
            <Satellite size={11} style={{ color: 'var(--accent-cyan)' }} />
            <span>Sensor</span>
          </div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Sentinel-1 SAR</div>
        </div>

        <div style={{ background: 'var(--surface-sunken)', padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '0.68rem', marginBottom: '2px' }}>
            <Droplet size={11} style={{ color: 'var(--accent-rose)' }} />
            <span>Slick Area</span>
          </div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{spill.areaKm2} km²</div>
        </div>

        <div style={{ background: 'var(--surface-sunken)', padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '0.68rem', marginBottom: '2px' }}>
            <MapPin size={11} style={{ color: 'var(--accent-cyan)' }} />
            <span>Centroid</span>
          </div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {!isNaN(lat) && !isNaN(lng) ? `${lat.toFixed(3)}°, ${lng.toFixed(3)}°` : 'N/A'}
          </div>
        </div>

        <div style={{ background: 'var(--surface-sunken)', padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '0.68rem', marginBottom: '2px' }}>
            <Clock size={11} style={{ color: 'var(--accent-amber)' }} />
            <span>Est. Slick Age</span>
          </div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{spill.estimatedAgeHours ? `${spill.estimatedAgeHours}h` : '14.5h'}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <Link
          to="/reports"
          className="btn-primary"
          style={{ textDecoration: 'none', fontSize: '0.78rem', flex: 1, justifyContent: 'center', padding: '6px 12px' }}
          aria-label="Generate Incident Report Dossier"
        >
          <FileText size={13} /> Synthesize Report Dossier
        </Link>
      </div>
    </div>
  );
}
