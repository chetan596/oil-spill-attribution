import React from 'react';
import { Link } from 'react-router-dom';
import ConfidenceBadge from './ConfidenceBadge';
import { Droplet, MapPin, Calendar, ArrowRight } from 'lucide-react';

export default function SpillCard({ spill, isSelected, onSelect }) {
  if (!spill) return null;

  const lat = Number(spill.latitude);
  const lng = Number(spill.longitude);

  return (
    <div
      onClick={() => onSelect && onSelect(spill)}
      style={{
        border: `1px solid ${isSelected ? '#38bdf8' : '#1e293b'}`,
        padding: '16px',
        borderRadius: '8px',
        background: isSelected ? 'rgba(56, 189, 248, 0.08)' : '#0f172a',
        color: '#f8fafc',
        cursor: 'pointer',
        transition: 'all 0.2s',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'rgba(244, 63, 94, 0.15)',
              color: '#f43f5e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Droplet size={16} />
          </div>
          <div>
            <h4 style={{ fontSize: '0.92rem', fontWeight: 600, color: '#f8fafc' }}>
              Potential Oil Slick <code style={{ color: '#38bdf8', fontSize: '0.8rem' }}>#{spill.id.slice(0, 8)}</code>
            </h4>
            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
              Analysis: {spill.analysisId ? `#${spill.analysisId.slice(0, 8)}` : 'Demo Record'}
            </div>
          </div>
        </div>

        <ConfidenceBadge score={spill.confidence} label="Detection" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px', margin: '12px 0', fontSize: '0.78rem', color: '#94a3b8' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <MapPin size={12} style={{ color: '#38bdf8', flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            {!isNaN(lat) && !isNaN(lng) ? `${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E` : 'Not available'}
          </span>
        </div>
        <div style={{ fontWeight: 600, color: '#f8fafc' }}>
          Area: {spill.areaKm2} km²
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #1e293b', paddingTop: '10px', fontSize: '0.72rem', color: '#64748b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Calendar size={12} />
          <span>{spill.detectedAt ? new Date(spill.detectedAt).toLocaleDateString() : 'Demonstration Scenario'}</span>
        </div>

        <Link
          to={`/spills/${spill.id}`}
          onClick={(e) => e.stopPropagation()}
          style={{
            color: '#38bdf8',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontWeight: 600,
          }}
          aria-label={`View analysis for spill #${spill.id.slice(0, 8)}`}
        >
          <span>View Analysis</span>
          <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}
