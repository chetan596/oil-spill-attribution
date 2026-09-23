import React from 'react';
import { Download, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function DownloadProgress({
  progress = 0,
  bytesDownloaded = 0,
  totalBytes = 0,
  speedMbps,
  status = 'DOWNLOADING',
  filename = 'S1A_IW_GRDH_1SDV_20240218T010329.SAFE.zip',
  className = '',
}) {
  const formatMB = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

  return (
    <div className={`p-4 rounded-lg bg-[#141416] border border-[#252529] space-y-3 ${className}`}>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {status === 'DOWNLOADING' ? (
            <Loader2 size={14} className="animate-spin text-[#06B6D4]" />
          ) : status === 'COMPLETE' ? (
            <CheckCircle2 size={14} className="text-[#1AE8A0]" />
          ) : (
            <Download size={14} className="text-[#5C5C63]" />
          )}
          <span className="font-mono text-[#F5F5F5] font-medium truncate max-w-[280px]">
            {filename}
          </span>
        </div>
        <span className="font-mono font-medium text-[#06B6D4]">{Math.round(progress)}%</span>
      </div>

      <div className="w-full bg-[#222224] h-1.5 rounded-full overflow-hidden">
        <div
          className="bg-gradient-to-r from-[#06B6D4] to-[#A855F7] h-full transition-all duration-300 ease-out rounded-full"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] font-mono text-[#5C5C63]">
        <span>
          {totalBytes > 0
            ? `${formatMB(bytesDownloaded)} MB / ${formatMB(totalBytes)} MB`
            : `${formatMB(bytesDownloaded)} MB downloaded`}
        </span>
        {speedMbps && <span>{speedMbps} MB/s</span>}
      </div>
    </div>
  );
}
