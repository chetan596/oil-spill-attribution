import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { spillsApi } from '../api/spills.api';
import MapView from '../components/map/MapView';
import SlickLayer from '../components/map/SlickLayer';
import OriginLayer from '../components/map/OriginLayer';
import TrajectoryLayer from '../components/map/TrajectoryLayer';
import VesselLayer from '../components/map/VesselLayer';
import DataProvenance from '../components/common/DataProvenance';
import { calculateBounds, parseWktPolygon } from '../utils/geo';
import {
  ArrowLeft,
  RefreshCw,
  FileText,
  Radio,
  Satellite,
  Compass,
  Ship,
  ExternalLink,
  ShieldCheck,
  Clock,
  MapPin,
  Layers,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Droplet,
  Activity,
  Wind,
  Waves,
  Eye,
  Calendar,
  ChevronRight,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';

// Fallback incident definitions for reliable demo presentation
const DEMO_SPILLS_FALLBACK = {
  '141968eb': {
    id: '141968eb',
    analysisId: 'demo-scene-001',
    name: 'Potential Oil Slick #141968eb',
    region: 'Mumbai Offshore Surveillance Sector',
    latitude: 18.921,
    longitude: 72.832,
    areaKm2: 4.73,
    confidence: 0.94,
    timestamp: '2026-09-12T06:15:00Z',
    source: 'demo',
    sensor: 'Sentinel-1A IW GRD (Dual-Pol VV+VH)',
    orbit: '142 (Descending)',
    resolution: '10m',
    estimatedAgeHours: 14.5,
    geomWkt: 'POLYGON((72.78 18.91, 72.82 18.91, 72.82 18.93, 72.78 18.93, 72.78 18.91))',
  },
  '043e9402': {
    id: '043e9402',
    analysisId: 'demo-scene-001',
    name: 'Potential Oil Slick #043e9402',
    region: 'Mumbai Offshore Surveillance Sector',
    latitude: 18.940,
    longitude: 72.810,
    areaKm2: 4.73,
    confidence: 0.94,
    timestamp: '2026-09-12T06:15:00Z',
    source: 'demo',
    sensor: 'Sentinel-1A IW GRD (Dual-Pol VV+VH)',
    orbit: '142 (Descending)',
    resolution: '10m',
    estimatedAgeHours: 14.5,
    geomWkt: 'POLYGON((72.79 18.93, 72.83 18.93, 72.83 18.95, 72.79 18.95, 72.79 18.93))',
  },
  'demo-scene-001': {
    id: 'demo-scene-001',
    analysisId: 'demo-scene-001',
    name: 'Mumbai Offshore Investigation Incident',
    region: 'Mumbai Offshore Surveillance Sector',
    latitude: 18.940,
    longitude: 72.810,
    areaKm2: 4.73,
    confidence: 0.94,
    timestamp: '2026-09-12T06:15:00Z',
    source: 'demo',
    sensor: 'Sentinel-1A IW GRD (Dual-Pol VV+VH)',
    orbit: '142 (Descending)',
    resolution: '10m',
    estimatedAgeHours: 14.5,
    geomWkt: 'POLYGON((72.79 18.93, 72.83 18.93, 72.83 18.95, 72.79 18.95, 72.79 18.93))',
  },
  'demo-scene-002': {
    id: 'demo-scene-002',
    analysisId: 'demo-scene-002',
    name: 'Gulf of Kutch Heavy Fuel Oil Discharge',
    region: 'Gulf of Kutch Tanker Corridor',
    latitude: 22.518,
    longitude: 69.192,
    areaKm2: 3.21,
    confidence: 0.89,
    timestamp: '2026-09-10T14:40:00Z',
    source: 'demo',
    sensor: 'Sentinel-1B IW GRD',
    orbit: '084 (Ascending)',
    resolution: '10m',
    estimatedAgeHours: 12.0,
    geomWkt: 'POLYGON((69.18 22.50, 69.21 22.50, 69.21 22.53, 69.18 22.53, 69.18 22.50))',
  },
  'demo-scene-003': {
    id: 'demo-scene-003',
    analysisId: 'demo-scene-003',
    name: 'Paradip Port Approach Anchorage Anomaly',
    region: 'Paradip Port Approach',
    latitude: 20.142,
    longitude: 86.820,
    areaKm2: 1.85,
    confidence: 0.82,
    timestamp: '2026-09-08T09:10:00Z',
    source: 'demo',
    sensor: 'Sentinel-1A IW GRD',
    orbit: '112 (Descending)',
    resolution: '10m',
    estimatedAgeHours: 8.5,
    geomWkt: 'POLYGON((86.80 20.13, 86.84 20.13, 86.84 20.15, 86.80 20.15, 86.80 20.13))',
  },
  'demo-scene-004': {
    id: 'demo-scene-004',
    analysisId: 'demo-scene-004',
    name: 'Goa / Malabar Coastal Transit Sheen',
    region: 'Goa / Malabar Coast',
    latitude: 15.340,
    longitude: 73.610,
    areaKm2: 0.92,
    confidence: 0.76,
    timestamp: '2026-09-05T18:25:00Z',
    source: 'demo',
    sensor: 'Sentinel-1A IW GRD',
    orbit: '055 (Descending)',
    resolution: '10m',
    estimatedAgeHours: 6.0,
    geomWkt: 'POLYGON((73.59 15.33, 73.63 15.33, 73.63 15.35, 73.59 15.35, 73.59 15.33))',
  },
  'REAL_CDSE': {
    id: 'REAL_CDSE',
    analysisId: 'REAL_CDSE',
    name: 'Copernicus CDSE Sentinel-1 Live Acquisition',
    region: 'Copernicus STAC Live AOI',
    latitude: 18.940,
    longitude: 72.810,
    areaKm2: 2.45,
    confidence: 0.91,
    timestamp: '2026-09-14T02:18:00Z',
    source: 'real_cdse',
    sensor: 'Sentinel-1A IW GRDH Level-1 (CDSE)',
    orbit: '142 (Descending)',
    resolution: '10m',
    estimatedAgeHours: null,
    geomWkt: 'POLYGON((72.79 18.93, 72.83 18.93, 72.83 18.95, 72.79 18.95, 72.79 18.93))',
  },
};

export default function SpillDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [spill, setSpill] = useState(null);
  const [driftData, setDriftData] = useState(null);
  const [candidateVessels, setCandidateVessels] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [spillRes, driftRes, vesselsRes] = await Promise.allSettled([
        spillsApi.getById(id),
        spillsApi.getDrift(id),
        spillsApi.getVessels(id),
      ]);

      let loadedSpill = null;
      if (spillRes.status === 'fulfilled' && spillRes.value?.data) {
        loadedSpill = spillRes.value.data;
      } else if (DEMO_SPILLS_FALLBACK[id]) {
        loadedSpill = DEMO_SPILLS_FALLBACK[id];
      } else {
        // Fallback to first demo spill if not found
        loadedSpill = DEMO_SPILLS_FALLBACK['141968eb'];
      }
      setSpill(loadedSpill);

      const isRealCdse = loadedSpill?.source === 'real_cdse' || id === 'REAL_CDSE';

      if (!isRealCdse && driftRes.status === 'fulfilled' && driftRes.value?.data) {
        const rawDrift = driftRes.value.data;
        const drift = {
          ...rawDrift,
          originLat: rawDrift.originLat ?? rawDrift.latitude ?? 19.113,
          originLng: rawDrift.originLng ?? rawDrift.longitude ?? 72.544,
          uncertaintyKm: rawDrift.uncertaintyKm ?? 2.6,
          backwardPath: rawDrift.backwardPath || (rawDrift.points || []).filter((p) => p.phase === 'backward'),
          forwardPath: rawDrift.forwardPath || (rawDrift.points || []).filter((p) => p.phase === 'forward'),
        };
        setDriftData(drift);
      } else if (!isRealCdse) {
        // Benchmark fallback drift
        setDriftData({
          originLat: 19.113,
          originLng: 72.544,
          uncertaintyKm: 2.6,
          windowHours: 24,
          driftSpeed: '0.83 kt NW',
          windVector: '12.4 kn @ 240° (SW)',
          currentVector: '0.42 m/s @ 310° (NW)',
          backwardPath: [
            { lat: loadedSpill?.latitude || 18.921, lng: loadedSpill?.longitude || 72.832 },
            { lat: 19.015, lng: 72.690 },
            { lat: 19.113, lng: 72.544 },
          ],
        });
      } else {
        setDriftData(null);
      }

      if (!isRealCdse && vesselsRes.status === 'fulfilled' && vesselsRes.value?.data) {
        const vList = Array.isArray(vesselsRes.value.data) ? vesselsRes.value.data : [];
        setCandidateVessels(vList);
        setSelectedCandidate(vList[0] || null);
      } else if (!isRealCdse) {
        const defaultCandidates = [
          {
            rank: 1,
            name: 'MV Kandla Star',
            mmsi: '419001234',
            vesselType: 'Crude Oil Tanker',
            flag: 'IN',
            totalScore: 94,
            proximityScore: 96,
            temporalScore: 92,
            trajectoryScore: 95,
            anomalyScore: 90,
            cpaKm: 0.8,
            cpaTime: '04:12 UTC',
            status: 'PRIMARY SUSPECT (ANALYTICAL)',
            latitude: 18.92,
            longitude: 72.78,
          },
          {
            rank: 2,
            name: 'MT Arabian Sea',
            mmsi: '636019876',
            vesselType: 'Chemical Tanker',
            flag: 'LR',
            totalScore: 41,
            proximityScore: 48,
            temporalScore: 38,
            trajectoryScore: 42,
            anomalyScore: 35,
            cpaKm: 3.4,
            cpaTime: '02:40 UTC',
            status: 'CORRELATED TRANSIT',
            latitude: 18.96,
            longitude: 72.70,
          },
          {
            rank: 3,
            name: 'MSC Mumbai Express',
            mmsi: '352002345',
            vesselType: 'Container Ship',
            flag: 'PA',
            totalScore: 18,
            proximityScore: 22,
            temporalScore: 16,
            trajectoryScore: 19,
            anomalyScore: 15,
            cpaKm: 7.2,
            cpaTime: '01:15 UTC',
            status: 'PASSING VESSEL',
            latitude: 19.05,
            longitude: 72.62,
          },
        ];
        setCandidateVessels(defaultCandidates);
        setSelectedCandidate(defaultCandidates[0]);
      } else {
        setCandidateVessels([]);
        setSelectedCandidate(null);
      }
    } catch (err) {
      console.warn('SpillDetails API error fallback:', err.message);
      const fallbackSpill = DEMO_SPILLS_FALLBACK[id] || DEMO_SPILLS_FALLBACK['141968eb'];
      setSpill(fallbackSpill);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

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
          if (pt.lat != null && pt.lng != null) points.push([Number(pt.lat), Number(pt.lng)]);
        });
      }
    }
    return calculateBounds(points);
  }, [spill, driftData]);

  const isRealCdse = spill?.source === 'real_cdse' || id === 'REAL_CDSE';
  const targetAnalysisId = spill?.analysisId || spill?.id || id;
  const latVal = spill?.latitude ? Number(spill.latitude) : 18.921;
  const lngVal = spill?.longitude ? Number(spill.longitude) : 72.832;

  return (
    <div
      style={{
        backgroundColor: '#0A0B0D',
        color: '#FFFFFF',
        minHeight: '100%',
        padding: '20px 24px 40px',
        boxSizing: 'border-box',
        fontFamily: "'Schibsted Grotesk', sans-serif",
      }}
    >
      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* ============================================================ */}
        {/* 1. TOP HEADER & BREADCRUMB BAR                               */}
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
                  color: 'var(--og-text-secondary)',
                  fontSize: 11,
                  fontFamily: "'Schibsted Grotesk', sans-serif",
                  textDecoration: 'none',
                  letterSpacing: '0.04em',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  transition: 'color 120ms',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--og-text-primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--og-text-secondary)')}
              >
                ← OVERVIEW
              </Link>
              <span style={{ color: 'var(--og-border-strong)' }}>|</span>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "'Hanken Grotesk', sans-serif",
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--og-teal)',
                  background: 'rgba(73, 198, 200, 0.1)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: '1px solid rgba(73, 198, 200, 0.25)',
                  fontWeight: 600,
                }}
              >
                INCIDENT INTELLIGENCE RECORD
              </span>
            </div>

            <h1
              style={{
                fontSize: 20,
                fontFamily: "'Hanken Grotesk', sans-serif",
                fontWeight: 600,
                margin: 0,
                color: 'var(--og-text-primary)',
                letterSpacing: '-0.01em',
              }}
            >
              SPILL DETAILS
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--og-text-muted)', maxWidth: 650 }}>
              Comprehensive forensic dossier of detected dark-surface slick, drift vectors, and vessel correlation.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                backgroundColor: 'var(--og-surface)',
                border: '1px solid var(--og-border)',
                fontSize: 11,
                fontFamily: 'var(--font-mono, monospace)',
                color: 'var(--og-text-secondary)',
              }}
            >
              INCIDENT: <strong style={{ color: 'var(--og-teal)' }}>#{id ? String(id).slice(0, 8) : 'RECORD'}</strong>
            </div>

            <div
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                backgroundColor: 'var(--og-surface)',
                border: '1px solid var(--og-border)',
                fontSize: 11,
                fontFamily: 'var(--font-mono, monospace)',
                color: isRealCdse ? 'var(--og-teal)' : 'var(--og-success)',
              }}
            >
              {isRealCdse ? 'CDSE AUTHENTICATED' : 'DEMO BENCHMARK'}
            </div>

            <button
              type="button"
              onClick={loadData}
              disabled={isLoading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                backgroundColor: 'transparent',
                border: '1px solid var(--og-border-strong)',
                color: 'var(--og-text-primary)',
                fontSize: 11,
                fontFamily: "'Schibsted Grotesk', sans-serif",
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background-color 120ms',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--og-surface-raised)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
              <span>REFRESH</span>
            </button>

            <Link
              to={`/analysis/${targetAnalysisId}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 8,
                backgroundColor: 'var(--og-violet)',
                color: '#FFFFFF',
                fontSize: 11,
                fontFamily: "'Schibsted Grotesk', sans-serif",
                fontWeight: 600,
                textDecoration: 'none',
                transition: 'opacity 120ms',
              }}
            >
              <span>OPEN FULL ANALYSIS</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>

        {/* ============================================================ */}
        {/* 2. INCIDENT IDENTITY BLOCK                                   */}
        {/* ============================================================ */}
        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  backgroundColor: 'var(--og-surface)',
                  border: '1px solid var(--og-border-subtle)',
                  borderRadius: 8,
                  padding: 16,
                  height: 60,
                  opacity: 0.6,
                }}
              />
            ))}
          </div>
        ) : spill ? (
          <div
            style={{
              backgroundColor: 'var(--og-surface)',
              border: '1px solid var(--og-border-subtle)',
              borderRadius: 8,
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 6,
                    backgroundColor: 'var(--og-surface-elevated)',
                    border: '1px solid var(--og-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--og-teal)',
                  }}
                >
                  <Droplet size={18} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--og-text-primary)', fontFamily: "'Hanken Grotesk', sans-serif" }}>
                    {spill.name || `Potential Oil Slick #${String(spill.id).slice(0, 8)}`}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--og-text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>
                    {spill.region || 'Operational Maritime Sector'} &bull; Database Record ID: <code>{spill.id}</code>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: 'var(--font-mono, monospace)',
                    fontWeight: 600,
                    padding: '3px 8px',
                    borderRadius: 4,
                    backgroundColor: 'rgba(73, 198, 200, 0.1)',
                    border: '1px solid rgba(73, 198, 200, 0.25)',
                    color: 'var(--og-teal)',
                  }}
                >
                  {spill.confidence ? `${Math.round(spill.confidence * 100)}% SAR CONFIDENCE` : '94% CONFIDENCE'}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: 'var(--font-mono, monospace)',
                    fontWeight: 600,
                    padding: '3px 8px',
                    borderRadius: 4,
                    backgroundColor: 'rgba(231, 166, 58, 0.1)',
                    border: '1px solid rgba(231, 166, 58, 0.25)',
                    color: 'var(--og-amber)',
                  }}
                >
                  {spill.areaKm2 ? `${Number(spill.areaKm2).toFixed(2)} km² AREA` : '4.73 km² AREA'}
                </span>
              </div>
            </div>

            {/* Quick Metrics Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 10,
                paddingTop: 8,
                borderTop: '1px solid var(--og-border-subtle)',
              }}
            >
              <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--og-border-subtle)' }}>
                <div style={{ fontSize: 10, fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--og-text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  CENTROID COORDINATES
                </div>
                <div style={{ fontSize: 13, fontFamily: 'var(--font-mono, monospace)', fontWeight: 600, color: 'var(--og-text-primary)' }}>
                  {latVal.toFixed(3)}°N, {lngVal.toFixed(3)}°E
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--og-border-subtle)' }}>
                <div style={{ fontSize: 10, fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--og-text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  OBSERVED TIMESTAMP
                </div>
                <div style={{ fontSize: 11.5, fontFamily: 'var(--font-mono, monospace)', fontWeight: 500, color: 'var(--og-text-secondary)' }}>
                  {new Date(spill.timestamp || Date.now()).toUTCString()}
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--og-border-subtle)' }}>
                <div style={{ fontSize: 10, fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--og-text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  ESTIMATED SLICK AGE
                </div>
                <div style={{ fontSize: 13, fontFamily: 'var(--font-mono, monospace)', fontWeight: 600, color: 'var(--og-amber)' }}>
                  {spill.estimatedAgeHours ? `${spill.estimatedAgeHours} hours` : isRealCdse ? 'N/A' : '14.5 hours'}
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--og-surface-recessed)', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--og-border-subtle)' }}>
                <div style={{ fontSize: 10, fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--og-text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  CORRELATED CANDIDATES
                </div>
                <div style={{ fontSize: 13, fontFamily: 'var(--font-mono, monospace)', fontWeight: 600, color: 'var(--og-violet)' }}>
                  {isRealCdse ? 'NOT ESTABLISHED' : `${candidateVessels.length} Vessels Tracked`}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* ============================================================ */}
        {/* 3. PROVENANCE STRIP                                          */}
        {/* ============================================================ */}
        <div
          style={{
            backgroundColor: 'var(--og-surface)',
            border: '1px solid var(--og-border)',
            borderRadius: 8,
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            fontSize: 11,
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          {isRealCdse ? (
            <>
              <div>SAR: <span style={{ color: 'var(--og-teal)', fontWeight: 600 }}>OBSERVED / CDSE</span></div>
              <span style={{ color: 'var(--og-border-strong)' }}>|</span>
              <div>DRIFT: <span style={{ color: 'var(--og-text-muted)' }}>NOT ESTABLISHED</span></div>
              <span style={{ color: 'var(--og-border-strong)' }}>|</span>
              <div>AIS: <span style={{ color: 'var(--og-text-muted)' }}>NOT ESTABLISHED</span></div>
              <span style={{ color: 'var(--og-border-strong)' }}>|</span>
              <div>METOCEAN: <span style={{ color: 'var(--og-text-secondary)' }}>SOURCE DEPENDENT</span></div>
              <span style={{ color: 'var(--og-border-strong)' }}>|</span>
              <div style={{ color: 'var(--og-amber)', fontSize: 10 }}>[REAL SCENE ISOLATION ACTIVE]</div>
            </>
          ) : (
            <>
              <div>SAR: <span style={{ color: 'var(--og-teal)', fontWeight: 600 }}>OBSERVED</span></div>
              <span style={{ color: 'var(--og-border-strong)' }}>|</span>
              <div>DRIFT: <span style={{ color: 'var(--og-amber)', fontWeight: 600 }}>MODELLED</span></div>
              <span style={{ color: 'var(--og-border-strong)' }}>|</span>
              <div>AIS: <span style={{ color: 'var(--og-violet)', fontWeight: 600 }}>DEMO</span></div>
              <span style={{ color: 'var(--og-border-strong)' }}>|</span>
              <div>METOCEAN: <span style={{ color: 'var(--og-text-secondary)', fontWeight: 600 }}>DEMO</span></div>
              <span style={{ color: 'var(--og-border-strong)' }}>|</span>
              <div style={{ color: 'var(--og-text-muted)', fontSize: 10 }}>[DEMO BENCHMARK SCENARIO]</div>
            </>
          )}
        </div>

        {/* ============================================================ */}
        {/* 4. MAIN SPLIT: MAP COLUMN + FORENSIC INTELLIGENCE            */}
        {/* ============================================================ */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
            gap: 16,
            alignItems: 'start',
          }}
        >
          {/* ========================================================== */}
          {/* LEFT: TACTICAL MAP & 3 PRIMARY EVIDENCE SECTIONS           */}
          {/* ========================================================== */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Tactical Incident Map */}
            <div
              style={{
                backgroundColor: 'var(--og-surface)',
                border: '1px solid var(--og-border)',
                borderRadius: 8,
                overflow: 'hidden',
                minHeight: 460,
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 12,
                  left: 12,
                  zIndex: 400,
                  backgroundColor: 'var(--og-surface)',
                  border: '1px solid var(--og-border)',
                  borderRadius: 6,
                  padding: '5px 10px',
                  fontSize: 10,
                  fontFamily: "'Hanken Grotesk', sans-serif",
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  color: 'var(--og-text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--og-teal)' }} />
                <span>GEOSPATIAL FORENSIC CONSOLE</span>
              </div>

              {spill && (
                <MapView
                  center={[latVal, lngVal]}
                  bounds={mapBounds}
                  zoom={10}
                >
                  <SlickLayer spill={spill} />
                  {driftData && <OriginLayer driftData={driftData} />}
                  {driftData && <TrajectoryLayer driftData={driftData} />}
                  {!isRealCdse && (
                    <VesselLayer
                      candidateVessels={candidateVessels}
                      selectedVessel={selectedCandidate}
                      onSelectVessel={(v) => setSelectedCandidate(v)}
                    />
                  )}
                </MapView>
              )}
            </div>

            {/* 3 Primary Evidence Summary Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* 01 SAR OBSERVATION */}
              <div
                style={{
                  backgroundColor: 'var(--og-surface)',
                  border: '1px solid var(--og-border-subtle)',
                  borderRadius: 8,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Satellite size={16} style={{ color: 'var(--og-teal)' }} />
                    <span style={{ fontSize: 12, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, color: 'var(--og-text-primary)' }}>
                      01 SAR OBSERVATION (SENTINEL-1 ACQUISITION)
                    </span>
                  </div>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono, monospace)', color: 'var(--og-teal)', fontWeight: 600 }}>
                    OBSERVED EVIDENCE
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 8,
                    fontSize: 11,
                    fontFamily: 'var(--font-mono, monospace)',
                  }}
                >
                  <div style={{ background: 'var(--og-surface-recessed)', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--og-border-subtle)' }}>
                    <div style={{ color: 'var(--og-text-muted)', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>SENSOR / MODE</span>
                      <DataProvenance
                        status={isRealCdse ? 'REAL' : 'DEMONSTRATION'}
                        evidenceClass="OBSERVED"
                        source={isRealCdse ? 'ESA Copernicus Data Space Ecosystem' : 'Copernicus Sentinel-1A SAR (Archived)'}
                        dataset="Sentinel-1A IW GRD (10m resolution)"
                        processing="Interferometric Wide Swath SAR Dual-Pol processing"
                        limitation={isRealCdse ? 'Live CDSE SAR scene unlabelled' : 'Calibrated benchmark demonstration capture'}
                        position="bottom-left"
                      />
                    </div>
                    <div style={{ color: 'var(--og-text-primary)', fontWeight: 600 }}>{spill?.sensor || 'Sentinel-1A IW GRD'}</div>
                  </div>
                  <div style={{ background: 'var(--og-surface-recessed)', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--og-border-subtle)' }}>
                    <div style={{ color: 'var(--og-text-muted)', fontSize: 10 }}>POLARIZATION</div>
                    <div style={{ color: 'var(--og-teal)', fontWeight: 600 }}>Dual-Pol (VV + VH)</div>
                  </div>
                  <div style={{ background: 'var(--og-surface-recessed)', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--og-border-subtle)' }}>
                    <div style={{ color: 'var(--og-text-muted)', fontSize: 10 }}>ORBIT / PASS</div>
                    <div style={{ color: 'var(--og-text-primary)', fontWeight: 600 }}>{spill?.orbit || '142 Descending'}</div>
                  </div>
                  <div style={{ background: 'var(--og-surface-recessed)', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--og-border-subtle)' }}>
                    <div style={{ color: 'var(--og-text-muted)', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>SLICK AREA</span>
                      <DataProvenance
                        status={isRealCdse ? 'NOT_ESTABLISHED' : 'DEMONSTRATION'}
                        evidenceClass={isRealCdse ? 'NOT_ESTABLISHED' : 'MODELLED'}
                        source="Copernicus Sentinel-1A SAR"
                        dataset="PyTorch U-Net V2 Dark Feature Mask"
                        processing="Planar polygon integration on WGS84 ellipsoid via PostGIS ST_Area"
                        limitation={isRealCdse ? 'Area unverified on unlabelled CDSE scene' : 'Surface area on 2D radar plane; thickness/volume not measured'}
                        position="bottom-left"
                      />
                    </div>
                    <div style={{ color: 'var(--og-teal)', fontWeight: 600 }}>{spill?.areaKm2 || 4.73} km²</div>
                  </div>
                  <div style={{ background: 'var(--og-surface-recessed)', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--og-border-subtle)' }}>
                    <div style={{ color: 'var(--og-text-muted)', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>CONFIDENCE</span>
                      <DataProvenance
                        status={isRealCdse ? 'NOT_ESTABLISHED' : 'DEMONSTRATION'}
                        evidenceClass={isRealCdse ? 'NOT_ESTABLISHED' : 'MODELLED'}
                        source="PyTorch Dual-Pol U-Net V2"
                        processing="Mean sigmoid threshold activation (τ=0.50)"
                        limitation="Neural classification probability, not chemical laboratory proof"
                        position="bottom-left"
                      />
                    </div>
                    <div style={{ color: 'var(--og-teal)', fontWeight: 600 }}>
                      {spill?.confidence ? `${Math.round(spill.confidence * 100)}%` : '94%'}
                    </div>
                  </div>
                  <div style={{ background: 'var(--og-surface-recessed)', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--og-border-subtle)' }}>
                    <div style={{ color: 'var(--og-text-muted)', fontSize: 10 }}>SPATIAL RESOLUTION</div>
                    <div style={{ color: 'var(--og-text-secondary)', fontWeight: 500 }}>10m Pixel Spacing</div>
                  </div>
                </div>
              </div>

              {/* 02 DRIFT RECONSTRUCTION */}
              <div
                style={{
                  backgroundColor: 'var(--og-surface)',
                  border: '1px solid var(--og-border-subtle)',
                  borderRadius: 8,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Compass size={16} style={{ color: 'var(--og-amber)' }} />
                    <span style={{ fontSize: 12, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, color: 'var(--og-text-primary)' }}>
                      02 DRIFT RECONSTRUCTION (METOCEAN HINDCAST)
                    </span>
                  </div>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono, monospace)', color: isRealCdse ? 'var(--og-text-muted)' : 'var(--og-amber)', fontWeight: 600 }}>
                    {isRealCdse ? 'NOT ESTABLISHED' : 'MODELLED EVIDENCE'}
                  </span>
                </div>

                {isRealCdse ? (
                  <div
                    style={{
                      backgroundColor: 'var(--og-surface-recessed)',
                      border: '1px solid var(--og-border-subtle)',
                      borderRadius: 6,
                      padding: 12,
                      color: 'var(--og-text-muted)',
                      fontSize: 11,
                      fontFamily: 'var(--font-mono, monospace)',
                    }}
                  >
                    DRIFT NOT ESTABLISHED: MetOcean forcing vectors (HYCOM ocean currents + ECMWF ERA5 winds) are awaiting initialization for this live CDSE scene.
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 8,
                      fontSize: 11,
                      fontFamily: 'var(--font-mono, monospace)',
                    }}
                  >
                    <div style={{ background: 'var(--og-surface-recessed)', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--og-border-subtle)' }}>
                      <div style={{ color: 'var(--og-text-muted)', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>MODELLED ORIGIN</span>
                        <DataProvenance
                          status={isRealCdse ? 'NOT_ESTABLISHED' : 'DEMONSTRATION'}
                          evidenceClass={isRealCdse ? 'NOT_ESTABLISHED' : 'MODELLED'}
                          source="Lagrangian Reverse Numerical Hindcast"
                          dataset="ECMWF ERA5 Winds + CMEMS Global Ocean Currents"
                          formula="dX/dt = -(V_curr + 0.035 * R(θ) * V_wind) + diffusion"
                          limitation={isRealCdse ? 'Hindcast uninitialized for CDSE live pass' : '±2.6 km 95% CI spatial uncertainty ellipse'}
                          position="bottom-left"
                        />
                      </div>
                      <div style={{ color: 'var(--og-text-primary)', fontWeight: 600 }}>
                        {driftData?.originLat ? `${driftData.originLat.toFixed(3)}°N, ${driftData.originLng.toFixed(3)}°E` : '19.113°N, 72.544°E'}
                      </div>
                    </div>
                    <div style={{ background: 'var(--og-surface-recessed)', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--og-border-subtle)' }}>
                      <div style={{ color: 'var(--og-text-muted)', fontSize: 10 }}>UNCERTAINTY RADIUS</div>
                      <div style={{ color: 'var(--og-amber)', fontWeight: 600 }}>&plusmn;2.6 km Ellipse</div>
                    </div>
                    <div style={{ background: 'var(--og-surface-recessed)', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--og-border-subtle)' }}>
                      <div style={{ color: 'var(--og-text-muted)', fontSize: 10 }}>HINDCAST WINDOW</div>
                      <div style={{ color: 'var(--og-text-secondary)', fontWeight: 500 }}>24 Hours Reverse</div>
                    </div>
                    <div style={{ background: 'var(--og-surface-recessed)', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--og-border-subtle)' }}>
                      <div style={{ color: 'var(--og-text-muted)', fontSize: 10 }}>WIND FORCING (ERA5)</div>
                      <div style={{ color: 'var(--og-text-secondary)' }}>12.4 kn @ 240° (SW)</div>
                    </div>
                    <div style={{ background: 'var(--og-surface-recessed)', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--og-border-subtle)' }}>
                      <div style={{ color: 'var(--og-text-muted)', fontSize: 10 }}>OCEAN CURRENT</div>
                      <div style={{ color: 'var(--og-text-secondary)' }}>0.42 m/s @ 310° (NW)</div>
                    </div>
                    <div style={{ background: 'var(--og-surface-recessed)', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--og-border-subtle)' }}>
                      <div style={{ color: 'var(--og-text-muted)', fontSize: 10 }}>ESTIMATED DRIFT</div>
                      <div style={{ color: 'var(--og-teal)' }}>36.8 km total distance</div>
                    </div>
                  </div>
                )}
              </div>

              {/* 03 AIS CORRELATION */}
              <div
                style={{
                  backgroundColor: 'var(--og-surface)',
                  border: '1px solid var(--og-border-subtle)',
                  borderRadius: 8,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Ship size={16} style={{ color: 'var(--og-violet)' }} />
                    <span style={{ fontSize: 12, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, color: 'var(--og-text-primary)' }}>
                      03 AIS ATTRIBUTION CORRELATION
                    </span>
                    <DataProvenance
                      status={isRealCdse ? 'NOT_ESTABLISHED' : 'DEMONSTRATION'}
                      evidenceClass={isRealCdse ? 'NOT_ESTABLISHED' : 'ANALYTICAL'}
                      source="Heuristic Spatiotemporal Multi-Criteria Engine"
                      formula="0.40*Spatial + 0.25*Temporal + 0.20*Trajectory + 0.15*Anomaly"
                      limitation={isRealCdse ? 'AIS strictly isolated: no synthetic attribution permitted' : 'Heuristic correlation; does not constitute legal proof without hydrocarbon fingerprinting'}
                      position="bottom-left"
                    />
                  </div>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono, monospace)', color: isRealCdse ? 'var(--og-text-muted)' : 'var(--og-violet)', fontWeight: 600 }}>
                    {isRealCdse ? 'NOT ESTABLISHED' : 'ANALYTICAL CORRELATION'}
                  </span>
                </div>

                {isRealCdse ? (
                  <div
                    style={{
                      backgroundColor: 'var(--og-surface-recessed)',
                      border: '1px solid var(--og-border-subtle)',
                      borderRadius: 6,
                      padding: 12,
                      color: 'var(--og-text-muted)',
                      fontSize: 11,
                      fontFamily: 'var(--font-mono, monospace)',
                    }}
                  >
                    NO VERIFIED AIS CANDIDATE: Real Sentinel-1 observations are strictly isolated from synthetic AIS records. Real-world AIS feeds must be ingested via coastal station feeds.
                  </div>
                ) : selectedCandidate ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: 8,
                      fontSize: 11,
                      fontFamily: 'var(--font-mono, monospace)',
                    }}
                  >
                    <div style={{ background: 'var(--og-surface-recessed)', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--og-border-subtle)' }}>
                      <div style={{ color: 'var(--og-text-muted)', fontSize: 10 }}>TOP CANDIDATE</div>
                      <div style={{ color: 'var(--og-text-primary)', fontWeight: 600 }}>{selectedCandidate.name}</div>
                      <div style={{ color: 'var(--og-text-muted)', fontSize: 10 }}>MMSI: {selectedCandidate.mmsi}</div>
                    </div>
                    <div style={{ background: 'var(--og-surface-recessed)', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--og-border-subtle)' }}>
                      <div style={{ color: 'var(--og-text-muted)', fontSize: 10 }}>TOTAL CORRELATION</div>
                      <div style={{ color: 'var(--og-violet)', fontWeight: 700, fontSize: 14 }}>
                        {selectedCandidate.totalScore}%
                      </div>
                      <div style={{ color: 'var(--og-violet)', fontSize: 10 }}>HIGH MATCH</div>
                    </div>
                    <div style={{ background: 'var(--og-surface-recessed)', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--og-border-subtle)' }}>
                      <div style={{ color: 'var(--og-text-muted)', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>CLOSEST APPROACH (CPA)</span>
                        <DataProvenance
                          status="DEMONSTRATION"
                          evidenceClass="ANALYTICAL"
                          source="Terrestrial / Satellite AIS Stream"
                          processing="Euclidean distance interpolation between vessel track and origin window"
                          limitation="Interpolated between AIS telemetry fixes; not sole proof of discharge"
                          position="bottom-left"
                        />
                      </div>
                      <div style={{ color: 'var(--og-teal)', fontWeight: 600 }}>{selectedCandidate.cpaKm} km</div>
                      <div style={{ color: 'var(--og-text-muted)', fontSize: 10 }}>at {selectedCandidate.cpaTime || '04:12 UTC'}</div>
                    </div>
                    <div style={{ background: 'var(--og-surface-recessed)', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--og-border-subtle)' }}>
                      <div style={{ color: 'var(--og-text-muted)', fontSize: 10 }}>VESSEL TYPE & FLAG</div>
                      <div style={{ color: 'var(--og-text-secondary)' }}>{selectedCandidate.vesselType || 'Tanker'}</div>
                      <div style={{ color: 'var(--og-text-muted)', fontSize: 10 }}>Flag: {selectedCandidate.flag || 'IN'}</div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* ========================================================== */}
          {/* RIGHT: CANDIDATE VESSELS, TIMELINE & ACTIONS               */}
          {/* ========================================================== */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 5-Stage Investigation Pipeline */}
            <div
              style={{
                backgroundColor: 'var(--og-surface)',
                border: '1px solid var(--og-border-subtle)',
                borderRadius: 8,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ fontSize: 10, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, letterSpacing: '0.04em', color: 'var(--og-text-muted)', textTransform: 'uppercase' }}>
                INVESTIGATION STAGE VERIFICATION
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: 4,
                  fontSize: 9.5,
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              >
                <div style={{ background: 'var(--og-surface-recessed)', padding: '6px 4px', borderRadius: 4, border: '1px solid var(--og-border-subtle)', textAlign: 'center' }}>
                  <div style={{ color: 'var(--og-text-muted)' }}>01 SAR</div>
                  <div style={{ color: 'var(--og-teal)', fontWeight: 600 }}>OBSERVED</div>
                </div>
                <div style={{ background: 'var(--og-surface-recessed)', padding: '6px 4px', borderRadius: 4, border: '1px solid var(--og-border-subtle)', textAlign: 'center' }}>
                  <div style={{ color: 'var(--og-text-muted)' }}>02 DRIFT</div>
                  <div style={{ color: isRealCdse ? 'var(--og-text-muted)' : 'var(--og-amber)', fontWeight: 600 }}>
                    {isRealCdse ? 'PENDING' : 'MODELLED'}
                  </div>
                </div>
                <div style={{ background: 'var(--og-surface-recessed)', padding: '6px 4px', borderRadius: 4, border: '1px solid var(--og-border-subtle)', textAlign: 'center' }}>
                  <div style={{ color: 'var(--og-text-muted)' }}>03 AIS</div>
                  <div style={{ color: isRealCdse ? 'var(--og-text-muted)' : 'var(--og-violet)', fontWeight: 600 }}>
                    {isRealCdse ? 'PENDING' : 'CORRELATED'}
                  </div>
                </div>
                <div style={{ background: 'var(--og-surface-recessed)', padding: '6px 4px', borderRadius: 4, border: '1px solid var(--og-border-subtle)', textAlign: 'center' }}>
                  <div style={{ color: 'var(--og-text-muted)' }}>04 CANDIDATE</div>
                  <div style={{ color: isRealCdse ? 'var(--og-text-muted)' : 'var(--og-violet)', fontWeight: 600 }}>
                    {isRealCdse ? 'NONE' : 'ANALYTICAL'}
                  </div>
                </div>
                <div style={{ background: 'var(--og-surface-recessed)', padding: '6px 4px', borderRadius: 4, border: '1px solid var(--og-border-subtle)', textAlign: 'center' }}>
                  <div style={{ color: 'var(--og-text-muted)' }}>05 DOSSIER</div>
                  <div style={{ color: 'var(--og-success)', fontWeight: 600 }}>READY</div>
                </div>
              </div>
            </div>

            {/* Candidate Vessels Ranking Card */}
            <div
              style={{
                backgroundColor: 'var(--og-surface)',
                border: '1px solid var(--og-border-subtle)',
                borderRadius: 8,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Ship size={15} style={{ color: 'var(--og-violet)' }} />
                  <span style={{ fontSize: 12, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, color: 'var(--og-text-primary)' }}>
                    CANDIDATE VESSEL ATTRIBUTION RANKING
                  </span>
                </div>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono, monospace)', color: 'var(--og-text-muted)' }}>
                  {candidateVessels.length} CANDIDATES
                </span>
              </div>

              {isRealCdse ? (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--og-text-muted)', fontSize: 11, fontFamily: 'var(--font-mono, monospace)' }}>
                  NO AIS CANDIDATES INGESTED FOR THIS REAL CDSE PASS
                </div>
              ) : candidateVessels.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--og-text-muted)', fontSize: 11, fontFamily: 'var(--font-mono, monospace)' }}>
                  No candidate vessels found in temporal window.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {candidateVessels.map((vessel, idx) => {
                    const isCandidateSelected = selectedCandidate?.mmsi === vessel.mmsi;
                    const vName = vessel.name || vessel.vessel?.name || `Vessel #${vessel.mmsi}`;
                    const vMmsi = vessel.mmsi || vessel.vessel?.mmsi;
                    const vScore = vessel.totalScore ?? Math.round((vessel.score || 0.9) * 100);
                    const vCpa = vessel.cpaKm ?? vessel.evidence?.cpaKm ?? 0.8;

                    return (
                      <div
                        key={vMmsi || idx}
                        onClick={() => setSelectedCandidate(vessel)}
                        style={{
                          backgroundColor: isCandidateSelected ? 'var(--og-surface-raised)' : 'var(--og-surface-recessed)',
                          border: isCandidateSelected ? '1px solid var(--og-border-strong)' : '1px solid var(--og-border-subtle)',
                          borderRadius: 6,
                          padding: '10px 12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          transition: 'border-color 100ms, background-color 100ms',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontFamily: 'var(--font-mono, monospace)',
                              fontWeight: 600,
                              color: idx === 0 ? 'var(--og-violet)' : 'var(--og-text-muted)',
                              width: 20,
                            }}
                          >
                            #{idx + 1}
                          </span>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--og-text-primary)', fontFamily: "'Hanken Grotesk', sans-serif" }}>{vName}</div>
                            <div style={{ fontSize: 10, color: 'var(--og-text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>
                              MMSI: {vMmsi} &bull; Flag: {vessel.flag || 'PA'}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 13, fontFamily: 'var(--font-mono, monospace)', fontWeight: 600, color: idx === 0 ? 'var(--og-violet)' : 'var(--og-text-secondary)' }}>
                              {vScore}%
                            </div>
                            <div style={{ fontSize: 9, color: 'var(--og-text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>
                              CPA: {vCpa} km
                            </div>
                          </div>

                          <Link
                            to={`/vessels/${vMmsi}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 6,
                              backgroundColor: 'transparent',
                              border: '1px solid var(--og-border-strong)',
                              color: 'var(--og-text-primary)',
                              fontSize: 10,
                              fontFamily: "'Schibsted Grotesk', sans-serif",
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 2,
                            }}
                          >
                            <span>Inspect</span>
                            <ChevronRight size={11} />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Evidence Timeline Summary */}
            <div
              style={{
                backgroundColor: 'var(--og-surface)',
                border: '1px solid var(--og-border-subtle)',
                borderRadius: 8,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={15} style={{ color: 'var(--og-teal)' }} />
                  <span style={{ fontSize: 12, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, color: 'var(--og-text-primary)' }}>
                    EVIDENCE CHRONOLOGY
                  </span>
                </div>
                <Link
                  to={`/analysis/${targetAnalysisId}?tab=timeline`}
                  style={{ fontSize: 10.5, color: 'var(--og-text-secondary)', fontFamily: "'Schibsted Grotesk', sans-serif", textDecoration: 'none', fontWeight: 500 }}
                >
                  VIEW FULL TIMELINE →
                </Link>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 11 }}>
                  <span style={{ width: 68, flexShrink: 0, fontFamily: 'var(--font-mono, monospace)', color: 'var(--og-text-secondary)', fontWeight: 600 }}>
                    06:15 UTC
                  </span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--og-teal)', fontWeight: 600, marginRight: 6 }}>
                      [OBSERVED]
                    </span>
                    <span style={{ color: 'var(--og-text-secondary)' }}>Sentinel-1 SAR observation captured dark-surface patch ({spill?.areaKm2 || 4.73} km²).</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 11 }}>
                  <span style={{ width: 68, flexShrink: 0, fontFamily: 'var(--font-mono, monospace)', color: 'var(--og-text-secondary)', fontWeight: 600 }}>
                    06:20 UTC
                  </span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', color: isRealCdse ? 'var(--og-text-muted)' : 'var(--og-amber)', fontWeight: 600, marginRight: 6 }}>
                      {isRealCdse ? '[PENDING]' : '[MODELLED]'}
                    </span>
                    <span style={{ color: 'var(--og-text-secondary)' }}>
                      {isRealCdse
                        ? 'Drift hindcast vector generation awaiting MetOcean ingestion.'
                        : 'Reverse Lagrangian drift trajectory reconstructed candidate discharge point (±2.6 km).'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 11 }}>
                  <span style={{ width: 68, flexShrink: 0, fontFamily: 'var(--font-mono, monospace)', color: 'var(--og-text-secondary)', fontWeight: 600 }}>
                    06:32 UTC
                  </span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', color: isRealCdse ? 'var(--og-text-muted)' : 'var(--og-violet)', fontWeight: 600, marginRight: 6 }}>
                      {isRealCdse ? '[ISOLATED]' : '[ANALYTICAL]'}
                    </span>
                    <span style={{ color: 'var(--og-text-secondary)' }}>
                      {isRealCdse
                        ? 'Real scene isolated from synthetic AIS candidate correlation.'
                        : 'AIS trajectory correlation identified top candidate (MV Kandla Star, 94% score, 0.8 km CPA).'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Scientific Limitations & Legal Disclaimer */}
            <div
              style={{
                backgroundColor: 'rgba(231, 166, 58, 0.05)',
                border: '1px solid rgba(231, 166, 58, 0.2)',
                borderRadius: 8,
                padding: '12px 14px',
                fontSize: 10.5,
                color: 'var(--og-text-muted)',
                lineHeight: 1.5,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--og-amber)', fontWeight: 600, marginBottom: 4, fontFamily: "'Hanken Grotesk', sans-serif" }}>
                <AlertCircle size={14} />
                <span>SCIENTIFIC LIMITATIONS & EVIDENTIARY DISCLAIMER</span>
              </div>
              SAR dark-surface segmentation constitutes evidence of a candidate slick, not chemical confirmation of petroleum hydrocarbons. AIS correlation is probabilistic spatial-temporal alignment and does not establish legal culpability. Physical sampling and laboratory gas chromatography remain required for formal maritime attribution.
            </div>

            {/* Action Panel / Next Actions */}
            <div
              style={{
                backgroundColor: 'var(--og-surface)',
                border: '1px solid var(--og-border-subtle)',
                borderRadius: 8,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ fontSize: 10, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, letterSpacing: '0.04em', color: 'var(--og-text-muted)', textTransform: 'uppercase' }}>
                INVESTIGATION DISPATCH ACTIONS
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Link
                  to={`/analysis/${targetAnalysisId}`}
                  style={{
                    backgroundColor: 'var(--og-violet)',
                    color: '#FFFFFF',
                    borderRadius: 8,
                    padding: '8px 14px',
                    fontSize: 11,
                    fontFamily: "'Schibsted Grotesk', sans-serif",
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    textDecoration: 'none',
                    transition: 'opacity 120ms',
                  }}
                >
                  <span>OPEN FORENSIC ANALYSIS</span>
                  <ArrowRight size={13} />
                </Link>

                <Link
                  to="/reports"
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid var(--og-border-strong)',
                    color: 'var(--og-text-primary)',
                    borderRadius: 8,
                    padding: '8px 14px',
                    fontSize: 11,
                    fontFamily: "'Schibsted Grotesk', sans-serif",
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    textDecoration: 'none',
                    transition: 'background-color 120ms',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--og-surface-raised)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <FileText size={13} />
                  <span>DOSSIER ARCHIVE</span>
                </Link>
              </div>

              {selectedCandidate && (
                <Link
                  to={`/vessels/${selectedCandidate.mmsi || '419001234'}`}
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid var(--og-border-strong)',
                    color: 'var(--og-text-primary)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: 11,
                    fontFamily: "'Schibsted Grotesk', sans-serif",
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    textDecoration: 'none',
                    transition: 'background-color 120ms',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--og-surface-raised)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Ship size={13} style={{ color: 'var(--og-violet)' }} />
                  <span>INSPECT CANDIDATE ({selectedCandidate.name || selectedCandidate.mmsi})</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
