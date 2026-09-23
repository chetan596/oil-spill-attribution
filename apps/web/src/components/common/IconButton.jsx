import React from 'react';

export default function IconButton({
  icon: Icon,
  title,
  onClick,
  size = 'md',
  active = false,
  variant = 'ghost',
  disabled = false,
  className = '',
  ...props
}) {
  const sizeClasses = {
    sm: 'w-7 h-7',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
  }[size] || 'w-8 h-8';

  const iconSizes = {
    sm: 14,
    md: 16,
    lg: 20,
  }[size] || 16;

  const activeClasses = active
    ? 'bg-[var(--og-surface-raised,#171A1E)] text-[var(--og-text-primary,#ECEEF1)] border border-[var(--og-border-strong,#343940)]'
    : 'text-[var(--og-text-secondary,#B1B6BD)] hover:text-[var(--og-text-primary,#ECEEF1)] hover:bg-[var(--og-surface-raised,#171A1E)]';

  const accessibleLabel = title || props['aria-label'] || 'Action control';

  return (
    <button
      type="button"
      title={title}
      aria-label={accessibleLabel}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-[6px] cursor-pointer transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--og-border-strong,#343940)] ${sizeClasses} ${activeClasses} ${className}`}
      {...props}
    >
      {Icon && <Icon size={iconSizes} />}
    </button>
  );
}
