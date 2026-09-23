import React from 'react';
import { CheckCircle2, Clock, AlertCircle, RefreshCw, XCircle } from 'lucide-react';

export default function StatusBadge({ status = 'PENDING', size = 'md', className = '' }) {
  const norm = String(status).toUpperCase();

  const configs = {
    COMPLETED: {
      bg: 'bg-[rgba(26,232,160,0.1)]',
      text: 'text-[#1AE8A0]',
      border: 'border-[rgba(26,232,160,0.25)]',
      icon: CheckCircle2,
      label: 'COMPLETED',
    },
    PROCESSING: {
      bg: 'bg-[rgba(6,182,212,0.1)]',
      text: 'text-[#06B6D4]',
      border: 'border-[rgba(6,182,212,0.25)]',
      icon: RefreshCw,
      label: 'PROCESSING',
      spin: true,
    },
    PENDING: {
      bg: 'bg-[rgba(251,191,36,0.1)]',
      text: 'text-[#FBBF24]',
      border: 'border-[rgba(251,191,36,0.25)]',
      icon: Clock,
      label: 'PENDING',
    },
    FAILED: {
      bg: 'bg-[rgba(255,77,94,0.1)]',
      text: 'text-[#FF4D5E]',
      border: 'border-[rgba(255,77,94,0.25)]',
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
      className={`inline-flex items-center font-mono font-medium rounded-full ${cfg.bg} ${cfg.text} border ${cfg.border} ${sizeClasses} ${className}`}
    >
      <Icon size={size === 'sm' ? 10 : 12} className={cfg.spin ? 'animate-spin' : ''} />
      <span>{cfg.label}</span>
    </span>
  );
}
