import React, { useState } from 'react';

export default function Tooltip({ content, children, position = 'top', className = '' }) {
  const [visible, setVisible] = useState(false);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }[position] || 'bottom-full left-1/2 -translate-x-1/2 mb-2';

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && content && (
        <div
          role="tooltip"
          className={`absolute z-50 px-2.5 py-1 text-[11px] font-mono leading-tight text-[var(--og-text-primary,#ECEEF1)] bg-[var(--og-surface-elevated,#1D2025)] border border-[var(--og-border-strong,#343940)] rounded-[4px] shadow-xl whitespace-nowrap pointer-events-none select-none ${positionClasses} ${className}`}
        >
          {content}
        </div>
      )}
    </div>
  );
}
