import React from 'react';
import { Loader2 } from 'lucide-react';

const SIZE_MAP = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
};

export default function LoadingSpinner({ message = 'Loading...', size = 24 }) {
  const numericSize = typeof size === 'number' ? size : (SIZE_MAP[size] || 24);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px',
        gap: '12px',
        color: 'var(--og-text-muted, #777E87)',
        fontFamily: "var(--og-font-body, 'Schibsted Grotesk', sans-serif)",
      }}
      role="status"
      aria-live="polite"
    >
      <Loader2 size={numericSize} style={{ animation: 'spin 1s linear infinite', color: 'var(--og-violet, #A855F7)' }} />
      <span style={{ fontSize: '0.85rem' }}>{message}</span>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

