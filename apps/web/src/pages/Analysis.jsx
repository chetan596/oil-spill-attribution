import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { jobsApi } from '../api/jobs.api';
import { spillsApi } from '../api/spills.api';
import { vesselsApi } from '../api/vessels.api';
import { dossierApi } from '../api/dossier.api';
import Navbar from '../components/common/Navbar';
import MapView from '../components/map/MapView';
import SlickLayer from '../components/map/SlickLayer';
import OriginLayer from '../components/map/OriginLayer';
import TrajectoryLayer from '../components/map/TrajectoryLayer';
import VesselLayer from '../components/map/VesselLayer';
import LayerControls from '../components/map/LayerControls';
import PipelineStepper from '../components/analysis/PipelineStepper';
import DriftControls from '../components/drift/DriftControls';
import Timeline from '../components/drift/Timeline';
import DriftAnimation from '../components/drift/DriftAnimation';
import InvestigationTimeline from '../components/analysis/InvestigationTimeline';
import CandidateVesselPanel from '../components/vessels/CandidateVesselPanel';
import EvidenceBadge from '../components/common/EvidenceBadge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import { calculateBounds, parseWktPolygon } from '../utils/geo';
import {
  FileText,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  Compass,
  Target,
  Wind,
  Waves,
  Satellite,
  Ship,
  Sparkles,
  CheckCircle2,
  Printer,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';

export default function Analysis() {
  const { id: jobId } = useParams();

  // Job Status State
  const [job, setJob] = useState(null);
  const [isPolling, setIsPolling] = useState(true);
  const [pollError, setPollError] = useState(null);

  // Analysis / Spill Results State
  const [spill, setSpill] = useState(null);
  const [driftData, setDriftData] = useState(null);
  const [candidateVessels, setCandidateVessels] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [selectedVesselTrack, setSelectedVesselTrack] = useState(null);
  const [loadingResults, setLoadingResults] = useState(false);

  // Dossier Synthesis State
  const [dossierResult, setDossierResult] = useState(null);
  const [isGeneratingDossier, setIsGeneratingDossier] = useState(false);
  const [dossierError, setDossierError] = useState(null);

  // Map Layer Visibility State
  const [layers, setLayers] = useState({
    slick: true,
    origin: true,
    hindcast: true,
    forecast: true,
    vessels: true,
    tracks: true,
  });

  // Simulation Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [simSpeed, setSimSpeed] = useState(1);
  const [simPhase, setSimPhase] = useState('backward');
  const playTimerRef = useRef(null);

  // ── 1. Poll Job Status (2 seconds interval) ──────────────────────────────────
  useEffect(() => {
    let timer = null;

    const poll = async () => {
      try {
        const response = await jobsApi.getById(jobId);
        const jobData = response.data;
        setJob(jobData);

        if (jobData.status === 'completed') {
          setIsPolling(false);
          loadAnalysisResults(jobData.analysisId);
        } else if (jobData.status === 'failed') {
          setIsPolling(false);
          setPollError(jobData.errorMessage || 'Job failed during execution.');
        }
      } catch (err) {
        setPollError(err.message || 'Failed to poll job status');
        setIsPolling(false);
      }
    };

    poll();

    if (isPolling) {
      timer = setInterval(poll, 2000);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [jobId, isPolling]);

  // ── 2. Load Spill, Drift & Vessels on Completion ─────────────────────────────
  const loadAnalysisResults = async (analysisId) => {
    setLoadingResults(true);
    try {
      const spillsListRes = await spillsApi.list();
      const matchedSpill = spillsListRes.data.spills?.find((s) => s.analysisId === analysisId) || spillsListRes.data.spills?.[0];

      if (matchedSpill) {
        const [spillDetailRes, driftRes, vesselsRes, existingDossierRes] = await Promise.allSettled([
          spillsApi.getById(matchedSpill.id),
          spillsApi.getDrift(matchedSpill.id),
          spillsApi.getVessels(matchedSpill.id),
          dossierApi.get(analysisId || matchedSpill.analysisId),
        ]);

        const fullSpill = spillDetailRes.status === 'fulfilled' ? spillDetailRes.value.data : matchedSpill;
        const rawDrift = driftRes.status === 'fulfilled' ? driftRes.value.data : null;
        const vessels = vesselsRes.status === 'fulfilled' ? vesselsRes.value.data : [];

        if (existingDossierRes.status === 'fulfilled' && existingDossierRes.value.data) {
          setDossierResult(existingDossierRes.value.data);
        }

        const drift = rawDrift ? {
          ...rawDrift,
          originLat: rawDrift.originLat ?? rawDrift.latitude,
          originLng: rawDrift.originLng ?? rawDrift.longitude,
          backwardPath: rawDrift.backwardPath || (rawDrift.points || []).filter((p) => p.phase === 'backward'),
          forwardPath: rawDrift.forwardPath || (rawDrift.points || []).filter((p) => p.phase === 'forward'),
        } : null;

        setSpill(fullSpill);
        setDriftData(drift);
        setCandidateVessels(vessels);
        if (vessels.length > 0) {
          handleSelectCandidate(vessels[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load analysis results:', err);
    } finally {
      setLoadingResults(false);
    }
  };

  // ── 3. Handle Candidate Selection & Load AIS Track ────────────────────────────
  const handleSelectCandidate = async (candidate) => {
    setSelectedCandidate(candidate);
    const mmsi = candidate.vessel?.mmsi || candidate.mmsi;
    if (mmsi) {
      try {
        const trackRes = await vesselsApi.getTrack(mmsi);
        const raw = trackRes.data;
        setSelectedVesselTrack({
          vessel: raw.vessel,
          trackPoints: raw.trackPoints || raw.track || [],
        });
      } catch (err) {
        console.warn('Could not fetch vessel track for', mmsi, err);
        setSelectedVesselTrack(null);
      }
    } else {
      setSelectedVesselTrack(null);
    }
  };

  // ── 4. Generate Analytical Investigation Dossier ──────────────────────────────
  const handleGenerateDossier = async () => {
    const analysisId = job?.analysisId || spill?.analysisId;
    if (!analysisId) return;

    setIsGeneratingDossier(true);
    setDossierError(null);
    try {
      const res = await dossierApi.generate(analysisId);
      setDossierResult(res.data);
    } catch (err) {
      setDossierError(err.message || 'Failed to synthesize investigation dossier');
    } finally {
      setIsGeneratingDossier(false);
    }
  };

  // ── 5. Simulation Playback Timer ─────────────────────────────────────────────
  const activePath = simPhase === 'backward' ? driftData?.backwardPath : driftData?.forwardPath;

  useEffect(() => {
    if (isPlaying && activePath && activePath.length > 0) {
      const maxSteps = activePath.length;
      playTimerRef.current = setInterval(() => {
        setCurrentStep((prev) => {
          if (prev >= maxSteps - 1) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000 / simSpeed);
    } else {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    }

    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, simSpeed, activePath]);

  // Calculate Map Bounds
  const mapBounds = useMemo(() => {
    const points = [];
    if (spill) {
      if (spill.latitude && spill.longitude) points.push([Number(spill.latitude), Number(spill.longitude)]);
      const polygonCoords = parseWktPolygon(spill.geomWkt);
      points.push(...polygonCoords);
    }
    if (driftData) {
      if (driftData.originLat && driftData.originLng) points.push([Number(driftData.originLat), Number(driftData.originLng)]);
      if (driftData.backwardPath) {
        driftData.backwardPath.forEach((pt) => {
          const lat = Number(pt.latitude ?? pt.lat);
          const lng = Number(pt.longitude ?? pt.lng);
          if (!isNaN(lat) && !isNaN(lng)) points.push([lat, lng]);
        });
      }
    }
    if (selectedVesselTrack?.trackPoints) {
      selectedVesselTrack.trackPoints.forEach((pt) => {
        const lat = Number(pt.latitude);
        const lng = Number(pt.longitude);
        if (!isNaN(lat) && !isNaN(lng)) points.push([lat, lng]);
      });
    }
    return calculateBounds(points);
  }, [spill, driftData, selectedVesselTrack]);

  const toggleLayer = (key) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const hasForwardPath = Boolean(driftData?.forwardPath && driftData.forwardPath.length > 0);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#020617' }}>
      <Navbar />

      {/* ── GLOBAL DEMONSTRATION BANNER ────────────────────────────────────────── */}
      <div
        style={{
          background: 'rgba(245, 158, 11, 0.12)',
          borderBottom: '1px solid rgba(245, 158, 11, 0.35)',
          padding: '10px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
        role="alert"
        aria-label="Demonstration Scenario Notice"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fbbf24', fontSize: '0.82rem', fontWeight: 700 }}>
          <AlertTriangle size={16} style={{ color: '#f59e0b', flexShrink: 0 }} />
          <span>DEMONSTRATION SCENARIO — AIS and MetOcean inputs are simulated.</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>Data Provenance:</span>
          <EvidenceBadge type="OBSERVED" label="SAR: OBSERVED" size="xs" />
          <EvidenceBadge type="MODELLED" label="Drift: MODELLED" size="xs" />
          <EvidenceBadge type="DEMONSTRATION" label="AIS: DEMO" size="xs" />
          <EvidenceBadge type="DEMONSTRATION" label="MetOcean: DEMO" size="xs" />
        </div>
      </div>

      {/* ── COMMAND CENTER SUB-HEADER ─────────────────────────────────────────── */}
      <div
        style={{
          padding: '12px 24px',
          background: '#0a0f1d',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
        role="navigation"
        aria-label="Investigation Subheader"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link to="/dashboard" style={{ color: '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem' }}>
            <ArrowLeft size={15} /> Dashboard
          </Link>
          <span style={{ color: '#334155' }}>|</span>
          <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.9rem' }}>
            Investigation Incident <code style={{ color: '#38bdf8', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}>#{jobId?.slice(0, 8)}</code>
          </span>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            (Scene: <strong style={{ color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>demo-scene-001</strong>)
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {spill && (
            <Link
              to="/reports"
              className="btn-secondary"
              style={{ padding: '6px 14px', fontSize: '0.82rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
              aria-label="View Analytical Investigation Dossier Page"
            >
              <FileText size={15} />
              <span>Full Investigation Dossier</span>
            </Link>
          )}
        </div>
      </div>

      {/* ── MAIN BODY ─────────────────────────────────────────────────────────── */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '20px 24px',
          gap: '20px',
          maxWidth: '1800px',
          width: '100%',
          margin: '0 auto',
        }}
        role="main"
      >
        {pollError && <ErrorMessage title="Analysis Pipeline Error" message={pollError} />}
        {dossierError && <ErrorMessage title="Dossier Generation Error" message={dossierError} />}

        {/* Pipeline Stepper */}
        <PipelineStepper
          status={job?.status || 'queued'}
          progress={job?.progress || 0}
          errorMessage={job?.errorMessage}
          createdAt={job?.createdAt}
          completedAt={job?.completedAt}
        />

        {/* ── SUMMARY KPI CARDS (4 CARDS) ───────────────────────────────────────── */}
        {spill && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            {/* Card 1: Observed Slick Area */}
            <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #ef4444' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                  Potential Slick Area
                </span>
                <EvidenceBadge type="OBSERVED" size="xs" />
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                {spill.areaKm2} <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 500 }}>km²</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '4px' }}>
                Estimated Slick Age: <strong style={{ color: '#f8fafc' }}>{spill.estimatedAgeHours ? `${spill.estimatedAgeHours}h` : '14.5h'}</strong>
              </div>
            </div>

            {/* Card 2: SAR Detection Confidence */}
            <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #10b981' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                  SAR Radar Detection
                </span>
                <EvidenceBadge type="OBSERVED" size="xs" />
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                {Math.round(spill.confidence * 100)}%
              </div>
              <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '4px' }}>
                Centroid: <strong style={{ color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>{Number(spill.latitude).toFixed(3)}°N, {Number(spill.longitude).toFixed(3)}°E</strong>
              </div>
            </div>

            {/* Card 3: Modelled Discharge Origin */}
            <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #f59e0b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                  Modelled Spill Origin
                </span>
                <EvidenceBadge type="MODELLED" size="xs" />
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f59e0b', fontFamily: 'var(--font-mono)' }}>
                {driftData ? `${Number(driftData.originLat).toFixed(3)}°N, ${Number(driftData.originLng).toFixed(3)}°E` : '19.113°N, 72.544°E'}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '4px' }}>
                Lagrangian Engine: <strong style={{ color: '#f8fafc' }}>{driftData?.simulationMeta?.engine || 'BUILT-IN DEMO MODEL'}</strong>
              </div>
            </div>

            {/* Card 4: Modelled Origin Uncertainty Radius */}
            <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #38bdf8' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                  Origin Uncertainty Radius
                </span>
                <EvidenceBadge type="MODELLED" size="xs" />
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                ±{Number(driftData?.uncertaintyRadiusKm ?? 2.6).toFixed(1)} <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 500 }}>km</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '4px' }}>
                Dispersion: <strong style={{ color: '#f8fafc' }}>Turbulent Diffusion (K = 5.0 m²/s)</strong>
              </div>
            </div>
          </div>
        )}

        {/* ── COMMAND CENTER TWO-COLUMN WORKSPACE ───────────────────────────────── */}
        {job?.status === 'completed' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '20px', flex: 1, minHeight: '750px' }}>
            {/* ── LEFT COLUMN: MAP & SIMULATION PLAYBACK & TIMELINE ──────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Interactive Map */}
              <div
                style={{
                  flex: 1,
                  background: '#0f172a',
                  borderRadius: '8px',
                  border: '1px solid #1e293b',
                  overflow: 'hidden',
                  position: 'relative',
                  minHeight: '520px',
                }}
              >
                <MapView
                  center={spill ? [Number(spill.latitude), Number(spill.longitude)] : [18.921, 72.832]}
                  bounds={mapBounds}
                  zoom={10}
                  showLegend={true}
                >
                  {/* Layer 1: Observed Potential Oil Slick (RED) */}
                  {layers.slick && spill && <SlickLayer spill={spill} />}

                  {/* Layer 2: Modelled Spill Origin & Uncertainty Radius (AMBER) */}
                  {layers.origin && driftData && <OriginLayer driftData={driftData} />}

                  {/* Layer 3: Modelled Backward Hindcast (CYAN DASHED) & Forward Forecast (GREEN) */}
                  {(layers.hindcast || layers.forecast) && driftData && (
                    <TrajectoryLayer
                      driftData={{
                        ...driftData,
                        backwardPath: layers.hindcast ? driftData.backwardPath : [],
                        forwardPath: layers.forecast ? driftData.forwardPath : [],
                      }}
                    />
                  )}

                  {/* Layer 4: Candidate Vessels & Selected Vessel AIS Track */}
                  {layers.vessels && (
                    <VesselLayer
                      candidateVessels={candidateVessels}
                      selectedVessel={selectedCandidate}
                      onSelectVessel={handleSelectCandidate}
                      vesselTrack={layers.tracks ? selectedVesselTrack : null}
                    />
                  )}
                </MapView>

                {/* Layer Toggles */}
                <LayerControls layers={layers} onToggleLayer={toggleLayer} />
              </div>

              {/* Drift Simulation Player */}
              {driftData && (
                <div className="card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <DriftControls
                      isPlaying={isPlaying}
                      onTogglePlay={() => setIsPlaying(!isPlaying)}
                      onReset={() => {
                        setIsPlaying(false);
                        setCurrentStep(0);
                      }}
                      speed={simSpeed}
                      onSpeedChange={(s) => setSimSpeed(s)}
                      phase={simPhase}
                      onPhaseChange={(p) => {
                        setIsPlaying(false);
                        setCurrentStep(0);
                        setSimPhase(p);
                      }}
                      hasForwardPath={hasForwardPath}
                    />
                    <DriftAnimation
                      isPlaying={isPlaying}
                      currentStep={currentStep}
                      totalSteps={activePath?.length || 24}
                      simulationMeta={driftData.simulationMeta}
                    />
                  </div>
                  <Timeline
                    currentStep={currentStep}
                    maxSteps={activePath?.length || 24}
                    currentTimestamp={activePath?.[currentStep]?.timestamp}
                    phase={simPhase}
                    onStepChange={(step) => setCurrentStep(step)}
                  />
                </div>
              )}

              {/* Investigation Chronological Timeline Component */}
              <InvestigationTimeline
                spill={spill}
                driftData={driftData}
                candidateVessels={candidateVessels}
              />
            </div>

            {/* ── RIGHT COLUMN: CANDIDATE VESSELS & INVESTIGATION DOSSIER ─────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', maxHeight: '1100px', paddingRight: '4px' }}>
              {/* Candidate Vessels Panel */}
              <CandidateVesselPanel
                candidateVessels={candidateVessels}
                selectedCandidate={selectedCandidate}
                onSelectCandidate={handleSelectCandidate}
              />

              {/* Analytical Investigation Dossier Card */}
              <div className="card" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={17} style={{ color: '#38bdf8' }} />
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                      Analytical Investigation Dossier
                    </h3>
                  </div>

                  <button
                    onClick={handleGenerateDossier}
                    disabled={isGeneratingDossier || !spill}
                    className="btn-primary"
                    style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                    aria-label="Synthesize Analytical Dossier"
                  >
                    {isGeneratingDossier ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <LoadingSpinner size={14} />
                        <span>Synthesizing...</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Sparkles size={14} />
                        <span>{dossierResult ? 'Regenerate Dossier' : 'Generate Dossier'}</span>
                      </div>
                    )}
                  </button>
                </div>

                {dossierResult?.dossier ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Executive Summary Preview */}
                    <div style={{ background: '#020617', padding: '14px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', marginBottom: '4px' }}>
                        Executive Summary
                      </div>
                      <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.55, color: '#cbd5e1' }}>
                        {dossierResult.dossier.executiveSummary}
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Link
                        to="/reports"
                        className="btn-secondary"
                        style={{ flex: 1, padding: '8px 12px', fontSize: '0.8rem', textAlign: 'center', textDecoration: 'none' }}
                      >
                        View Full Dossier & Actions
                      </Link>
                      <button
                        onClick={() => window.print()}
                        className="btn-secondary"
                        style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                        aria-label="Print Dossier"
                      >
                        <Printer size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '24px 16px', color: '#64748b', fontSize: '0.82rem' }}>
                    Click "Generate Dossier" to synthesize structured SAR, Lagrangian drift, and AIS attribution evidence into a formal report.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {loadingResults && <LoadingSpinner message="Assembling spatial layers and candidate attribution evidence..." />}
      </main>
    </div>
  );
}
