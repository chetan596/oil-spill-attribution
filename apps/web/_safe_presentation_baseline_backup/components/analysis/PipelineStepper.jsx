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
        background: '#0a0f1d',
        border: `1px solid ${isFailed ? 'rgba(239, 68, 68, 0.4)' : '#1e293b'}`,
        padding: '16px 20px',
        borderRadius: '8px',
      }}
      role="region"
      aria-label="Pipeline Execution Progress"
    >
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Analysis Pipeline Execution
          </span>
          <span
            style={{
              background: isFailed
                ? 'rgba(239, 68, 68, 0.2)'
                : normalizedStatus === 'completed'
                ? 'rgba(16, 185, 129, 0.2)'
                : 'rgba(56, 189, 248, 0.2)',
              color: isFailed ? '#ef4444' : normalizedStatus === 'completed' ? '#10b981' : '#38bdf8',
              border: `1px solid ${isFailed ? 'rgba(239, 68, 68, 0.3)' : normalizedStatus === 'completed' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(56, 189, 248, 0.3)'}`,
              padding: '2px 8px',
              borderRadius: '12px',
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            {isFailed ? 'FAILED' : normalizedStatus}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.8rem', color: '#64748b' }}>
          {createdAt && (
            <span>Started: {new Date(createdAt).toLocaleTimeString()}</span>
          )}
          {completedAt && (
            <span>Completed: {new Date(completedAt).toLocaleTimeString()}</span>
          )}
          <span style={{ fontWeight: 700, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
            {isFailed ? 'ERROR' : `${Math.round(progress)}%`}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div
        style={{
          width: '100%',
          height: '6px',
          background: '#1e293b',
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
              ? '#ef4444'
              : normalizedStatus === 'completed'
              ? '#10b981'
              : 'linear-gradient(90deg, #0284c7, #38bdf8)',
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

          let iconColor = '#475569';
          let textColor = '#64748b';
          let bgColor = '#0f172a';
          let borderColor = '#1e293b';

          if (isDone) {
            iconColor = '#10b981';
            textColor = '#f8fafc';
            bgColor = 'rgba(16, 185, 129, 0.05)';
            borderColor = 'rgba(16, 185, 129, 0.3)';
          } else if (isCurrent) {
            iconColor = '#38bdf8';
            textColor = '#f8fafc';
            bgColor = 'rgba(56, 189, 248, 0.08)';
            borderColor = 'rgba(56, 189, 248, 0.4)';
          } else if (isStageFailed) {
            iconColor = '#ef4444';
            textColor = '#ef4444';
            bgColor = 'rgba(239, 68, 68, 0.1)';
            borderColor = 'rgba(239, 68, 68, 0.4)';
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
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Icon size={16} style={{ color: iconColor }} />
                {isDone ? (
                  <CheckCircle2 size={14} style={{ color: '#10b981' }} />
                ) : isStageFailed ? (
                  <AlertCircle size={14} style={{ color: '#ef4444' }} />
                ) : isCurrent ? (
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: '#38bdf8',
                      boxShadow: '0 0 8px #38bdf8',
                      animation: 'pulse 1.5s infinite',
                    }}
                  />
                ) : (
                  <span style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 600 }}>0{idx + 1}</span>
                )}
              </div>

              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: textColor, marginTop: '2px' }}>
                {stage.label}
              </div>

              <div style={{ fontSize: '0.7rem', color: isCurrent ? '#94a3b8' : '#475569', lineHeight: 1.2 }}>
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
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#f87171',
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
