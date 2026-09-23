import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Drawer({
  isOpen = false,
  onClose,
  title,
  subtitle,
  children,
  width = 'max-w-lg',
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
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className={`w-screen ${width} bg-[#141416] border-l border-[#252529] shadow-2xl flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-200 ${className}`}>
          {/* Header */}
          <div className="flex items-start justify-between p-6 border-b border-[#252529] bg-[#0A0A0B]/50 flex-shrink-0">
            <div className="space-y-1">
              {title && <h3 className="text-base font-display font-medium text-[#F5F5F5]">{title}</h3>}
              {subtitle && <p className="text-xs font-mono text-[#5C5C63]">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-[#5C5C63] hover:text-[#F5F5F5] hover:bg-[#222224] transition-colors cursor-pointer"
              aria-label="Close panel"
            >
              <X size={18} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
