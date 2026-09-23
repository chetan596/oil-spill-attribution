import React from 'react';
import { AlertCircle, RefreshCw, Radar, ImageOff } from 'lucide-react';
import Button from './Button';

export function ErrorState({
  title = 'Service Unavailable',
  message = 'The requested operation could not be completed. Please retry.',
  onRetry,
  className = '',
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center bg-[#141416] border border-[rgba(255,77,94,0.2)] rounded-lg gap-3 ${className}`}
      role="alert"
    >
      <div className="w-10 h-10 rounded-full bg-[rgba(255,77,94,0.1)] text-[#FF4D5E] flex items-center justify-center">
        <AlertCircle size={20} />
      </div>
      <div className="space-y-1 max-w-md">
        <h4 className="text-sm font-medium text-[#F5F5F5]">{title}</h4>
        <p className="text-xs text-[#71717A] leading-relaxed">{message}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} icon={RefreshCw} className="mt-2">
          Retry Operation
        </Button>
      )}
    </div>
  );
}

export function MediaErrorState({
  title = 'SAR Preview Unavailable',
  message = 'Source raster geometry could not be synthesized for this scene.',
  onRetry,
  className = '',
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center p-6 text-center bg-[#0A0A0B] border border-[#252529] rounded-lg gap-3 w-full h-full min-h-[220px] ${className}`}
      role="alert"
    >
      <div className="w-12 h-12 rounded-full bg-[#141416] border border-[#252529] text-[#5C5C63] flex items-center justify-center">
        <Radar size={22} className="animate-pulse" />
      </div>
      <div className="space-y-1 max-w-xs">
        <h5 className="text-xs font-mono font-medium text-[#C8C8CE] uppercase tracking-wider">{title}</h5>
        <p className="text-[11px] text-[#5C5C63] leading-relaxed">{message}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} icon={RefreshCw}>
          Retry Raster
        </Button>
      )}
    </div>
  );
}

export default ErrorState;
