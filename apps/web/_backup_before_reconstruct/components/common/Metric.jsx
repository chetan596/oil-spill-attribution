import React from 'react';

export function Metric({
  label,
  value,
  unit,
  provenance,
  description,
  className = '',
}) {
  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-mono tracking-[0.08em] uppercase text-[#5C5C63]">
          {label}
        </span>
        {provenance && (
          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[rgba(255,255,255,0.04)] text-[#71717A] border border-[#252529]">
            {provenance}
          </span>
        )}
      </div>
      <div className="font-display text-[24px] md:text-[28px] leading-tight text-[#E8E8EA] mt-0.5 tabular-nums">
        {value}
        {unit && <span className="text-[13px] text-[#5C5C63] ml-1 font-sans">{unit}</span>}
      </div>
      {description && (
        <span className="text-[11px] text-[#5C5C63] font-sans mt-0.5 leading-snug">
          {description}
        </span>
      )}
    </div>
  );
}

export function MetricStrip({ metrics = [], className = '' }) {
  return (
    <div className={`flex items-start gap-8 md:gap-12 flex-wrap ${className}`}>
      {metrics.map((m, idx) => (
        <Metric key={idx} {...m} />
      ))}
    </div>
  );
}

export default Metric;
