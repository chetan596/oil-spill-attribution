/**
 * InvestigationDetectionPanel.jsx
 * Phase 16.4 Part 6 — Detection Evidence Panel
 *
 * Displays:
 *   - Detection verdict (oilSpillDetected, confidence, coveragePercent)
 *   - Probability statistics (meanForegroundProbability, maxProbability)
 *   - Actual visual artifacts ONLY (original, mask, overlay, probabilityMap, vv, vh, annotated)
 *   - Never renders fake placeholder artifacts
 */

import React, { useState } from 'react';
import { Eye, ShieldAlert, CheckCircle, Percent, Maximize2 } from 'lucide-react';
import { ProvenanceBadge } from './ProvenanceLegend';

export default function InvestigationDetectionPanel({ canonical, className = '' }) {
  if (!canonical) return null;

  const detection = canonical.detection || {};
  const artifacts = canonical.artifacts || {};
  const isDetected = Boolean(detection.oilSpillDetected);
  const confidence = typeof detection.confidence === 'number' ? (detection.confidence * 100).toFixed(1) : 'N/A';
  const coverage = typeof detection.coveragePercent === 'number' ? detection.coveragePercent.toFixed(2) : '0.00';
  const probStats = detection.probabilityStats || {};

  // Gather only artifacts that genuinely exist and have valid URLs
  const activeArtifacts = [];
  if (artifacts.original) {
    activeArtifacts.push({ key: 'original', label: 'Original Input', url: artifacts.original, prov: canonical.provenance?.inputGeolocation || 'REAL' });
  }
  if (artifacts.mask) {
    activeArtifacts.push({ key: 'mask', label: 'Binary Mask', url: artifacts.mask, prov: 'MODEL_DERIVED' });
  }
  if (artifacts.overlay) {
    activeArtifacts.push({ key: 'overlay', label: 'Spill Overlay', url: artifacts.overlay, prov: 'MODEL_DERIVED' });
  }
  if (artifacts.probabilityMap) {
    activeArtifacts.push({ key: 'probabilityMap', label: 'Probability Map', url: artifacts.probabilityMap, prov: 'MODEL_DERIVED' });
  }
  if (artifacts.vv) {
    activeArtifacts.push({ key: 'vv', label: 'SAR VV Channel', url: artifacts.vv, prov: 'REAL' });
  }
  if (artifacts.vh) {
    activeArtifacts.push({ key: 'vh', label: 'SAR VH Channel', url: artifacts.vh, prov: 'REAL' });
  }
  if (artifacts.annotated && artifacts.annotated !== artifacts.overlay) {
    activeArtifacts.push({ key: 'annotated', label: 'Annotated Composite', url: artifacts.annotated, prov: 'MODEL_DERIVED' });
  }

  const [selectedArtifact, setSelectedArtifact] = useState(activeArtifacts[0]?.key || 'original');
  const currentView = activeArtifacts.find((a) => a.key === selectedArtifact) || activeArtifacts[0];

  return (
    <div
      data-testid="investigation-detection-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        padding: '16px',
        background: 'rgba(15, 23, 42, 0.7)',
        border: '1px solid rgba(51, 65, 85, 0.65)',
        borderRadius: '8px',
      }}
      className={className}
    >
      {/* Header & Metrics */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#F8FAFC', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Spill Detection Evidence
            </h3>
            <ProvenanceBadge type="MODEL_DERIVED" size="xs" />
          </div>
          <span style={{ fontSize: '0.74rem', color: '#94A3B8' }}>
            Authoritative neural segmentation inference results
          </span>
        </div>

        {/* Verdict Badge */}
        <div
          data-testid="detection-verdict-badge"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '6px',
            background: isDetected ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
            border: `1px solid ${isDetected ? 'rgba(239, 68, 68, 0.4)' : 'rgba(34, 197, 94, 0.4)'}`,
            color: isDetected ? '#F87171' : '#4ADE80',
            fontWeight: 800,
            fontSize: '0.80rem',
            fontFamily: 'monospace',
          }}
        >
          {isDetected ? <ShieldAlert size={15} /> : <CheckCircle size={15} />}
          <span>{isDetected ? 'OIL SPILL DETECTED' : 'NO OIL DETECTED'}</span>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
        <div style={{ padding: '8px 10px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(51, 65, 85, 0.4)', borderRadius: '4px' }}>
          <span style={{ fontSize: '0.66rem', color: '#64748B', textTransform: 'uppercase', display: 'block' }}>Confidence</span>
          <span style={{ fontSize: '0.90rem', fontWeight: 700, color: '#38BDF8', fontFamily: 'monospace' }}>{confidence}%</span>
        </div>
        <div style={{ padding: '8px 10px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(51, 65, 85, 0.4)', borderRadius: '4px' }}>
          <span style={{ fontSize: '0.66rem', color: '#64748B', textTransform: 'uppercase', display: 'block' }}>Coverage</span>
          <span style={{ fontSize: '0.90rem', fontWeight: 700, color: '#E2E8F0', fontFamily: 'monospace' }}>{coverage}%</span>
        </div>
        <div style={{ padding: '8px 10px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(51, 65, 85, 0.4)', borderRadius: '4px' }}>
          <span style={{ fontSize: '0.66rem', color: '#64748B', textTransform: 'uppercase', display: 'block' }}>Mean Probability</span>
          <span style={{ fontSize: '0.90rem', fontWeight: 700, color: '#E2E8F0', fontFamily: 'monospace' }}>
            {typeof probStats.meanForegroundProbability === 'number' ? (probStats.meanForegroundProbability * 100).toFixed(1) + '%' : 'N/A'}
          </span>
        </div>
        <div style={{ padding: '8px 10px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(51, 65, 85, 0.4)', borderRadius: '4px' }}>
          <span style={{ fontSize: '0.66rem', color: '#64748B', textTransform: 'uppercase', display: 'block' }}>Max Probability</span>
          <span style={{ fontSize: '0.90rem', fontWeight: 700, color: '#E2E8F0', fontFamily: 'monospace' }}>
            {typeof probStats.maxProbability === 'number' ? (probStats.maxProbability * 100).toFixed(1) + '%' : 'N/A'}
          </span>
        </div>
      </div>

      {/* Artifact Switcher & Preview */}
      {activeArtifacts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
          {/* Tab Selector */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', borderBottom: '1px solid rgba(51, 65, 85, 0.5)', paddingBottom: '6px' }}>
            {activeArtifacts.map((art) => {
              const isSelected = art.key === selectedArtifact;
              return (
                <button
                  key={art.key}
                  type="button"
                  data-testid={`artifact-btn-${art.key}`}
                  onClick={() => setSelectedArtifact(art.key)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '5px 10px',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                    border: `1px solid ${isSelected ? '#38BDF8' : 'rgba(51, 65, 85, 0.5)'}`,
                    color: isSelected ? '#38BDF8' : '#94A3B8',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Eye size={12} />
                  <span>{art.label}</span>
                </button>
              );
            })}
          </div>

          {/* Active Image Viewer */}
          {currentView && (
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '260px',
                background: '#0B0F19',
                borderRadius: '6px',
                overflow: 'hidden',
                border: '1px solid rgba(51, 65, 85, 0.5)',
              }}
            >
              <img
                src={currentView.url}
                alt={currentView.label}
                data-testid={`artifact-img-${currentView.key}`}
                style={{
                  maxHeight: '340px',
                  width: 'auto',
                  maxWidth: '100%',
                  objectFit: 'contain',
                  borderRadius: '4px',
                }}
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <ProvenanceBadge type={currentView.prov} size="xs" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
