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
        className={`inline-flex items-center font-mono font-medium rounded-full bg-[rgba(26,232,160,0.1)] text-[#1AE8A0] border border-[rgba(26,232,160,0.25)] ${sizeClasses} ${className}`}
        title="Copernicus Data Space Ecosystem authenticated satellite pass"
      >
        <ShieldCheck size={size === 'sm' ? 11 : 13} />
        <span>REAL CDSE SAR</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center font-mono font-medium rounded-full bg-[rgba(168,85,247,0.1)] text-[#C084FC] border border-[rgba(168,85,247,0.25)] ${sizeClasses} ${className}`}
      title="Standard simulated demonstration scenario"
    >
      <Radio size={size === 'sm' ? 11 : 13} />
      <span>DEMO SCENARIO</span>
    </span>
  );
}
