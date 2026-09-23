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
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#141416] border border-[#252529] hover:border-[#A855F7] text-xs font-mono transition-colors cursor-pointer group select-none ${className}`}
      title="Click to view full architecture, lineage, and benchmark metrics"
    >
      <Cpu size={13} className="text-[#A855F7] group-hover:scale-110 transition-transform" />
      <span className="text-[#C8C8CE] font-medium">Dual-Pol U-Net</span>
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(168,85,247,0.15)] text-[#C084FC]">
        {version}
      </span>
      {onClick && <ChevronRight size={12} className="text-[#5C5C63] group-hover:text-[#F5F5F5] transition-colors" />}
    </button>
  );
}
