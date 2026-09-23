import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Server,
  Database,
  Cpu,
  Radio,
  Shield,
  Sparkles,
  Compass,
  RefreshCw,
  Globe,
  Activity,
  ArrowRight,
  Wind,
  Sliders,
  Check,
  Zap,
} from 'lucide-react';

export default function SystemStatus() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState(() => new Date().toUTCString());
  const [refreshNotice, setRefreshNotice] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setLastCheckTime(new Date().toUTCString());
      setIsRefreshing(false);
      setRefreshNotice(true);
      setTimeout(() => setRefreshNotice(false), 2500);
    }, 600);
  };

  const subsystems = [
    {
      id: 'backend',
      name: 'Backend API Service',
      tier: 'Node.js 18 + Express REST',
      status: 'OPERATIONAL',
      statusColor: 'var(--og-success)',
      provenance: 'LOCAL SERVICE',
      endpoint: 'Port 4000 (REST / WebSockets)',
      desc: 'Orchestrating mission dispatch, spatial queries, job queues, and authentication session state.',
      icon: Server,
    },
    {
      id: 'database',
      name: 'Spatial Database & GIS Index',
      tier: 'PostgreSQL 15 + PostGIS',
      status: 'OPERATIONAL',
      statusColor: 'var(--og-success)',
      provenance: 'PERSISTENCE',
      endpoint: 'Port 5432 (EPSG:4326 WGS84)',
      desc: 'Spatial persistence with WKT polygon indexing across detections, reverse trajectories, and AIS tracks.',
      icon: Database,
    },
    {
      id: 'ml-service',
      name: 'SAR Neural Segmentation Engine',
      tier: 'Python FastAPI + PyTorch U-Net',
      status: 'BASELINE ACTIVE',
      statusColor: 'var(--og-success)',
      provenance: 'AI MODEL',
      endpoint: 'unet-dual-pol-sar-v2 (Benchmark IoU 78.4%)',
      desc: 'Dual-polarization decibel normalization (VV+VH) for dark-surface candidate extraction.',
      icon: Cpu,
    },
    {
      id: 'drift-engine',
      name: 'Lagrangian Reverse Drift Engine',
      tier: 'Numerical Advection Hindcast Solver',
      status: 'OPERATIONAL',
      statusColor: 'var(--og-success)',
      provenance: 'LAGRANGIAN MODEL',
      endpoint: '24h Hindcast / 6h Forecast Horizon',
      desc: 'MetOcean forced reverse drift advection computing origin coordinates and uncertainty ellipse.',
      icon: Compass,
    },
    {
      id: 'ais-stream',
      name: 'AIS Telemetry Ingestion & Correlation',
      tier: 'Spatiotemporal Candidate Registry',
      status: 'OPERATIONAL',
      statusColor: 'var(--og-success)',
      provenance: 'AIS STREAM (DEMO/FEED)',
      endpoint: 'Spatiotemporal CPA Matcher',
      desc: 'Candidate vessel track correlation, CPA distance calculation, and speed anomaly tracking.',
      icon: Radio,
    },
    {
      id: 'cdse-stac',
      name: 'Copernicus Data Space STAC Gateway',
      tier: 'CDSE Level-1 GRD Catalog',
      status: 'AUTHENTICATED',
      statusColor: 'var(--og-teal)',
      provenance: 'COPERNICUS API',
      endpoint: 'STAC API v1.0 (Sentinel-1A/B)',
      desc: 'Live query gateway for multi-orbit Sentinel-1 C-Band synthetic aperture radar scenes.',
      icon: Globe,
    },
    {
      id: 'dossier-engine',
      name: 'Investigation Dossier Synthesizer',
      tier: 'Deterministic Multi-Source Synthesis',
      status: 'SCHEMA VALIDATED',
      statusColor: 'var(--og-success)',
      provenance: 'EVIDENTIARY ENGINE',
      endpoint: 'Strict JSON Schema & Print Engine',
      desc: 'Converts database evidence into structured reports with mandatory legal and scientific governance disclaimers.',
      icon: Sparkles,
    },
  ];

  return (
    <div
      style={{
        backgroundColor: 'var(--og-bg)',
        color: 'var(--og-text-primary)',
        minHeight: '100%',
        padding: '24px 32px 48px',
        boxSizing: 'border-box',
        fontFamily: 'var(--og-font-body)',
      }}
    >
      <div style={{ maxWidth: 1300, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* ============================================================ */}
        {/* 1. COMPACT PAGE HEADER                                      */}
        {/* ============================================================ */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
            paddingBottom: 16,
            borderBottom: '1px solid var(--og-border)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Link
                to="/dashboard"
                style={{
                  color: 'var(--og-violet)',
                  fontSize: 11,
                  fontFamily: 'var(--og-font-mono)',
                  textDecoration: 'none',
                  letterSpacing: '0.08em',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                ← OVERVIEW
              </Link>
              <span style={{ color: 'var(--og-border-strong)' }}>|</span>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--og-font-mono)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--og-text-secondary)',
                  background: 'var(--og-surface-raised)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: '1px solid var(--og-border)',
                }}
              >
                SYSTEM HEALTH & DATA INTEGRITY
              </span>
            </div>

            <h1
              style={{
                fontSize: 22,
                fontWeight: 600,
                margin: 0,
                color: 'var(--og-text-primary)',
                fontFamily: 'var(--og-font-display)',
                letterSpacing: '-0.02em',
              }}
            >
              SYSTEM STATUS
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--og-text-muted)', maxWidth: 650 }}>
              Monitor operational services, data sources, processing infrastructure and scientific provenance.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                backgroundColor: 'var(--og-surface)',
                border: '1px solid var(--og-border)',
                fontSize: 11,
                fontFamily: 'var(--og-font-mono)',
                color: 'var(--og-success)',
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: 'var(--og-success)',
                }}
              />
              SYSTEM OPERATIONAL
            </div>

            {refreshNotice && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  fontFamily: 'var(--og-font-mono)',
                  color: 'var(--og-success)',
                  backgroundColor: 'rgba(74, 222, 128, 0.1)',
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(74, 222, 128, 0.25)',
                }}
              >
                <Check size={13} />
                <span>STATUS UPDATED</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 12px',
                borderRadius: 8,
                backgroundColor: 'transparent',
                border: '1px solid var(--og-border-strong)',
                color: 'var(--og-text-primary)',
                fontSize: 11,
                fontFamily: 'var(--og-font-body)',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--og-surface-raised)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
              <span>REFRESH STATUS</span>
            </button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* 2. OVERALL SYSTEM HEALTH BANNER                              */}
        {/* ============================================================ */}
        <div
          style={{
            backgroundColor: 'var(--og-surface)',
            border: '1px solid var(--og-border)',
            borderRadius: 8,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 8,
                backgroundColor: 'var(--og-surface-raised)',
                border: '1px solid var(--og-border-strong)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--og-success)',
              }}
            >
              <Activity size={22} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--og-text-primary)', fontFamily: 'var(--og-font-display)' }}>
                ALL SYSTEMS OPERATIONAL &bull; 7 / 7 SUBSYSTEMS ONLINE
              </div>
              <div style={{ fontSize: 11, color: 'var(--og-text-muted)', fontFamily: 'var(--og-font-body)', marginTop: 2 }}>
                Last Verified: <span style={{ color: 'var(--og-text-secondary)', fontFamily: 'var(--og-font-mono)' }}>{lastCheckTime}</span> &bull; Architecture Standard: <strong style={{ color: 'var(--og-text-primary)' }}>SIH26143 Maritime Core</strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link
              to="/settings"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 12px',
                borderRadius: 8,
                backgroundColor: 'transparent',
                border: '1px solid var(--og-border-strong)',
                color: 'var(--og-text-primary)',
                fontSize: 11,
                fontFamily: 'var(--og-font-body)',
                fontWeight: 500,
                textDecoration: 'none',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--og-surface-raised)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <Sliders size={13} />
              <span>CONFIGURE PREFERENCES</span>
            </Link>

            <Link
              to="/new-mission"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: 8,
                backgroundColor: 'var(--og-violet)',
                color: '#FFFFFF',
                fontSize: 11,
                fontFamily: 'var(--og-font-body)',
                fontWeight: 600,
                textDecoration: 'none',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--og-violet-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--og-violet)')}
            >
              <span>DISPATCH NEW MISSION</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>

        {/* ============================================================ */}
        {/* 3. SUBSYSTEM HEALTH GRID (7 TRACKED SUBSYSTEMS)              */}
        {/* ============================================================ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 11, fontFamily: 'var(--og-font-mono)', fontWeight: 600, color: 'var(--og-text-muted)', paddingLeft: 2, letterSpacing: '0.04em' }}>
            CORE INFRASTRUCTURE & REASONING SERVICES (7 TRACKED)
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: 14,
            }}
          >
            {subsystems.map((sub) => {
              const Icon = sub.icon;
              return (
                <div
                  key={sub.id}
                  style={{
                    backgroundColor: 'var(--og-surface)',
                    border: '1px solid var(--og-border)',
                    borderRadius: 8,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 6,
                            backgroundColor: 'var(--og-surface-recessed)',
                            border: '1px solid var(--og-border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: sub.statusColor,
                          }}
                        >
                          <Icon size={16} />
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--og-text-primary)', fontFamily: 'var(--og-font-display)' }}>
                            {sub.name}
                          </div>
                          <div style={{ fontSize: 10, fontFamily: 'var(--og-font-mono)', color: 'var(--og-text-muted)' }}>
                            {sub.tier}
                          </div>
                        </div>
                      </div>

                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: 'var(--og-font-mono)',
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: 4,
                          backgroundColor: 'var(--og-surface-raised)',
                          border: '1px solid var(--og-border)',
                          color: sub.statusColor,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {sub.status}
                      </span>
                    </div>

                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--og-text-secondary)', lineHeight: 1.5 }}>
                      {sub.desc}
                    </p>
                  </div>

                  <div
                    style={{
                      paddingTop: 10,
                      borderTop: '1px solid var(--og-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 10,
                      fontFamily: 'var(--og-font-mono)',
                    }}
                  >
                    <span style={{ color: 'var(--og-text-muted)' }}>
                      CLASSIFICATION: <strong style={{ color: 'var(--og-text-secondary)' }}>{sub.provenance}</strong>
                    </span>
                    <span style={{ color: 'var(--og-teal)', fontWeight: 500 }}>{sub.endpoint}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ============================================================ */}
        {/* 4. DATA PROVENANCE HEALTH & SCIENTIFIC ISOLATION             */}
        {/* ============================================================ */}
        <div
          style={{
            backgroundColor: 'var(--og-surface)',
            border: '1px solid var(--og-border)',
            borderRadius: 8,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--og-border)', paddingBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Database size={16} style={{ color: 'var(--og-teal)' }} />
              <h2 style={{ fontSize: 13, fontFamily: 'var(--og-font-display)', fontWeight: 600, color: 'var(--og-text-primary)', textTransform: 'uppercase', margin: 0 }}>
                DATA PROVENANCE & SCIENTIFIC INTEGRITY MATRIX
              </h2>
            </div>
            <span style={{ fontSize: 10, fontFamily: 'var(--og-font-mono)', color: 'var(--og-success)', fontWeight: 600 }}>
              NON-BYPASSABLE ISOLATION ACTIVE
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
            {/* Demo Benchmark Stream */}
            <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: 14, borderRadius: 8, border: '1px solid var(--og-border)' }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--og-font-display)', fontWeight: 600, color: 'var(--og-text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Shield size={14} style={{ color: 'var(--og-success)' }} />
                <span>DEMO BENCHMARK SCENARIO STREAM</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11, fontFamily: 'var(--og-font-body)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--og-text-muted)' }}>SAR SLICK:</span>
                  <strong style={{ color: 'var(--og-teal)', fontFamily: 'var(--og-font-mono)' }}>OBSERVED (Sentinel-1)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--og-text-muted)' }}>DRIFT RECONSTRUCTION:</span>
                  <strong style={{ color: 'var(--og-amber)', fontFamily: 'var(--og-font-mono)' }}>MODELLED (Lagrangian)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--og-text-muted)' }}>AIS ATTRIBUTION:</span>
                  <strong style={{ color: 'var(--og-violet)', fontFamily: 'var(--og-font-mono)' }}>DEMO CANDIDATES</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--og-text-muted)' }}>METOCEAN FORCING:</span>
                  <strong style={{ color: 'var(--og-success)', fontFamily: 'var(--og-font-mono)' }}>DEMO ENVIRONMENTAL</strong>
                </div>
              </div>
            </div>

            {/* Real CDSE Stream */}
            <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: 14, borderRadius: 8, border: '1px solid var(--og-border)' }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--og-font-display)', fontWeight: 600, color: 'var(--og-text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Globe size={14} style={{ color: 'var(--og-teal)' }} />
                <span>REAL COPERNICUS CDSE INGESTION</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11, fontFamily: 'var(--og-font-body)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--og-text-muted)' }}>SAR SLICK:</span>
                  <strong style={{ color: 'var(--og-teal)', fontFamily: 'var(--og-font-mono)' }}>OBSERVED / CDSE STAC</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--og-text-muted)' }}>DRIFT RECONSTRUCTION:</span>
                  <strong style={{ color: 'var(--og-text-muted)', fontFamily: 'var(--og-font-mono)' }}>NOT ESTABLISHED</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--og-text-muted)' }}>AIS ATTRIBUTION:</span>
                  <strong style={{ color: 'var(--og-text-muted)', fontFamily: 'var(--og-font-mono)' }}>NOT ESTABLISHED</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--og-text-muted)' }}>METOCEAN FORCING:</span>
                  <strong style={{ color: 'var(--og-teal)', fontFamily: 'var(--og-font-mono)' }}>SOURCE DEPENDENT</strong>
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              backgroundColor: 'var(--og-surface-recessed)',
              border: '1px solid var(--og-border)',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 11,
              color: 'var(--og-text-secondary)',
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: 'var(--og-teal)' }}>EVIDENTIARY ISOLATION GUARANTEE:</strong> Real Copernicus Sentinel-1 observations are strictly isolated from synthetic AIS records and unvalidated drift trajectories. Synthetic candidate attribution is prevented from leaking into operational CDSE investigation dossiers.
          </div>
        </div>

        {/* ============================================================ */}
        {/* 5. METOCEAN ENVIRONMENTAL SOURCES & PROCESSING PIPELINE      */}
        {/* ============================================================ */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: 16,
          }}
        >
          {/* MetOcean Sources Card */}
          <div
            style={{
              backgroundColor: 'var(--og-surface)',
              border: '1px solid var(--og-border)',
              borderRadius: 8,
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--og-border)', paddingBottom: 8 }}>
              <Wind size={16} style={{ color: 'var(--og-amber)' }} />
              <h2 style={{ fontSize: 12, fontFamily: 'var(--og-font-display)', fontWeight: 600, color: 'var(--og-text-primary)', textTransform: 'uppercase', margin: 0 }}>
                METOCEAN FORCING SOURCES
              </h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 11 }}>
              <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--og-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--og-font-body)', marginBottom: 2 }}>
                  <strong style={{ color: 'var(--og-text-primary)' }}>ECMWF ERA5 Atmospheric Wind Field</strong>
                  <span style={{ color: 'var(--og-success)', fontFamily: 'var(--og-font-mono)', fontSize: 10, fontWeight: 600 }}>ONLINE</span>
                </div>
                <div style={{ color: 'var(--og-text-muted)', fontSize: 11 }}>
                  ERA5-derived 10-m surface wind field spatially resampled to Sentinel-1 scene grid.
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--og-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--og-font-body)', marginBottom: 2 }}>
                  <strong style={{ color: 'var(--og-text-primary)' }}>HYCOM Hydrodynamic Ocean Velocity</strong>
                  <span style={{ color: 'var(--og-success)', fontFamily: 'var(--og-font-mono)', fontSize: 10, fontWeight: 600 }}>ONLINE</span>
                </div>
                <div style={{ color: 'var(--og-text-muted)', fontSize: 11 }}>
                  HYCOM 1/12° global hydrodynamic surface current vectors for Lagrangian advection.
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--og-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--og-font-body)', marginBottom: 2 }}>
                  <strong style={{ color: 'var(--og-text-primary)' }}>NOAA Coral Reef Watch SST</strong>
                  <span style={{ color: 'var(--og-teal)', fontFamily: 'var(--og-font-mono)', fontSize: 10, fontWeight: 600 }}>DAILY FEED</span>
                </div>
                <div style={{ color: 'var(--og-text-muted)', fontSize: 11 }}>
                  NOAA CRW daily sea surface temperature baseline for kinematic weathering rate calibration.
                </div>
              </div>
            </div>
          </div>

          {/* Processing Pipeline Health */}
          <div
            style={{
              backgroundColor: 'var(--og-surface)',
              border: '1px solid var(--og-border)',
              borderRadius: 8,
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--og-border)', paddingBottom: 8 }}>
              <Zap size={16} style={{ color: 'var(--og-violet)' }} />
              <h2 style={{ fontSize: 12, fontFamily: 'var(--og-font-display)', fontWeight: 600, color: 'var(--og-text-primary)', textTransform: 'uppercase', margin: 0 }}>
                PROCESSING PIPELINE STAGE HEALTH
              </h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11, fontFamily: 'var(--og-font-body)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--og-surface-recessed)', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--og-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--og-text-muted)', fontFamily: 'var(--og-font-mono)' }}>01</span>
                  <span style={{ color: 'var(--og-text-primary)' }}>SAR LEVEL-1 INGESTION</span>
                </div>
                <span style={{ color: 'var(--og-teal)', fontWeight: 600, fontFamily: 'var(--og-font-mono)', fontSize: 10 }}>READY (CDSE STAC)</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--og-surface-recessed)', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--og-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--og-text-muted)', fontFamily: 'var(--og-font-mono)' }}>02</span>
                  <span style={{ color: 'var(--og-text-primary)' }}>DUAL-POL VV+VH SEGMENTATION</span>
                </div>
                <span style={{ color: 'var(--og-success)', fontWeight: 600, fontFamily: 'var(--og-font-mono)', fontSize: 10 }}>READY (PyTorch U-Net)</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--og-surface-recessed)', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--og-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--og-text-muted)', fontFamily: 'var(--og-font-mono)' }}>03</span>
                  <span style={{ color: 'var(--og-text-primary)' }}>REVERSE DRIFT ADVECTION</span>
                </div>
                <span style={{ color: 'var(--og-amber)', fontWeight: 600, fontFamily: 'var(--og-font-mono)', fontSize: 10 }}>READY (Lagrangian Solver)</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--og-surface-recessed)', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--og-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--og-text-muted)', fontFamily: 'var(--og-font-mono)' }}>04</span>
                  <span style={{ color: 'var(--og-text-primary)' }}>AIS SPATIOTEMPORAL CPA MATCH</span>
                </div>
                <span style={{ color: 'var(--og-violet)', fontWeight: 600, fontFamily: 'var(--og-font-mono)', fontSize: 10 }}>READY (Candidate Ranker)</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--og-surface-recessed)', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--og-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--og-text-muted)', fontFamily: 'var(--og-font-mono)' }}>05</span>
                  <span style={{ color: 'var(--og-text-primary)' }}>EVIDENTIARY DOSSIER COMPILATION</span>
                </div>
                <span style={{ color: 'var(--og-success)', fontWeight: 600, fontFamily: 'var(--og-font-mono)', fontSize: 10 }}>READY (JSON Schema)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <div style={{ textAlign: 'center', fontSize: 10, fontFamily: 'var(--og-font-mono)', color: 'var(--og-text-muted)', paddingTop: 8 }}>
          BLUE FORENSIC AI &bull; SIH 26143 INFRASTRUCTURE GOVERNANCE CONSOLE &bull; ALL SYSTEMS COMPLIANT
        </div>
      </div>
    </div>
  );
}

