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
  const baseClasses = 'inline-flex items-center justify-center font-medium transition-all duration-150 rounded-md cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#A855F7] focus:ring-offset-2 focus:ring-offset-[#0A0A0B]';

  const sizeClasses = {
    sm: 'px-2.5 py-1 text-xs gap-1.5',
    md: 'px-3.5 py-1.5 text-xs gap-2',
    lg: 'px-4 py-2 text-sm gap-2',
  }[size] || 'px-3.5 py-1.5 text-xs gap-2';

  const variantClasses = {
    primary: 'bg-[#A855F7] hover:bg-[#9333EA] active:bg-[#7E22CE] text-white shadow-sm',
    secondary: 'bg-[#141416] hover:bg-[#222224] active:bg-[#2A2A2E] text-[#F5F5F5] border border-[#252529]',
    ghost: 'bg-transparent hover:bg-[#141416] text-[#C8C8CE] hover:text-[#F5F5F5]',
    danger: 'bg-[rgba(255,77,94,0.15)] hover:bg-[rgba(255,77,94,0.25)] text-[#FF4D5E] border border-[rgba(255,77,94,0.3)]',
  }[variant] || 'bg-[#141416] text-[#F5F5F5] border border-[#252529]';

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
