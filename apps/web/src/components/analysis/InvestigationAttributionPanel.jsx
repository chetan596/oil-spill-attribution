/**
 * InvestigationAttributionPanel.jsx
 * Phase 16.4 Part 6 — Vessel Attribution Status Panel
 *
 * Displays:
 *   - Dedicated final evidence state
 *   - Status strictly: NOT ESTABLISHED
 *   - Scientific guardrail disclaimer that correlation does not establish responsibility
 *   - NEVER displays any candidate as confirmed source
 */

import React from 'react';
import { ShieldAlert, Info } from 'lucide-react';
import { ProvenanceBadge } from './ProvenanceLegend';

export default function InvestigationAttributionPanel({ className = '' }) {
  return (
    <div
      data-testid="investigation-attribution-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '16px',
        background: 'linear-gradient(180deg, rgba(245, 158, 11, 0.08) 0%, rgba(15, 23, 42, 0.8) 100%)',
        border: '1px solid rgba(245, 158, 11, 0.35)',
        borderRadius: '8px',
      }}
      className={className}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldAlert size={18} color="#F59E0B" />
          <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#F8FAFC', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Vessel Attribution Status
          </h3>
        </div>
        <ProvenanceBadge type="NOT_AVAILABLE" customLabel="NOT ESTABLISHED" size="xs" />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '10px',
          padding: '10px 14px',
          background: 'rgba(15, 23, 42, 0.65)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          borderRadius: '6px',
        }}
      >
        <span style={{ fontSize: '0.70rem', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Verdict:
        </span>
        <span
          data-testid="attribution-verdict"
          style={{
            fontSize: '1.05rem',
            fontWeight: 800,
            color: '#FBBF24',
            fontFamily: 'monospace',
            letterSpacing: '0.04em',
          }}
        >
          NOT ESTABLISHED
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
          padding: '8px 12px',
          background: 'rgba(30, 41, 59, 0.45)',
          borderRadius: '4px',
          color: '#CBD5E1',
          fontSize: '0.74rem',
          lineHeight: 1.5,
        }}
      >
        <Info size={14} color="#38BDF8" style={{ marginTop: '2px', flexShrink: 0 }} />
        <span>
          <strong>Scientific & Legal Guardrail:</strong> Historical AIS correlation identifies potential spatial and temporal proximity only. Correlation does not establish responsibility for the spill. Conclusive attribution requires physical in-situ chemical fingerprinting or direct visual witnessing.
        </span>
      </div>
    </div>
  );
}
