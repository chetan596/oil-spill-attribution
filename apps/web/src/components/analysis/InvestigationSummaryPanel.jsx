/**
 * InvestigationSummaryPanel.jsx
 * Phase 16.4 Part 6 — Compact Investigation Summary Panel
 *
 * Displays:
 *   - Oil spill detected
 *   - Spill coverage
 *   - Model architecture
 *   - Input modality
 *   - Geospatial availability
 *   - Estimated origin
 *   - Drift status
 *   - AIS correlation status
 *   - Vessel attribution (strictly NOT ESTABLISHED)
 */

import React from 'react';
import { Droplet, Layers, Cpu, Globe, Compass, Wind, Ship, ShieldAlert } from 'lucide-react';
import { ProvenanceBadge } from './ProvenanceLegend';

export default function InvestigationSummaryPanel({ canonical, className = '' }) {
  if (!canonical) return null;

  const detection = canonical.detection || {};
  const isDetected = Boolean(detection.oilSpillDetected);
  const coverage = typeof detection.coveragePercent === 'number' ? `${detection.coveragePercent.toFixed(2)}%` : '0.00%';
  const modelId = canonical.model?.modelId || 'N/A';
  const modality = canonical.input?.modality || 'N/A';
  const geoAvailable = Boolean(canonical.geospatial?.available);
  const originStatus = canonical.origin?.status || 'NOT_AVAILABLE';
  const driftBackStatus = canonical.drift?.backward?.status || 'NOT_AVAILABLE';
  const aisStatus = canonical.aisCorrelation?.status || 'NOT_AVAILABLE';
  const candidateCount = canonical.aisCorrelation?.candidates?.length || 0;

  const summaryItems = [
    {
      id: 'oil-spill',
      label: 'OIL SPILL',
      value: isDetected ? 'DETECTED' : 'NOT DETECTED',
      icon: Droplet,
      provenance: 'MODEL_DERIVED',
      highlight: isDetected ? '#EF4444' : '#10B981',
    },
    {
      id: 'coverage',
      label: 'COVERAGE',
      value: coverage,
      icon: Layers,
      provenance: 'MODEL_DERIVED',
      highlight: '#38BDF8',
    },
    {
      id: 'model',
      label: 'MODEL',
      value: modelId,
      subValue: modelId,
      icon: Cpu,
      provenance: 'REAL',
      highlight: '#94A3B8',
    },
    {
      id: 'modality',
      label: 'MODALITY',
      value: modality,
      icon: Globe,
      provenance: 'REAL',
      highlight: '#A855F7',
    },
    {
      id: 'geospatial',
      label: 'GEOSPATIAL',
      value: geoAvailable ? 'AVAILABLE' : 'NOT AVAILABLE',
      icon: Globe,
      provenance: geoAvailable ? 'REAL' : 'NOT_AVAILABLE',
      highlight: geoAvailable ? '#10B981' : '#64748B',
    },
    {
      id: 'origin',
      label: 'ORIGIN',
      value: originStatus === 'ESTIMATED' ? 'ESTIMATED' : originStatus,
      icon: Compass,
      provenance: originStatus === 'ESTIMATED' ? 'MODEL_DERIVED' : 'NOT_AVAILABLE',
      highlight: originStatus === 'ESTIMATED' ? '#F59E0B' : '#64748B',
    },
    {
      id: 'drift',
      label: 'DRIFT',
      value: driftBackStatus === 'ESTIMATED' ? 'ESTIMATED' : driftBackStatus,
      icon: Wind,
      provenance: driftBackStatus === 'ESTIMATED' ? 'MODEL_DERIVED' : 'NOT_AVAILABLE',
      highlight: driftBackStatus === 'ESTIMATED' ? '#06B6D4' : '#64748B',
    },
    {
      id: 'ais',
      label: 'AIS CORRELATION',
      value: aisStatus === 'CANDIDATES_FOUND' ? `${candidateCount} CANDIDATE${candidateCount !== 1 ? 'S' : ''}` : aisStatus,
      icon: Ship,
      provenance: canonical.aisCorrelation?.isDemo ? 'DEMO' : (aisStatus === 'CANDIDATES_FOUND' ? 'REAL' : 'NOT_AVAILABLE'),
      highlight: aisStatus === 'CANDIDATES_FOUND' ? '#C084FC' : '#64748B',
    },
    {
      id: 'attribution',
      label: 'ATTRIBUTION',
      value: 'NOT ESTABLISHED',
      icon: ShieldAlert,
      provenance: 'NOT_AVAILABLE',
      highlight: '#FBBF24',
    },
  ];

  return (
    <section
      data-testid="investigation-summary-panel"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: '10px',
        padding: '12px 14px',
        background: 'rgba(15, 23, 42, 0.75)',
        border: '1px solid rgba(51, 65, 85, 0.65)',
        borderRadius: '8px',
      }}
      className={className}
    >
      {summaryItems.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.id}
            data-testid={`summary-item-${item.id}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '10px 12px',
              background: 'rgba(30, 41, 59, 0.55)',
              border: '1px solid rgba(51, 65, 85, 0.5)',
              borderRadius: '6px',
              minHeight: '82px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span
                style={{
                  fontSize: '0.66rem',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  color: '#94A3B8',
                  textTransform: 'uppercase',
                }}
              >
                {item.label}
              </span>
              <Icon size={12} style={{ color: item.highlight, opacity: 0.8 }} />
            </div>

            <div
              style={{
                fontSize: '0.86rem',
                fontWeight: 700,
                color: item.highlight,
                fontFamily: 'monospace',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                margin: '2px 0 6px 0',
              }}
              title={item.subValue || item.value}
            >
              {item.value}
            </div>

            <div>
              <ProvenanceBadge type={item.provenance} size="xs" />
            </div>
          </div>
        );
      })}
    </section>
  );
}
