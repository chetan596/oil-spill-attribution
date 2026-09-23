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
  const numericSize = typeof size === 'number'
    ? size
    : (SIZE_MAP[size] || (typeof size === 'string' && !isNaN(Number(size)) ? Number(size) : 24));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px', gap: '12px', color: '#94a3b8' }}>
      <Loader2 size={numericSize} style={{ animation: 'spin 1s linear infinite', color: '#38bdf8' }} />
      <span style={{ fontSize: '0.9rem' }}>{message}</span>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
