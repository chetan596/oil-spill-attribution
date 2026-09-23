import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { jobsApi } from '../api/jobs.api';
import ErrorMessage from '../components/common/ErrorMessage';
import EvidenceBadge from '../components/common/EvidenceBadge';
import Sentinel1AcquisitionPanel from '../components/analysis/Sentinel1AcquisitionPanel';
import {
  Satellite,
  Clock,
  Play,
  Info,
  AlertCircle,
  Sparkles,
  Layers,
  Compass,
  Ship,
  CheckCircle2,
  Sliders,
  Globe,
  Radio,
} from 'lucide-react';

export default function NewAnalysis() {
  // Application Mode: 'demo' | 'real_sentinel1'
  const [appMode, setAppMode] = useState('demo');

  const [sarSceneId, setSarSceneId] = useState('demo-scene-001');
  const [timeWindowHours, setTimeWindowHours] = useState(24);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const presets = [
    {
      id: 'demo-scene-001',
      title: 'Mumbai Offshore Sector (Primary Baseline Demo)',
      description: 'Sentinel-1 C-Band SAR dual-pol acquisition over Mumbai High oil corridor with simulated MetOcean boundary forcings.',
      area: '4.73 km²',
      centroid: '18.921°N, 72.832°E',
      origin: '19.113°N, 72.544°E',
    },
    {
      id: 'demo-scene-002',
      title: 'Gulf of Kutch Maritime Pass (Secondary Scenario)',
      description: 'Strait transit corridor with complex tidal currents and dense tanker traffic.',
      area: '2.85 km²',
      centroid: '22.450°N, 69.210°E',
      origin: '22.610°N, 69.010°E',
    },
    {
      id: 'demo-scene-003',
      title: 'Bay of Bengal / Paradip Offshore Corridor',
      description: 'Deep-water maritime corridor with seasonal monsoon surface drift in Bay of Bengal.',
      area: '5.20 km²',
      centroid: '20.150°N, 86.920°E',
      origin: '20.310°N, 86.720°E',
    },
    {
      id: 'demo-scene-004',
      title: 'Goa / Malabar Offshore Transit Channel',
      description: 'Coastal traffic lane along western continental shelf with southerly drift currents.',
      area: '3.60 km²',
      centroid: '15.280°N, 73.520°E',
      origin: '15.440°N, 73.320°E',
    },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await jobsApi.create({
        sarSceneId,
        timeWindowHours: Number(timeWindowHours) || 24,
      });

      const jobId = response?.jobId || response?.data?.jobId;
      if (!jobId) {
        throw new Error('Analysis dispatch failed: No jobId returned by service');
      }
      navigate(`/analysis/${jobId}`);
    } catch (err) {
      setError(err.message || 'Failed to dispatch analysis job');
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Mission Dispatch Control
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>•</span>
          <EvidenceBadge type="EXPERIMENTAL" label="SIH26143 Automated Run" size="xs" />
        </div>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)', margin: '2px 0' }}>
          Initiate Oil Spill Detection & Candidate Attribution Job
        </h1>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
          Dispatch an automated pipeline run for satellite SAR acquisition segmentation, numerical backward drift trajectory modeling, and spatiotemporal candidate vessel ranking.
        </p>
      </div>

      {/* Mode Switcher Tabs */}
      <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
        <button
          type="button"
          onClick={() => setAppMode('demo')}
          className="btn"
          style={{
            padding: '8px 16px',
            fontSize: '0.82rem',
            fontWeight: 700,
            borderRadius: '4px',
            background: appMode === 'demo' ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
            border: `1px solid ${appMode === 'demo' ? 'var(--accent-cyan)' : 'var(--border-color)'}`,
            color: appMode === 'demo' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
          }}
        >
          <Sliders size={14} />
          Demo Mode (Deterministic Scenarios)
        </button>

        <button
          type="button"
          onClick={() => setAppMode('real_sentinel1')}
          className="btn"
          style={{
            padding: '8px 16px',
            fontSize: '0.82rem',
            fontWeight: 700,
            borderRadius: '4px',
            background: appMode === 'real_sentinel1' ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
            border: `1px solid ${appMode === 'real_sentinel1' ? 'var(--accent-cyan)' : 'var(--border-color)'}`,
            color: appMode === 'real_sentinel1' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
          }}
        >
          <Globe size={14} />
          Real Sentinel-1 Mode (Copernicus CDSE)
        </button>
      </div>

      {error && <ErrorMessage title="Failed to dispatch mission" message={error} />}

      {/* Render based on Mode */}
      {appMode === 'real_sentinel1' ? (
        <Sentinel1AcquisitionPanel />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: '20px' }}>
          {/* Form Column */}
          <div className="card" style={{ padding: '20px' }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Preset Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Operational Presets & SAR Scene
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {presets.map((preset) => (
                    <div
                      key={preset.id}
                      onClick={() => setSarSceneId(preset.id)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '4px',
                        border: `1px solid ${sarSceneId === preset.id ? 'var(--accent-cyan)' : 'var(--border-color)'}`,
                        background: sarSceneId === preset.id ? 'rgba(56, 189, 248, 0.08)' : 'var(--surface-sunken)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '0.82rem', color: sarSceneId === preset.id ? 'var(--accent-cyan)' : 'var(--text-primary)' }}>
                          {preset.title}
                        </strong>
                        <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          {preset.id}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.4 }}>
                        {preset.description}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom Scene Input */}
              <div>
                <label htmlFor="sarSceneId" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Or Custom SAR Satellite Scene Identifier
                </label>
                <div style={{ position: 'relative' }}>
                  <Satellite size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    id="sarSceneId"
                    type="text"
                    required
                    value={sarSceneId}
                    onChange={(e) => setSarSceneId(e.target.value)}
                    placeholder="e.g. demo-scene-001"
                    style={{
                      width: '100%',
                      padding: '8px 10px 8px 32px',
                      background: 'var(--surface-sunken)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem',
                      fontFamily: 'var(--font-mono)',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              {/* Time Window Hours */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label htmlFor="timeWindowHours" style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Reverse Hindcast Time Window
                  </label>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--accent-cyan)', fontSize: '0.85rem' }}>
                    {timeWindowHours} Hours
                  </span>
                </div>

                <input
                  id="timeWindowHours"
                  type="range"
                  min={6}
                  max={72}
                  step={6}
                  value={timeWindowHours}
                  onChange={(e) => setTimeWindowHours(Number(e.target.value))}
                  style={{
                    width: '100%',
                    cursor: 'pointer',
                    accentColor: 'var(--accent-cyan)',
                  }}
                />

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  <span>6h (Quick Trace)</span>
                  <span>24h (Standard MetOcean)</span>
                  <span>48h</span>
                  <span>72h (Max Span)</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary"
                style={{ padding: '10px', justifyContent: 'center', marginTop: '4px' }}
                aria-label="Dispatch Detection & Attribution Pipeline"
              >
                {isSubmitting ? (
                  <span>Enqueuing Mission to BullMQ / Redis...</span>
                ) : (
                  <>
                    <Play size={15} />
                    <span>Dispatch Mission Pipeline</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Pipeline Details Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="card" style={{ padding: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-cyan)', fontWeight: 700, fontSize: '0.85rem', marginBottom: '10px' }}>
                <Info size={16} />
                <span>Automated Pipeline Stages</span>
              </div>

              <ol style={{ paddingLeft: '18px', fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '8px', margin: 0 }}>
                <li>
                  <strong style={{ color: 'var(--text-primary)' }}>1. Potential Oil Slick Segmentation</strong>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Extracts polygon geometry, detection confidence, and centroid coordinates using active U-Net model.</div>
                </li>
                <li>
                  <strong style={{ color: 'var(--text-primary)' }}>2. Backward Hindcast Modeling</strong>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Simulates 24h backward Lagrangian drift trajectory with MetOcean forcing to compute Modelled Origin (±2.6 km uncertainty).</div>
                </li>
                <li>
                  <strong style={{ color: 'var(--text-primary)' }}>3. AIS Candidate Attribution</strong>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Correlates candidate vessels using spatial proximity (30%), temporal window (25%), trajectory kinematics (25%), and speed anomalies (20%).</div>
                </li>
              </ol>
            </div>

            <div className="card" style={{ border: '1px solid rgba(56, 189, 248, 0.25)', background: 'rgba(56, 189, 248, 0.04)', padding: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.74rem', lineHeight: 1.45 }}>
                <AlertCircle size={15} style={{ color: 'var(--accent-cyan)', flexShrink: 0, marginTop: '2px' }} />
                <span>
                  <strong style={{ color: 'var(--text-primary)' }}>Methodology Notice:</strong> Attribution scores reflect analytical correlations derived from drift physics and available AIS evidence. They do not constitute legal determinations of fault.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
