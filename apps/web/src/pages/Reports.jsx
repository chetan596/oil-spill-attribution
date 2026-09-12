import React, { useEffect, useState } from 'react';
import { spillsApi } from '../api/spills.api';
import { dossierApi } from '../api/dossier.api';
import Navbar from '../components/common/Navbar';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
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
      // Find the corresponding analysisId for this spill
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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#020617' }}>
      <Navbar />

      <main style={{ flex: 1, padding: '32px 24px', maxWidth: '1200px', width: '100%', margin: '0 auto' }} role="main">
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Phase 6 — Evidentiary Synthesis
            </span>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f8fafc' }}>
            LLM-Assisted Analytical Investigation Dossier
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#94a3b8', marginTop: '4px' }}>
            Synthesize pre-computed Sentinel-1 SAR observations, Lagrangian reverse drift hindcasts, and AIS candidate vessel attribution rankings into a comprehensive investigative dossier.
          </p>
        </div>

        {error && <ErrorMessage title="Dossier Generation Error" message={error} />}

        {/* Generator Controls Card */}
        <div className="card" style={{ marginBottom: '24px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '300px' }}>
              <label htmlFor="spill-select" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                Select Detected Spill Incident
              </label>
              <select
                id="spill-select"
                value={selectedSpillId}
                onChange={(e) => setSelectedSpillId(e.target.value)}
                disabled={isLoadingSpills || isGenerating}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#020617',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '0.88rem',
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
              style={{ marginTop: '22px', padding: '10px 20px', fontSize: '0.88rem' }}
              aria-label="Generate Analytical Investigation Dossier"
            >
              {isGenerating ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <LoadingSpinner size={16} />
                  <span>Synthesizing Dossier...</span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={16} />
                  <span>Generate Investigation Dossier</span>
                </div>
              )}
            </button>
          </div>
        </div>

        {/* Generated Dossier Document */}
        {dossier && (
          <div
            className="card report-container"
            style={{
              background: '#0a0f1d',
              border: '1px solid #334155',
              padding: '36px',
              borderRadius: '8px',
            }}
          >
            {/* Dossier Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                borderBottom: '1px solid #1e293b',
                paddingBottom: '20px',
                marginBottom: '24px',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>
                  <CheckCircle2 size={14} /> Analytical Investigation Dossier
                </div>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#f8fafc' }}>
                  {dossierResult.title || `Maritime Investigation Report — Incident #${selectedSpillId.slice(0, 8)}`}
                </h2>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '4px' }}>
                  Generated on: <span style={{ color: '#cbd5e1', fontFamily: 'var(--font-mono)' }}>{new Date(dossierResult.createdAt || Date.now()).toUTCString()}</span> | Classification: <strong style={{ color: '#38bdf8' }}>INTERNAL ANALYTICAL EVIDENCE</strong>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => window.print()}
                  className="btn-secondary"
                  style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                  aria-label="Print or Export PDF Dossier"
                >
                  <Printer size={14} /> Print / Export PDF
                </button>
              </div>
            </div>

            {/* Demonstration Notice Banners */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px', marginBottom: '24px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  background: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  color: '#fbbf24',
                  fontWeight: 600,
                }}
              >
                <Compass size={15} style={{ flexShrink: 0 }} />
                <span>DRIFT MODEL: DEMONSTRATION ENVIRONMENTAL SCENARIO (source = 'demo')</span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  background: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  color: '#fbbf24',
                  fontWeight: 600,
                }}
              >
                <Database size={15} style={{ flexShrink: 0 }} />
                <span>AIS DATA SOURCE: DEMONSTRATION DATASET (source = 'demo')</span>
              </div>
            </div>

            {/* Structured Dossier Sections */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Executive Summary */}
              {dossier.executiveSummary && (
                <div style={{ background: '#020617', padding: '20px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Executive Summary
                  </div>
                  <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.65, color: '#e2e8f0' }}>
                    {dossier.executiveSummary}
                  </p>
                </div>
              )}

              {/* 1. OBSERVED EVIDENCE */}
              {dossier.observedEvidence && dossier.observedEvidence.length > 0 && (
                <div style={{ background: '#020617', padding: '20px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontWeight: 700, fontSize: '0.92rem', marginBottom: '12px' }}>
                    <Satellite size={17} />
                    <span>1. OBSERVED EVIDENCE (SENTINEL-1 SAR ACQUISITION)</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.7 }}>
                    {dossier.observedEvidence.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 2. MODELLED EVIDENCE */}
              {dossier.modelledEvidence && dossier.modelledEvidence.length > 0 && (
                <div style={{ background: '#020617', padding: '20px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b', fontWeight: 700, fontSize: '0.92rem', marginBottom: '12px' }}>
                    <Compass size={17} />
                    <span>2. MODELLED EVIDENCE (DRIFT HINDCAST & METOCEAN FORCING)</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.7 }}>
                    {dossier.modelledEvidence.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 3. CANDIDATE VESSEL ATTRIBUTION ASSESSMENTS */}
              {dossier.candidateAssessments && dossier.candidateAssessments.length > 0 && (
                <div style={{ background: '#020617', padding: '20px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a855f7', fontWeight: 700, fontSize: '0.92rem', marginBottom: '16px' }}>
                    <Ship size={17} />
                    <span>3. CANDIDATE VESSEL ATTRIBUTION CORRELATIONS (DEMONSTRATION AIS)</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {dossier.candidateAssessments.map((cand, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: '#0a0f1d',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          padding: '16px',
                        }}
                      >
                        <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#f8fafc', marginBottom: '6px' }}>
                          {cand.candidateVessel}
                        </div>
                        <p style={{ fontSize: '0.84rem', color: '#cbd5e1', margin: '0 0 10px', lineHeight: 1.55 }}>
                          {cand.summary}
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                          {/* Supporting Evidence */}
                          {cand.supportingEvidence && cand.supportingEvidence.length > 0 && (
                            <div style={{ background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '4px', padding: '10px 12px' }}>
                              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', marginBottom: '4px' }}>
                                Supporting Evidence Metrics
                              </div>
                              <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                                {cand.supportingEvidence.map((s, sIdx) => (
                                  <li key={sIdx}>{s}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Limiting Evidence */}
                          {cand.limitingEvidence && cand.limitingEvidence.length > 0 && (
                            <div style={{ background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '4px', padding: '10px 12px' }}>
                              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase', marginBottom: '4px' }}>
                                Limiting / Contextual Factors
                              </div>
                              <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.5 }}>
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
                <div style={{ background: '#020617', padding: '20px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontWeight: 700, fontSize: '0.92rem', marginBottom: '14px' }}>
                    <Clock size={17} />
                    <span>4. CHRONOLOGICAL EVENT TIMELINE</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {dossier.timeline.map((step, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <div style={{ width: '170px', flexShrink: 0, fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>
                          {step.time}
                        </div>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', display: 'inline-block', marginRight: '8px' }}>
                            [{step.phase}]
                          </span>
                          <span style={{ fontSize: '0.84rem', color: '#cbd5e1' }}>
                            {step.description}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 5. LIMITATIONS & RECOMMENDATIONS */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                {/* Limitations */}
                {dossier.limitations && dossier.limitations.length > 0 && (
                  <div style={{ background: '#020617', padding: '20px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fbbf24', fontWeight: 700, fontSize: '0.88rem', marginBottom: '10px' }}>
                      <AlertTriangle size={16} />
                      <span>5. SCIENTIFIC LIMITATIONS</span>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.6 }}>
                      {dossier.limitations.map((lim, idx) => (
                        <li key={idx}>{lim}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Recommendations */}
                {dossier.recommendedFollowUp && dossier.recommendedFollowUp.length > 0 && (
                  <div style={{ background: '#020617', padding: '20px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontWeight: 700, fontSize: '0.88rem', marginBottom: '10px' }}>
                      <Shield size={16} />
                      <span>6. RECOMMENDED FOLLOW-UP</span>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.6 }}>
                      {dossier.recommendedFollowUp.map((rec, idx) => (
                        <li key={idx}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* 7. MANDATORY DISCLAIMER */}
              <div style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '16px 20px', borderRadius: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', color: '#94a3b8', fontSize: '0.78rem', lineHeight: 1.6 }}>
                  <AlertCircle size={18} style={{ color: '#38bdf8', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong style={{ color: '#f8fafc', display: 'block', marginBottom: '4px' }}>
                      MANDATORY EVIDENTIARY & SCIENTIFIC DISCLAIMER:
                    </strong>
                    <p style={{ margin: '0 0 4px', color: '#cbd5e1' }}>
                      {dossier.disclaimer}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {!dossier && !isGenerating && spills.length > 0 && (
          <div style={{ textAlign: 'center', padding: '48px', color: '#64748b' }}>
            <FileText size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
            <p>Select a detected spill incident from above and click "Generate Investigation Dossier" to synthesize the evidence report.</p>
          </div>
        )}
      </main>
    </div>
  );
}
