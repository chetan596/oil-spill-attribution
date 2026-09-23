import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { jobsApi } from '../api/jobs.api';
import { spillsApi } from '../api/spills.api';
import { vesselsApi } from '../api/vessels.api';
import { dossierApi } from '../api/dossier.api';
import MapView from '../components/map/MapView';
import SlickLayer from '../components/map/SlickLayer';
import OriginLayer from '../components/map/OriginLayer';
import TrajectoryLayer from '../components/map/TrajectoryLayer';
import VesselLayer from '../components/map/VesselLayer';
import MetOceanLayer from '../components/map/MetOceanLayer';
import GridLayer from '../components/map/GridLayer';
import LayerControls from '../components/map/LayerControls';
import MapFocusActions from '../components/map/MapFocusActions';
import MapInfoHUD from '../components/map/MapInfoHUD';
import MapModeSelector from '../components/map/MapModeSelector';
import SarSceneHUD from '../components/map/SarSceneHUD';
import SarLayerControls from '../components/map/SarLayerControls';
import SarToolbar from '../components/map/SarToolbar';
import DriftForecastHUD from '../components/map/DriftForecastHUD';
import DriftToolbar from '../components/map/DriftToolbar';
import DriftLayerControls from '../components/map/DriftLayerControls';
import AttributionHUD from '../components/map/AttributionHUD';
import AttributionToolbar from '../components/map/AttributionToolbar';
import AttributionLayerControls from '../components/map/AttributionLayerControls';
import SceneFootprintLayer from '../components/map/SceneFootprintLayer';
import PipelineStepper from '../components/analysis/PipelineStepper';
import InvestigationTimeline from '../components/analysis/InvestigationTimeline';
import EvidenceChain from '../components/analysis/EvidenceChain';
import InvestigationGuide from '../components/analysis/InvestigationGuide';
import SarEvidenceViewer from '../components/analysis/SarEvidenceViewer';
import CandidateVesselPanel from '../components/vessels/CandidateVesselPanel';
import AttributionRankingPanel from '../components/vessels/AttributionRankingPanel';
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
  Play,
  Pause,
  RotateCcw,
  Sliders,
  Eye,
  Layers,
  Info,
  Clock,
  Crosshair,
  ExternalLink,
  SlidersHorizontal,
  Maximize2,
  Zap,
  Navigation,
} from 'lucide-react';

