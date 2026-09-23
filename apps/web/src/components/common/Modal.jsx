import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({
  isOpen = false,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'max-w-xl',
  className = '',
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className={`relative w-full ${maxWidth} bg-[#171A1E] border border-[#343940] rounded-[8px] shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150 ${className}`}>
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-[rgba(255,255,255,0.055)] bg-[#121417]">
          <div className="space-y-1">
            {title && <h3 className="text-sm font-display font-medium text-[#ECEEF1]">{title}</h3>}
            {subtitle && <p className="text-xs font-mono text-[#777E87]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-[6px] text-[#777E87] hover:text-[#ECEEF1] hover:bg-[#1D2025] transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
