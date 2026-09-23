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
    <div className={`p-4 rounded-lg bg-[#121417] border border-[rgba(255,255,255,0.055)] space-y-3 ${className}`}>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {status === 'DOWNLOADING' ? (
            <Loader2 size={14} className="animate-spin text-[#49C6C8]" />
          ) : status === 'COMPLETE' ? (
            <CheckCircle2 size={14} className="text-[#4ADE80]" />
          ) : (
            <Download size={14} className="text-[#777E87]" />
          )}
          <span className="font-mono text-[#ECEEF1] font-medium truncate max-w-[280px]">
            {filename}
          </span>
        </div>
        <span className="font-mono font-medium text-[#49C6C8]">{Math.round(progress)}%</span>
      </div>

      <div className="w-full bg-[#0C0E11] h-1.5 rounded-full overflow-hidden border border-[#25292F]">
        <div
          className="bg-[#49C6C8] h-full transition-all duration-300 ease-out rounded-full"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] font-mono text-[#777E87]">
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