export default function Analysis() {
  const { id, jobId: paramJobId } = useParams();
  const jobId = id || paramJobId;

  // Polling State
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

  // Workstation Map Mode: 'investigation' | 'sar' | 'drift'
  const [mapMode, setMapMode] = useState('investigation');

  // Basemap Selector State
  const [basemapType, setBasemapType] = useState('dark');

  // Camera Target Controller (for smooth flyTo)
  const [flyToTarget, setFlyToTarget] = useState(null);

  // Dossier Synthesis State
  const [dossierResult, setDossierResult] = useState(null);
  const [isGeneratingDossier, setIsGeneratingDossier] = useState(false);
  const [dossierError, setDossierError] = useState(null);

  // Right Workspace Tab: 'vessels' | 'science' | 'timeline' | 'dossier'
  const [activeTab, setActiveTab] = useState('vessels');

  // Judge Walkthrough Guide State
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // SAR Evidence & Source Image Viewer State
  const [isSarEvidenceOpen, setIsSarEvidenceOpen] = useState(false);

  // Map Layer Visibility State for Investigation Mode
  const [layers, setLayers] = useState({
    slick: true,
    origin: true,
    hindcast: true,
    forecast: true,
    vessels: true,
    tracks: true,
    metocean: false,
    grid: true,
  });

  // Map Layer Visibility State for SAR Mode
  const [sarLayers, setSarLayers] = useState({
    slick: true,
    segmentation: true,
    sceneFootprint: true,
    grid: true,
  });

  // Map Layer Visibility State for Drift & Forecast Mode
  const [driftLayers, setDriftLayers] = useState({
    origin: true,
    hindcast: true,
    forecast: true,
    metocean: true,
    slick: true,
    grid: true,
  });

  // Map Layer Visibility State for AIS Attribution Mode
  const [attributionLayers, setAttributionLayers] = useState({
    slick: true,
    origin: true,
    cpa: true,
    vessels: true,
    tracks: true,
    grid: true,
    sceneFootprint: false,
  });

  // Simulation Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [simSpeed, setSimSpeed] = useState(1);
  const [simPhase, setSimPhase] = useState('backward'); // 'backward' | 'forward'
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
      let matchedSpill = null;

      // 1. Direct 1-to-1 lookup by analysisId
      if (analysisId) {
        try {
          const directRes = await spillsApi.getByAnalysisId(analysisId);
          if (directRes?.data) {
            matchedSpill = directRes.data;
          }
        } catch (err) {
          console.info('[Analysis] Direct spill by-analysis lookup pending or unavailable, checking index list...', err?.message);
        }
      }

      // 2. Fallback to list search if direct lookup is not matched
      if (!matchedSpill) {
        const spillsListRes = await spillsApi.list({ limit: 50 });
        const spills = spillsListRes.data?.spills || [];
        matchedSpill =
          (analysisId ? spills.find((s) => s.analysisId === analysisId) : null) ||
          spills[0];
      }

      if (matchedSpill) {
        if (analysisId && matchedSpill.analysisId && matchedSpill.analysisId !== analysisId) {
          console.warn(`[Analysis] Notice: Spill analysisId (${matchedSpill.analysisId}) does not match current requested analysis (${analysisId})`);
        }

        const [spillDetailRes, driftRes, vesselsRes, existingDossierRes] = await Promise.allSettled([
          spillsApi.getById(matchedSpill.id),
          spillsApi.getDrift(matchedSpill.id),
          spillsApi.getVessels(matchedSpill.id),
          dossierApi.get(analysisId || matchedSpill.analysisId),
        ]);

        const fullSpill = spillDetailRes.status === 'fulfilled' ? spillDetailRes.value.data : matchedSpill;
        const rawDrift = driftRes.status === 'fulfilled' ? driftRes.value.data : null;
        const vessels = vesselsRes.status === 'fulfilled' ? vesselsRes.value.data : [];

        if (existingDossierRes.status === 'fulfilled' && existingDossierRes.value?.exists && existingDossierRes.value?.data) {
          setDossierResult(existingDossierRes.value.data);
        } else {
          setDossierResult(null);
        }

        const drift = rawDrift
          ? {
              ...rawDrift,
              originLat: rawDrift.originLat ?? rawDrift.latitude,
              originLng: rawDrift.originLng ?? rawDrift.longitude,
              backwardPath: rawDrift.backwardPath || (rawDrift.points || []).filter((p) => p.phase === 'backward'),
              forwardPath: rawDrift.forwardPath || (rawDrift.points || []).filter((p) => p.phase === 'forward'),
            }
          : null;

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
    if (!candidate) {
      setSelectedCandidate(null);
      setSelectedVesselTrack(null);
      return;
    }

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

  // Determine Real CDSE vs Demo Mode
  const isRealScene = Boolean(
    job?.scenarioType === 'REAL_CDSE' ||
    spill?.scenarioType === 'REAL_CDSE' ||
    spill?.analysis?.scenarioType === 'REAL_CDSE' ||
    spill?.analysis?.scene?.scenarioType === 'REAL_CDSE' ||
    spill?.analysis?.scene?.sceneId?.includes('cdse') ||
    spill?.sceneId?.includes('cdse') ||
    job?.sarSceneId?.includes('cdse') ||
    jobId?.includes('cdse')
  );

  // ── Calculate Map Bounds ───────────────────────────────────────────────────
  const mapBounds = useMemo(() => {
    if (isRealScene) {
      return [[18.965879, 72.716985], [19.020798, 72.773998]];
    }
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
  }, [spill, driftData, selectedVesselTrack, isRealScene]);

  const handleClearSelection = () => {
    setSelectedCandidate(null);
    setSelectedVesselTrack(null);
    if (mapBounds) {
      setFlyToTarget({ bounds: mapBounds, timestamp: Date.now() });
    }
  };

  // ── 4. Generate Analytical Investigation Dossier ──────────────────────────────
  const handleGenerateDossier = async () => {
    const targetAnalysisId = job?.analysisId || spill?.analysisId || jobId;
    if (!targetAnalysisId) return;

    setIsGeneratingDossier(true);
    setDossierError(null);
    try {
      const res = await dossierApi.generate(targetAnalysisId);
      setDossierResult(res.data);
      setActiveTab('dossier');
    } catch (err) {
      setDossierError(err.message || 'Failed to synthesize investigation dossier');
    } finally {
      setIsGeneratingDossier(false);
    }
  };

  // ── 5. Simulation Playback Timer & Progressive Step ─────────────────────────
  const activePath = simPhase === 'backward' ? driftData?.backwardPath : driftData?.forwardPath;
  const maxSteps = activePath?.length || 24;

  useEffect(() => {
    if (isPlaying && activePath && activePath.length > 0) {
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
  }, [isPlaying, simSpeed, activePath, maxSteps]);

  // Camera Focus Handler for Timeline Events
  const handleFocusTarget = useCallback((coords, zoom, eventId) => {
    if (!coords || isNaN(coords[0]) || isNaN(coords[1])) return;
    setFlyToTarget({ center: coords, zoom: zoom || 12, timestamp: Date.now() });
  }, []);

  // Quick Focus Action Handlers
  const handleFocusIncident = useCallback(() => {
    if (isRealScene) {
      setFlyToTarget({ center: [18.993339, 72.745492], zoom: 12, timestamp: Date.now() });
      return;
    }
    if (spill?.latitude && spill?.longitude) {
      setFlyToTarget({ center: [Number(spill.latitude), Number(spill.longitude)], zoom: 12, timestamp: Date.now() });
    }
  }, [spill, isRealScene]);

  const handleFocusOrigin = useCallback(() => {
    if (isRealScene) {
      handleFocusIncident();
      return;
    }
    if (driftData) {
      const lat = Number(driftData.originLat ?? driftData.latitude);
      const lng = Number(driftData.originLng ?? driftData.longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        setFlyToTarget({ center: [lat, lng], zoom: 13, timestamp: Date.now() });
      }
    }
  }, [driftData, isRealScene, handleFocusIncident]);

  const handleFocusCpa = useCallback(() => {
    const evidence = selectedCandidate?.evidence;
    if (evidence?.passingLat != null && evidence?.passingLng != null) {
      setFlyToTarget({ center: [Number(evidence.passingLat), Number(evidence.passingLng)], zoom: 13, timestamp: Date.now() });
    }
  }, [selectedCandidate]);

  const handleFocusVessel = useCallback(() => {
    const evidence = selectedCandidate?.evidence;
    const lat = Number(evidence?.passingLat ?? evidence?.latitude);
    const lng = Number(evidence?.passingLng ?? evidence?.longitude);
    if (!isNaN(lat) && !isNaN(lng)) {
      setFlyToTarget({ center: [lat, lng], zoom: 13, timestamp: Date.now() });
    }
  }, [selectedCandidate]);

  const handleFocusForecast = useCallback(() => {
    if (driftData?.forwardPath && driftData.forwardPath.length > 0) {
      const lastPt = driftData.forwardPath[driftData.forwardPath.length - 1];
      setFlyToTarget({ center: [Number(lastPt.latitude ?? lastPt.lat), Number(lastPt.longitude ?? lastPt.lng)], zoom: 12, timestamp: Date.now() });
    }
  }, [driftData]);

  const handleFitAll = useCallback(() => {
    if (mapBounds) {
      setFlyToTarget({ bounds: mapBounds, timestamp: Date.now() });
    }
  }, [mapBounds]);

  const handleFocusScene = useCallback(() => {
    if (isRealScene) {
      setFlyToTarget({ bounds: [[18.965879, 72.716985], [19.020798, 72.773998]], timestamp: Date.now() });
      return;
    }
    const sceneWkt = spill?.analysis?.scene?.geomWkt;
    if (sceneWkt) {
      const coords = parseWktPolygon(sceneWkt);
      if (coords && coords.length > 0) {
        const bounds = calculateBounds(coords);
        if (bounds) {
          setFlyToTarget({ bounds, timestamp: Date.now() });
          return;
        }
      }
    }
    handleFocusIncident();
  }, [spill, handleFocusIncident, isRealScene]);

  // Evidence Chain Stage Navigator
  const handleNavigateStage = useCallback((stageId, target) => {
    if (stageId === 'sar') {
      setMapMode('sar');
      handleFocusIncident();
    } else if (stageId === 'ai') {
      setMapMode('sar');
      handleFocusIncident();
    } else if (stageId === 'drift') {
      setMapMode('drift');
      handleFocusOrigin();
    } else if (stageId === 'ais') {
      setMapMode('ais');
      setActiveTab('vessels');
      if (target === 'cpa') {
        handleFocusCpa();
      } else if (selectedCandidate) {
        handleFocusVessel();
      } else {
        handleFitAll();
      }
    } else if (stageId === 'cpa') {
      setMapMode('ais');
      setActiveTab('vessels');
      handleFocusCpa();
    } else if (stageId === 'dossier') {
      setActiveTab('dossier');
    }
  }, [handleFocusIncident, handleFocusOrigin, handleFocusCpa, handleFocusVessel, handleFitAll, selectedCandidate]);

  const toggleLayer = (key) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleSarLayer = (key) => {
    setSarLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleDriftLayer = (key) => {
    setDriftLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleAttributionLayer = (key) => {
    setAttributionLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const hasForwardPath = Boolean(driftData?.forwardPath && driftData.forwardPath.length > 0);
  const hasSceneFootprint = Boolean(spill?.analysis?.scene?.geomWkt || isRealScene);

  // Time step label
  const currentWaypoint = activePath?.[currentStep];
  const stepLabel =
    simPhase === 'backward'
      ? `T - ${maxSteps - 1 - currentStep}h`
      : `T + ${currentStep}h`;

  const originCoords = driftData
    ? [Number(driftData.originLat ?? driftData.latitude), Number(driftData.originLng ?? driftData.longitude)]
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', minHeight: 'calc(100vh - 120px)' }}>
      {/* ── 1. GLOBAL PROVENANCE NOTICE (Real CDSE vs Demo Mode) ──────────────── */}
      {isRealScene ? (
        <div
          style={{
            background: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            borderLeft: '4px solid var(--accent-cyan)',
            padding: '10px 16px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
          role="alert"
          aria-label="Real Sentinel-1 Scene Notice"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-cyan)', fontSize: '0.80rem', fontWeight: 700 }}>
            <Satellite size={16} style={{ flexShrink: 0 }} />
            <span>REAL SENTINEL-1 SCENE — Forensically Verified Copernicus CDSE Source (S1A IW GRD &bull; 18 Feb 2024 01:03:29 UTC)</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <EvidenceBadge classification="OBSERVED" label="REAL SENTINEL-1 DATA" size="xs" />
            <EvidenceBadge classification="VERIFIED" label="AUTHENTICATED CDSE SOURCE" size="xs" />
            <EvidenceBadge classification="MODELLED" label="MODELLED SAR RESPONSE" size="xs" />
            <EvidenceBadge classification="OBSERVED" label="REAL ERA5: 2.79 m/s" size="xs" />
            <EvidenceBadge classification="OBSERVED" label="REAL NOAA CRW: 26.30 °C" size="xs" />
          </div>
        </div>
      ) : (
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderLeft: '4px solid var(--accent-amber)',
            padding: '8px 16px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
          role="alert"
          aria-label="Demonstration Scenario Notice"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-amber)', fontSize: '0.78rem', fontWeight: 700 }}>
            <AlertTriangle size={15} style={{ flexShrink: 0 }} />
            <span>DEMONSTRATION SCENARIO — AIS telemetry and MetOcean boundary forcings are simulated.</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>Scientific Provenance:</span>
            <EvidenceBadge type="OBSERVED" label="SAR: OBSERVED" size="xs" />
            <EvidenceBadge type="MODELLED" label="Drift: MODELLED" size="xs" />
            <EvidenceBadge type="DEMONSTRATION" label="AIS: DEMO" size="xs" />
            <EvidenceBadge type="DEMONSTRATION" label="MetOcean: DEMO" size="xs" />
          </div>
        </div>
      )}

      {/* ── 2. PIPELINE PROGRESS TRACKER (When processing / executing) ───────── */}
      {job?.status !== 'completed' && (
        <PipelineStepper
          status={job?.status || 'queued'}
          progress={job?.progress || 0}
          errorMessage={job?.errorMessage}
          createdAt={job?.createdAt}
          completedAt={job?.completedAt}
        />
      )}

      {pollError && <ErrorMessage title="Analysis Pipeline Error" message={pollError} />}
      {dossierError && <ErrorMessage title="Dossier Synthesis Error" message={dossierError} />}

      {/* ── 2.5 EVIDENCE CHAIN INVESTIGATION WORKFLOW ───────────────────────── */}
      {job?.status === 'completed' && (
        <>
          <EvidenceChain
            currentMode={mapMode}
            activeTab={activeTab}
            spill={spill}
            driftData={driftData}
            candidateVessels={candidateVessels}
            selectedCandidate={selectedCandidate}
            dossierResult={dossierResult}
            onNavigateStage={handleNavigateStage}
            onStartWalkthrough={() => {
              setIsGuideOpen(true);
              setMapMode('sar');
              handleFocusIncident();
            }}
          />

          <InvestigationGuide
            isOpen={isGuideOpen}
            onClose={() => setIsGuideOpen(false)}
            onOpenSar={() => {
              setMapMode('sar');
              handleFocusIncident();
            }}
            onOpenDrift={() => {
              setMapMode('drift');
              handleFocusOrigin();
            }}
            onOpenAis={() => {
              setMapMode('ais');
              setActiveTab('vessels');
              if (candidateVessels.length > 0 && !selectedCandidate) {
                handleSelectCandidate(candidateVessels[0]);
              }
            }}
            onFocusTopCandidate={() => {
              setMapMode('ais');
              setActiveTab('vessels');
              if (candidateVessels.length > 0) {
                handleSelectCandidate(candidateVessels[0]);
              }
              handleFocusCpa();
            }}
            onOpenDossier={() => {
              setActiveTab('dossier');
            }}
            spill={spill}
            driftData={driftData}
            candidateVessels={candidateVessels}
            selectedCandidate={selectedCandidate}
          />
        </>
      )}

      {/* ── 3. MAP-FIRST COMMAND WORKSPACE (70% Map / 30% Intelligence Panel) ── */}
      {job?.status === 'completed' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(600px, 1fr) minmax(380px, 480px)',
            gap: '16px',
            flex: 1,
            minHeight: '760px',
          }}
        >
          {/* ── LEFT PANE: TACTICAL MAP & INTEGRATED SIMULATION DOCK ─────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>
            {/* Map Mode Selector Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <MapModeSelector
                currentMode={mapMode}
                onSelectMode={(mode) => {
                  setMapMode(mode);
                  if (mode === 'sar') {
                    handleFocusIncident();
                  } else if (mode === 'drift') {
                    handleFocusOrigin();
                  } else if (mode === 'ais') {
                    setActiveTab('vessels');
                    if (selectedCandidate) {
                      handleFocusVessel();
                    } else {
                      handleFitAll();
                    }
                  } else {
                    handleFitAll();
                  }
                }}
              />

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  Active Mode:
                </span>
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: mapMode === 'sar'
                    ? 'var(--accent-cyan)'
                    : (mapMode === 'drift'
                      ? 'var(--accent-amber)'
                      : (mapMode === 'ais' ? 'var(--accent-amber)' : 'var(--accent-emerald)'))
                }}>
                  {mapMode === 'sar'
                    ? 'SAR SATELLITE ANALYSIS'
                    : (mapMode === 'drift'
                      ? 'LAGRANGIAN DRIFT & FORECAST'
                      : (mapMode === 'ais' ? 'AIS KINEMATIC ATTRIBUTION' : 'COMMAND INVESTIGATION'))}
                </span>
              </div>
            </div>

            <div
              style={{
                flex: 1,
                background: 'var(--surface-base)',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
                overflow: 'hidden',
                position: 'relative',
                minHeight: '560px',
              }}
            >
              {/* ── MODE 1: INVESTIGATION MODE HUD & TOOLBAR ── */}
              {mapMode === 'investigation' && (
                <>
                  {spill && (
                    <MapInfoHUD
                      spill={spill}
                      driftData={driftData}
                      selectedCandidate={selectedCandidate}
                    />
                  )}

                  <MapFocusActions
                    onFocusIncident={handleFocusIncident}
                    onFocusOrigin={handleFocusOrigin}
                    onFocusCpa={handleFocusCpa}
                    onFocusVessel={handleFocusVessel}
                    onFocusForecast={handleFocusForecast}
                    onFitAll={handleFitAll}
                    hasSelectedCandidate={Boolean(selectedCandidate?.evidence?.passingLat)}
                    hasForecast={hasForwardPath}
                  />

                  <LayerControls
                    layers={layers}
                    onToggleLayer={toggleLayer}
                    basemapType={basemapType}
                    onChangeBasemap={setBasemapType}
                  />
                </>
              )}

              {/* ── MODE 2: SAR ANALYSIS MODE HUD & TOOLBAR ── */}
              {mapMode === 'sar' && (
                <>
                  <SarSceneHUD
                    spill={spill}
                    scene={spill?.analysis?.scene}
                    evidence={dossierResult?.evidence}
                    onFocusSlick={handleFocusIncident}
                    onFocusScene={handleFocusScene}
                    onOpenSarEvidence={() => setIsSarEvidenceOpen(true)}
                  />

                  <SarToolbar
                    onFocusSlick={handleFocusIncident}
                    onFocusScene={handleFocusScene}
                    onResetView={handleFitAll}
                    onOpenSarEvidence={() => setIsSarEvidenceOpen(true)}
                    hasFootprint={hasSceneFootprint}
                  />

                  <SarLayerControls
                    visibleLayers={sarLayers}
                    onToggleLayer={toggleSarLayer}
                    basemapType={basemapType}
                    onChangeBasemap={setBasemapType}
                    hasFootprint={hasSceneFootprint}
                  />
                </>
              )}

              {/* ── MODE 3: DRIFT & FORECAST MODE HUD & TOOLBAR ── */}
              {mapMode === 'drift' && (
                <>
                  <DriftForecastHUD
                    driftData={driftData}
                    spill={spill}
                    onFocusOrigin={handleFocusOrigin}
                    onFocusHindcast={handleFocusIncident}
                    onFocusForecast={handleFocusForecast}
                  />

                  <DriftToolbar
                    onFocusOrigin={handleFocusOrigin}
                    onFocusHindcast={handleFocusIncident}
                    onFocusForecast={handleFocusForecast}
                    onResetView={handleFitAll}
                    hasForecast={hasForwardPath}
                  />

                  <DriftLayerControls
                    visibleLayers={driftLayers}
                    onToggleLayer={toggleDriftLayer}
                    basemapType={basemapType}
                    onChangeBasemap={setBasemapType}
                    hasForecast={hasForwardPath}
                  />
                </>
              )}

              {/* ── MODE 4: AIS ATTRIBUTION MODE HUD & TOOLBAR ── */}
              {mapMode === 'ais' && (
                <>
                  <AttributionHUD
                    candidateVessels={candidateVessels}
                    selectedCandidate={selectedCandidate}
                    spill={spill}
                    driftData={driftData}
                    onFocusCandidate={handleFocusVessel}
                    onFocusCpa={handleFocusCpa}
                    isRealScene={isRealScene}
                  />

                  <AttributionToolbar
                    onFocusSlick={handleFocusIncident}
                    onFocusOrigin={handleFocusOrigin}
                    onFocusCpa={handleFocusCpa}
                    onFocusVessel={handleFocusVessel}
                    onClearSelection={handleClearSelection}
                    onResetView={handleFitAll}
                    hasSelectedCandidate={Boolean(selectedCandidate?.evidence?.passingLat || selectedCandidate?.evidence?.distanceKm != null)}
                  />

                  <AttributionLayerControls
                    visibleLayers={attributionLayers}
                    onToggleLayer={toggleAttributionLayer}
                    basemapType={basemapType}
                    onChangeBasemap={setBasemapType}
                    hasFootprint={hasSceneFootprint}
                    hasSelectedCandidate={Boolean(selectedCandidate)}
                  />
                </>
              )}

              {/* Leaflet Map Engine with Camera Controller */}
              <MapView
                center={isRealScene ? [18.993339, 72.745492] : (spill ? [Number(spill.latitude), Number(spill.longitude)] : [18.921, 72.832])}
                bounds={mapBounds}
                flyToTarget={flyToTarget}
                zoom={isRealScene ? 12 : 10}
                basemapType={basemapType}
                showLegend={mapMode === 'investigation'}
              >
                {/* Context Layer: Coordinate Graticule Grid */}
                {((mapMode === 'investigation' && layers.grid) || (mapMode === 'sar' && sarLayers.grid) || (mapMode === 'drift' && driftLayers.grid) || (mapMode === 'ais' && attributionLayers.grid)) && (
                  <GridLayer bounds={mapBounds} />
                )}

                {/* SAR Scene Footprint Layer (when available) */}
                {((mapMode === 'sar' && sarLayers.sceneFootprint) || (mapMode === 'investigation' && layers.sceneFootprint) || (mapMode === 'ais' && attributionLayers.sceneFootprint)) && (
                  <SceneFootprintLayer scene={spill?.analysis?.scene} visible={true} />
                )}

                {/* Layer 1: Observed Potential Oil Slick (RED) */}
                {((mapMode === 'investigation' && layers.slick) || (mapMode === 'sar' && sarLayers.slick) || (mapMode === 'drift' && driftLayers.slick) || (mapMode === 'ais' && attributionLayers.slick)) && spill && (
                  <SlickLayer spill={spill} />
                )}

                {/* Layer 2: Modelled Spill Origin & Uncertainty Radius (AMBER) */}
                {!isRealScene && ((mapMode === 'investigation' && layers.origin) || (mapMode === 'drift' && driftLayers.origin) || (mapMode === 'ais' && attributionLayers.origin)) && driftData && (
                  <OriginLayer driftData={driftData} />
                )}

                {/* Layer 3: Progressive Backward Hindcast & Forward Forecast */}
                {!isRealScene && ((mapMode === 'investigation' && (layers.hindcast || layers.forecast)) || (mapMode === 'drift' && (driftLayers.hindcast || driftLayers.forecast))) && driftData && (
                  <TrajectoryLayer
                    driftData={{
                      ...driftData,
                      backwardPath: (mapMode === 'investigation' ? layers.hindcast : driftLayers.hindcast) ? driftData.backwardPath : [],
                      forwardPath: (mapMode === 'investigation' ? layers.forecast : driftLayers.forecast) ? driftData.forwardPath : [],
                    }}
                    currentStep={currentStep}
                    simPhase={simPhase}
                    isPlaying={isPlaying}
                  />
                )}

                {/* Layer 4: Candidate Vessels, AIS Track, and CPA Vector Line */}
                {!isRealScene && (((mapMode === 'investigation' && layers.vessels) || mapMode === 'ais')) && (
                  <VesselLayer
                    candidateVessels={candidateVessels}
                    selectedVessel={selectedCandidate}
                    onSelectVessel={handleSelectCandidate}
                    vesselTrack={mapMode === 'ais' ? (attributionLayers.tracks ? selectedVesselTrack : null) : (layers.tracks ? selectedVesselTrack : null)}
                    originCoord={originCoords}
                    showVessels={mapMode === 'ais' ? attributionLayers.vessels : layers.vessels}
                    showTracks={mapMode === 'ais' ? attributionLayers.tracks : layers.tracks}
                    showCpa={mapMode === 'ais' ? attributionLayers.cpa : true}
                  />
                )}

                {/* Layer 5: MetOcean Wind & Current Vectors (DEMONSTRATION) */}
                {!isRealScene && (((mapMode === 'investigation' && layers.metocean) || (mapMode === 'drift' && driftLayers.metocean))) && (
                  <MetOceanLayer
                    center={originCoords || [18.98, 72.58]}
                  />
                )}
              </MapView>
            </div>

            {/* ── FLOATING / INTEGRATED SIMULATION DOCK ────────────────────────── */}
            {!isRealScene && (mapMode === 'investigation' || mapMode === 'drift') && driftData && (
              <div
                className="card"
                style={{
                  padding: '12px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  background: 'var(--surface-raised)',
                }}
              >
                {/* Controls Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* Play / Pause */}
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="btn-primary"
                      style={{ padding: '6px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '5px' }}
                      aria-label={isPlaying ? 'Pause simulation' : 'Play simulation'}
                    >
                      {isPlaying ? <Pause size={13} /> : <Play size={13} />}
                      <span>{isPlaying ? 'Pause' : 'Play'}</span>
                    </button>

                    {/* Reset */}
                    <button
                      onClick={() => {
                        setIsPlaying(false);
                        setCurrentStep(0);
                      }}
                      className="btn-secondary"
                      style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                      title="Reset step to origin"
                      aria-label="Reset simulation step"
                    >
                      <RotateCcw size={13} />
                    </button>

                    {/* Phase Switch: Backward vs Forward */}
                    <div style={{ display: 'flex', background: 'var(--surface-sunken)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '2px' }}>
                      <button
                        onClick={() => {
                          setIsPlaying(false);
                          setCurrentStep(0);
                          setSimPhase('backward');
                        }}
                        style={{
                          background: simPhase === 'backward' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                          color: simPhase === 'backward' ? 'var(--accent-cyan)' : 'var(--text-muted)',
                          border: 'none',
                          borderRadius: '3px',
                          padding: '4px 8px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Backward Hindcast (-24h)
                      </button>

                      <button
                        onClick={() => {
                          setIsPlaying(false);
                          setCurrentStep(0);
                          setSimPhase('forward');
                        }}
                        disabled={!hasForwardPath}
                        style={{
                          background: simPhase === 'forward' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                          color: simPhase === 'forward' ? 'var(--accent-emerald)' : 'var(--text-muted)',
                          border: 'none',
                          borderRadius: '3px',
                          padding: '4px 8px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: hasForwardPath ? 'pointer' : 'not-allowed',
                          opacity: hasForwardPath ? 1 : 0.5,
                        }}
                      >
                        Forward Forecast (+6h)
                      </button>
                    </div>
                  </div>

                  {/* Playback Multipliers */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Speed:</span>
                    {[0.5, 1, 2, 5].map((spd) => (
                      <button
                        key={spd}
                        onClick={() => setSimSpeed(spd)}
                        style={{
                          padding: '2px 6px',
                          fontSize: '0.7rem',
                          borderRadius: '3px',
                          border: '1px solid var(--border-color)',
                          background: simSpeed === spd ? 'var(--accent-cyan)' : 'var(--surface-sunken)',
                          color: simSpeed === spd ? '#07100D' : 'var(--text-secondary)',
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Timeline Scrubber */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    <span>
                      Active Step:{' '}
                      <strong style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                        {stepLabel} (Waypoint {currentStep + 1}/{maxSteps})
                      </strong>
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {currentWaypoint?.timestamp
                        ? new Date(currentWaypoint.timestamp).toUTCString()
                        : 'Simulated Advection Step'}
                    </span>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max={maxSteps - 1}
                    value={currentStep}
                    onChange={(e) => setCurrentStep(Number(e.target.value))}
                    style={{
                      width: '100%',
                      cursor: 'pointer',
                      accentColor: 'var(--accent-cyan)',
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT PANE: TABBED INTELLIGENCE & EVIDENTIARY WORKSPACE ──────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%', maxHeight: '820px' }}>
            {/* Tab Selector Buttons */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                background: 'var(--surface-sunken)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                padding: '3px',
                gap: '4px',
              }}
              role="tablist"
              aria-label="Intelligence Workspace Tabs"
            >
              {[
                { id: 'vessels', label: 'Candidates', icon: Ship },
                { id: 'science', label: 'Science', icon: Layers },
                { id: 'timeline', label: 'Timeline', icon: Clock },
                { id: 'dossier', label: 'Dossier', icon: FileText },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    role="tab"
                    aria-selected={isActive}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      padding: '8px 6px',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      borderRadius: '3px',
                      border: 'none',
                      cursor: 'pointer',
                      background: isActive ? 'var(--surface-raised)' : 'transparent',
                      color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)',
                      boxShadow: isActive ? '0 2px 4px rgba(0,0,0,0.3)' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Icon size={13} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Tab Content Container */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                paddingRight: '4px',
              }}
            >
              {/* ── TAB 1: CANDIDATE VESSELS ───────────────────────────────── */}
              {activeTab === 'vessels' && (
                <AttributionRankingPanel
                  candidateVessels={candidateVessels}
                  selectedCandidate={selectedCandidate}
                  onSelectCandidate={handleSelectCandidate}
                  onClearSelection={handleClearSelection}
                  onFocusCandidate={handleFocusVessel}
                  onFocusCpa={handleFocusCpa}
                  isRealScene={isRealScene}
                />
              )}

              {/* ── TAB 2: SCIENTIFIC TRANSPARENCY ─────────────────────────── */}
              {activeTab === 'science' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {isRealScene ? (
                    <>
                      {/* Real SAR Model Card */}
                      <div className="card" style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-cyan)', fontWeight: 700, fontSize: '0.85rem' }}>
                            <Satellite size={16} />
                            <span>SAR Model Response — Unlabelled Live Scene</span>
                          </div>
                          <EvidenceBadge classification="MODELLED" label="MODELLED SAR RESPONSE" size="xs" />
                        </div>

                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div>Model ID: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>unet-dual-pol-sar-v2 (Baseline)</strong></div>
                          <div>Target Scene: <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.70rem', color: 'var(--accent-cyan)' }}>S1A_IW_GRDH_1SDV_20240218T010329_20240218T010354_052606_065D1D_A8B1_COG</span></div>
                          <div>Product UUID: <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.70rem' }}>3f5c4ba1-ed70-4065-91b9-2bbeb7ebfb79</span></div>
                          <div>Acquisition: <span style={{ fontFamily: 'var(--font-mono)' }}>18 Feb 2024 01:03:29 UTC</span> (Descending, Pass 65)</div>
                          <div style={{ marginTop: '6px', borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}>
                            <strong>Probability Statistics:</strong> Max = 0.362835 | Mean = 0.024305 | Median = 0.022336 | Std = 0.011739
                          </div>
                          <div>
                            <strong>Percentiles:</strong> P90 = 0.035095 | P95 = 0.040692 | P99 = 0.065173
                          </div>
                          <div style={{ color: 'var(--accent-emerald)' }}>
                            <strong>Threshold 0.50:</strong> 0 positive pixels (0.0000 km²)
                          </div>
                          <div style={{ color: '#ff4d5e' }}>
                            <strong>Threshold 0.35:</strong> 1 positive pixel (0.0001 km²)
                          </div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            * No detection accuracy (IoU, Dice, Precision, Recall) is claimed for this unlabelled scene.
                          </div>
                        </div>
                      </div>

                      {/* Real MetOcean Card */}
                      <div className="card" style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-emerald)', fontWeight: 700, fontSize: '0.85rem' }}>
                            <Wind size={16} />
                            <span>Real Environmental Data</span>
                          </div>
                          <EvidenceBadge classification="OBSERVED" label="REAL ENVIRONMENTAL DATA" size="xs" />
                        </div>

                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div>
                            <strong>ECMWF ERA5 10m Surface Wind:</strong> Mean wind speed = <span style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>2.79 m/s</span>
                          </div>
                          <div>
                            <strong>NOAA CRW daily SST analysis:</strong> Mean SST = <span style={{ color: 'var(--accent-amber)', fontWeight: 700 }}>26.30 °C</span>
                          </div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            * Co-registered spatial coverage over subscene extent [72.717°E to 72.774°E, 18.966°N to 19.021°N].
                          </div>
                        </div>
                      </div>

                      {/* Real Drift & AIS Notice Card */}
                      <div className="card" style={{ padding: '16px', background: 'rgba(245, 158, 11, 0.04)', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-amber)', fontWeight: 700, fontSize: '0.85rem', marginBottom: '6px' }}>
                          <Compass size={16} />
                          <span>Drift & AIS Telemetry Status</span>
                        </div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div><strong>Drift Trajectory Model:</strong> NOT RUN FOR THIS REAL SCENE</div>
                          <div><strong>Vessel Attribution:</strong> NOT ESTABLISHED (No real vessel attribution is established for this live scene)</div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* SAR Model Card */}
                      <div className="card" style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-emerald)', fontWeight: 700, fontSize: '0.85rem' }}>
                            <Satellite size={16} />
                            <span>SAR Segmentation Engine</span>
                          </div>
                          <EvidenceBadge type="OBSERVED" size="xs" />
                        </div>

                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div>Model ID: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>unet-dual-pol-sar-v2</strong></div>
                          <div>Modality: Dual-Polarized Sentinel-1 C-Band (VV/VH Backscatter)</div>
                          <div>Inference Resolution: 10m Ground Sample Distance</div>
                          <div>Dark Spot Polygonization: Douglas-Peucker ($\epsilon=0.0001$)</div>
                        </div>
                      </div>

                      {/* Drift Model Card */}
                      <div className="card" style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-amber)', fontWeight: 700, fontSize: '0.85rem' }}>
                            <Compass size={16} />
                            <span>Lagrangian Drift Engine</span>
                          </div>
                          <EvidenceBadge type="MODELLED" size="xs" />
                        </div>

                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div>Engine: <strong style={{ color: 'var(--text-primary)' }}>BUILT-IN DEMONSTRATION LAGRANGIAN MODEL</strong></div>
                          <div>Advection Law: <span style={{ fontFamily: 'var(--font-mono)' }}>V_oil = 1.00 · V_current + 0.03 · V_wind</span></div>
                          <div>MetOcean Forcing: NW Wind (12.4 kts) + SE Current (0.8 kts)</div>
                          <div>Turbulent Diffusion: <span style={{ fontFamily: 'var(--font-mono)' }}>K_h = 5.0 m²/s</span></div>
                          <div>Modelled Origin Uncertainty Radius: <strong style={{ color: 'var(--accent-amber)', fontFamily: 'var(--font-mono)' }}>±2.6 km</strong></div>
                        </div>
                      </div>

                      {/* AIS Attribution Heuristic Card */}
                      <div className="card" style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-purple)', fontWeight: 700, fontSize: '0.85rem' }}>
                            <Ship size={16} />
                            <span>AIS Correlation Heuristic</span>
                          </div>
                          <EvidenceBadge type="DEMONSTRATION" size="xs" />
                        </div>

                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div>Formula: <span style={{ fontFamily: 'var(--font-mono)' }}>S_total = 0.30 · S_prox + 0.25 · S_temp + 0.25 · S_traj + 0.20 · S_anom</span></div>
                          <div>Search Radius: <span style={{ fontFamily: 'var(--font-mono)' }}>R_search = 50.0 km</span> around Modelled Origin</div>
                          <div>Data Source: <strong style={{ color: 'var(--accent-purple)' }}>Demonstration Synthetic AIS (source = 'demo')</strong></div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── TAB 3: INVESTIGATION TIMELINE ──────────────────────────── */}
              {activeTab === 'timeline' && (
                <InvestigationTimeline
                  spill={spill}
                  driftData={driftData}
                  candidateVessels={candidateVessels}
                  onFocusTarget={handleFocusTarget}
                />
              )}

              {/* ── TAB 4: ANALYTICAL INVESTIGATION DOSSIER ─────────────────── */}
              {activeTab === 'dossier' && (
                <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FileText size={16} style={{ color: 'var(--accent-cyan)' }} />
                      <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                        {isRealScene ? 'Real-Scene Observational Dossier' : 'Investigation Dossier'}
                      </h3>
                    </div>

                    <button
                      onClick={handleGenerateDossier}
                      disabled={isGeneratingDossier || (!spill && !job?.analysisId && !jobId)}
                      className="btn-primary"
                      style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                      aria-label="Synthesize Analytical Dossier"
                    >
                      {isGeneratingDossier ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <LoadingSpinner size={12} />
                          <span>Synthesizing...</span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Sparkles size={12} />
                          <span>
                            {dossierResult
                              ? 'Regenerate'
                              : isRealScene
                              ? 'GENERATE REAL-SCENE DOSSIER'
                              : 'Generate'}
                          </span>
                        </div>
                      )}
                    </button>
                  </div>

                  {dossierResult?.dossier ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {/* Evidence Classification Badge */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {dossierResult.title || (isRealScene ? 'Real-Scene Observational Dossier' : 'Analytical Investigation Dossier')}
                        </span>
                        <EvidenceBadge
                          classification={isRealScene ? 'OBSERVED' : 'MODELLED'}
                          label={isRealScene ? 'REAL-SCENE EVIDENCE' : 'MODELLED SYNTHESIS'}
                          size="xs"
                        />
                      </div>

                      {/* Executive Summary */}
                      <div style={{ background: 'var(--surface-sunken)', padding: '12px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase', marginBottom: '4px' }}>
                          Executive Summary
                        </div>
                        <p style={{ margin: 0, fontSize: '0.78rem', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                          {dossierResult.dossier.executiveSummary}
                        </p>
                      </div>

                      {/* Observed Evidence List for Real Scene */}
                      {isRealScene && dossierResult.dossier.observedEvidence?.length > 0 && (
                        <div style={{ background: 'var(--surface-sunken)', padding: '12px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-emerald)', textTransform: 'uppercase', marginBottom: '6px' }}>
                            Observed & Provenance Evidence
                          </div>
                          <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            {dossierResult.dossier.observedEvidence.map((obs, idx) => (
                              <li key={idx}>{obs}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Modelled Evidence List for Real Scene */}
                      {isRealScene && dossierResult.dossier.modelledEvidence?.length > 0 && (
                        <div style={{ background: 'var(--surface-sunken)', padding: '12px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-amber)', textTransform: 'uppercase', marginBottom: '6px' }}>
                            AI Baseline & Environmental Context
                          </div>
                          <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            {dossierResult.dossier.modelledEvidence.map((item, idx) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Top Candidate Assessment (Only if candidates exist in demo mode) */}
                      {!isRealScene && dossierResult.dossier.candidateAssessments?.[0] && (
                        <div style={{ background: 'var(--surface-sunken)', padding: '12px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-amber)', textTransform: 'uppercase', marginBottom: '4px' }}>
                            Top Correlated Candidate
                          </div>
                          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {dossierResult.dossier.candidateAssessments[0].candidateVessel}
                          </div>
                          <p style={{ margin: '4px 0 0', fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            {dossierResult.dossier.candidateAssessments[0].summary}
                          </p>
                        </div>
                      )}

                      {/* Limitations & Scientific Disclaimer */}
                      {dossierResult.dossier.limitations?.length > 0 && (
                        <div style={{ background: 'var(--surface-sunken)', padding: '10px 12px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase', fontSize: '0.68rem' }}>
                            Investigation Limitations
                          </div>
                          <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {dossierResult.dossier.limitations.map((lim, idx) => (
                              <li key={idx}>{lim}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Link
                          to="/reports"
                          className="btn-secondary"
                          style={{ flex: 1, padding: '6px 10px', fontSize: '0.75rem', textAlign: 'center', textDecoration: 'none' }}
                        >
                          Full Dossier Archive
                        </Link>
                        <button
                          onClick={() => window.print()}
                          className="btn-secondary"
                          style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                          aria-label="Print Dossier"
                        >
                          <Printer size={13} />
                        </button>
                      </div>
                    </div>
                  ) : dossierError ? (
                    <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '4px', padding: '16px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: 'var(--accent-rose)', fontWeight: 700, fontSize: '0.85rem' }}>
                        <AlertCircle size={16} />
                        <span>INVESTIGATION DOSSIER — Generation Unavailable</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {dossierError}
                      </p>
                    </div>
                  ) : isRealScene ? (
                    <div style={{ textAlign: 'center', padding: '24px 14px', background: 'var(--surface-sunken)', borderRadius: '4px', border: '1px dashed var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                      <FileText size={28} style={{ color: 'var(--accent-cyan)', opacity: 0.8 }} />
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.86rem' }}>
                        DOSSIER NOT GENERATED
                      </div>
                      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.76rem', lineHeight: 1.5, maxWidth: '380px' }}>
                        Generate an observational investigation dossier from the verified real-scene evidence.
                      </p>
                      <button
                        onClick={handleGenerateDossier}
                        disabled={isGeneratingDossier}
                        className="btn-primary"
                        style={{ fontSize: '0.74rem', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Sparkles size={13} />
                        <span>GENERATE REAL-SCENE DOSSIER</span>
                      </button>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                      Click "Generate" to synthesize pre-computed SAR observation, Lagrangian reverse hindcast, and AIS candidate rankings into an evidentiary dossier.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {loadingResults && <LoadingSpinner message="Assembling geospatial layers and candidate vessel telemetry..." />}

      {/* ── SAR EVIDENCE & SOURCE IMAGE VIEWER MODAL ───────────────────────── */}
      <SarEvidenceViewer
        isOpen={isSarEvidenceOpen}
        onClose={() => setIsSarEvidenceOpen(false)}
        spill={spill}
        scene={spill?.analysis?.scene}
        evidence={dossierResult?.evidence}
        onShowOnMap={() => {
          setMapMode('sar');
          handleFocusIncident();
        }}
      />
    </div>
  );
}
