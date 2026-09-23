import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import Button from './Button';

export default function ErrorMessage({ title = 'Error', message, onRetry, className = '' }) {
  return (
    <div
      style={{
        background: 'rgba(248, 113, 113, 0.08)',
        border: '1px solid rgba(248, 113, 113, 0.25)',
        borderRadius: '6px',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        margin: '14px 0',
      }}
      className={className}
      role="alert"
    >
      <AlertCircle size={18} style={{ color: 'var(--og-error, #F87171)', flexShrink: 0, marginTop: '2px' }} />
      <div style={{ flex: 1 }}>
        <h4 style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--og-text-primary, #ECEEF1)', marginBottom: '4px' }}>
          {title}
        </h4>
        <p style={{ fontSize: '0.8rem', color: 'var(--og-text-secondary, #B1B6BD)', lineHeight: 1.5, margin: 0 }}>
          {message || 'An unexpected operational error occurred.'}
        </p>
        {onRetry && (
          <div style={{ marginTop: '10px' }}>
            <Button variant="danger" size="sm" onClick={onRetry} icon={RefreshCw}>
              Retry
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
