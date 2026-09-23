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
    <div className={`p-4 rounded-lg bg-[#121417] border border-[rgba(255,255,255,0.055)] space-y-4 ${className}`}>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <RefreshCw size={14} className="animate-spin text-[#A855F7]" />
          <span className="font-sans text-[#ECEEF1] font-medium">Pipeline Execution in Progress</span>
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
                    ? 'bg-[#4ADE80]'
                    : isCurrent
                    ? 'bg-[#A855F7] animate-pulse'
                    : 'bg-[#1D2025]'
                }`}
              />
              <span
                className={`text-[10px] font-mono leading-tight truncate ${
                  isDone
                    ? 'text-[#4ADE80]'
                    : isCurrent
                    ? 'text-[#ECEEF1] font-medium'
                    : 'text-[#777E87]'
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
