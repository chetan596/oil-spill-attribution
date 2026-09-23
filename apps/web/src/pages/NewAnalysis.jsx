import React, { useState } from 'react';
import { useNavigate, Link, useSearchParams, useLocation } from 'react-router-dom';
import { jobsApi } from '../api/jobs.api';
import Sentinel1AcquisitionPanel from '../components/analysis/Sentinel1AcquisitionPanel';
import ErrorMessage from '../components/common/ErrorMessage';
import {
  Satellite,
  Clock,
  Play,
  Info,
  AlertCircle,
  Radio,
  ShieldCheck,
  Compass,
  Layers,
  CheckCircle2,
  Ship,
  Sparkles,
  ArrowRight,
  Database,
  ArrowLeft,
  Calendar,
  Globe,
  Sliders,
  Check,
  FileCode,
  HardDrive,
  Cpu,
  RefreshCw,
  Search,
  CheckSquare,
} from 'lucide-react';

function formatBbox(bbox) {
  if (!bbox || !Array.isArray(bbox) || bbox.length < 4) return '72.50°E – 73.20°E · 18.50°N – 19.20°N';
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const lonStr = `${Math.abs(minLon).toFixed(2)}°${minLon >= 0 ? 'E' : 'W'} – ${Math.abs(maxLon).toFixed(2)}°${maxLon >= 0 ? 'E' : 'W'}`;
  const latStr = `${Math.abs(minLat).toFixed(2)}°${minLat >= 0 ? 'N' : 'S'} – ${Math.abs(maxLat).toFixed(2)}°${maxLat >= 0 ? 'N' : 'S'}`;
  return `${lonStr} · ${latStr}`;
}

