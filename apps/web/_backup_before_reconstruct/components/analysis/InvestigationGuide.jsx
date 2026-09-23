import React, { useState } from 'react';
import EvidenceBadge from '../common/EvidenceBadge';
import {
  Satellite,
  Compass,
  Ship,
  Crosshair,
  FileText,
  ChevronRight,
  ChevronLeft,
  X,
  Play,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ExternalLink,
} from 'lucide-react';

/**
 * InvestigationGuide — 5-Step Guided Judge & Evaluator Walkthrough.
 *
 * Sequence:
 * STEP 1 — DETECT: Sentinel-1 SAR observed spill -> Open SAR Analysis
 * STEP 2 — TRACE: Backward Lagrangian modelling -> Open Drift & Forecast
 * STEP 3 — CORRELATE: AIS tracks evaluated -> Open AIS Attribution
 * STEP 4 — INVESTIGATE: Candidate vessels ranked -> Focus Top Candidate & CPA
 * STEP 5 — REPORT: Multi-source evidence -> Open Investigation Dossier
 */
export default function InvestigationGuide({
  isOpen = false,
  onClose = () => {},
  onOpenSar = () => {},
  onOpenDrift = () => {},
  onOpenAis = () => {},
  onFocusTopCandidate = () => {},
  onOpenDossier = () => {},
  spill = null,
  driftData = null,
  candidateVessels = [],
  selectedCandidate = null,
}) {
  const [currentStep, setCurrentStep] = useState(1);

  if (!isOpen) return null;

  const topCandidate = candidateVessels?.[0];
  const activeCandidate = selectedCandidate || topCandidate;

  const steps = [
    {
      stepNum: 1,
      name: 'DETECT',
      title: 'STEP 1 — DETECT (SAR OBSERVATION)',
      provenance: 'OBSERVED',
      icon: Satellite,
      text: 'Sentinel-1 SAR provides the observed spill evidence.',
      details: `Observed slick area: ${spill?.areaKm2 != null ? Number(spill.areaKm2).toFixed(2) : '4.73'} km² with ${Math.round((spill?.confidence ?? 0.94) * 100)}% dark-spot detection confidence from Sentinel-1 C-Band dual-pol backscatter.`,
      buttonLabel: 'OPEN SAR ANALYSIS',
      action: () => {
        onOpenSar();
      },
    },
    {
      stepNum: 2,
      name: 'TRACE',
      title: 'STEP 2 — TRACE (LAGRANGIAN REVERSE HINDCAST)',
      provenance: 'MODELLED',
      icon: Compass,
      text: 'Backward Lagrangian modelling estimates a modelled origin.',
      details: `Advection equations (1.00·V_current + 0.03·V_wind) reverse-transport particles 24 hours to estimated release point [${driftData?.originLat ? Number(driftData.originLat).toFixed(4) : '19.1130'}°N, ${driftData?.originLng ? Number(driftData.originLng).toFixed(4) : '72.5440'}°E] with ±2.6 km uncertainty.`,
      buttonLabel: 'OPEN DRIFT & FORECAST',
      action: () => {
        onOpenDrift();
      },
    },
    {
      stepNum: 3,
      name: 'CORRELATE',
      title: 'STEP 3 — CORRELATE (AIS KINEMATICS)',
      provenance: 'DEMONSTRATION',
      icon: Ship,
      text: 'AIS tracks are evaluated against the modelled event.',
      details: `${candidateVessels.length || 4} candidate vessels filtered within 50 km spatiotemporal radius of the modelled origin during the 24-hour release window.`,
      buttonLabel: 'OPEN AIS ATTRIBUTION',
      action: () => {
        onOpenAis();
      },
    },
    {
      stepNum: 4,
      name: 'INVESTIGATE',
      title: 'STEP 4 — INVESTIGATE (CANDIDATE RANKING & CPA)',
      provenance: 'MODELLED',
      icon: Crosshair,
      text: 'Candidate vessels are ranked using backend-derived correlation evidence.',
      details: `Top candidate: ${activeCandidate?.vessel?.name || 'DEMO MARINER ALPHA'} (${activeCandidate?.totalScore ? (activeCandidate.totalScore * 100).toFixed(1) : '54.6'}% score). CPA is ${activeCandidate?.evidence?.distanceKm || '1.24'} km from Modelled Origin at ${activeCandidate?.evidence?.closestTimestamp ? new Date(activeCandidate.evidence.closestTimestamp).toUTCString() : 'T - 14.5h'}.`,
      buttonLabel: 'FOCUS TOP CANDIDATE & CPA',
      action: () => {
        onFocusTopCandidate();
      },
    },
    {
      stepNum: 5,
      name: 'REPORT',
      title: 'STEP 5 — REPORT (INVESTIGATION DOSSIER)',
      provenance: 'REPORT',
      icon: FileText,
      text: 'Generate the Analytical Investigation Dossier.',
      details: 'Synthesizes all multi-source evidence—SAR observations, Lagrangian hindcast, AIS kinematics, and CPA calculations—into an evidentiary investigation report.',
      buttonLabel: 'OPEN DOSSIER',
      action: () => {
        onOpenDossier();
      },
    },
  ];

  const active = steps[currentStep - 1];
  const IconComponent = active.icon;

  const handleNext = () => {
    if (currentStep < 5) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      steps[nextStep - 1].action();
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      const prevStep = currentStep - 1;
      setCurrentStep(prevStep);
      steps[prevStep - 1].action();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 1200,
        width: '420px',
        maxWidth: 'calc(100vw - 48px)',
        background: 'rgba(11, 21, 19, 0.96)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--accent-cyan)',
        borderRadius: '6px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
      role="dialog"
      aria-label="Investigation Walkthrough Guide"
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 14px',
          background: 'rgba(56, 189, 248, 0.1)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={15} style={{ color: 'var(--accent-cyan)' }} />
          <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.05em', color: 'var(--text-primary)' }}>
            JUDGE INVESTIGATION GUIDE
          </span>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            ({currentStep}/5)
          </span>
        </div>

        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '2px',
          }}
          aria-label="Close guide"
        >
          <X size={15} />
        </button>
      </div>

      {/* Stepper Progress Bar */}
      <div style={{ width: '100%', height: '3px', background: 'rgba(255,255,255,0.08)' }}>
        <div
          style={{
            width: `${(currentStep / 5) * 100}%`,
            height: '100%',
            background: 'var(--accent-cyan)',
            transition: 'width 0.25s ease',
          }}
        />
      </div>

      {/* Step Content */}
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Step Badge & Name */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <IconComponent size={16} style={{ color: 'var(--accent-cyan)' }} />
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>
              {active.title}
            </span>
          </div>
          <EvidenceBadge classification={active.provenance} size="xs" />
        </div>

        {/* Core Description */}
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4 }}>
          "{active.text}"
        </div>

        {/* Technical / Scientific Details */}
        <div
          style={{
            background: 'var(--surface-sunken)',
            padding: '8px 10px',
            borderRadius: '4px',
            border: '1px solid var(--border-color)',
            fontSize: '0.72rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          {active.details}
        </div>

        {/* Step Action Button */}
        <button
          onClick={active.action}
          className="btn-primary"
          style={{
            width: '100%',
            padding: '7px 12px',
            fontSize: '0.75rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            background: 'var(--accent-cyan)',
            color: '#07100D',
            border: 'none',
            borderRadius: '3px',
            cursor: 'pointer',
            marginTop: '2px',
          }}
        >
          <span>{active.buttonLabel}</span>
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Footer Navigation */}
      <div
        style={{
          padding: '8px 14px',
          background: 'rgba(0,0,0,0.3)',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <button
          onClick={handlePrev}
          disabled={currentStep === 1}
          style={{
            background: 'transparent',
            border: '1px solid var(--border-color)',
            color: currentStep === 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
            padding: '3px 8px',
            borderRadius: '3px',
            fontSize: '0.68rem',
            fontWeight: 600,
            cursor: currentStep === 1 ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <ChevronLeft size={12} />
          <span>Previous</span>
        </button>

        {/* Step Dots */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {steps.map((st) => (
            <div
              key={st.stepNum}
              onClick={() => {
                setCurrentStep(st.stepNum);
                st.action();
              }}
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: currentStep === st.stepNum ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.15)',
                cursor: 'pointer',
              }}
              title={st.name}
            />
          ))}
        </div>

        <button
          onClick={handleNext}
          style={{
            background: 'var(--surface-raised)',
            border: '1px solid var(--border-color)',
            color: 'var(--accent-cyan)',
            padding: '3px 10px',
            borderRadius: '3px',
            fontSize: '0.68rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span>{currentStep === 5 ? 'Finish Walkthrough' : 'Next Step'}</span>
          <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}
