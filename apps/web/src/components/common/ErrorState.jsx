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
      className={`flex flex-col items-center justify-center p-8 text-center bg-[var(--og-surface,#121417)] border border-[rgba(248,113,113,0.25)] rounded-[8px] gap-3 ${className}`}
      role="alert"
    >
      <div className="w-10 h-10 rounded-full bg-[rgba(248,113,113,0.1)] text-[var(--og-error,#F87171)] flex items-center justify-center">
        <AlertCircle size={20} />
      </div>
      <div className="space-y-1 max-w-md">
        <h4 className="text-sm font-display font-medium text-[var(--og-text-primary,#ECEEF1)]">{title}</h4>
        <p className="text-xs text-[var(--og-text-muted,#777E87)] leading-relaxed">{message}</p>
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
      className={`flex flex-col items-center justify-center p-6 text-center bg-[var(--og-surface-recessed,#0C0E11)] border border-[var(--og-border,#25292F)] rounded-[8px] gap-3 w-full h-full min-h-[220px] ${className}`}
      role="alert"
    >
      <div className="w-12 h-12 rounded-full bg-[var(--og-surface,#121417)] border border-[var(--og-border,#25292F)] text-[var(--og-text-muted,#777E87)] flex items-center justify-center">
        <Radar size={22} className="animate-pulse" />
      </div>
      <div className="space-y-1 max-w-xs">
        <h5 className="text-xs font-mono font-medium text-[var(--og-text-primary,#ECEEF1)] uppercase tracking-wider">{title}</h5>
        <p className="text-[11px] text-[var(--og-text-muted,#777E87)] leading-relaxed">{message}</p>
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