export default function NewAnalysis() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  // Mode Selection: 'demo' | 'cdse'
  const [dataSource, setDataSource] = useState(() => {
    if (searchParams.get('source') === 'cdse' || location.pathname === '/sentinel1') {
      return 'cdse';
    }
    return 'demo';
  });

  // Step 1: Mission Context
  const [missionId, setMissionId] = useState(() => `OG-MISSION-${Date.now().toString().slice(-5)}`);
  const [selectedScenarioId, setSelectedScenarioId] = useState('demo-scene-001');

  // Step 2: SAR Acquisition Filter & Selection
  const [selectedProductIndex, setSelectedProductIndex] = useState(0);
  const [isSearchingAcquisitions, setIsSearchingAcquisitions] = useState(false);
  const [acquisitionFilterPolarization, setAcquisitionFilterPolarization] = useState('VV+VH');

  // Step 3: Processing Parameters
  const [timeWindowHours, setTimeWindowHours] = useState(24);
  const [decisionThreshold, setDecisionThreshold] = useState(0.50);

  // Step 4: Dispatch State & Error
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dispatchResult, setDispatchResult] = useState(null);
  const [error, setError] = useState(null);

  const demoScenarios = [
    {
      id: 'demo-scene-001',
      name: '001 — Mumbai Offshore Corridor',
      region: 'Arabian Sea / Mumbai High',
      aoi: 'mumbai',
      bbox: [72.500, 18.500, 73.200, 19.200],
      sceneProduct: 'S1A_IW_GRDH_1SDV_20240218T010329_052606_065D1D_MUMBAI_COG',
      platform: 'Sentinel-1A',
      mode: 'IW GRD',
      orbit: 'DESCENDING (Pass 65)',
      relOrbit: 65,
      acquisitionTime: '18 Feb 2024 · 01:03:29 UTC',
      fileSize: '954 MB',
      resolution: '10m Pixel Spacing',
      polarization: 'VV + VH',
      desc: 'High-density tanker transit corridor off Mumbai High with correlated candidate discharge.',
    },
    {
      id: 'demo-scene-002',
      name: '002 — Gulf of Kutch Marine Sanctuary',
      region: 'Gulf of Kutch / Gujarat',
      aoi: 'kutch',
      bbox: [68.800, 22.300, 70.200, 23.000],
      sceneProduct: 'S1A_IW_GRDH_1SDV_20240214T131015_052555_065B90_KUTCH_COG',
      platform: 'Sentinel-1A',
      mode: 'IW GRD',
      orbit: 'ASCENDING (Pass 12)',
      relOrbit: 12,
      acquisitionTime: '14 Feb 2024 · 13:10:15 UTC',
      fileSize: '918 MB',
      resolution: '10m Pixel Spacing',
      polarization: 'VV + VH',
      desc: 'Crude carrier deepwater lane with complex tidal advection and mangrove boundary protection.',
    },
    {
      id: 'demo-scene-003',
      name: '003 — Bay of Bengal / Paradip Port',
      region: 'Bay of Bengal / Odisha',
      aoi: 'bengal',
      bbox: [86.400, 19.800, 87.200, 20.600],
      sceneProduct: 'S1B_IW_GRDH_1SDV_20240211T234510_041920_050E11_PARADIP_COG',
      platform: 'Sentinel-1B',
      mode: 'IW GRD',
      orbit: 'DESCENDING (Pass 104)',
      relOrbit: 104,
      acquisitionTime: '11 Feb 2024 · 23:45:10 UTC',
      fileSize: '982 MB',
      resolution: '10m Pixel Spacing',
      polarization: 'VV + VH',
      desc: 'Bulk carrier anchorage sector with high wind-driven surface dispersion and cyclonic vectors.',
    },
    {
      id: 'demo-scene-004',
      name: '004 — Goa / Malabar Coastal Corridor',
      region: 'Malabar Coast / Karnataka-Goa',
      aoi: 'malabar',
      bbox: [73.400, 14.800, 74.300, 15.600],
      sceneProduct: 'S1A_IW_GRDH_1SDV_20240208T005218_052460_065842_MALABAR_COG',
      platform: 'Sentinel-1A',
      mode: 'IW GRD',
      orbit: 'DESCENDING (Pass 65)',
      relOrbit: 65,
      acquisitionTime: '08 Feb 2024 · 00:52:18 UTC',
      fileSize: '936 MB',
      resolution: '10m Pixel Spacing',
      polarization: 'VV + VH',
      desc: 'Coastal transit fairway with high fishing density and biogenic surfactant look-alike features.',
    },
  ];

  const currentScenario = demoScenarios.find((s) => s.id === selectedScenarioId) || demoScenarios[0];

  const candidateScenes = [
    {
      name: currentScenario.sceneProduct,
      platform: currentScenario.platform,
      mode: currentScenario.mode,
      orbit: currentScenario.orbit,
      date: currentScenario.acquisitionTime,
      pol: currentScenario.polarization,
      size: currentScenario.fileSize,
      confidenceScore: '94.2%',
    },
    {
      name: `${currentScenario.sceneProduct.slice(0, 32)}_CYCLE_12D_PRIOR_COG`,
      platform: 'Sentinel-1A',
      mode: 'IW GRD',
      orbit: 'ASCENDING (Pass 12)',
      date: 'Prior Repeat Orbit (−12 Days)',
      pol: 'VV + VH',
      size: '912 MB',
      confidenceScore: '81.5%',
    },
  ];

  const handleScenarioSelect = (scenarioId) => {
    setSelectedScenarioId(scenarioId);
    setSelectedProductIndex(0);
  };

  const handleSimulatedSearch = () => {
    setIsSearchingAcquisitions(true);
    setTimeout(() => {
      setIsSearchingAcquisitions(false);
    }, 450);
  };

  const handleDispatch = async (e) => {
    if (e) e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await jobsApi.create({
        sarSceneId: selectedScenarioId,
        timeWindowHours: Number(timeWindowHours) || 24,
        confidenceThreshold: Number(decisionThreshold) || 0.50,
      });

      const jobId = response?.jobId || response?.data?.jobId || response?.data?.id || selectedScenarioId;
      setDispatchResult({ jobId });

      // Immediate redirect or brief verification
      setTimeout(() => {
        navigate(`/analysis/${selectedScenarioId}?jobId=${jobId}`);
      }, 700);
    } catch (err) {
      setError(err.message || 'Failed to dispatch mission pipeline to BullMQ queue');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#0A0B0D',
        minHeight: '100%',
        padding: '14px 20px',
        color: '#FFFFFF',
        fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div style={{ maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* ========================================================================= */}
        {/* 1. COMPACT PAGE HEADER */}
        {/* ========================================================================= */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            paddingBottom: '12px',
            borderBottom: '1px solid #20242A',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Link
                to="/dashboard"
                style={{
                  color: '#777E87',
                  textDecoration: 'none',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ECEEF1')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#777E87')}
              >
                <ArrowLeft size={12} /> OVERVIEW
              </Link>
              <span style={{ color: '#555C65' }}>/</span>
              <span
                style={{
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: '#49C6C8',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  backgroundColor: 'rgba(73, 198, 200, 0.1)',
                  border: '1px solid rgba(73, 198, 200, 0.25)',
                }}
              >
                MISSION DISPATCH & SATELLITE INGESTION
              </span>
            </div>

            <h1 style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: '18px', fontWeight: 600, color: '#ECEEF1', margin: '2px 0 0 0', letterSpacing: '-0.02em' }}>
              NEW MISSION
            </h1>
            <p style={{ fontSize: '11.5px', color: '#8E96A4', margin: 0, maxWidth: '680px', lineHeight: 1.4 }}>
              Create and dispatch an oil-spill investigation pipeline across satellite SAR, MetOcean drift, and AIS correlation.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 8px',
                borderRadius: '4px',
                backgroundColor: '#121417',
                border: '1px solid #25292F',
                fontSize: '10.5px',
                fontFamily: 'monospace',
              }}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22C55E' }} />
              <span style={{ color: '#B1B6BD' }}>SYSTEM READY</span>
            </div>

            <div
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                backgroundColor: '#121417',
                border: '1px solid #25292F',
                fontSize: '10.5px',
                fontFamily: 'monospace',
                color: '#49C6C8',
              }}
            >
              {currentScenario.region.split('/')[0].trim()}
            </div>

            <div
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                backgroundColor: dataSource === 'demo' ? 'rgba(168, 85, 247, 0.12)' : 'rgba(73, 198, 200, 0.12)',
                border: `1px solid ${dataSource === 'demo' ? 'rgba(168, 85, 247, 0.3)' : 'rgba(73, 198, 200, 0.3)'}`,
                fontSize: '10.5px',
                fontFamily: 'monospace',
                fontWeight: 600,
                color: dataSource === 'demo' ? '#C084FC' : '#49C6C8',
              }}
            >
              {dataSource === 'demo' ? 'DEMONSTRATION / BENCHMARK' : 'CDSE AUTHENTICATED'}
            </div>

            <Link
              to="/analysis/manual"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '4px',
                backgroundColor: 'rgba(73, 198, 200, 0.12)',
                border: '1px solid rgba(73, 198, 200, 0.3)',
                color: '#49C6C8',
                fontSize: '10.5px',
                fontFamily: 'monospace',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              MANUAL SAR UPLOAD →
            </Link>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. FOUR-STAGE WORKFLOW STRIP */}
        {/* ========================================================================= */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            backgroundColor: '#101216',
            borderRadius: '6px',
            border: '1px solid #20242A',
            overflow: 'hidden',
          }}
        >
          {/* Step 1 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderRight: '1px solid #20242A',
              backgroundColor: '#14171C',
            }}
          >
            <span
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                backgroundColor: '#1D2025',
                border: '1px solid #343940',
                color: '#ECEEF1',
                fontWeight: 700,
                fontSize: '10px',
                fontFamily: 'monospace',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              01
            </span>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#ECEEF1', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                CONTEXT
              </span>
              <span style={{ fontSize: '9.5px', color: '#4ADE80', fontFamily: 'monospace', display: 'block', fontWeight: 600 }}>
                READY &bull; CONFIGURED
              </span>
            </div>
          </div>

          {/* Step 2 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderRight: '1px solid #20242A',
              backgroundColor: '#14171C',
            }}
          >
            <span
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                backgroundColor: 'rgba(73, 198, 200, 0.12)',
                border: '1px solid rgba(73, 198, 200, 0.3)',
                color: '#49C6C8',
                fontWeight: 700,
                fontSize: '10px',
                fontFamily: 'monospace',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              02
            </span>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#ECEEF1', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                SAR ACQUISITION
              </span>
              <span style={{ fontSize: '9.5px', color: '#49C6C8', fontFamily: 'monospace', display: 'block', fontWeight: 600 }}>
                OBSERVED &bull; SELECTED
              </span>
            </div>
          </div>

          {/* Step 3 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderRight: '1px solid #20242A',
              backgroundColor: '#14171C',
            }}
          >
            <span
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                backgroundColor: 'rgba(231, 166, 58, 0.12)',
                border: '1px solid rgba(231, 166, 58, 0.3)',
                color: '#E7A63A',
                fontWeight: 700,
                fontSize: '10px',
                fontFamily: 'monospace',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              03
            </span>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#ECEEF1', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                PROCESSING
              </span>
              <span style={{ fontSize: '9.5px', color: '#E7A63A', fontFamily: 'monospace', display: 'block', fontWeight: 600 }}>
                MODELLED &bull; 3 STAGES
              </span>
            </div>
          </div>

          {/* Step 4 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              backgroundColor: '#14171C',
            }}
          >
            <span
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                backgroundColor: 'rgba(168, 85, 247, 0.12)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                color: '#C084FC',
                fontWeight: 700,
                fontSize: '10px',
                fontFamily: 'monospace',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              04
            </span>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#ECEEF1', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                REVIEW & DISPATCH
              </span>
              <span style={{ fontSize: '9.5px', color: '#4ADE80', fontFamily: 'monospace', display: 'block', fontWeight: 600 }}>
                DISPATCH READY
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SOURCE MODE SWITCH */}
        {/* ========================================================================= */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '10.5px', fontFamily: 'monospace', fontWeight: 700, color: '#8E96A4', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              SOURCE
            </span>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: '#0C0E11',
                border: '1px solid #25292F',
                padding: '3px',
                borderRadius: '6px',
              }}
            >
              <button
                type="button"
                onClick={() => setDataSource('demo')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  borderRadius: '4px',
                  border: dataSource === 'demo' ? '1px solid #343940' : '1px solid transparent',
                  backgroundColor: dataSource === 'demo' ? '#1D2025' : 'transparent',
                  color: dataSource === 'demo' ? '#ECEEF1' : '#777E87',
                  fontSize: '11px',
                  fontWeight: dataSource === 'demo' ? 600 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Radio size={12} style={{ color: dataSource === 'demo' ? '#A855F7' : '#777E87' }} />
                <span>BENCHMARK / DEMO</span>
              </button>

              <button
                type="button"
                onClick={() => setDataSource('cdse')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  borderRadius: '4px',
                  border: dataSource === 'cdse' ? '1px solid rgba(73, 198, 200, 0.4)' : '1px solid transparent',
                  backgroundColor: dataSource === 'cdse' ? '#1D2025' : 'transparent',
                  color: dataSource === 'cdse' ? '#ECEEF1' : '#777E87',
                  fontSize: '11px',
                  fontWeight: dataSource === 'cdse' ? 600 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <ShieldCheck size={12} style={{ color: dataSource === 'cdse' ? '#49C6C8' : '#777E87' }} />
                <span>REAL CDSE</span>
              </button>
            </div>
          </div>

          <div>
            {dataSource === 'demo' ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(168, 85, 247, 0.12)',
                  border: '1px solid rgba(168, 85, 247, 0.25)',
                  fontSize: '10.5px',
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  color: '#C084FC',
                }}
              >
                <Radio size={11} />
                <span>DEMONSTRATION / BENCHMARK</span>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(73, 198, 200, 0.12)',
                  border: '1px solid rgba(73, 198, 200, 0.3)',
                  fontSize: '10.5px',
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  color: '#49C6C8',
                }}
              >
                <ShieldCheck size={11} />
                <span>REAL CDSE AUTHENTICATED</span>
              </div>
            )}
          </div>
        </div>

        {error && <ErrorMessage title="Pipeline Dispatch Error" message={error} />}

        {dataSource === 'cdse' ? (
          /* Copernicus STAC Interface */
          <Sentinel1AcquisitionPanel />
        ) : (
          /* ========================================================================= */
          /* 3. MAIN WORKSPACE (2-COLUMN LAYOUT: ~65% LEFT / ~35% RIGHT) */
          /* ========================================================================= */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.85fr) minmax(320px, 1fr)',
              gap: '12px',
              alignItems: 'start',
            }}
          >
            {/* ===================================================================== */}
            {/* LEFT WORKSPACE (~65%) */}
            {/* ===================================================================== */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* 4. LEFT — MISSION CONTEXT CARD */}
              <div
                style={{
                  backgroundColor: '#121417',
                  border: '1px solid #25292F',
                  borderRadius: '6px',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #20242A', paddingBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        padding: '2px 6px',
                        backgroundColor: 'rgba(168, 85, 247, 0.12)',
                        border: '1px solid rgba(168, 85, 247, 0.25)',
                        color: '#C084FC',
                        fontSize: '10px',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        borderRadius: '3px',
                      }}
                    >
                      01
                    </span>
                    <h2 style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: '12px', fontWeight: 600, color: '#ECEEF1', margin: 0, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      MISSION CONTEXT
                    </h2>
                  </div>
                  <span style={{ fontSize: '10.5px', color: '#777E87', fontFamily: 'monospace' }}>
                    Target &amp; Scenario Configuration
                  </span>
                </div>

                {/* Structured Metadata Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {/* Mission ID Input */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', color: '#8E96A4' }}>
                      MISSION ID
                    </label>
                    <input
                      type="text"
                      value={missionId}
                      onChange={(e) => setMissionId(e.target.value)}
                      style={{
                        width: '100%',
                        height: '32px',
                        backgroundColor: '#0C0E11',
                        border: '1px solid #25292F',
                        borderRadius: '4px',
                        padding: '0 8px',
                        color: '#ECEEF1',
                        fontFamily: 'monospace',
                        fontSize: '11.5px',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  {/* Operational Scenario Selector */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', color: '#8E96A4' }}>
                      OPERATIONAL SCENARIO
                    </label>
                    <select
                      value={selectedScenarioId}
                      onChange={(e) => handleScenarioSelect(e.target.value)}
                      style={{
                        width: '100%',
                        height: '32px',
                        backgroundColor: '#0C0E11',
                        border: '1px solid #25292F',
                        borderRadius: '4px',
                        padding: '0 8px',
                        color: '#ECEEF1',
                        fontFamily: 'monospace',
                        fontSize: '11.5px',
                        outline: 'none',
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                      }}
                    >
                      {demoScenarios.map((sc) => (
                        <option key={sc.id} value={sc.id}>
                          {sc.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Data Source Display */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', color: '#8E96A4' }}>
                      DATA SOURCE
                    </label>
                    <div
                      style={{
                        height: '32px',
                        backgroundColor: '#0C0E11',
                        border: '1px solid #25292F',
                        borderRadius: '4px',
                        padding: '0 8px',
                        color: '#C084FC',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        boxSizing: 'border-box',
                      }}
                    >
                      [ DEMO BENCHMARK CORPUS ]
                    </div>
                  </div>

                  {/* AOI Bounding Coordinates */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', color: '#8E96A4' }}>
                      AOI BOUNDING BOX (WGS84)
                    </label>
                    <div
                      style={{
                        height: '32px',
                        backgroundColor: '#0C0E11',
                        border: '1px solid #25292F',
                        borderRadius: '4px',
                        padding: '0 8px',
                        color: '#49C6C8',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        boxSizing: 'border-box',
                        overflow: 'hidden',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {formatBbox(currentScenario.bbox)}
                      </span>
                      <span style={{ color: '#555C65', fontSize: '9.5px', marginLeft: '6px', flexShrink: 0 }}>
                        EPSG:4326
                      </span>
                    </div>
                  </div>
                </div>

                {/* 5. PROVENANCE STRIP */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '8px',
                    padding: '6px 10px',
                    borderRadius: '4px',
                    backgroundColor: '#0C0E11',
                    border: '1px solid #25292F',
                    fontSize: '10.5px',
                    fontFamily: 'monospace',
                  }}
                >
                  <div>
                    <span style={{ color: '#777E87', display: 'block', fontSize: '9px' }}>SAR</span>
                    <strong style={{ color: '#49C6C8' }}>OBSERVED</strong>
                  </div>
                  <div>
                    <span style={{ color: '#777E87', display: 'block', fontSize: '9px' }}>DRIFT</span>
                    <strong style={{ color: '#E7A63A' }}>MODELLED</strong>
                  </div>
                  <div>
                    <span style={{ color: '#777E87', display: 'block', fontSize: '9px' }}>AIS</span>
                    <strong style={{ color: '#C084FC' }}>DEMO</strong>
                  </div>
                  <div>
                    <span style={{ color: '#777E87', display: 'block', fontSize: '9px' }}>METOCEAN</span>
                    <strong style={{ color: '#777E87' }}>DEMO</strong>
                  </div>
                </div>
              </div>

              {/* 6. LEFT — SENTINEL-1 ACQUISITION */}
              <div
                style={{
                  backgroundColor: '#121417',
                  border: '1px solid #25292F',
                  borderRadius: '6px',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #20242A', paddingBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        padding: '2px 6px',
                        backgroundColor: 'rgba(73, 198, 200, 0.12)',
                        border: '1px solid rgba(73, 198, 200, 0.25)',
                        color: '#49C6C8',
                        fontSize: '10px',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        borderRadius: '3px',
                      }}
                    >
                      02
                    </span>
                    <h2 style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: '12px', fontWeight: 600, color: '#ECEEF1', margin: 0, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      SENTINEL-1 ACQUISITION
                    </h2>
                  </div>
                  <span style={{ fontSize: '10.5px', color: '#777E87', fontFamily: 'monospace' }}>
                    Select an available Level-1 GRD SAR observation
                  </span>
                </div>

                {/* Filter / Search Bar */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '8px',
                    padding: '8px 10px',
                    backgroundColor: '#0C0E11',
                    border: '1px solid #25292F',
                    borderRadius: '4px',
                    fontSize: '10.5px',
                    fontFamily: 'monospace',
                  }}
                >
                  <div>
                    <span style={{ color: '#777E87', display: 'block', fontSize: '9px', marginBottom: '2px' }}>AOI REGION</span>
                    <strong style={{ color: '#ECEEF1' }}>{currentScenario.region.split('/')[0].trim()}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#777E87', display: 'block', fontSize: '9px', marginBottom: '2px' }}>INSTRUMENT</span>
                    <strong style={{ color: '#ECEEF1' }}>C-Band SAR (IW)</strong>
                  </div>
                  <div>
                    <span style={{ color: '#777E87', display: 'block', fontSize: '9px', marginBottom: '2px' }}>POLARIZATION</span>
                    <strong style={{ color: '#49C6C8' }}>VV + VH (Dual-Pol)</strong>
                  </div>
                  <div>
                    <span style={{ color: '#777E87', display: 'block', fontSize: '9px', marginBottom: '2px' }}>RESOLUTION</span>
                    <strong style={{ color: '#49C6C8' }}>10m GRD Pixels</strong>
                  </div>
                </div>

                {/* 7. ACQUISITION RESULTS (Cards/Rows) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {isSearchingAcquisitions ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#777E87', fontSize: '11px', fontFamily: 'monospace' }}>
                      <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto 6px', color: '#49C6C8' }} />
                      <span>Querying available Level-1 GRD SAR products...</span>
                    </div>
                  ) : (
                    candidateScenes.map((scene, idx) => {
                      const isSelected = selectedProductIndex === idx;

                      return (
                        <div
                          key={idx}
                          onClick={() => setSelectedProductIndex(idx)}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '4px',
                            backgroundColor: isSelected ? '#171A1E' : '#0C0E11',
                            border: isSelected ? '1px solid #38BDF8' : '1px solid #25292F',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 600, color: isSelected ? '#ECEEF1' : '#B1B6BD' }}>
                              {scene.name}
                            </span>
                            <span
                              style={{
                                fontSize: '9.5px',
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: '3px',
                                backgroundColor: isSelected ? 'rgba(73, 198, 200, 0.15)' : '#1D2025',
                                color: isSelected ? '#49C6C8' : '#777E87',
                                border: isSelected ? '1px solid rgba(73, 198, 200, 0.35)' : '1px solid #343940',
                              }}
                            >
                              {isSelected ? 'SELECTED' : 'SELECT'}
                            </span>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10.5px', color: '#777E87', fontFamily: 'monospace', flexWrap: 'wrap', gap: '6px' }}>
                            <span>{scene.date}</span>
                            <span>{scene.mode} &bull; {scene.pol} &bull; {scene.orbit}</span>
                            <span style={{ color: '#49C6C8' }}>{scene.size}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 8. LEFT — PROCESSING PIPELINE */}
              <div
                style={{
                  backgroundColor: '#121417',
                  border: '1px solid #25292F',
                  borderRadius: '6px',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #20242A', paddingBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        padding: '2px 6px',
                        backgroundColor: 'rgba(231, 166, 58, 0.12)',
                        border: '1px solid rgba(231, 166, 58, 0.25)',
                        color: '#E7A63A',
                        fontSize: '10px',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        borderRadius: '3px',
                      }}
                    >
                      03
                    </span>
                    <h2 style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: '12px', fontWeight: 600, color: '#ECEEF1', margin: 0, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      PROCESSING PIPELINE
                    </h2>
                  </div>
                  <span style={{ fontSize: '10.5px', color: '#777E87', fontFamily: 'monospace' }}>
                    Automated Multi-Stage Forensic Ingestion
                  </span>
                </div>

                {/* 4 Compact Rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {/* Stage 1 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', backgroundColor: '#0C0E11', border: '1px solid #25292F', borderRadius: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Satellite size={15} style={{ color: '#49C6C8' }} />
                      <div>
                        <strong style={{ fontSize: '11.5px', color: '#ECEEF1', display: 'block' }}>01 SAR DETECTION</strong>
                        <span style={{ fontSize: '10px', color: '#777E87' }}>Dual-Pol VV + VH segmentation &bull; U-Net V2.1 inference</span>
                      </div>
                    </div>
                    <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#4ADE80', fontWeight: 600 }}>
                      ✓ READY
                    </span>
                  </div>

                  {/* Stage 2 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', backgroundColor: '#0C0E11', border: '1px solid #25292F', borderRadius: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Compass size={15} style={{ color: '#E7A63A' }} />
                      <div>
                        <strong style={{ fontSize: '11.5px', color: '#ECEEF1', display: 'block' }}>02 REVERSE DRIFT</strong>
                        <span style={{ fontSize: '10px', color: '#777E87' }}>Lagrangian hindcast advection ({timeWindowHours}h window) &bull; Origin ellipse</span>
                      </div>
                    </div>
                    <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#E7A63A', fontWeight: 600 }}>
                      ● CONFIGURED
                    </span>
                  </div>

                  {/* Stage 3 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', backgroundColor: '#0C0E11', border: '1px solid #25292F', borderRadius: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Ship size={15} style={{ color: '#A855F7' }} />
                      <div>
                        <strong style={{ fontSize: '11.5px', color: '#ECEEF1', display: 'block' }}>03 AIS CORRELATION</strong>
                        <span style={{ fontSize: '10px', color: '#777E87' }}>Candidate vessel matching &bull; CPA proximity ranking</span>
                      </div>
                    </div>
                    <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#C084FC', fontWeight: 600 }}>
                      ● CONFIGURED
                    </span>
                  </div>

                  {/* Stage 4 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', backgroundColor: '#0C0E11', border: '1px solid #25292F', borderRadius: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Database size={15} style={{ color: '#777E87' }} />
                      <div>
                        <strong style={{ fontSize: '11.5px', color: '#ECEEF1', display: 'block' }}>04 ANALYSIS WORKSPACE</strong>
                        <span style={{ fontSize: '10px', color: '#777E87' }}>Interactive investigation console &bull; Dossier generation</span>
                      </div>
                    </div>
                    <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#777E87', fontWeight: 600 }}>
                      ○ PENDING DISPATCH
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ===================================================================== */}
            {/* RIGHT CONTROL PANEL (~35%) */}
            {/* ===================================================================== */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* 9. RIGHT — SELECTED SCENE CARD */}
              <div
                style={{
                  backgroundColor: '#121417',
                  border: '1px solid #25292F',
                  borderRadius: '6px',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #20242A', paddingBottom: '8px' }}>
                  <Satellite size={14} style={{ color: '#49C6C8' }} />
                  <h3 style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: '11.5px', fontWeight: 600, color: '#ECEEF1', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    SELECTED SCENE
                  </h3>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '10.5px', fontFamily: 'monospace' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #20242A', paddingBottom: '4px' }}>
                    <span style={{ color: '#777E87' }}>PRODUCT</span>
                    <strong style={{ color: '#ECEEF1', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {candidateScenes[selectedProductIndex].name}
                    </strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #20242A', paddingBottom: '4px' }}>
                    <span style={{ color: '#777E87' }}>ACQUISITION</span>
                    <strong style={{ color: '#ECEEF1' }}>{candidateScenes[selectedProductIndex].date}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #20242A', paddingBottom: '4px' }}>
                    <span style={{ color: '#777E87' }}>SENSOR</span>
                    <strong style={{ color: '#ECEEF1' }}>{candidateScenes[selectedProductIndex].platform} (C-Band)</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #20242A', paddingBottom: '4px' }}>
                    <span style={{ color: '#777E87' }}>MODE</span>
                    <strong style={{ color: '#ECEEF1' }}>{candidateScenes[selectedProductIndex].mode}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #20242A', paddingBottom: '4px' }}>
                    <span style={{ color: '#777E87' }}>POLARIZATION</span>
                    <strong style={{ color: '#49C6C8' }}>{candidateScenes[selectedProductIndex].pol}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #20242A', paddingBottom: '4px' }}>
                    <span style={{ color: '#777E87' }}>ORBIT</span>
                    <strong style={{ color: '#E7A63A' }}>{candidateScenes[selectedProductIndex].orbit}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#777E87' }}>PROVENANCE</span>
                    <strong style={{ color: '#C084FC' }}>BENCHMARK CORPUS</strong>
                  </div>
                </div>
              </div>

              {/* 10. RIGHT — HINDCAST PARAMETERS */}
              <div
                style={{
                  backgroundColor: '#121417',
                  border: '1px solid #25292F',
                  borderRadius: '6px',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #20242A', paddingBottom: '8px' }}>
                  <Sliders size={14} style={{ color: '#E7A63A' }} />
                  <h3 style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: '11.5px', fontWeight: 600, color: '#ECEEF1', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    PROCESSING PARAMETERS
                  </h3>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '10.5px', color: '#8E96A4', fontFamily: 'monospace' }}>
                    REVERSE HINDCAST WINDOW
                  </label>

                  {/* Preset Buttons [6h] [24h STANDARD] [48h] [72h] */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                    {[6, 24, 48, 72].map((hours) => {
                      const isActive = timeWindowHours === hours;
                      return (
                        <button
                          key={hours}
                          type="button"
                          onClick={() => setTimeWindowHours(hours)}
                          style={{
                            padding: '6px 4px',
                            borderRadius: '4px',
                            border: `1px solid ${isActive ? '#343940' : '#25292F'}`,
                            backgroundColor: isActive ? '#1D2025' : '#0C0E11',
                            color: isActive ? '#ECEEF1' : '#777E87',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {hours}h{hours === 24 ? ' ★' : ''}
                        </button>
                      );
                    })}
                  </div>

                  <span style={{ fontSize: '9.5px', color: '#777E87', fontFamily: 'monospace' }}>
                    24h is standard for coastal and continental shelf dispersion.
                  </span>
                </div>
              </div>

              {/* 11. RIGHT — DISPATCH READINESS */}
              <div
                style={{
                  backgroundColor: '#121417',
                  border: '1px solid #25292F',
                  borderRadius: '6px',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #20242A', paddingBottom: '8px' }}>
                  <ShieldCheck size={14} style={{ color: '#4ADE80' }} />
                  <h3 style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: '11.5px', fontWeight: 600, color: '#ECEEF1', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    DISPATCH READINESS
                  </h3>
                </div>

                {/* Readiness Status Checklist */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '10.5px', fontFamily: 'monospace' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#777E87' }}>MISSION CONTEXT</span>
                    <strong style={{ color: '#4ADE80' }}>✓ READY</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#777E87' }}>SAR ACQUISITION</span>
                    <strong style={{ color: '#4ADE80' }}>✓ READY</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#777E87' }}>PROCESSING PLAN</span>
                    <strong style={{ color: '#4ADE80' }}>✓ READY</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#777E87' }}>PROVENANCE</span>
                    <strong style={{ color: '#C084FC' }}>DEMO CORPUS</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px', borderTop: '1px solid #20242A' }}>
                    <span style={{ color: '#777E87' }}>DISPATCH</span>
                    <strong style={{ color: '#4ADE80' }}>READY</strong>
                  </div>
                </div>

                {/* 12. DISPATCH BUTTON */}
                <button
                  type="button"
                  onClick={handleDispatch}
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 16px',
                    borderRadius: '4px',
                    backgroundColor: isSubmitting ? '#1A1E24' : '#9333EA',
                    color: isSubmitting ? '#777E87' : '#FFFFFF',
                    border: isSubmitting ? '1px solid #25292F' : '1px solid #A855F7',
                    fontWeight: 700,
                    fontSize: '12px',
                    letterSpacing: '0.03em',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'background 0.15s ease',
                    boxShadow: isSubmitting ? 'none' : '0 2px 8px rgba(147, 51, 234, 0.3)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSubmitting) e.currentTarget.style.backgroundColor = '#A855F7';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSubmitting) e.currentTarget.style.backgroundColor = '#9333EA';
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>DISPATCHING MISSION...</span>
                    </>
                  ) : (
                    <>
                      <Play size={13} fill="#FFFFFF" />
                      <span>DISPATCH INVESTIGATION</span>
                      <ArrowRight size={13} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
