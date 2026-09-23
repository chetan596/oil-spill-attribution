import React from 'react';
import ConfidenceBadge from './ConfidenceBadge';
import { Droplet, Satellite, MapPin, Clock, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function SpillDetails({ spill }) {
  if (!spill) return null;

  const lat = Number(spill.latitude);
  const lng = Number(spill.longitude);

  return (
    <div
      style={{
        padding: '20px',
        background: '#0f172a',
        color: '#f8fafc',
        borderRadius: '8px',
        border: '1px solid #1e293b',
      }}
      role="region"
      aria-label="Spill Incident Details"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'rgba(244, 63, 94, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f43f5e',
            }}
          >
            <Droplet size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
              Potential Oil Slick <code style={{ color: '#38bdf8', fontSize: '0.85rem' }}>#{spill.id.slice(0, 8)}</code>
            </h3>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Database Record ID: <span style={{ fontFamily: 'var(--font-mono)' }}>{spill.id}</span>
            </div>
          </div>
        </div>

        <ConfidenceBadge score={spill.confidence} label="Detection" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '16px', fontSize: '0.8rem' }}>
        <div style={{ background: '#020617', padding: '10px', borderRadius: '6px', border: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8', fontSize: '0.72rem', marginBottom: '2px' }}>
            <Satellite size={12} style={{ color: '#38bdf8' }} />
            <span>Sensor</span>
          </div>
          <div style={{ fontWeight: 600, color: '#f8fafc' }}>Sentinel-1 C-Band SAR</div>
        </div>

        <div style={{ background: '#020617', padding: '10px', borderRadius: '6px', border: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8', fontSize: '0.72rem', marginBottom: '2px' }}>
            <Droplet size={12} style={{ color: '#38bdf8' }} />
            <span>Slick Area</span>
          </div>
          <div style={{ fontWeight: 600, color: '#f8fafc' }}>{spill.areaKm2} km²</div>
        </div>

        <div style={{ background: '#020617', padding: '10px', borderRadius: '6px', border: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8', fontSize: '0.72rem', marginBottom: '2px' }}>
            <MapPin size={12} style={{ color: '#38bdf8' }} />
            <span>Centroid</span>
          </div>
          <div style={{ fontWeight: 600, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
            {!isNaN(lat) && !isNaN(lng) ? `${lat.toFixed(3)}°, ${lng.toFixed(3)}°` : 'N/A'}
          </div>
        </div>

        <div style={{ background: '#020617', padding: '10px', borderRadius: '6px', border: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8', fontSize: '0.72rem', marginBottom: '2px' }}>
            <Clock size={12} style={{ color: '#38bdf8' }} />
            <span>Est. Slick Age</span>
          </div>
          <div style={{ fontWeight: 600, color: '#f8fafc' }}>{spill.estimatedAgeHours ? `${spill.estimatedAgeHours} hours` : '14.5 hours'}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <Link
          to="/reports"
          className="btn-primary"
          style={{ textDecoration: 'none', fontSize: '0.82rem', flex: 1, justifyContent: 'center' }}
          aria-label="Generate Incident Report Dossier"
        >
          <FileText size={14} /> Generate Incident Report
        </Link>
      </div>
    </div>
  );
}
