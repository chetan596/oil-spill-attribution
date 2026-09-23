import React, { useEffect } from 'react';
import { X, Server, Database, Cpu, Radio, Shield, Sparkles, CheckCircle2, AlertTriangle, Compass } from 'lucide-react';

export default function SystemStatusModal({ isOpen, onClose }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const subsystems = [
    {
      name: 'Backend API Service',
      tier: 'Node.js 18 + Express REST',
      status: 'OPERATIONAL',
      provenance: 'LOCAL SERVICE',
      badgeClass: 'og-badge-observed',
      desc: 'Active on port 4000. Orchestrating job dispatch, authentication, and PostGIS queries.',
      icon: Server,
    },
    {
      name: 'Spatial Database & GIS',
      tier: 'PostgreSQL 15 + PostGIS',
      status: 'OPERATIONAL',
      provenance: 'DATABASE',
      badgeClass: 'og-badge-observed',
      desc: 'Relational persistence with WKT spatial indexing across spills, trajectories, and AIS tracks.',
      icon: Database,
    },
    {
      name: 'SAR Neural Detection Engine',
      tier: 'Python FastAPI + PyTorch U-Net',
      status: 'EXPERIMENTAL CHECKPOINT',
      provenance: 'EXPERIMENTAL',
      badgeClass: 'og-badge-modelled',
      desc: 'Active model: unet-dual-pol-sar-v2. Dual-channel decibel normalization (VV+VH).',
      icon: Cpu,
    },
    {
      name: 'Lagrangian Drift Engine',
      tier: 'Built-in Demonstration Lagrangian Model',
      status: 'OPERATIONAL',
      provenance: 'MODELLED',
      badgeClass: 'og-badge-modelled',
      desc: '24h backward advection + 6h forward forecast with turbulent diffusion uncertainty.',
      icon: Compass,
    },
    {
      name: 'AIS Telemetry Ingestion',
      tier: 'Demonstration AIS Registry',
      status: 'BENCHMARK SCENARIO',
      provenance: 'DEMONSTRATION',
      badgeClass: 'og-badge-ais',
      desc: 'Synthetic demonstration vessel tracks (source: demo) for candidate correlation and CPA tracking.',
      icon: Radio,
    },
    {
      name: 'MetOcean Environmental Vectors',
      tier: 'Steady-State Demonstration Field',
      status: 'DEMONSTRATION VECTORS',
      provenance: 'DEMONSTRATION',
      badgeClass: 'og-badge-ais',
      desc: '12.4 kts NW wind (315°), 0.8 kts SE current (125°), leeway factor 0.030 (source: demo).',
      icon: Radio,
    },
    {
      name: 'Investigation Dossier Synthesizer',
      tier: 'Strict JSON Schema + Deterministic Offline Mock',
      status: 'SCHEMA VALIDATED',
      provenance: 'OFFLINE/LLM',
      badgeClass: 'og-badge-forecast',
      desc: 'Converts structured database evidence into factual dossiers with mandatory disclaimers.',
      icon: Sparkles,
    },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: '20px',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="system-status-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="og-panel-hud"
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: 'var(--og-radius-md)',
          border: '1px solid var(--og-border-strong)',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--og-border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--og-bg-surface)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Server size={16} style={{ color: 'var(--og-observed)' }} />
            <h2 id="system-status-title" style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--og-text-primary)', margin: 0 }}>
              System Architecture & Data Provenance Status
            </h2>
          </div>

          <button
            onClick={onClose}
            className="og-btn og-btn-secondary"
            style={{ padding: '4px 6px', border: 'none', background: 'transparent' }}
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Content / Subsystem Grid */}
        <div style={{ padding: '16px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--og-text-secondary)', marginBottom: '4px' }}>
            Verified operational health, model checkpoints, and data classification matrix:
          </div>

          {subsystems.map((sub, idx) => {
            const Icon = sub.icon;
            return (
              <div
                key={idx}
                className="og-panel"
                style={{
                  padding: '10px 12px',
                  backgroundColor: 'var(--og-bg-base)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <div
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: 'var(--og-radius-sm)',
                      backgroundColor: 'var(--og-bg-elevated)',
                      border: '1px solid var(--og-border-default)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--og-observed)',
                      flexShrink: 0,
                      marginTop: '2px',
                    }}
                  >
                    <Icon size={14} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--og-text-primary)' }}>
                        {sub.name}
                      </span>
                      <span style={{ fontSize: '0.6875rem', color: 'var(--og-text-muted)', fontFamily: 'var(--og-font-mono)' }}>
                        [{sub.tier}]
                      </span>
                    </div>
                    <p style={{ fontSize: '0.72rem', color: 'var(--og-text-secondary)', margin: '2px 0 0 0' }}>
                      {sub.desc}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                  <span className={`og-badge ${sub.badgeClass}`}>
                    {sub.provenance}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--og-operational)', fontWeight: 600 }}>
                    {sub.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '10px 18px',
            borderTop: '1px solid var(--og-border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--og-bg-surface)',
          }}
        >
          <span style={{ fontSize: '0.6875rem', color: 'var(--og-text-muted)' }}>
            Blue Forensic AI — SIH26143 Analytical Verification Station
          </span>
          <button onClick={onClose} className="og-btn og-btn-primary" style={{ padding: '5px 14px' }}>
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
}
