import React from 'react';
import { Cpu, ChevronRight } from 'lucide-react';

export default function ModelBadge({
  modelName = 'unet-dual-pol-sar-v2',
  version = 'V2',
  onClick,
  className = '',
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="View model architecture, lineage, and benchmark metrics"
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-[6px] bg-[var(--og-surface-raised,#171A1E)] border border-[var(--og-border,#25292F)] hover:border-[var(--og-violet,#A855F7)] text-xs font-mono transition-colors cursor-pointer group select-none ${className}`}
      title="Click to view full architecture, lineage, and benchmark metrics"
    >
      <Cpu size={13} className="text-[var(--og-violet,#A855F7)] group-hover:scale-110 transition-transform" />
      <span className="text-[var(--og-text-secondary,#B1B6BD)] group-hover:text-[var(--og-text-primary,#ECEEF1)] font-medium">Dual-Pol U-Net</span>
      <span className="text-[10px] px-1.5 py-0.5 rounded-[4px] bg-[rgba(168,85,247,0.15)] text-[var(--og-violet-soft,#C084FC)]">
        {version}
      </span>
      {onClick && <ChevronRight size={12} className="text-[var(--og-text-muted,#777E87)] group-hover:text-[var(--og-text-primary,#ECEEF1)] transition-colors" />}
    </button>
  );
}
