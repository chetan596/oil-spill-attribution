import React from 'react';
import { CheckCircle2, Clock, AlertCircle, PlayCircle, Layers, Compass, Ship, FileCheck } from 'lucide-react';

const STAGES = [
  { id: 'queued', label: 'Queued', description: 'Job enqueued in BullMQ', icon: Clock },
  { id: 'running', label: 'Init', description: 'Worker allocated', icon: PlayCircle },
  { id: 'detection', label: 'SAR Slick Detection', description: 'U-Net segmentation', icon: Layers },
  { id: 'hindcast', label: 'Backward Drift', description: 'Lagrangian trace', icon: Compass },
  { id: 'attribution', label: 'AIS Correlation', description: 'Candidate ranking', icon: Ship },
  { id: 'completed', label: 'Completed', description: 'Evidence ready', icon: FileCheck },
];

export default function PipelineStepper({
  status = 'queued',
  progress = 0,
  errorMessage = null,
  createdAt = null,
  completedAt = null,
}) {
  const isFailed = status === 'failed';
  const normalizedStatus = (status || 'queued').toLowerCase();

  // Determine active stage index
  let activeIndex = 0;
  if (normalizedStatus === 'running') activeIndex = 1;
  else if (normalizedStatus === 'detection') activeIndex = 2;
  else if (normalizedStatus === 'hindcast') activeIndex = 3;
  else if (normalizedStatus === 'attribution') activeIndex = 4;
  else if (normalizedStatus === 'completed') activeIndex = 5;
  else if (isFailed) activeIndex = 1;

  return (
    <div
      className="card"
      style={{
        background: 'var(--surface-raised)',
        border: `1px solid ${isFailed ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-color)'}`,
        padding: '14px 16px',
        borderRadius: '4px',
      }}
      role="region"
      aria-label="Pipeline Execution Progress"
    >
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Mission Execution Pipeline
          </span>
          <span
            style={{
              background: isFailed
                ? 'rgba(239, 68, 68, 0.15)'
                : normalizedStatus === 'completed'
                ? 'rgba(16, 185, 129, 0.15)'
                : 'rgba(56, 189, 248, 0.15)',
              color: isFailed ? '#ef4444' : normalizedStatus === 'completed' ? '#10b981' : 'var(--accent-cyan)',
              border: `1px solid ${isFailed ? 'rgba(239, 68, 68, 0.3)' : normalizedStatus === 'completed' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(56, 189, 248, 0.3)'}`,
              padding: '2px 6px',
              borderRadius: '3px',
              fontSize: '0.68rem',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            {isFailed ? 'FAILED' : normalizedStatus}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
          {createdAt && <span>Start: {new Date(createdAt).toLocaleTimeString()}</span>}
          {completedAt && <span>End: {new Date(completedAt).toLocaleTimeString()}</span>}
          <span style={{ fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {isFailed ? 'ERROR' : `${Math.round(progress)}%`}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div
        style={{
          width: '100%',
          height: '4px',
          background: 'var(--surface-sunken)',
          borderRadius: '2px',
          overflow: 'hidden',
          marginBottom: '14px',
        }}
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div
          style={{
            width: isFailed ? '100%' : `${Math.max(progress, 5)}%`,
            height: '100%',
            background: isFailed
              ? '#ef4444'
              : normalizedStatus === 'completed'
              ? 'var(--accent-emerald)'
              : 'linear-gradient(90deg, #0284c7, #38bdf8)',
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      {/* Stepper Stages Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: '6px',
        }}
      >
        {STAGES.map((stage, idx) => {
          const Icon = stage.icon;
          const isDone = normalizedStatus === 'completed' || idx < activeIndex;
          const isCurrent = idx === activeIndex && !isFailed && normalizedStatus !== 'completed';
          const isStageFailed = isFailed && idx === activeIndex;

          let iconColor = 'var(--text-muted)';
          let textColor = 'var(--text-muted)';
          let bgColor = 'var(--surface-sunken)';
          let borderColor = 'var(--border-color)';

          if (isDone) {
            iconColor = 'var(--accent-emerald)';
            textColor = 'var(--text-primary)';
            bgColor = 'rgba(16, 185, 129, 0.04)';
            borderColor = 'rgba(16, 185, 129, 0.25)';
          } else if (isCurrent) {
            iconColor = 'var(--accent-cyan)';
            textColor = 'var(--text-primary)';
            bgColor = 'rgba(56, 189, 248, 0.07)';
            borderColor = 'rgba(56, 189, 248, 0.35)';
          } else if (isStageFailed) {
            iconColor = '#ef4444';
            textColor = '#ef4444';
            bgColor = 'rgba(239, 68, 68, 0.1)';
            borderColor = 'rgba(239, 68, 68, 0.3)';
          }

          return (
            <div
              key={stage.id}
              style={{
                background: bgColor,
                border: `1px solid ${borderColor}`,
                borderRadius: '3px',
                padding: '8px 6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                position: 'relative',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Icon size={14} style={{ color: iconColor }} />
                {isDone ? (
                  <CheckCircle2 size={12} style={{ color: 'var(--accent-emerald)' }} />
                ) : isStageFailed ? (
                  <AlertCircle size={12} style={{ color: '#ef4444' }} />
                ) : isCurrent ? (
                  <div
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: 'var(--accent-cyan)',
                      boxShadow: '0 0 6px var(--accent-cyan)',
                    }}
                  />
                ) : (
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>0{idx + 1}</span>
                )}
              </div>

              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: textColor, marginTop: '2px' }}>
                {stage.label}
              </div>

              <div style={{ fontSize: '0.65rem', color: isCurrent ? 'var(--text-secondary)' : 'var(--text-muted)', lineHeight: 1.2 }}>
                {stage.description}
              </div>
            </div>
          );
        })}
      </div>

      {/* Error Message banner if failed */}
      {isFailed && errorMessage && (
        <div
          style={{
            marginTop: '10px',
            padding: '8px 12px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: '#f87171',
            fontSize: '0.78rem',
          }}
        >
          <AlertCircle size={14} style={{ flexShrink: 0 }} />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
