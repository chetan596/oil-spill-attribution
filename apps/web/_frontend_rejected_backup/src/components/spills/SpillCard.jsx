import React from 'react';
import { Link } from 'react-router-dom';
import ConfidenceBadge from './ConfidenceBadge';
import EvidenceBadge from '../common/EvidenceBadge';
import { Droplet, MapPin, Calendar, ArrowRight, Activity } from 'lucide-react';

export default function SpillCard({ spill, isSelected, onSelect }) {
  if (!spill) return null;

  const lat = Number(spill.latitude);
  const lng = Number(spill.longitude);

  return (
    <div
      onClick={() => onSelect && onSelect(spill)}
      style={{
        border: `1px solid ${isSelected ? 'var(--accent-cyan)' : 'var(--border-color)'}`,
        padding: '14px 16px',
        borderRadius: '4px',
        background: isSelected ? 'rgba(56, 189, 248, 0.07)' : 'var(--surface-raised)',
        color: 'var(--text-primary)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        boxShadow: isSelected ? '0 0 12px rgba(56, 189, 248, 0.15)' : 'none',
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onSelect && onSelect(spill);
        }
      }}
      aria-label={`Potential Oil Slick #${spill.id.slice(0, 8)}, area ${spill.areaKm2} square kilometers`}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '4px',
              background: 'rgba(244, 63, 94, 0.12)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              color: 'var(--accent-rose)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Droplet size={15} />
          </div>
          <div>
            <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Potential Oil Slick <code style={{ color: 'var(--accent-cyan)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>#{spill.id.slice(0, 8)}</code>
            </h4>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Mission: <span style={{ fontFamily: 'var(--font-mono)' }}>{spill.analysisId ? `#${spill.analysisId.slice(0, 8)}` : 'Demo Target'}</span>
            </div>
          </div>
        </div>

        <ConfidenceBadge score={spill.confidence} label="Detection" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px', margin: '10px 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <MapPin size={13} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            {!isNaN(lat) && !isNaN(lng) ? `${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E` : 'N/A'}
          </span>
        </div>
        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
          Area: <span style={{ fontFamily: 'var(--font-mono)' }}>{spill.areaKm2}</span> km²
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '8px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Calendar size={12} />
          <span>{spill.detectedAt ? new Date(spill.detectedAt).toLocaleDateString() : 'Sentinel-1 Pass'}</span>
        </div>

        {spill.analysisId ? (
          <Link
            to={`/analysis/${spill.analysisId}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              color: 'var(--accent-cyan)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontWeight: 600,
            }}
            aria-label={`Open command center for spill #${spill.id.slice(0, 8)}`}
          >
            <span>Command Center</span>
            <ArrowRight size={12} />
          </Link>
        ) : (
          <Link
            to={`/spills/${spill.id}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              color: 'var(--accent-cyan)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontWeight: 600,
            }}
            aria-label={`View analysis for spill #${spill.id.slice(0, 8)}`}
          >
            <span>Details</span>
            <ArrowRight size={12} />
          </Link>
        )}
      </div>
    </div>
  );
}
