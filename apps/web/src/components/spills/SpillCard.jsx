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
        border: `1px solid ${isSelected ? 'var(--og-violet, #A855F7)' : 'var(--og-border, #25292F)'}`,
        padding: '16px',
        borderRadius: '6px',
        background: isSelected ? 'var(--og-surface-raised, #171A1E)' : 'var(--og-surface, #121417)',
        color: 'var(--og-text-primary, #ECEEF1)',
        cursor: 'pointer',
        transition: 'all 0.15s',
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
              borderRadius: '4px',
              background: 'rgba(168, 85, 247, 0.15)',
              color: 'var(--og-violet, #A855F7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Droplet size={16} />
          </div>
          <div>
            <h4 style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--og-text-primary, #ECEEF1)' }}>
              Potential Oil Slick <code style={{ color: 'var(--og-violet, #A855F7)', fontSize: '0.8rem' }}>#{spill.id.slice(0, 8)}</code>
            </h4>
            <div style={{ fontSize: '0.72rem', color: 'var(--og-text-muted, #777E87)' }}>
              Analysis: {spill.analysisId ? `#${spill.analysisId.slice(0, 8)}` : 'Demo Record'}
            </div>
          </div>
        </div>

        <ConfidenceBadge score={spill.confidence} label="Detection" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px', margin: '12px 0', fontSize: '0.78rem', color: 'var(--og-text-secondary, #B1B6BD)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <MapPin size={12} style={{ color: 'var(--og-teal, #49C6C8)', flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
            {!isNaN(lat) && !isNaN(lng) ? `${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E` : 'Not available'}
          </span>
        </div>
        <div style={{ fontWeight: 600, color: 'var(--og-text-primary, #ECEEF1)', fontVariantNumeric: 'tabular-nums' }}>
          Area: {spill.areaKm2} km²
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--og-border-subtle, #1B1E22)', paddingTop: '10px', fontSize: '0.72rem', color: 'var(--og-text-muted, #777E87)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Calendar size={12} />
          <span>{spill.detectedAt ? new Date(spill.detectedAt).toLocaleDateString() : 'Demonstration Scenario'}</span>
        </div>

        <Link
          to={`/spills/${spill.id}`}
          onClick={(e) => e.stopPropagation()}
          style={{
            color: 'var(--og-violet, #A855F7)',
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
