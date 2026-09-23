/**
 * InvestigationInputModelCard.jsx
 * Phase 16.4 Part 6 — Input & Model Card
 *
 * Displays:
 *   - Input format, channel count, band structure, modality
 *   - Model identifier, version, checkpoint SHA256, preprocessing version
 *   - Decision threshold, inference timing, input provenance
 */

import React from 'react';
import { Cpu, FileText, CheckCircle, Sliders, Layers } from 'lucide-react';
import { ProvenanceBadge } from './ProvenanceLegend';

export default function InvestigationInputModelCard({ canonical, className = '' }) {
  if (!canonical) return null;

  const input = canonical.input || {};
  const model = canonical.model || {};
  const isSar = input.modality === 'SAR_DUAL_POL';

  return (
    <div
      data-testid="investigation-input-model-card"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '14px',
        padding: '16px',
        background: 'rgba(15, 23, 42, 0.7)',
        border: '1px solid rgba(51, 65, 85, 0.65)',
        borderRadius: '8px',
      }}
      className={className}
    >
      {/* Column 1: Input Telemetry */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          padding: '12px 14px',
          background: 'rgba(30, 41, 59, 0.5)',
          border: '1px solid rgba(51, 65, 85, 0.5)',
          borderRadius: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(51, 65, 85, 0.4)', paddingBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={15} color="#38BDF8" />
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#F1F5F9', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Input & Acquisition
            </span>
          </div>
          <ProvenanceBadge type={canonical.provenance?.inputGeolocation || 'REAL'} size="xs" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.76rem' }}>
          <div>
            <span style={{ color: '#64748B', display: 'block', fontSize: '0.68rem', textTransform: 'uppercase' }}>Format</span>
            <span style={{ color: '#E2E8F0', fontFamily: 'monospace', fontWeight: 600 }}>{input.inputFormat || 'N/A'}</span>
          </div>
          <div>
            <span style={{ color: '#64748B', display: 'block', fontSize: '0.68rem', textTransform: 'uppercase' }}>Channels</span>
            <span style={{ color: '#E2E8F0', fontFamily: 'monospace', fontWeight: 600 }}>{input.channelCount ?? 'N/A'} channels</span>
          </div>
          <div>
            <span style={{ color: '#64748B', display: 'block', fontSize: '0.68rem', textTransform: 'uppercase' }}>Modality</span>
            <span style={{ color: '#38BDF8', fontFamily: 'monospace', fontWeight: 600 }}>{input.modality || 'N/A'}</span>
          </div>
          <div>
            <span style={{ color: '#64748B', display: 'block', fontSize: '0.68rem', textTransform: 'uppercase' }}>Source Type</span>
            <span style={{ color: '#E2E8F0', fontFamily: 'monospace', fontWeight: 600 }}>{input.sourceType || 'N/A'}</span>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <span style={{ color: '#64748B', display: 'block', fontSize: '0.68rem', textTransform: 'uppercase' }}>Band Structure</span>
            <span style={{ color: '#E2E8F0', fontFamily: 'monospace', fontWeight: 600 }}>
              {input.bandStructure || 'N/A'}
              {isSar && input.polarizations ? ` (${input.polarizations.join(' + ')})` : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Column 2: AI Model Architecture */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          padding: '12px 14px',
          background: 'rgba(30, 41, 59, 0.5)',
          border: '1px solid rgba(51, 65, 85, 0.5)',
          borderRadius: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(51, 65, 85, 0.4)', paddingBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Cpu size={15} color="#A855F7" />
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#F1F5F9', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              AI Model & Checkpoint
            </span>
          </div>
          <ProvenanceBadge type="MODEL_DERIVED" size="xs" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.76rem' }}>
          <div style={{ gridColumn: 'span 2' }}>
            <span style={{ color: '#64748B', display: 'block', fontSize: '0.68rem', textTransform: 'uppercase' }}>Model ID</span>
            <span style={{ color: '#F8FAFC', fontFamily: 'monospace', fontWeight: 700, wordBreak: 'break-all' }}>
              {model.modelId || 'N/A'}
            </span>
          </div>
          <div>
            <span style={{ color: '#64748B', display: 'block', fontSize: '0.68rem', textTransform: 'uppercase' }}>Model Version</span>
            <span style={{ color: '#E2E8F0', fontFamily: 'monospace', fontWeight: 600 }}>{model.modelVersion || '1.0.0'}</span>
          </div>
          <div>
            <span style={{ color: '#64748B', display: 'block', fontSize: '0.68rem', textTransform: 'uppercase' }}>Decision Threshold</span>
            <span style={{ color: '#E2E8F0', fontFamily: 'monospace', fontWeight: 600 }}>
              {typeof model.threshold === 'number' ? model.threshold.toFixed(2) : '0.50'}
            </span>
          </div>
          <div>
            <span style={{ color: '#64748B', display: 'block', fontSize: '0.68rem', textTransform: 'uppercase' }}>Preprocessing</span>
            <span style={{ color: '#E2E8F0', fontFamily: 'monospace', fontWeight: 600 }}>{model.preprocessingVersion || 'N/A'}</span>
          </div>
          <div>
            <span style={{ color: '#64748B', display: 'block', fontSize: '0.68rem', textTransform: 'uppercase' }}>Checkpoint SHA256</span>
            <span
              style={{ color: '#94A3B8', fontFamily: 'monospace', fontSize: '0.70rem', cursor: 'help' }}
              title={model.checkpointSha256 || 'N/A'}
            >
              {model.checkpointSha256 ? `${model.checkpointSha256.slice(0, 10)}...` : 'N/A'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
