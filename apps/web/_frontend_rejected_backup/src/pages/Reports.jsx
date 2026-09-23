import React, { useEffect, useState } from 'react';
import { spillsApi } from '../api/spills.api';
import { dossierApi } from '../api/dossier.api';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import EvidenceBadge from '../components/common/EvidenceBadge';
import {
  FileText,
  CheckCircle2,
  Printer,
  Sparkles,
  Shield,
  AlertCircle,
  Satellite,
  Compass,
  Ship,
  Database,
  Clock,
  AlertTriangle,
  ChevronRight,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';

export default function Reports() {
  const [spills, setSpills] = useState([]);
  const [selectedSpillId, setSelectedSpillId] = useState('');
  const [dossierResult, setDossierResult] = useState(null);
  const [isLoadingSpills, setIsLoadingSpills] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadSpills = async () => {
      try {
        const res = await spillsApi.list();
        const list = res.data.spills || [];
        setSpills(list);
        if (list.length > 0) {
          setSelectedSpillId(list[0].id);
        }
      } catch (err) {
        setError(err.message || 'Failed to fetch spills list');
      } finally {
        setIsLoadingSpills(false);
      }
    };
    loadSpills();
  }, []);

  const handleGenerate = async () => {
    if (!selectedSpillId) return;
    setIsGenerating(true);
    setError(null);
    try {
      const spillObj = spills.find((s) => s.id === selectedSpillId);
      const analysisId = spillObj?.analysisId || selectedSpillId;

      const res = await dossierApi.generate(analysisId);
      setDossierResult(res.data);
    } catch (err) {
      setError(err.message || 'Failed to synthesize analytical investigation dossier');
    } finally {
      setIsGenerating(false);
    }
  };

  const dossier = dossierResult?.dossier;

  return (
    <div className="reports-page-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      {/* Screen Header (Hidden on Print) */}
      <div className="no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Evidentiary Intelligence Synthesis
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>•</span>
          <EvidenceBadge type="MODELLED" label="LLM Multi-Modal Dossier" size="xs" />
        </div>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)', margin: '2px 0' }}>
          Analytical Investigation Dossier Records
        </h1>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
          Synthesize pre-computed Sentinel-1 SAR observations, Lagrangian reverse drift hindcasts, and AIS candidate vessel attribution rankings into a formal maritime investigation dossier.
        </p>
      </div>

      {error && (
        <div className="card no-print" style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-rose)', fontWeight: 700, fontSize: '0.85rem' }}>
            <AlertCircle size={16} />
            <span>INVESTIGATION DOSSIER — Generation Unavailable</span>
          </div>
          <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            The dossier synthesis service is temporarily unavailable. All underlying multi-source surveillance data (Observed SAR slick, Modelled Lagrangian origin, and Candidate AIS telemetry) remains intact and accessible in the investigation workstation.
          </p>
        </div>
      )}

      {/* Generator Controls Card (Hidden on Print) */}
      <div className="card no-print" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '300px' }}>
            <label htmlFor="spill-select" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Select Detected Spill Incident
            </label>
            <select
              id="spill-select"
              value={selectedSpillId}
              onChange={(e) => setSelectedSpillId(e.target.value)}
              disabled={isLoadingSpills || isGenerating}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: 'var(--surface-sunken)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                fontSize: '0.82rem',
                outline: 'none',
              }}
            >
              {spills.map((s) => (
                <option key={s.id} value={s.id}>
                  Spill #{s.id.slice(0, 8)} — Area: {s.areaKm2} km² (Confidence: {Math.round(s.confidence * 100)}%)
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating || !selectedSpillId}
            className="btn-primary"
            style={{ marginTop: '20px', padding: '8px 16px', fontSize: '0.82rem' }}
            aria-label="Generate Analytical Investigation Dossier"
          >
            {isGenerating ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <LoadingSpinner size={13} />
                <span>Synthesizing Dossier...</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={14} />
                <span>Synthesize Dossier</span>
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Generated Dossier Document (Formal Print/PDF format) */}
      {dossier && (
        <div
          className="card report-container formal-print-document"
          style={{
            background: 'var(--surface-base)',
            border: '1px solid var(--border-color)',
            padding: '28px',
            borderRadius: '4px',
          }}
        >
          {/* Formal Print Header (Visible only in Print / Formal View) */}
          <div className="print-only-header">
            <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '10pt', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#0f172a' }}>
                  OCEAN GUARD AI • MARITIME SURVEILLANCE & ATTRIBUTION SYSTEM
                </div>
                <div style={{ fontSize: '16pt', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>
                  OFFICIAL MARITIME INVESTIGATION RECORD
                </div>
                <div style={{ fontSize: '9pt', color: '#475569', marginTop: '2px' }}>
                  INCIDENT REF: <strong>OG-SAR-{selectedSpillId.slice(0, 8).toUpperCase()}</strong> • CLASSIFICATION: <strong>CONFIDENTIAL / EVIDENCE RECORD</strong>
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '8.5pt', color: '#475569' }}>
                <div>RECORD DATE: <strong>{new Date().toISOString().slice(0, 10)}</strong></div>
                <div>SYNTHESIS ENGINE: <strong>ANALYTICAL DOSSIER v0.9</strong></div>
                <div>DRIFT MODEL: <strong>LAGRANGIAN HINDCAST</strong></div>
              </div>
            </div>

            {/* Provenance Banner */}
            <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '8px 12px', borderRadius: '4px', marginBottom: '16px', fontSize: '8pt', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              <div><strong>SAR SATELLITE:</strong> OBSERVED</div>
              <div><strong>DRIFT HINDCAST:</strong> MODELLED</div>
              <div><strong>AIS TELEMETRY:</strong> DEMONSTRATION</div>
              <div><strong>METOCEAN FORCING:</strong> DEMONSTRATION</div>
            </div>
          </div>

          {/* Dossier Header (Interactive UI) */}
          <div
            className="no-print"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              borderBottom: '1px solid var(--border-color)',
              paddingBottom: '16px',
              marginBottom: '20px',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-emerald)', fontSize: '0.74rem', fontWeight: 700, marginBottom: '4px' }}>
                <CheckCircle2 size={13} /> Maritime Evidentiary Dossier
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                {dossierResult.title || `Investigation Dossier — Incident #${selectedSpillId.slice(0, 8)}`}
              </h2>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Generated: <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{new Date(dossierResult.createdAt || Date.now()).toUTCString()}</span> | Classification: <strong style={{ color: 'var(--accent-cyan)' }}>INTERNAL MARITIME EVIDENCE</strong>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => window.print()}
                className="btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                aria-label="Print or Export PDF Dossier"
              >
                <Printer size={13} /> Print / Export PDF
              </button>
            </div>
          </div>

          {/* Structured Dossier Sections */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Executive Summary */}
            {dossier.executiveSummary && (
              <div className="report-section" style={{ background: 'var(--surface-raised)', padding: '16px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Executive Summary
                </div>
                <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                  {dossier.executiveSummary}
                </p>
              </div>
            )}

            {/* 1. OBSERVED EVIDENCE */}
            {dossier.observedEvidence && dossier.observedEvidence.length > 0 && (
              <div className="report-section" style={{ background: 'var(--surface-raised)', padding: '16px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-emerald)', fontWeight: 700, fontSize: '0.85rem', marginBottom: '10px' }}>
                  <Satellite size={15} />
                  <span>1. OBSERVED EVIDENCE (SENTINEL-1 SAR ACQUISITION)</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {dossier.observedEvidence.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* 2. MODELLED EVIDENCE */}
            {dossier.modelledEvidence && dossier.modelledEvidence.length > 0 && (
              <div className="report-section" style={{ background: 'var(--surface-raised)', padding: '16px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-amber)', fontWeight: 700, fontSize: '0.85rem', marginBottom: '10px' }}>
                  <Compass size={15} />
                  <span>2. MODELLED EVIDENCE (DRIFT HINDCAST & METOCEAN FORCING)</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {dossier.modelledEvidence.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* 3. CANDIDATE VESSEL ATTRIBUTION ASSESSMENTS */}
            {dossier.candidateAssessments && dossier.candidateAssessments.length > 0 && (
              <div className="report-section" style={{ background: 'var(--surface-raised)', padding: '16px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-purple)', fontWeight: 700, fontSize: '0.85rem', marginBottom: '12px' }}>
                  <Ship size={15} />
                  <span>3. CANDIDATE VESSEL ATTRIBUTION CORRELATIONS (DEMONSTRATION AIS)</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {dossier.candidateAssessments.map((cand, idx) => (
                    <div
                      key={idx}
                      className="candidate-card-print"
                      style={{
                        background: 'var(--surface-sunken)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        padding: '12px',
                      }}
                    >
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                        {cand.candidateVessel}
                      </div>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.5 }}>
                        {cand.summary}
                      </p>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '8px' }}>
                        {/* Supporting Evidence */}
                        {cand.supportingEvidence && cand.supportingEvidence.length > 0 && (
                          <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '3px', padding: '8px 10px' }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-emerald)', textTransform: 'uppercase', marginBottom: '3px' }}>
                              Supporting Evidence
                            </div>
                            <ul style={{ margin: 0, paddingLeft: '14px', fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                              {cand.supportingEvidence.map((s, sIdx) => (
                                <li key={sIdx}>{s}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Limiting Evidence */}
                        {cand.limitingEvidence && cand.limitingEvidence.length > 0 && (
                          <div style={{ background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '3px', padding: '8px 10px' }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-amber)', textTransform: 'uppercase', marginBottom: '3px' }}>
                              Limiting Factors
                            </div>
                            <ul style={{ margin: 0, paddingLeft: '14px', fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                              {cand.limitingEvidence.map((l, lIdx) => (
                                <li key={lIdx}>{l}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. TIMELINE */}
            {dossier.timeline && dossier.timeline.length > 0 && (
              <div className="report-section" style={{ background: 'var(--surface-raised)', padding: '16px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-cyan)', fontWeight: 700, fontSize: '0.85rem', marginBottom: '10px' }}>
                  <Clock size={15} />
                  <span>4. CHRONOLOGICAL EVENT TIMELINE</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {dossier.timeline.map((step, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                      <div style={{ width: '150px', flexShrink: 0, fontSize: '0.74rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
                        {step.time}
                      </div>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-amber)', textTransform: 'uppercase', display: 'inline-block', marginRight: '6px' }}>
                          [{step.phase}]
                        </span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          {step.description}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 5. LIMITATIONS & RECOMMENDATIONS */}
            <div className="report-section" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
              {dossier.limitations && dossier.limitations.length > 0 && (
                <div style={{ background: 'var(--surface-raised)', padding: '16px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-amber)', fontWeight: 700, fontSize: '0.82rem', marginBottom: '8px' }}>
                    <AlertTriangle size={14} />
                    <span>5. SCIENTIFIC LIMITATIONS</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    {dossier.limitations.map((lim, idx) => (
                      <li key={idx}>{lim}</li>
                    ))}
                  </ul>
                </div>
              )}

              {dossier.recommendedFollowUp && dossier.recommendedFollowUp.length > 0 && (
                <div style={{ background: 'var(--surface-raised)', padding: '16px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-emerald)', fontWeight: 700, fontSize: '0.82rem', marginBottom: '8px' }}>
                    <Shield size={14} />
                    <span>6. RECOMMENDED FOLLOW-UP</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    {dossier.recommendedFollowUp.map((rec, idx) => (
                      <li key={idx}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* MANDATORY DISCLAIMER */}
            <div className="report-section" style={{ background: 'rgba(56, 189, 248, 0.04)', border: '1px solid rgba(56, 189, 248, 0.25)', padding: '14px 16px', borderRadius: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.74rem', lineHeight: 1.5 }}>
                <AlertCircle size={16} style={{ color: 'var(--accent-cyan)', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '2px' }}>
                    MANDATORY EVIDENTIARY & SCIENTIFIC DISCLAIMER:
                  </strong>
                  <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    {dossier.disclaimer}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!dossier && !isGenerating && spills.length > 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          <FileText size={36} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
          <p style={{ fontSize: '0.82rem' }}>Select a detected incident from above and click "Synthesize Dossier" to generate a formal investigation report.</p>
        </div>
      )}
    </div>
  );
}
