import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Drawer({
  isOpen = false,
  onClose,
  title,
  subtitle,
  children,
  width = '380px',
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

  // Resolve numerical or string width safely
  const resolvedWidth = typeof width === 'number'
    ? `${width}px`
    : (width?.startsWith('max-w-') ? '380px' : width || '380px');

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1500,
        overflow: 'hidden',
        pointerEvents: 'auto',
      }}
      role="dialog"
      aria-modal="true"
    >
      {/* Dimmed Blurred Backdrop */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.68)',
          backdropFilter: 'blur(3px)',
          transition: 'opacity 0.2s ease-out',
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-out Drawer Panel (Controlled max-width, never full-screen width) */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          bottom: 0,
          right: 0,
          width: '100%',
          maxWidth: `min(${resolvedWidth}, calc(100vw - 32px))`,
          backgroundColor: 'var(--og-surface, #121417)',
          borderLeft: '1px solid var(--og-border-strong, #343940)',
          boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.85)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1501,
          overflow: 'hidden',
        }}
        className={className}
      >
        {/* Drawer Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--og-border-subtle, rgba(255, 255, 255, 0.055))',
            backgroundColor: 'var(--og-surface-raised, #171A1E)',
            flexShrink: 0,
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
            {title && (
              <h3
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: 'var(--og-text-primary, #ECEEF1)',
                  margin: 0,
                  letterSpacing: '0.02em',
                }}
              >
                {title}
              </h3>
            )}
            {subtitle && (
              <p
                style={{
                  fontSize: '11px',
                  fontFamily: "var(--og-font-mono, 'JetBrains Mono', monospace)",
                  color: 'var(--og-text-muted, #777E87)',
                  margin: 0,
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px',
              borderRadius: '4px',
              color: 'var(--og-text-muted, #777E87)',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 120ms, background-color 120ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--og-text-primary, #ECEEF1)';
              e.currentTarget.style.backgroundColor = 'var(--og-surface-elevated, #1D2025)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--og-text-muted, #777E87)';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            aria-label="Close panel"
          >
            <X size={16} />
          </button>
        </div>

        {/* Drawer Scrollable Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
