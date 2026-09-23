import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { jobsApi } from '../api/jobs.api';
import Navbar from '../components/common/Navbar';
import ErrorMessage from '../components/common/ErrorMessage';
import { Satellite, Clock, Play, Info, AlertCircle, Sparkles } from 'lucide-react';

export default function NewAnalysis() {
  const [sarSceneId, setSarSceneId] = useState('demo-scene-001');
  const [timeWindowHours, setTimeWindowHours] = useState(24);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await jobsApi.create({
        sarSceneId,
        timeWindowHours: Number(timeWindowHours) || 24,
      });

      const { jobId } = response.data;
      // Navigate to the analysis monitor page for this job
      navigate(`/analysis/${jobId}`);
    } catch (err) {
      setError(err.message || 'Failed to dispatch analysis job');
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#020617' }}>
      <Navbar />

      <main style={{ flex: 1, padding: '32px 24px', maxWidth: '1050px', width: '100%', margin: '0 auto' }} role="main">
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              SIH26143 Pipeline Execution
            </span>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f8fafc' }}>
            Initiate Oil Spill Detection & Candidate Attribution Job
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#94a3b8', marginTop: '4px', maxWidth: '780px' }}>
            Dispatch an automated pipeline run for satellite SAR acquisition segmentation, numerical backward drift trajectory modeling, and spatiotemporal candidate vessel ranking.
          </p>
        </div>

        {error && <ErrorMessage title="Failed to start analysis job" message={error} />}

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
          {/* Form Column */}
          <div className="card" style={{ padding: '24px' }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label htmlFor="sarSceneId" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                  SAR Satellite Scene Identifier
                </label>
                <div style={{ position: 'relative' }}>
                  <Satellite size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                  <input
                    id="sarSceneId"
                    type="text"
                    required
                    value={sarSceneId}
                    onChange={(e) => setSarSceneId(e.target.value)}
                    placeholder="e.g. demo-scene-001"
                    aria-describedby="scene-desc"
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 36px',
                      background: '#020617',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '0.9rem',
                      fontFamily: 'var(--font-mono)',
                      outline: 'none',
                    }}
                  />
                </div>
                <span id="scene-desc" style={{ fontSize: '0.74rem', color: '#64748b', display: 'block', marginTop: '6px' }}>
                  Demonstration Scenario: <code style={{ color: '#38bdf8', fontWeight: 600 }}>demo-scene-001</code> (Offshore Mumbai C-Band SAR)
                </span>
              </div>

              <div>
                <label htmlFor="timeWindowHours" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                  Reverse Hindcast Time Window (Hours)
                </label>
                <div style={{ position: 'relative' }}>
                  <Clock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                  <input
                    id="timeWindowHours"
                    type="number"
                    min={1}
                    max={72}
                    required
                    value={timeWindowHours}
                    onChange={(e) => setTimeWindowHours(Number(e.target.value))}
                    aria-describedby="window-desc"
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 36px',
                      background: '#020617',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '0.9rem',
                      fontFamily: 'var(--font-mono)',
                      outline: 'none',
                    }}
                  />
                </div>
                <span id="window-desc" style={{ fontSize: '0.74rem', color: '#64748b', display: 'block', marginTop: '6px' }}>
                  Traces numerical drift trajectory points backward from the detected slick time.
                </span>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary"
                style={{ padding: '12px', justifyContent: 'center', marginTop: '8px' }}
                aria-label="Dispatch Detection & Attribution Pipeline"
              >
                {isSubmitting ? (
                  <span>Enqueuing Job to Redis / BullMQ...</span>
                ) : (
                  <>
                    <Play size={16} />
                    <span>Run AI Detection & Attribution Pipeline</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Pipeline Details Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="card" style={{ background: 'rgba(15, 23, 42, 0.7)', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontWeight: 600, marginBottom: '12px' }}>
                <Info size={18} />
                <span>Automated Pipeline Stages</span>
              </div>

              <ol style={{ paddingLeft: '20px', fontSize: '0.82rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <li>
                  <strong style={{ color: '#f8fafc' }}>1. Potential Oil Slick Segmentation</strong>
                  <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Extracts spatial polygon geometry, detection confidence, and centroid coordinates.</div>
                </li>
                <li>
                  <strong style={{ color: '#f8fafc' }}>2. Backward Hindcast Modeling</strong>
                  <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Simulates backward ocean drift trajectory to compute modeled discharge origin.</div>
                </li>
                <li>
                  <strong style={{ color: '#f8fafc' }}>3. AIS Candidate Attribution</strong>
                  <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Evaluates spatial proximity, temporal delta, trajectory alignment, and AIS speed anomalies.</div>
                </li>
              </ol>
            </div>

            <div className="card" style={{ border: '1px solid rgba(56, 189, 248, 0.3)', background: 'rgba(56, 189, 248, 0.05)', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: '#38bdf8', fontSize: '0.78rem', lineHeight: 1.4 }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>
                  <strong>Scientific Methodology Note:</strong> Attribution scores reflect analytical correlation based on available AIS data and drift physics. They do not constitute legal determinations of fault.
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
