import React from 'react';
import { CheckCircle2, Clock, AlertCircle, PlayCircle, Layers, Compass, Ship, FileCheck } from 'lucide-react';

const STAGES = [
  { id: 'queued', label: 'Queued', description: 'Job enqueued in BullMQ / Redis', icon: Clock },
  { id: 'running', label: 'Pipeline Init', description: 'Worker allocating resources', icon: PlayCircle },
  { id: 'detection', label: 'SAR Slick Detection', description: 'Potential oil slick extraction', icon: Layers },
  { id: 'hindcast', label: 'Backward Hindcast', description: 'Lagrangian reverse trajectory trace', icon: Compass },
  { id: 'attribution', label: 'AIS Attribution', description: 'Candidate vessel spatial scoring', icon: Ship },
  { id: 'completed', label: 'Completed', description: 'Investigation evidence ready', icon: FileCheck },
];

export default function PipelineStepper({ status = 'queued', progress = 0, errorMessage = null, createdAt = null, completedAt = null }) {
  const isFailed = status === 'failed';
  const normalizedStatus = (status || 'queued').toLowerCase();

  // Determine active stage index
  let activeIndex = 0;
  if (normalizedStatus === 'running') activeIndex = 1;
  else if (normalizedStatus === 'detection') activeIndex = 2;
  else if (normalizedStatus === 'hindcast') activeIndex = 3;
  else if (normalizedStatus === 'attribution') activeIndex = 4;
  else if (normalizedStatus === 'completed') activeIndex = 5;
  else if (isFailed) activeIndex = 1; // Mark failure at active stage

  return (
    <div
      className="card"
      style={{
        background: 'var(--og-surface, #121417)',
        border: `1px solid ${isFailed ? 'var(--og-error, #F87171)' : 'var(--og-border, #25292F)'}`,
        padding: '16px 20px',
        borderRadius: '6px',
      }}
      role="region"
      aria-label="Pipeline Execution Progress"
    >
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--og-text-secondary, #B1B6BD)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Analysis Pipeline Execution
          </span>
          <span
            style={{
              background: isFailed
                ? 'var(--og-error-soft, rgba(248, 113, 113, 0.15))'
                : normalizedStatus === 'completed'
                ? 'var(--og-green-soft, rgba(52, 211, 153, 0.15))'
                : 'var(--og-violet-soft, rgba(168, 85, 247, 0.15))',
              color: isFailed ? 'var(--og-error, #F87171)' : normalizedStatus === 'completed' ? 'var(--og-green, #34D399)' : 'var(--og-violet, #A855F7)',
              border: `1px solid ${isFailed ? 'var(--og-error-border, rgba(248, 113, 113, 0.3))' : normalizedStatus === 'completed' ? 'var(--og-green-border, rgba(52, 211, 153, 0.3))' : 'var(--og-violet-border, rgba(168, 85, 247, 0.3))'}`,
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            {isFailed ? 'FAILED' : normalizedStatus}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.8rem', color: 'var(--og-text-muted, #777E87)' }}>
          {createdAt && (
            <span>Started: {new Date(createdAt).toLocaleTimeString()}</span>
          )}
          {completedAt && (
            <span>Completed: {new Date(completedAt).toLocaleTimeString()}</span>
          )}
          <span style={{ fontWeight: 700, color: 'var(--og-text-primary, #ECEEF1)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
            {isFailed ? 'ERROR' : `${Math.round(progress)}%`}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div
        style={{
          width: '100%',
          height: '6px',
          background: 'var(--og-surface-recessed, #0C0E11)',
          border: '1px solid var(--og-border, #25292F)',
          borderRadius: '3px',
          overflow: 'hidden',
          marginBottom: '20px',
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
              ? 'var(--og-error, #F87171)'
              : normalizedStatus === 'completed'
              ? 'var(--og-green, #34D399)'
              : 'var(--og-violet, #A855F7)',
            transition: 'width 0.4s ease-in-out',
          }}
        />
      </div>

      {/* Stepper Stages Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '8px',
        }}
      >
        {STAGES.map((stage, idx) => {
          const Icon = stage.icon;
          const isDone = normalizedStatus === 'completed' || idx < activeIndex;
          const isCurrent = idx === activeIndex && !isFailed && normalizedStatus !== 'completed';
          const isStageFailed = isFailed && idx === activeIndex;

          let iconColor = 'var(--og-text-muted, #777E87)';
          let textColor = 'var(--og-text-muted, #777E87)';
          let bgColor = 'var(--og-surface-recessed, #0C0E11)';
          let borderColor = 'var(--og-border, #25292F)';

          if (isDone) {
            iconColor = 'var(--og-green, #34D399)';
            textColor = 'var(--og-text-primary, #ECEEF1)';
            bgColor = 'rgba(52, 211, 153, 0.05)';
            borderColor = 'rgba(52, 211, 153, 0.25)';
          } else if (isCurrent) {
            iconColor = 'var(--og-violet, #A855F7)';
            textColor = 'var(--og-text-primary, #ECEEF1)';
            bgColor = 'var(--og-surface-raised, #171A1E)';
            borderColor = 'var(--og-violet, #A855F7)';
          } else if (isStageFailed) {
            iconColor = 'var(--og-error, #F87171)';
            textColor = 'var(--og-error, #F87171)';
            bgColor = 'rgba(248, 113, 113, 0.08)';
            borderColor = 'rgba(248, 113, 113, 0.3)';
          }

          return (
            <div
              key={stage.id}
              style={{
                background: bgColor,
                border: `1px solid ${borderColor}`,
                borderRadius: '6px',
                padding: '10px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                position: 'relative',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Icon size={16} style={{ color: iconColor }} />
                {isDone ? (
                  <CheckCircle2 size={14} style={{ color: 'var(--og-green, #34D399)' }} />
                ) : isStageFailed ? (
                  <AlertCircle size={14} style={{ color: 'var(--og-error, #F87171)' }} />
                ) : isCurrent ? (
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'var(--og-violet, #A855F7)',
                      animation: 'pulse 1.5s infinite',
                    }}
                  />
                ) : (
                  <span style={{ fontSize: '0.7rem', color: 'var(--og-text-muted, #777E87)', fontWeight: 600 }}>0{idx + 1}</span>
                )}
              </div>

              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: textColor, marginTop: '2px' }}>
                {stage.label}
              </div>

              <div style={{ fontSize: '0.7rem', color: isCurrent ? 'var(--og-text-secondary, #B1B6BD)' : 'var(--og-text-muted, #777E87)', lineHeight: 1.2 }}>
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
            marginTop: '12px',
            padding: '10px 14px',
            background: 'var(--og-error-soft, rgba(248, 113, 113, 0.15))',
            border: '1px solid var(--og-error-border, rgba(248, 113, 113, 0.3))',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: 'var(--og-error, #F87171)',
            fontSize: '0.85rem',
          }}
        >
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
