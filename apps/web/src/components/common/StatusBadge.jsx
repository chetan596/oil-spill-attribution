import React from 'react';
import { CheckCircle2, Clock, AlertCircle, RefreshCw, XCircle } from 'lucide-react';

export default function StatusBadge({ status = 'PENDING', size = 'md', className = '' }) {
  const norm = String(status).toUpperCase();

  const configs = {
    COMPLETED: {
      bg: 'bg-[rgba(74,222,128,0.1)]',
      text: 'text-[var(--og-success,#4ADE80)]',
      border: 'border-[rgba(74,222,128,0.25)]',
      icon: CheckCircle2,
      label: 'COMPLETED',
    },
    PROCESSING: {
      bg: 'bg-[rgba(73,198,200,0.1)]',
      text: 'text-[var(--og-teal,#49C6C8)]',
      border: 'border-[rgba(73,198,200,0.25)]',
      icon: RefreshCw,
      label: 'PROCESSING',
      spin: true,
    },
    PENDING: {
      bg: 'bg-[rgba(231,166,58,0.1)]',
      text: 'text-[var(--og-amber,#E7A63A)]',
      border: 'border-[rgba(231,166,58,0.25)]',
      icon: Clock,
      label: 'PENDING',
    },
    FAILED: {
      bg: 'bg-[rgba(248,113,113,0.1)]',
      text: 'text-[var(--og-error,#F87171)]',
      border: 'border-[rgba(248,113,113,0.25)]',
      icon: XCircle,
      label: 'FAILED',
    },
  };

  const cfg = configs[norm] || configs.PENDING;
  const Icon = cfg.icon;

  const sizeClasses = size === 'sm'
    ? 'px-2 py-0.5 text-[10px] gap-1'
    : 'px-2.5 py-1 text-[11px] gap-1.5';

  return (
    <span
      className={`inline-flex items-center font-mono font-medium rounded-[4px] select-none ${cfg.bg} ${cfg.text} border ${cfg.border} ${sizeClasses} ${className}`}
      aria-label={`Status: ${cfg.label}`}
    >
      <Icon size={size === 'sm' ? 10 : 12} className={cfg.spin ? 'animate-spin' : ''} />
      <span>{cfg.label}</span>
    </span>
  );
}
