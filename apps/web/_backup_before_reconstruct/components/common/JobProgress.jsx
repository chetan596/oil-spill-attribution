import React from 'react';
import { RefreshCw, CheckCircle2, Clock, XCircle } from 'lucide-react';

export default function JobProgress({
  stage = 'SAR_SEGMENTATION',
  progress = 65,
  stages = [
    { key: 'SAR_SEGMENTATION', label: 'SAR Segmentation' },
    { key: 'DRIFT_HINDCAST', label: 'Drift Hindcast' },
    { key: 'AIS_ATTRIBUTION', label: 'AIS Attribution' },
    { key: 'DOSSIER_SYNTHESIS', label: 'Dossier Synthesis' },
  ],
  className = '',
}) {
  const currentIdx = stages.findIndex((s) => s.key === stage);

  return (
    <div className={`p-4 rounded-lg bg-[#141416] border border-[#252529] space-y-4 ${className}`}>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <RefreshCw size={14} className="animate-spin text-[#A855F7]" />
          <span className="font-sans text-[#F5F5F5] font-medium">Pipeline Execution in Progress</span>
        </div>
        <span className="font-mono text-[#A855F7] font-medium">{Math.round(progress)}%</span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {stages.map((stg, idx) => {
          const isDone = idx < currentIdx;
          const isCurrent = idx === currentIdx;

          return (
            <div key={stg.key} className="flex flex-col gap-1.5">
              <div
                className={`h-1.5 rounded-full transition-colors ${
                  isDone
                    ? 'bg-[#1AE8A0]'
                    : isCurrent
                    ? 'bg-[#A855F7] animate-pulse'
                    : 'bg-[#222224]'
                }`}
              />
              <span
                className={`text-[10px] font-mono leading-tight truncate ${
                  isDone
                    ? 'text-[#1AE8A0]'
                    : isCurrent
                    ? 'text-[#F5F5F5] font-medium'
                    : 'text-[#5C5C63]'
                }`}
              >
                {stg.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
