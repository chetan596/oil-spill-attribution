/**
 * InvestigationHeader.jsx
 * Phase 16.4 Part 6 — Investigation Header
 *
 * Displays:
 *   OCEAN GUARD AI
 *   MANUAL INVESTIGATION
 *   Investigation ID
 *   Input filename
 *   Input modality
 *   Analysis status
 */

import React from 'react';
import { Shield, FileCode, Radio, Activity, Fingerprint } from 'lucide-react';
import { ProvenanceBadge } from './ProvenanceLegend';

export default function InvestigationHeader({ canonical, className = '' }) {
  if (!canonical) return null;

  const jobId = canonical.jobId || 'UNKNOWN';
  const filename = canonical.input?.filename || 'manual_input';
  const modality = canonical.input?.modality || 'UNKNOWN';
  const status = canonical.status || 'PROCESSING';
  const fingerprint = canonical.fingerprint || null;

  const isCompleted = status === 'COMPLETED';
  const isFailed = status === 'FAILED';

  return (
    <header
      data-testid="investigation-header"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        padding: '14px 20px',
        background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(10, 15, 30, 0.95) 100%)',
        border: '1px solid rgba(51, 65, 85, 0.65)',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)',
      }}
      className={className}
    >
      {/* Brand & Type */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #0EA5E9 0%, #3B82F6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 16px rgba(14, 165, 233, 0.4)',
          }}
        >
          <Shield size={22} color="#FFFFFF" />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 800,
                letterSpacing: '0.12em',
                color: '#38BDF8',
                textTransform: 'uppercase',
              }}
            >
              OCEAN GUARD AI
            </span>
            <span style={{ color: '#475569', fontSize: '0.7rem' }}>•</span>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: '#94A3B8',
                textTransform: 'uppercase',
              }}
            >
              MANUAL INVESTIGATION
            </span>
          </div>
          <h1
            style={{
              margin: '2px 0 0 0',
              fontSize: '1.25rem',
              fontWeight: 700,
              color: '#F8FAFC',
              fontFamily: 'monospace',
              letterSpacing: '0.02em',
            }}
          >
            INVESTIGATION <span style={{ color: '#0284C7' }}>{jobId.slice(0, 14)}</span>
          </h1>
        </div>
      </div>

      {/* Meta Indicators */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '14px',
        }}
      >
        {/* Filename */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 10px',
            background: 'rgba(30, 41, 59, 0.7)',
            border: '1px solid rgba(51, 65, 85, 0.6)',
            borderRadius: '6px',
            fontSize: '0.78rem',
            color: '#CBD5E1',
          }}
          title={filename}
        >
          <FileCode size={14} color="#94A3B8" />
          <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {filename}
          </span>
        </div>

        {/* Modality */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 10px',
            background: 'rgba(30, 41, 59, 0.7)',
            border: '1px solid rgba(51, 65, 85, 0.6)',
            borderRadius: '6px',
            fontSize: '0.78rem',
            fontFamily: 'monospace',
            color: '#38BDF8',
          }}
        >
          <Radio size={14} color="#38BDF8" />
          <span>{modality}</span>
        </div>

        {/* Status */}
        <div
          data-testid="investigation-status-badge"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
            background: isCompleted
              ? 'rgba(34, 197, 94, 0.15)'
              : isFailed
              ? 'rgba(239, 68, 68, 0.15)'
              : 'rgba(56, 189, 248, 0.15)',
            border: `1px solid ${
              isCompleted
                ? 'rgba(34, 197, 94, 0.4)'
                : isFailed
                ? 'rgba(239, 68, 68, 0.4)'
                : 'rgba(56, 189, 248, 0.4)'
            }`,
            color: isCompleted ? '#4ADE80' : isFailed ? '#F87171' : '#38BDF8',
          }}
        >
          <Activity size={13} />
          <span>STATUS: {status}</span>
        </div>

        {/* Fingerprint indicator if present */}
        {fingerprint && (
          <div
            title={`Canonical SHA256 Fingerprint: ${fingerprint}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 8px',
              borderRadius: '6px',
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(51, 65, 85, 0.5)',
              fontSize: '0.70rem',
              color: '#64748B',
              cursor: 'help',
            }}
          >
            <Fingerprint size={12} />
            <span style={{ fontFamily: 'monospace' }}>{fingerprint.slice(0, 8)}...</span>
          </div>
        )}
      </div>
    </header>
  );
}
