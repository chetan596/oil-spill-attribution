import React from 'react';
import Drawer from '../common/Drawer';
import { Cpu, ShieldCheck, AlertTriangle, Layers, Database, Activity, GitBranch } from 'lucide-react';

export default function ModelDrawer({
  isOpen = false,
  onClose,
  model = {
    id: 'unet-dual-pol-sar-v2',
    name: 'Dual-Pol U-Net V2',
    architecture: '2-Channel Encoder-Decoder U-Net with Skip Connections',
    inputs: 'Sentinel-1 Level-1 GRD SAR (VV + VH amplitude rasters)',
    role: 'SAR Dark-Surface Candidate Segmentation',
    status: 'ACTIVE BASELINE',
    benchmarkIoU: 0.784,
    benchmarkDice: 0.879,
    benchmarkPrecision: 0.892,
    benchmarkRecall: 0.866,
    lookalikeFpr: 0.048,
    decisionThreshold: 0.50,
    lineage: 'Trained on verified Sentinel-1 oil slick ground-truth corpus (12,400 patches).',
    limitations: [
      'Identifies radar dark-surface anomalies (oil slicks, low wind calm water, biogenic surfactants).',
      'Does not estimate oil chemical composition or spill thickness.',
      'Live unlabelled scenes produce candidate confidence masks without synthetic accuracy claims.',
    ],
  },
}) {
  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Model Architecture & Lineage"
      subtitle={`Identifier: ${model.id} · Version: V2.1`}
      width="420px"
    >
      {/* Overview Card */}
      <div
        style={{
          padding: '14px',
          borderRadius: '8px',
          backgroundColor: 'var(--og-surface-recessed, #0C0E11)',
          border: '1px solid var(--og-border, #25292F)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cpu size={16} style={{ color: 'var(--og-violet, #A855F7)' }} />
            <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--og-text-primary, #ECEEF1)', margin: 0 }}>
              {model.name}
            </h4>
          </div>
          <span
            style={{
              fontSize: '10px',
              fontFamily: 'monospace',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: 'rgba(74, 222, 128, 0.1)',
              color: 'var(--og-success, #4ADE80)',
              border: '1px solid rgba(74, 222, 128, 0.25)',
              fontWeight: 700,
            }}
          >
            {model.status}
          </span>
        </div>

        <p style={{ fontSize: '11px', color: 'var(--og-text-secondary, #B1B6BD)', lineHeight: 1.45, margin: 0 }}>
          {model.architecture}
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
            paddingTop: '8px',
            borderTop: '1px solid var(--og-border-subtle, rgba(255, 255, 255, 0.055))',
            fontSize: '11px',
            fontFamily: 'monospace',
          }}
        >
          <div>
            <span style={{ color: 'var(--og-text-muted, #777E87)', display: 'block', fontSize: '10px' }}>Input Channels:</span>
            <span style={{ color: 'var(--og-text-primary, #ECEEF1)' }}>{model.inputs}</span>
          </div>
          <div>
            <span style={{ color: 'var(--og-text-muted, #777E87)', display: 'block', fontSize: '10px' }}>Operational Role:</span>
            <span style={{ color: 'var(--og-text-primary, #ECEEF1)' }}>{model.role}</span>
          </div>
        </div>
      </div>

      {/* Benchmark Metrics (Verified Offline Corpus) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h4
            style={{
              fontSize: '10.5px',
              fontFamily: 'monospace',
              fontWeight: 700,
              color: 'var(--og-text-muted, #777E87)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Activity size={13} style={{ color: 'var(--og-teal, #49C6C8)' }} />
            <span>Verified Offline Benchmark Metrics</span>
          </h4>
          <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--og-text-muted, #777E87)' }}>Corpus Eval</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: 'var(--og-surface-recessed, #0C0E11)', border: '1px solid var(--og-border, #25292F)' }}>
            <span style={{ fontSize: '9.5px', fontFamily: 'monospace', color: 'var(--og-text-muted, #777E87)', display: 'block', textTransform: 'uppercase' }}>
              IoU Score (Jaccard)
            </span>
            <span style={{ fontSize: '16px', fontFamily: 'monospace', color: 'var(--og-success, #4ADE80)', fontWeight: 700 }}>
              {(model.benchmarkIoU * 100).toFixed(1)}%
            </span>
          </div>

          <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: 'var(--og-surface-recessed, #0C0E11)', border: '1px solid var(--og-border, #25292F)' }}>
            <span style={{ fontSize: '9.5px', fontFamily: 'monospace', color: 'var(--og-text-muted, #777E87)', display: 'block', textTransform: 'uppercase' }}>
              Dice Coefficient (F1)
            </span>
            <span style={{ fontSize: '16px', fontFamily: 'monospace', color: 'var(--og-success, #4ADE80)', fontWeight: 700 }}>
              {(model.benchmarkDice * 100).toFixed(1)}%
            </span>
          </div>

          <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: 'var(--og-surface-recessed, #0C0E11)', border: '1px solid var(--og-border, #25292F)' }}>
            <span style={{ fontSize: '9.5px', fontFamily: 'monospace', color: 'var(--og-text-muted, #777E87)', display: 'block', textTransform: 'uppercase' }}>
              Precision / Recall
            </span>
            <span style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 600 }}>
              {(model.benchmarkPrecision * 100).toFixed(1)}% / {(model.benchmarkRecall * 100).toFixed(1)}%
            </span>
          </div>

          <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: 'var(--og-surface-recessed, #0C0E11)', border: '1px solid var(--og-border, #25292F)' }}>
            <span style={{ fontSize: '9.5px', fontFamily: 'monospace', color: 'var(--og-text-muted, #777E87)', display: 'block', textTransform: 'uppercase' }}>
              Look-Alike FPR
            </span>
            <span style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--og-amber, #E7A63A)', fontWeight: 600 }}>
              {(model.lookalikeFpr * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Scientific Governance & Limitations */}
      <div
        style={{
          padding: '12px 14px',
          borderRadius: '6px',
          backgroundColor: 'rgba(231, 166, 58, 0.06)',
          border: '1px solid rgba(231, 166, 58, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--og-amber, #E7A63A)' }}>
          <AlertTriangle size={14} />
          <span style={{ fontSize: '10px', fontFamily: 'monospace', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Scientific Governance & Known Limitations
          </span>
        </div>
        <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '11px', color: 'var(--og-text-primary, #ECEEF1)', lineHeight: 1.45 }}>
          {model.limitations.map((lim, idx) => (
            <li key={idx} style={{ marginBottom: '4px' }}>
              {lim}
            </li>
          ))}
        </ul>
      </div>

      {/* Model Registry Lineage */}
      <div
        style={{
          padding: '12px 14px',
          borderRadius: '6px',
          backgroundColor: 'var(--og-surface-recessed, #0C0E11)',
          border: '1px solid var(--og-border, #25292F)',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--og-text-muted, #777E87)' }}>
          <GitBranch size={13} style={{ color: 'var(--og-violet, #A855F7)' }} />
          <span style={{ fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Registry Status & Lineage
          </span>
        </div>
        <p style={{ margin: 0, fontSize: '10.5px', color: 'var(--og-text-secondary, #B1B6BD)', lineHeight: 1.45 }}>
          {model.lineage}
        </p>
      </div>
    </Drawer>
  );
}
