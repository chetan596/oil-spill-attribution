import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function ErrorMessage({ title = 'Error', message, onRetry }) {
  return (
    <div style={{
      background: 'rgba(239, 68, 68, 0.1)',
      border: '1px solid rgba(239, 68, 68, 0.3)',
      borderRadius: '8px',
      padding: '16px',
      color: '#f87171',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
      margin: '16px 0'
    }}>
      <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
      <div style={{ flex: 1 }}>
        <h4 style={{ fontWeight: 600, color: '#fca5a5', marginBottom: '4px' }}>{title}</h4>
        <p style={{ fontSize: '0.9rem', color: '#fecaca' }}>{message || 'An unexpected error occurred.'}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            style={{
              marginTop: '10px',
              background: '#b91c1c',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '0.85rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={14} /> Retry
          </button>
        )}
      </div>
    </div>
  );
}
