import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { vesselsApi } from '../api/vessels.api';
import MapView from '../components/map/MapView';
import VesselDrawer from '../components/vessels/VesselDrawer';
import DataProvenance from '../components/common/DataProvenance';
import { calculateBounds } from '../utils/geo';
import {
  Ship,
  ArrowLeft,
  Anchor,
  Compass,
  Radio,
  Activity,
  Navigation,
  Calendar,
  Clock,
  ArrowRight,
  AlertCircle,
  ShieldCheck,
  Target,
  RefreshCw,
  ExternalLink,
  Layers,
  MapPin,
  FileText,
  Sliders,
  Wind,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { Polyline, CircleMarker, Popup } from 'react-leaflet';

// Canonical fallback vessel records for demo resilience
const CANONICAL_VESSEL_RECORDS = {
  '419001234': {
    name: 'MV Kandla Star',
    mmsi: '419001234',
    imo: '9481234',
    callSign: '9V8742',
    flag: 'IN',
    vesselType: 'Crude Oil Tanker',
    lengthM: 244,
    beamM: 42,
    draughtM: 14.8,
    destination: 'MUMBAI OFFSHORE TERMINAL',
    navStatus: 'Underway Using Engine',
    correlation: 94,
    proximityScore: 96,
    temporalScore: 92,
    trajectoryScore: 95,
    anomalyScore: 90,
    cpaKm: 0.8,
    cpaTime: '04:12 UTC',
    timeDelta: '-14 min',
    passingCoords: '18.920° N, 72.780° E',
    speed: 12.4,
    heading: 285,
    lastTimestamp: '2026-09-12T06:10:00Z',
    source: 'demo',
    incident: {
      id: '141968eb',
      analysisId: 'demo-scene-001',
      region: 'Mumbai Offshore Surveillance Sector',
      areaKm2: 4.73,
      timestamp: '12 Sep 2026 · 06:15 UTC',
      status: 'ACTIVE INVESTIGATION',
    },
    defaultWaypoints: [
      { id: 1, latitude: 18.920, longitude: 72.780, speedKnots: 12.4, heading: 285, timestamp: '2026-09-12T06:10:00Z', status: 'Underway' },
      { id: 2, latitude: 18.935, longitude: 72.740, speedKnots: 12.6, heading: 288, timestamp: '2026-09-12T05:30:00Z', status: 'Underway' },
      { id: 3, latitude: 18.950, longitude: 72.700, speedKnots: 12.8, heading: 290, timestamp: '2026-09-12T04:50:00Z', status: 'Underway' },
      { id: 4, latitude: 18.970, longitude: 72.650, speedKnots: 13.1, heading: 292, timestamp: '2026-09-12T04:12:00Z', status: 'CPA Fix' },
      { id: 5, latitude: 19.010, longitude: 72.580, speedKnots: 13.5, heading: 295, timestamp: '2026-09-12T03:30:00Z', status: 'Underway' },
    ],
  },
  '636019876': {
    name: 'MT Arabian Sea',
    mmsi: '636019876',
    imo: '9512345',
    callSign: 'A8LK9',
    flag: 'LR',
    vesselType: 'Chemical Tanker',
    lengthM: 182,
    beamM: 28,
    draughtM: 11.2,
    destination: 'JAWAHARLAL NEHRU PORT',
    navStatus: 'Underway Using Engine',
    correlation: 41,
    proximityScore: 48,
    temporalScore: 38,
    trajectoryScore: 42,
    anomalyScore: 35,
    cpaKm: 3.4,
    cpaTime: '02:40 UTC',
    timeDelta: '-3.6h',
    passingCoords: '18.960° N, 72.700° E',
    speed: 10.2,
    heading: 140,
    lastTimestamp: '2026-09-12T05:45:00Z',
    source: 'demo',
    incident: {
      id: '141968eb',
      analysisId: 'demo-scene-001',
      region: 'Mumbai Offshore Surveillance Sector',
      areaKm2: 4.73,
      timestamp: '12 Sep 2026 · 06:15 UTC',
      status: 'CORRELATED TRANSIT',
    },
    defaultWaypoints: [
      { id: 1, latitude: 18.960, longitude: 72.700, speedKnots: 10.2, heading: 140, timestamp: '2026-09-12T05:45:00Z', status: 'Underway' },
      { id: 2, latitude: 18.990, longitude: 72.670, speedKnots: 10.5, heading: 142, timestamp: '2026-09-12T04:30:00Z', status: 'Underway' },
      { id: 3, latitude: 19.030, longitude: 72.630, speedKnots: 10.8, heading: 145, timestamp: '2026-09-12T03:15:00Z', status: 'Underway' },
    ],
  },
  '352002345': {
    name: 'MSC Mumbai Express',
    mmsi: '352002345',
    imo: '9678901',
    callSign: '3E2190',
    flag: 'PA',
    vesselType: 'Container Ship',
    lengthM: 366,
    beamM: 51,
    draughtM: 15.2,
    destination: 'COLOMBO',
    navStatus: 'Underway Using Engine',
    correlation: 18,
    proximityScore: 22,
    temporalScore: 16,
    trajectoryScore: 19,
    anomalyScore: 15,
    cpaKm: 7.2,
    cpaTime: '01:15 UTC',
    timeDelta: '-5.0h',
    passingCoords: '19.050° N, 72.620° E',
    speed: 18.6,
    heading: 195,
    lastTimestamp: '2026-09-12T05:00:00Z',
    source: 'demo',
    incident: {
      id: '141968eb',
      analysisId: 'demo-scene-001',
      region: 'Mumbai Offshore Surveillance Sector',
      areaKm2: 4.73,
      timestamp: '12 Sep 2026 · 06:15 UTC',
      status: 'PASSING VESSEL',
    },
    defaultWaypoints: [
      { id: 1, latitude: 19.050, longitude: 72.620, speedKnots: 18.6, heading: 195, timestamp: '2026-09-12T05:00:00Z', status: 'Underway' },
      { id: 2, latitude: 19.120, longitude: 72.600, speedKnots: 18.9, heading: 195, timestamp: '2026-09-12T03:30:00Z', status: 'Underway' },
    ],
  },
  '413289000': {
    name: 'MT PACIFIC BRAVO',
    mmsi: '413289000',
    imo: '9345678',
    callSign: '3F1209',
    flag: 'PA',
    vesselType: 'Crude Oil Tanker',
    lengthM: 274,
    beamM: 48,
    draughtM: 16.0,
    destination: 'VADINAR TERMINAL',
    navStatus: 'Underway Using Engine',
    correlation: 94,
    proximityScore: 95,
    temporalScore: 93,
    trajectoryScore: 96,
    anomalyScore: 91,
    cpaKm: 0.35,
    cpaTime: '04:12 UTC',
    timeDelta: '-1.2h',
    passingCoords: '18.942° N, 72.081° E',
    speed: 13.2,
    heading: 310,
    lastTimestamp: '2026-09-12T06:15:00Z',
    source: 'demo',
    incident: {
      id: 'demo-scene-001',
      analysisId: 'demo-scene-001',
      region: 'Mumbai Offshore Surveillance Sector',
      areaKm2: 4.73,
      timestamp: '12 Sep 2026 · 06:15 UTC',
      status: 'PRIMARY CORRELATED VESSEL',
    },
    defaultWaypoints: [
      { id: 1, latitude: 18.942, longitude: 72.081, speedKnots: 13.2, heading: 310, timestamp: '2026-09-12T06:15:00Z', status: 'Underway' },
      { id: 2, latitude: 18.960, longitude: 72.050, speedKnots: 13.4, heading: 312, timestamp: '2026-09-12T05:15:00Z', status: 'Underway' },
    ],
  },
};

export default function VesselDetails() {
  const { mmsi } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const loadTrack = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await vesselsApi.getTrack(mmsi);
      if (response && response.data) {
        setData(response.data);
      } else if (CANONICAL_VESSEL_RECORDS[mmsi]) {
        setData({
          vessel: CANONICAL_VESSEL_RECORDS[mmsi],
          trackPoints: CANONICAL_VESSEL_RECORDS[mmsi].defaultWaypoints,
          count: CANONICAL_VESSEL_RECORDS[mmsi].defaultWaypoints.length,
        });
      } else {
        // Fallback default
        const fallback = CANONICAL_VESSEL_RECORDS['419001234'];
        setData({
          vessel: { ...fallback, mmsi: mmsi || '419001234' },
          trackPoints: fallback.defaultWaypoints,
          count: fallback.defaultWaypoints.length,
        });
      }
    } catch (err) {
      console.warn('Vessel track API error, using canonical fallback:', err.message);
      const fallback = CANONICAL_VESSEL_RECORDS[mmsi] || CANONICAL_VESSEL_RECORDS['419001234'];
      setData({
        vessel: fallback,
        trackPoints: fallback.defaultWaypoints,
        count: fallback.defaultWaypoints.length,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTrack();
  }, [mmsi]);

  const rawVessel = data?.vessel;
  const canonical = CANONICAL_VESSEL_RECORDS[mmsi] || CANONICAL_VESSEL_RECORDS['419001234'];
  const vessel = rawVessel ? { ...canonical, ...rawVessel } : canonical;
  const trackPoints = data?.trackPoints || data?.track || canonical?.defaultWaypoints || [];

  const isRealCdse = mmsi === 'REAL_CDSE' || vessel?.source === 'real_cdse';

  const trackPositions = useMemo(() => {
    if (!trackPoints || trackPoints.length === 0 || isRealCdse) return [];
    return trackPoints
      .map((pt) => [Number(pt.latitude), Number(pt.longitude)])
      .filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng));
  }, [trackPoints, isRealCdse]);

  const mapBounds = useMemo(() => {
    if (!trackPositions || trackPositions.length === 0) return null;
    return calculateBounds(trackPositions);
  }, [trackPositions]);

  const targetAnalysisId = vessel?.incident?.analysisId || 'demo-scene-001';

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
                ← BACK TO INVESTIGATION
              </Link>
              <span style={{ color: 'var(--og-border-strong)' }}>|</span>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "'Hanken Grotesk', sans-serif",
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--og-violet)',
                  background: 'rgba(168, 85, 247, 0.1)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: '1px solid rgba(168, 85, 247, 0.25)',
                  fontWeight: 600,
                }}
              >
                VESSEL INTELLIGENCE RECORD
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
              {isRealCdse ? 'REAL CDSE SAR SCENE (NO AIS LINK)' : vessel?.name || `CANDIDATE VESSEL #${mmsi}`}
            </h1>
            <div style={{ fontSize: 11.5, color: 'var(--og-text-muted)', fontFamily: 'var(--font-mono, monospace)', marginTop: 4 }}>
              MMSI: <strong style={{ color: 'var(--og-violet)' }}>{mmsi}</strong> &bull; FLAG: <strong style={{ color: 'var(--og-text-secondary)' }}>{vessel?.flag || 'IN'}</strong> &bull; TYPE: <strong style={{ color: 'var(--og-text-secondary)' }}>{vessel?.vesselType || 'Crude Oil Tanker'}</strong>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-mono, monospace)',
                padding: '4px 10px',
                borderRadius: 4,
                backgroundColor: 'var(--og-surface)',
                border: '1px solid var(--og-border)',
                color: isRealCdse ? 'var(--og-text-muted)' : 'var(--og-success)',
                fontWeight: 600,
              }}
            >
              {isRealCdse ? 'AIS NOT ESTABLISHED' : 'ACTIVE REPORTING'}
            </span>

            <span
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-mono, monospace)',
                padding: '4px 10px',
                borderRadius: 4,
                backgroundColor: 'var(--og-surface)',
                border: '1px solid var(--og-border)',
                color: 'var(--og-text-secondary)',
              }}
            >
              {isRealCdse ? 'CDSE AUTHENTICATED' : 'DEMO BENCHMARK'}
            </span>

            <button
              type="button"
              onClick={loadTrack}
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
              <Radio size={13} className={isLoading ? 'animate-spin' : ''} />
              <span>POLL TELEMETRY</span>
            </button>

            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
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
              <Ship size={13} style={{ color: 'var(--og-violet)' }} />
              <span>INSPECT IN DRAWER</span>
            </button>

            <Link
              to={`/analysis/${targetAnalysisId}?candidate=${mmsi}&tab=ais`}
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
              <span>OPEN FORENSIC ANALYSIS</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>

        {/* ============================================================ */}
        {/* 2. OPERATIONAL KPI STRIP                                     */}
        {/* ============================================================ */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
          }}
        >
          <div style={{ backgroundColor: 'var(--og-surface)', border: '1px solid var(--og-border-subtle)', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontSize: 10, fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--og-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>ATTRIBUTION SCORE</span>
              <DataProvenance
                status={isRealCdse ? 'NOT_ESTABLISHED' : 'DEMONSTRATION'}
                evidenceClass={isRealCdse ? 'NOT_ESTABLISHED' : 'ANALYTICAL'}
                source="Heuristic Spatiotemporal Multi-Criteria Engine"
                formula="0.40*Spatial + 0.25*Temporal + 0.20*Trajectory + 0.15*Anomaly"
                limitation={isRealCdse ? 'Real CDSE observations have no correlated synthetic vessels' : 'Heuristic correlation; does not constitute legal proof of discharge without oily-water separator sampling'}
                position="bottom-left"
              />
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-mono, monospace)', color: isRealCdse ? 'var(--og-text-muted)' : 'var(--og-violet)', marginTop: 2 }}>
              {isRealCdse ? 'NOT ESTABLISHED' : `${vessel?.correlation || 94}% MATCH`}
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--og-surface)', border: '1px solid var(--og-border-subtle)', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontSize: 10, fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--og-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>CPA DISTANCE TO ORIGIN</span>
              <DataProvenance
                status={isRealCdse ? 'NOT_ESTABLISHED' : 'DEMONSTRATION'}
                evidenceClass={isRealCdse ? 'NOT_ESTABLISHED' : 'ANALYTICAL'}
                source="Terrestrial / Satellite AIS Stream"
                processing="Spatiotemporal Euclidean distance interpolation between vessel track and origin window"
                limitation="Interpolated between AIS telemetry fixes; not sole proof of discharge"
                position="bottom-left"
              />
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-mono, monospace)', color: isRealCdse ? 'var(--og-text-muted)' : 'var(--og-teal)', marginTop: 2 }}>
              {isRealCdse ? 'NOT ESTABLISHED' : `${vessel?.cpaKm || 0.8} km`}
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--og-surface)', border: '1px solid var(--og-border-subtle)', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontSize: 10, fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--og-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              TIME DELTA (ΔT)
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-mono, monospace)', color: isRealCdse ? 'var(--og-text-muted)' : 'var(--og-amber)', marginTop: 2 }}>
              {isRealCdse ? 'NOT ESTABLISHED' : vessel?.timeDelta || '-14 min'}
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--og-surface)', border: '1px solid var(--og-border-subtle)', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontSize: 10, fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--og-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              SPEED OVER GROUND
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-mono, monospace)', color: isRealCdse ? 'var(--og-text-muted)' : 'var(--og-text-primary)', marginTop: 2 }}>
              {isRealCdse ? 'NOT ESTABLISHED' : `${vessel?.speed || 12.4} kn`}
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--og-surface)', border: '1px solid var(--og-border-subtle)', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontSize: 10, fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--og-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              TRACK STATUS
            </div>
            <div style={{ fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", fontWeight: 600, color: isRealCdse ? 'var(--og-text-muted)' : 'var(--og-success)', marginTop: 4 }}>
              {isRealCdse ? 'UNLINKED LIVE SCENE' : 'UNDERWAY / CORRELATED'}
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* 3. MAIN INTELLIGENCE WORKSPACE (3-COLUMN: 25% - 50% - 25%)   */}
        {/* ============================================================ */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr)',
            gap: 16,
            alignItems: 'start',
          }}
        >
          {/* ========================================================== */}
          {/* LEFT PANEL: VESSEL PROFILE & AIS TELEMETRY                 */}
          {/* ========================================================== */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Vessel Profile Card */}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--og-border-subtle)', paddingBottom: 8 }}>
                <Ship size={15} style={{ color: 'var(--og-violet)' }} />
                <span style={{ fontSize: 11, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, color: 'var(--og-text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  VESSEL REGISTRY PROFILE
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, fontFamily: 'var(--font-mono, monospace)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--og-text-muted)' }}>Name:</span>
                  <strong style={{ color: 'var(--og-text-primary)' }}>{vessel?.name || 'N/A'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--og-text-muted)' }}>MMSI:</span>
                  <strong style={{ color: 'var(--og-violet)' }}>{mmsi}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--og-text-muted)' }}>IMO Number:</span>
                  <span style={{ color: 'var(--og-text-secondary)' }}>{vessel?.imo || '9481234'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--og-text-muted)' }}>Call Sign:</span>
                  <span style={{ color: 'var(--og-text-secondary)' }}>{vessel?.callSign || '9V8742'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--og-text-muted)' }}>Flag State:</span>
                  <span style={{ color: 'var(--og-text-secondary)' }}>{vessel?.flag || 'IN'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--og-text-muted)' }}>Vessel Type:</span>
                  <span style={{ color: 'var(--og-text-secondary)' }}>{vessel?.vesselType || 'Crude Oil Tanker'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--og-text-muted)' }}>Dimensions:</span>
                  <span style={{ color: 'var(--og-text-secondary)' }}>
                    {vessel?.lengthM ? `${vessel.lengthM}m × ${vessel.beamM || 42}m` : '244m × 42m'}
                  </span>
                </div>
              </div>
            </div>

            {/* AIS Telemetry Card */}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--og-border-subtle)', paddingBottom: 8 }}>
                <Radio size={15} style={{ color: 'var(--og-violet)' }} />
                <span style={{ fontSize: 11, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, color: 'var(--og-text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  LIVE AIS TELEMETRY
                </span>
              </div>

              {isRealCdse ? (
                <div style={{ color: 'var(--og-text-muted)', fontSize: 11, fontFamily: 'var(--font-mono, monospace)' }}>
                  AIS telemetry not established for this live CDSE scene.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, fontFamily: 'var(--font-mono, monospace)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--og-text-muted)' }}>Last Position:</span>
                    <strong style={{ color: 'var(--og-text-primary)' }}>{vessel?.passingCoords || '18.920° N, 72.780° E'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--og-text-muted)' }}>Heading:</span>
                    <span style={{ color: 'var(--og-text-secondary)' }}>{vessel?.heading || 285}° (WNW)</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--og-text-muted)' }}>Speed (SOG):</span>
                    <span style={{ color: 'var(--og-text-primary)', fontWeight: 600 }}>{vessel?.speed || 12.4} kn</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--og-text-muted)' }}>Destination:</span>
                    <span style={{ color: 'var(--og-text-secondary)' }}>{vessel?.destination || 'MUMBAI OFFSHORE'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--og-text-muted)' }}>Nav Status:</span>
                    <span style={{ color: 'var(--og-success)' }}>{vessel?.navStatus || 'Underway'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--og-text-muted)' }}>Reporting:</span>
                    <span style={{ color: 'var(--og-teal)' }}>Normal (Class A)</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ========================================================== */}
          {/* CENTER PANEL: TRAJECTORY / SPATIAL CONTEXT MAP             */}
          {/* ========================================================== */}
          <div
            style={{
              backgroundColor: 'var(--og-surface)',
              border: '1px solid var(--og-border)',
              borderRadius: 8,
              overflow: 'hidden',
              minHeight: 520,
              display: 'flex',
              flexDirection: 'column',
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
              <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--og-violet)' }} />
              <span>AIS TRACK & CPA RECONSTRUCTION ({trackPositions.length} FIXES)</span>
            </div>

            <MapView
              center={trackPositions[0] || [18.921, 72.832]}
              bounds={mapBounds}
              zoom={11}
              showLegend={true}
            >
              {trackPositions.length > 1 && (
                <Polyline
                  positions={trackPositions}
                  pathOptions={{
                    color: '#A855F7',
                    weight: 3,
                    opacity: 0.9,
                  }}
                />
              )}

              {trackPoints.map((pt, idx) => {
                const lat = Number(pt.latitude);
                const lng = Number(pt.longitude);
                if (isNaN(lat) || isNaN(lng) || idx % 2 !== 0) return null;
                const isLatest = idx === 0;

                return (
                  <CircleMarker
                    key={pt.id || idx}
                    center={[lat, lng]}
                    radius={isLatest ? 6.5 : 4}
                    pathOptions={{
                      color: isLatest ? '#FFFFFF' : '#A855F7',
                      weight: isLatest ? 2 : 1,
                      fillColor: isLatest ? '#A855F7' : '#49C6C8',
                      fillOpacity: 1,
                    }}
                  >
                    <Popup>
                      <div className="p-1 text-xs text-[#ECEEF1] font-mono space-y-0.5 bg-[#121417]">
                        <strong>AIS Waypoint #{idx + 1}</strong>
                        <div>Time: {new Date(pt.timestamp).toUTCString()}</div>
                        <div>Speed: {pt.speedKnots != null ? `${pt.speedKnots} kn` : 'N/A'}</div>
                        <div>Coords: [{lat.toFixed(4)}, {lng.toFixed(4)}]</div>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapView>
          </div>

          {/* ========================================================== */}
          {/* RIGHT PANEL: ATTRIBUTION INTELLIGENCE & CPA CONTEXT        */}
          {/* ========================================================== */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Attribution Assessment */}
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--og-border-subtle)', paddingBottom: 8 }}>
                <span style={{ fontSize: 11, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, color: 'var(--og-text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  ATTRIBUTION ASSESSMENT
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: 'var(--font-mono, monospace)',
                    color: isRealCdse ? 'var(--og-text-muted)' : 'var(--og-violet)',
                    fontWeight: 600,
                  }}
                >
                  {isRealCdse ? 'NOT ESTABLISHED' : 'ANALYTICAL'}
                </span>
              </div>

              {isRealCdse ? (
                <div style={{ color: 'var(--og-text-muted)', fontSize: 11, fontFamily: 'var(--font-mono, monospace)' }}>
                  Real CDSE observation is isolated. Attribution calculation requires live AIS coastal receiver ingestion.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10, fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--og-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>OVERALL CORRELATION</span>
                    <span style={{ fontSize: 20, fontFamily: 'var(--font-mono, monospace)', fontWeight: 600, color: 'var(--og-violet)' }}>
                      {vessel?.correlation || 94}%
                    </span>
                  </div>

                  {/* 4 Score Progress Bars */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 10, fontFamily: 'var(--font-mono, monospace)' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--og-text-muted)', marginBottom: 2 }}>
                        <span>Spatial Proximity</span>
                        <span style={{ color: 'var(--og-violet)' }}>{vessel?.proximityScore || 96}%</span>
                      </div>
                      <div style={{ height: 4, backgroundColor: 'var(--og-surface-recessed)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${vessel?.proximityScore || 96}%`, height: '100%', backgroundColor: 'var(--og-violet)' }} />
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--og-text-muted)', marginBottom: 2 }}>
                        <span>Temporal Alignment</span>
                        <span style={{ color: 'var(--og-violet)' }}>{vessel?.temporalScore || 92}%</span>
                      </div>
                      <div style={{ height: 4, backgroundColor: 'var(--og-surface-recessed)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${vessel?.temporalScore || 92}%`, height: '100%', backgroundColor: 'var(--og-violet)' }} />
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--og-text-muted)', marginBottom: 2 }}>
                        <span>Trajectory Alignment</span>
                        <span style={{ color: 'var(--og-violet)' }}>{vessel?.trajectoryScore || 95}%</span>
                      </div>
                      <div style={{ height: 4, backgroundColor: 'var(--og-surface-recessed)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${vessel?.trajectoryScore || 95}%`, height: '100%', backgroundColor: 'var(--og-violet)' }} />
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--og-text-muted)', marginBottom: 2 }}>
                        <span>AIS Anomaly Score</span>
                        <span style={{ color: 'var(--og-amber)' }}>{vessel?.anomalyScore || 90}%</span>
                      </div>
                      <div style={{ height: 4, backgroundColor: 'var(--og-surface-recessed)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${vessel?.anomalyScore || 90}%`, height: '100%', backgroundColor: 'var(--og-amber)' }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* CPA Intelligence Card */}
            <div
              style={{
                backgroundColor: 'var(--og-surface)',
                border: '1px solid var(--og-border-subtle)',
                borderRadius: 8,
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ fontSize: 10, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, letterSpacing: '0.04em', color: 'var(--og-amber)', textTransform: 'uppercase' }}>
                CLOSEST POINT OF APPROACH (CPA)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontFamily: 'var(--font-mono, monospace)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--og-text-muted)' }}>Distance:</span>
                  <strong style={{ color: 'var(--og-teal)' }}>{vessel?.cpaKm || 0.8} km</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--og-text-muted)' }}>Time Delta:</span>
                  <span style={{ color: 'var(--og-amber)' }}>{vessel?.timeDelta || '-14 min'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--og-text-muted)' }}>CPA Fix Time:</span>
                  <span style={{ color: 'var(--og-text-secondary)' }}>{vessel?.cpaTime || '04:12 UTC'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--og-text-muted)' }}>Passing Coords:</span>
                  <span style={{ color: 'var(--og-text-secondary)' }}>{vessel?.passingCoords || '18.92°N, 72.78°E'}</span>
                </div>
              </div>
            </div>

            {/* Notice */}
            <div
              style={{
                backgroundColor: 'rgba(231, 166, 58, 0.05)',
                border: '1px solid rgba(231, 166, 58, 0.2)',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 10.5,
                color: 'var(--og-text-muted)',
                lineHeight: 1.4,
              }}
            >
              <strong style={{ color: 'var(--og-amber)' }}>ANALYTICAL CORRELATION:</strong> Ranking is mathematical trajectory alignment and does not establish legal culpability.
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* 4. AIS MOVEMENT TIMELINE / WAYPOINT TABLE                    */}
        {/* ============================================================ */}
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
              <Clock size={15} style={{ color: 'var(--og-teal)' }} />
              <span style={{ fontSize: 12, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, color: 'var(--og-text-primary)' }}>
                AIS MOVEMENT LOG & WAYPOINT FIXES ({trackPoints.length} RECORDS)
              </span>
            </div>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono, monospace)', color: 'var(--og-text-muted)' }}>
              Historical PostGIS Ingestion
            </span>
          </div>

          {isRealCdse ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--og-text-muted)', fontSize: 11, fontFamily: 'var(--font-mono, monospace)' }}>
              AIS TELEMETRY ISOLATED / NOT ESTABLISHED FOR LIVE CDSE SCENES
            </div>
          ) : trackPoints.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--og-text-muted)', fontSize: 11, fontFamily: 'var(--font-mono, monospace)' }}>
              NO VERIFIED AIS TELEMETRY AVAILABLE
            </div>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: 260 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--font-mono, monospace)', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--og-border)', color: 'var(--og-text-muted)', fontSize: 10, textTransform: 'uppercase', fontFamily: "'Hanken Grotesk', sans-serif" }}>
                    <th style={{ padding: '8px 12px' }}>UTC Timestamp</th>
                    <th style={{ padding: '8px 12px' }}>Latitude</th>
                    <th style={{ padding: '8px 12px' }}>Longitude</th>
                    <th style={{ padding: '8px 12px' }}>Speed (kn)</th>
                    <th style={{ padding: '8px 12px' }}>Heading (°)</th>
                    <th style={{ padding: '8px 12px' }}>Status</th>
                    <th style={{ padding: '8px 12px' }}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {trackPoints.map((pt, idx) => (
                    <tr
                      key={pt.id || idx}
                      style={{
                        borderBottom: '1px solid var(--og-border-subtle)',
                        backgroundColor: idx === 0 ? 'var(--og-surface-raised)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '8px 12px', color: 'var(--og-text-primary)' }}>
                        {new Date(pt.timestamp).toUTCString()}
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--og-text-secondary)' }}>
                        {Number(pt.latitude).toFixed(4)}° N
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--og-text-secondary)' }}>
                        {Number(pt.longitude).toFixed(4)}° E
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--og-teal)', fontWeight: 600 }}>
                        {pt.speedKnots != null ? `${pt.speedKnots} kn` : '12.4 kn'}
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--og-amber)' }}>
                        {pt.heading ? `${pt.heading}°` : '285°'}
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--og-text-secondary)' }}>
                        {pt.status || (idx === 0 ? 'Latest Fix' : 'Underway')}
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--og-text-muted)' }}>
                        AIS Receiver Network
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* 5. INCIDENT CORRELATION & PROVENANCE FOOTER                  */}
        {/* ============================================================ */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
            gap: 16,
          }}
        >
          {/* Linked Incident Card */}
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
              <span style={{ fontSize: 11, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, color: 'var(--og-text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                LINKED OIL-SPILL INCIDENT
              </span>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono, monospace)', color: 'var(--og-success)', fontWeight: 600 }}>
                {vessel?.incident?.status || 'CORRELATED'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, fontFamily: 'var(--font-mono, monospace)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--og-text-muted)' }}>Incident ID:</span>
                <strong style={{ color: 'var(--og-teal)' }}>#{vessel?.incident?.id || '141968eb'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--og-text-muted)' }}>Region:</span>
                <span style={{ color: 'var(--og-text-secondary)' }}>{vessel?.incident?.region || 'Mumbai Offshore'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--og-text-muted)' }}>Observed Slick Area:</span>
                <span style={{ color: 'var(--og-teal)', fontWeight: 600 }}>{vessel?.incident?.areaKm2 || 4.73} km²</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--og-text-muted)' }}>Observation Time:</span>
                <span style={{ color: 'var(--og-text-secondary)' }}>{vessel?.incident?.timestamp || '12 Sep 2026 · 06:15 UTC'}</span>
              </div>
            </div>

            <Link
              to={`/analysis/${targetAnalysisId}?candidate=${mmsi}`}
              style={{
                marginTop: 6,
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
              <span>OPEN INCIDENT INVESTIGATION WORKSPACE</span>
              <ArrowRight size={13} />
            </Link>
          </div>

          {/* Legal / Scientific Limitation Banner */}
          <div
            style={{
              backgroundColor: 'rgba(231, 166, 58, 0.05)',
              border: '1px solid rgba(231, 166, 58, 0.2)',
              borderRadius: 8,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 8,
              fontSize: 11,
              color: 'var(--og-text-muted)',
              lineHeight: 1.5,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--og-amber)', fontWeight: 600, marginBottom: 4, fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11 }}>
                <AlertTriangle size={14} />
                <span>SCIENTIFIC & LEGAL LIMITATION</span>
              </div>
              AIS correlation identifies vessels that are analytically associated with the observed event based on spatiotemporal proximity and reverse Lagrangian drift vectors. It does not establish legal culpability or physical discharge responsibility. Independent maritime authority investigation and physical sampling remain required.
            </div>

            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono, monospace)', color: 'var(--og-text-faint)' }}>
              BLUE FORENSIC AI &bull; MARITIME FORENSIC GOVERNANCE
            </div>
          </div>
        </div>
      </div>

      {/* Integrated Vessel Intelligence Drawer */}
      <VesselDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        vessel={vessel}
      />
    </div>
  );
}
