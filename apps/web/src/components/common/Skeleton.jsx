import React from 'react';

/**
 * Primitive Skeleton element with shimmer effect.
 */
export function Skeleton({ width = '100%', height = '20px', className = '', style = {} }) {
  return (
    <div
      className={`skeleton-shimmer ${className}`}
      style={{
        width,
        height,
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

/**
 * Text placeholder skeleton with configurable line count.
 */
export function SkeletonText({ lines = 3, gap = '8px', className = '', style = {} }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap, ...style }} className={className} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height="14px"
          width={i === lines - 1 && lines > 1 ? '70%' : '100%'}
        />
      ))}
    </div>
  );
}

/**
 * Metric card skeleton loader.
 */
export function SkeletonMetric({ className = '', style = {} }) {
  return (
    <div
      className={`gesso-card ${className}`}
      style={{
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        background: 'var(--og-surface-raised, #171A1E)',
        border: '1px solid var(--og-border, #25292F)',
        borderRadius: '8px',
        ...style,
      }}
      aria-hidden="true"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton width="40%" height="12px" />
        <Skeleton width="20%" height="16px" style={{ borderRadius: '4px' }} />
      </div>
      <Skeleton width="60%" height="28px" />
      <Skeleton width="30%" height="12px" />
    </div>
  );
}

/**
 * Standard card skeleton loader.
 */
export function SkeletonCard({ className = '', style = {} }) {
  return (
    <div
      className={`gesso-card ${className}`}
      style={{
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        background: 'var(--og-surface-raised, #171A1E)',
        border: '1px solid var(--og-border, #25292F)',
        borderRadius: '8px',
        ...style,
      }}
      aria-hidden="true"
    >
      <Skeleton width="50%" height="18px" />
      <SkeletonText lines={3} />
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <Skeleton width="80px" height="28px" style={{ borderRadius: '4px' }} />
        <Skeleton width="80px" height="28px" style={{ borderRadius: '4px' }} />
      </div>
    </div>
  );
}

/**
 * Map view skeleton placeholder.
 */
export function SkeletonMap({ height = '450px', className = '', style = {} }) {
  return (
    <div
      className={`skeleton-shimmer ${className}`}
      style={{
        width: '100%',
        height,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        background: 'var(--og-surface-recessed, #0C0E11)',
        border: '1px solid var(--og-border, #25292F)',
        borderRadius: '8px',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
      aria-label="Loading Geospatial Map..."
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          color: 'var(--og-text-muted, #777E87)',
          fontSize: '0.85rem',
          fontFamily: "var(--og-font-mono, 'JetBrains Mono', monospace)",
          letterSpacing: '0.05em',
        }}
      >
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', border: '2px dashed var(--og-border, #25292F)' }} />
        <span>INITIALIZING RADAR GEOMETRY...</span>
      </div>
    </div>
  );
}

/**
 * Chart skeleton placeholder.
 */
export function SkeletonChart({ height = '160px', className = '', style = {} }) {
  return (
    <div
      className={`gesso-card ${className}`}
      style={{
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        background: 'var(--og-surface-raised, #171A1E)',
        border: '1px solid var(--og-border, #25292F)',
        borderRadius: '8px',
        height,
        ...style,
      }}
      aria-hidden="true"
    >
      <Skeleton width="40%" height="14px" />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', flex: 1, paddingTop: '8px' }}>
        <Skeleton width="15%" height="60%" />
        <Skeleton width="15%" height="90%" />
        <Skeleton width="15%" height="40%" />
        <Skeleton width="15%" height="75%" />
        <Skeleton width="15%" height="50%" />
        <Skeleton width="15%" height="85%" />
      </div>
    </div>
  );
}

/**
 * Table skeleton placeholder.
 */
export function SkeletonTable({ rows = 4, cols = 4, className = '', style = {} }) {
  return (
    <div
      className={`gesso-card ${className}`}
      style={{
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        background: 'var(--og-surface-raised, #171A1E)',
        border: '1px solid var(--og-border, #25292F)',
        borderRadius: '8px',
        ...style,
      }}
      aria-hidden="true"
    >
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--og-border, #25292F)', paddingBottom: '8px' }}>
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={`th-${c}`} width={`${100 / cols}%`} height="14px" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={`tr-${r}`} style={{ display: 'flex', gap: '8px', padding: '4px 0' }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={`td-${r}-${c}`} width={`${100 / cols}%`} height="12px" />
          ))}
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
