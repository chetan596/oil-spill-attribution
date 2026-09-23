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
    ? 'bg-[#222224] text-[#F5F5F5] border border-[#38383E]'
    : 'text-[#5C5C63] hover:text-[#C8C8CE] hover:bg-[rgba(255,255,255,0.04)]';

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-md cursor-pointer transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${sizeClasses} ${activeClasses} ${className}`}
      {...props}
    >
      {Icon && <Icon size={iconSizes} />}
    </button>
  );
}
