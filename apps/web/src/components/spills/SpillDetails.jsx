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
        background: 'var(--og-surface, #121417)',
        color: 'var(--og-text-primary, #ECEEF1)',
        borderRadius: '6px',
        border: '1px solid var(--og-border, #25292F)',
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
              borderRadius: '6px',
              background: 'rgba(168, 85, 247, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--og-violet, #A855F7)',
            }}
          >
            <Droplet size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
              Potential Oil Slick <code style={{ color: 'var(--og-violet, #A855F7)', fontSize: '0.85rem' }}>#{spill.id.slice(0, 8)}</code>
            </h3>
            <div style={{ fontSize: '0.75rem', color: 'var(--og-text-muted, #777E87)' }}>
              Database Record ID: <span style={{ fontFamily: 'var(--font-mono)' }}>{spill.id}</span>
            </div>
          </div>
        </div>

        <ConfidenceBadge score={spill.confidence} label="Detection" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '16px', fontSize: '0.8rem' }}>
        <div style={{ background: 'var(--og-surface-recessed, #0C0E11)', padding: '10px', borderRadius: '6px', border: '1px solid var(--og-border, #25292F)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--og-text-secondary, #B1B6BD)', fontSize: '0.72rem', marginBottom: '2px' }}>
            <Satellite size={12} style={{ color: 'var(--og-teal, #49C6C8)' }} />
            <span>Sensor</span>
          </div>
          <div style={{ fontWeight: 600, color: 'var(--og-text-primary, #ECEEF1)' }}>Sentinel-1 C-Band SAR</div>
        </div>

        <div style={{ background: 'var(--og-surface-recessed, #0C0E11)', padding: '10px', borderRadius: '6px', border: '1px solid var(--og-border, #25292F)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--og-text-secondary, #B1B6BD)', fontSize: '0.72rem', marginBottom: '2px' }}>
            <Droplet size={12} style={{ color: 'var(--og-teal, #49C6C8)' }} />
            <span>Slick Area</span>
          </div>
          <div style={{ fontWeight: 600, color: 'var(--og-text-primary, #ECEEF1)', fontVariantNumeric: 'tabular-nums' }}>{spill.areaKm2} km²</div>
        </div>

        <div style={{ background: 'var(--og-surface-recessed, #0C0E11)', padding: '10px', borderRadius: '6px', border: '1px solid var(--og-border, #25292F)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--og-text-secondary, #B1B6BD)', fontSize: '0.72rem', marginBottom: '2px' }}>
            <MapPin size={12} style={{ color: 'var(--og-teal, #49C6C8)' }} />
            <span>Centroid</span>
          </div>
          <div style={{ fontWeight: 600, color: 'var(--og-text-primary, #ECEEF1)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
            {!isNaN(lat) && !isNaN(lng) ? `${lat.toFixed(3)}°, ${lng.toFixed(3)}°` : 'N/A'}
          </div>
        </div>

        <div style={{ background: 'var(--og-surface-recessed, #0C0E11)', padding: '10px', borderRadius: '6px', border: '1px solid var(--og-border, #25292F)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--og-text-secondary, #B1B6BD)', fontSize: '0.72rem', marginBottom: '2px' }}>
            <Clock size={12} style={{ color: 'var(--og-teal, #49C6C8)' }} />
            <span>Est. Slick Age</span>
          </div>
          <div style={{ fontWeight: 600, color: 'var(--og-text-primary, #ECEEF1)', fontVariantNumeric: 'tabular-nums' }}>{spill.estimatedAgeHours ? `${spill.estimatedAgeHours} hours` : '14.5 hours'}</div>
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
