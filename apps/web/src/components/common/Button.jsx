import React from 'react';
import { Loader2 } from 'lucide-react';

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  icon: Icon,
  className = '',
  ...props
}) {
  const baseClasses = 'inline-flex items-center justify-center font-medium transition-colors duration-150 rounded-[6px] cursor-pointer select-none disabled:opacity-45 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--og-border-strong,#343940)]';

  const sizeClasses = {
    sm: 'px-2.5 py-1 text-[11px] gap-1.5 h-[28px]',
    md: 'px-3.5 py-1.5 text-xs gap-2 h-[32px]',
    lg: 'px-4 py-2 text-xs gap-2 h-[36px]',
  }[size] || 'px-3.5 py-1.5 text-xs gap-2 h-[32px]';

  const variantClasses = {
    primary: 'bg-[var(--og-violet,#A855F7)] hover:bg-[var(--og-violet-soft,#C084FC)] active:bg-[#9333EA] text-[#FFFFFF] font-medium shadow-sm',
    secondary: 'bg-[var(--og-surface-raised,#171A1E)] hover:bg-[var(--og-surface-elevated,#1D2025)] text-[var(--og-text-primary,#ECEEF1)] border border-[var(--og-border-strong,#343940)]',
    ghost: 'bg-transparent hover:bg-[var(--og-surface-raised,#171A1E)] text-[var(--og-text-secondary,#B1B6BD)] hover:text-[var(--og-text-primary,#ECEEF1)]',
    synthesis: 'bg-[var(--og-magenta,#EC4899)] hover:bg-[var(--og-magenta-soft,#F472B6)] active:bg-[#DB2777] text-[#FFFFFF] font-medium shadow-sm',
    sar: 'bg-[var(--og-teal,#49C6C8)] hover:bg-[var(--og-teal-soft,#78DADD)] active:bg-[#38A8AA] text-[#0A0B0D] font-semibold',
    drift: 'bg-[var(--og-amber,#E7A63A)] hover:bg-[var(--og-amber-soft,#F2BC62)] active:bg-[#C98A2A] text-[#0A0B0D] font-semibold',
    danger: 'bg-[rgba(248,113,113,0.12)] hover:bg-[rgba(248,113,113,0.2)] text-[var(--og-error,#F87171)] border border-[rgba(248,113,113,0.3)]',
  }[variant] || 'bg-[var(--og-surface-raised,#171A1E)] text-[var(--og-text-primary,#ECEEF1)] border border-[var(--og-border-strong,#343940)]';

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {isLoading ? (
        <Loader2 size={size === 'sm' ? 12 : 14} className="animate-spin" />
      ) : Icon ? (
        <Icon size={size === 'sm' ? 13 : 15} />
      ) : null}
      <span>{children}</span>
    </button>
  );
}
