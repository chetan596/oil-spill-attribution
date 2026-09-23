import React from 'react';
import { ShieldCheck, Database, Radio, Sparkles } from 'lucide-react';

export default function SourceBadge({
  mode = 'DEMO',
  provenanceState,
  size = 'md',
  className = '',
}) {
  const isReal = mode === 'REAL' || provenanceState === 'AUTHENTICATED_CDSE';

  const sizeClasses = size === 'sm'
    ? 'px-2 py-0.5 text-[10px] gap-1'
    : 'px-2.5 py-1 text-[11px] gap-1.5';

  if (isReal) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: size === 'sm' ? '2px 8px' : '3px 9px',
          fontSize: size === 'sm' ? '10px' : '11px',
          fontWeight: 600,
          borderRadius: '4px',
          backgroundColor: 'rgba(73, 198, 200, 0.10)',
          color: 'var(--og-teal, #49C6C8)',
          border: '1px solid rgba(73, 198, 200, 0.24)',
          fontFamily: "var(--og-font-mono, 'JetBrains Mono', monospace)",
          letterSpacing: '0.03em',
          userSelect: 'none',
        }}
        className={className}
        title="Copernicus Data Space Ecosystem authenticated satellite pass"
        aria-label="Source: Real Copernicus CDSE SAR"
      >
        <ShieldCheck size={size === 'sm' ? 11 : 13} />
        <span>REAL CDSE SAR</span>
      </span>
    );
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: size === 'sm' ? '2px 8px' : '3px 9px',
        fontSize: size === 'sm' ? '10px' : '11px',
        fontWeight: 600,
        borderRadius: '4px',
        backgroundColor: 'rgba(168, 85, 247, 0.10)',
        color: 'var(--og-violet, #A855F7)',
        border: '1px solid rgba(168, 85, 247, 0.24)',
        fontFamily: "var(--og-font-mono, 'JetBrains Mono', monospace)",
        letterSpacing: '0.03em',
        userSelect: 'none',
      }}
      className={className}
      title="Standard simulated demonstration scenario"
      aria-label="Source: Demonstration Scenario"
    >
      <Radio size={size === 'sm' ? 11 : 13} />
      <span>DEMO SCENARIO</span>
    </span>
  );
}
