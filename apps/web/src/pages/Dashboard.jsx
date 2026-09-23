import React, { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSpillStore } from '../app/store/spillStore';
import { useAuthStore } from '../app/store/authStore';

// Map Components (LOCKED - Untouched internals)
import MapView from '../components/map/MapView';
import SlickLayer from '../components/map/SlickLayer';
import OriginLayer from '../components/map/OriginLayer';
import TrajectoryLayer from '../components/map/TrajectoryLayer';
import VesselLayer from '../components/map/VesselLayer';
import MapLegend from '../components/map/MapLegend';

// Drawers & Modals (Retained for seamless interaction)
import ModelDrawer from '../components/analysis/ModelDrawer';
import VesselDrawer from '../components/vessels/VesselDrawer';
import SarEvidenceViewer from '../components/analysis/SarEvidenceViewer';
import SystemStatusModal from '../components/layout/SystemStatusModal';

// Badges & Common UI
import EvidenceBadge from '../components/common/EvidenceBadge';
import SourceBadge from '../components/common/SourceBadge';
import { SkeletonMap } from '../components/common/Skeleton';
import { parseWktPolygon, calculateBounds } from '../utils/geo';

// Lucide Icons
import {
  Droplet,
  ChevronRight,
  Search,
  Layers,
  AlertCircle,
  Radar,
  ArrowRight,
  Activity,
  Navigation,
  Globe,
  Satellite,
  Mountain,
  Clock,
  Eye,
  EyeOff,
  MapPin,
  Crosshair,
} from 'lucide-react';

// Canonical Multi-Scenario Data
const SCENARIOS = [
  {
    id: 'demo-scene-001',
    name: '001 — Mumbai Offshore Corridor',
    sector: 'Mumbai Offshore Surveillance Sector (ISRO/NRSC Active Zone 4)',
    activeTarget: '#141968eb',
    center: [18.94, 72.81],
    originCoords: [19.113, 72.544],
    uncertaintyKm: 2.6,
    areaKm2: 4.73,
    confidence: 94,
    driftKm: 36.8,
    driftSpeed: '0.83 kt NW',
    isRealScene: false,
    spillGeomWkt: 'POLYGON((72.800 18.900, 72.860 18.900, 72.860 18.942, 72.800 18.942, 72.800 18.900))',
    slicks: [
      { id: '043e9402', title: 'Potential Oil Slick #043e9402', mission: '#M-26143-A', lat: 18.94, lng: 72.81, area: 4.73, conf: 94, date: '12 Sep 2026' },
      { id: '141968eb', title: 'Potential Oil Slick #141968eb', mission: '#M-26143-B', lat: 18.92, lng: 72.80, area: 3.60, conf: 93, date: '12 Sep 2026' },
      { id: 'bfbf7b01', title: 'Potential Oil Slick #bfbf7b01', mission: '#M-26143-C', lat: 18.89, lng: 72.85, area: 2.84, conf: 89, date: '12 Sep 2026' },
      { id: '13c0b39e', title: 'Potential Oil Slick #13c0b39e', mission: '#M-26143-D', lat: 18.95, lng: 72.76, area: 1.95, conf: 82, date: '11 Sep 2026' },
    ],
    vessels: [
      {
        id: 'vessel-1',
        mmsi: '419001234',
        name: 'MV Kandla Star',
        flag: 'IN',
        vesselType: 'Crude Oil Tanker',
        latitude: 18.92,
        longitude: 72.78,
        heading: 285,
        speed: 12.4,
        correlation: 94,
        sub: 'AIS · heading 285° · 72.78°E',
        evidence: {
          closestApproachKm: 0.8,
          distanceKm: 0.8,
          timeDeltaMinutes: -14,
          passingLat: 18.914,
          passingLng: 72.788,
          speedKnots: 12.4,
          headingDeg: 285,
        },
      },
      {
        id: 'vessel-2',
        mmsi: '419005678',
        name: 'MT Indrayani',
        flag: 'SG',
        vesselType: 'Chemical Tanker',
        latitude: 18.89,
        longitude: 72.85,
        heading: 212,
        speed: 8.2,
        correlation: 41,
        sub: 'AIS · heading 212° · 72.85°E',
        evidence: {
          closestApproachKm: 4.6,
          distanceKm: 4.6,
          timeDeltaMinutes: 48,
          passingLat: 18.89,
          passingLng: 72.85,
          speedKnots: 8.2,
          headingDeg: 212,
        },
      },
      {
        id: 'vessel-3',
        mmsi: '419009999',
        name: 'Unknown trawler',
        flag: 'UNK',
        vesselType: 'Fishing Vessel',
        latitude: 18.95,
        longitude: 72.90,
        heading: 140,
        speed: 5.1,
        correlation: 18,
        sub: 'No AIS · radar return · 72.90°E',
        evidence: {
          closestApproachKm: 8.2,
          distanceKm: 8.2,
          timeDeltaMinutes: 110,
          passingLat: 18.95,
          passingLng: 72.90,
          speedKnots: 5.1,
          headingDeg: 140,
        },
      },
    ],
    trajectory: [
      { latitude: 18.94, longitude: 72.81, timestamp: '2026-09-12T06:15:00Z', type: 'OBSERVED' },
      { latitude: 18.92, longitude: 72.80, timestamp: '2026-09-12T06:20:00Z', type: 'HINDCAST' },
      { latitude: 18.91, longitude: 72.79, timestamp: '2026-09-12T06:32:00Z', type: 'ORIGIN' },
      { latitude: 18.92, longitude: 72.78, timestamp: '2026-09-12T07:04:00Z', type: 'VESSEL_MATCH' },
      { latitude: 18.95, longitude: 72.76, timestamp: '2026-09-12T12:00:00Z', type: 'FORECAST' },
    ],
  },
  {
    id: 'demo-scene-002',
    name: '002 — Gulf of Kutch Sanctuary',
    sector: 'Gulf of Kutch Marine Sanctuary Surveillance Zone',
    activeTarget: '#22486915',
    center: [22.45, 69.21],
    originCoords: [22.512, 69.115],
    uncertaintyKm: 2.1,
    areaKm2: 3.82,
    confidence: 91,
    driftKm: 22.4,
    driftSpeed: '0.62 kt WSW',
    isRealScene: false,
    spillGeomWkt: 'POLYGON((69.180 22.430, 69.240 22.430, 69.240 22.470, 69.180 22.470, 69.180 22.430))',
    slicks: [
      { id: '22486915', title: 'Potential Oil Slick #22486915', mission: '#M-KUTCH-01', lat: 22.45, lng: 69.21, area: 3.82, conf: 91, date: '11 Sep 2026' },
      { id: '22516911', title: 'Potential Oil Slick #22516911', mission: '#M-KUTCH-02', lat: 22.51, lng: 69.12, area: 2.15, conf: 85, date: '11 Sep 2026' },
    ],
    vessels: [
      {
        id: 'vessel-k1',
        mmsi: '419002345',
        name: 'MT Saurashtra Star',
        flag: 'IN',
        vesselType: 'Crude Carrier',
        latitude: 22.48,
        longitude: 69.15,
        heading: 260,
        speed: 11.2,
        correlation: 88,
        sub: 'AIS · heading 260° · 69.15°E',
        evidence: { closestApproachKm: 1.1, distanceKm: 1.1, timeDeltaMinutes: -22 },
      },
    ],
    trajectory: [
      { latitude: 22.45, longitude: 69.21, timestamp: '2026-09-12T06:15:00Z', type: 'OBSERVED' },
      { latitude: 22.512, longitude: 69.115, timestamp: '2026-09-12T06:32:00Z', type: 'ORIGIN' },
    ],
  },
  {
    id: 'demo-scene-003',
    name: '003 — Paradip Port / Bay of Bengal',
    sector: 'Paradip Port Anchorage Surveillance Corridor',
    activeTarget: '#20288661',
    center: [20.24, 86.68],
    originCoords: [20.315, 86.542],
    uncertaintyKm: 3.2,
    areaKm2: 5.15,
    confidence: 87,
    driftKm: 44.1,
    driftSpeed: '1.02 kt NE',
    isRealScene: false,
    spillGeomWkt: 'POLYGON((86.880 20.120, 86.960 20.120, 86.960 20.180, 86.880 20.180, 86.880 20.120))',
    slicks: [
      { id: '20288661', title: 'Potential Oil Slick #20288661', mission: '#M-PARADIP-01', lat: 20.24, lng: 86.68, area: 5.15, conf: 87, date: '10 Sep 2026' },
    ],
    vessels: [
      {
        id: 'vessel-p1',
        mmsi: '419003456',
        name: 'MV Mahanadi Pride',
        flag: 'PA',
        vesselType: 'Bulk Carrier',
        latitude: 20.28,
        longitude: 86.61,
        heading: 45,
        speed: 13.8,
        correlation: 82,
        sub: 'AIS · heading 045° · 86.61°E',
        evidence: { closestApproachKm: 1.4, distanceKm: 1.4, timeDeltaMinutes: -35 },
      },
    ],
    trajectory: [
      { latitude: 20.24, longitude: 86.68, timestamp: '2026-09-12T06:15:00Z', type: 'OBSERVED' },
      { latitude: 20.315, longitude: 86.542, timestamp: '2026-09-12T06:32:00Z', type: 'ORIGIN' },
    ],
  },
  {
    id: 'demo-scene-004',
    name: '004 — Goa Coastal Corridor',
    sector: 'Goa Coastal Transit Corridor (Malabar Coast)',
    activeTarget: '#15417368',
    center: [15.38, 73.72],
    originCoords: [15.442, 73.618],
    uncertaintyKm: 1.9,
    areaKm2: 2.91,
    confidence: 84,
    driftKm: 18.6,
    driftSpeed: '0.54 kt SSW',
    isRealScene: false,
    spillGeomWkt: 'POLYGON((73.490 15.260, 73.550 15.260, 73.550 15.300, 73.490 15.300, 73.490 15.260))',
    slicks: [
      { id: '15417368', title: 'Potential Oil Slick #15417368', mission: '#M-GOA-01', lat: 15.38, lng: 73.72, area: 2.91, conf: 84, date: '09 Sep 2026' },
    ],
    vessels: [
      {
        id: 'vessel-g1',
        mmsi: '419004567',
        name: 'MT Mandovi Star',
        flag: 'IN',
        vesselType: 'Coastal Tanker',
        latitude: 15.41,
        longitude: 73.68,
        heading: 195,
        speed: 9.6,
        correlation: 76,
        sub: 'AIS · heading 195° · 73.68°E',
        evidence: { closestApproachKm: 1.8, distanceKm: 1.8, timeDeltaMinutes: -40 },
      },
    ],
    trajectory: [
      { latitude: 15.38, longitude: 73.72, timestamp: '2026-09-12T06:15:00Z', type: 'OBSERVED' },
      { latitude: 15.442, longitude: 73.618, timestamp: '2026-09-12T06:32:00Z', type: 'ORIGIN' },
    ],
  },
  {
    id: 'cdse-s1a-real-001',
    name: 'REAL CDSE Sentinel-1 SAR Pass',
    sector: 'Copernicus Data Space Authenticated Sentinel-1 Pass',
    activeTarget: '#CDSE-S1A-REAL',
    center: [18.94, 72.81],
    originCoords: [18.91, 72.79],
    uncertaintyKm: 1.5,
    areaKm2: 2.84,
    confidence: 89,
    driftKm: 14.2,
    driftSpeed: '0.60 kt NW',
    isRealScene: true,
    slicks: [
      { id: 'cdse-real-01', title: 'Sentinel-1A IW GRDH Feature', mission: '#CDSE-PASS', lat: 18.94, lng: 72.81, area: 2.84, conf: 89, date: '12 Sep 2026' },
    ],
    vessels: [],
    trajectory: [
      { latitude: 18.94, longitude: 72.81, timestamp: '2026-09-12T06:15:00Z', type: 'OBSERVED' },
    ],
  },
];

export default function Dashboard() {
  const { spills, fetchSpills, isLoading, error } = useSpillStore();
  const { user } = useAuthStore();

  const [searchParams] = useSearchParams();
  const scenarioFromQuery = searchParams.get('scenario');

  const [selectedScenarioId, setSelectedScenarioId] = useState(() => {
    if (scenarioFromQuery && SCENARIOS.some((s) => s.id === scenarioFromQuery)) {
      return scenarioFromQuery;
    }
    return 'demo-scene-001';
  });

  const [selectedSlick, setSelectedSlick] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [filterMode, setFilterMode] = useState('ALL'); // 'ALL' | 'HIGH' | 'RECENT'
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  const [mapViewMode, setMapViewMode] = useState('operational'); // 'operational' | 'satellite' | 'terrain'
  const [showLayerPanel, setShowLayerPanel] = useState(false);

  // Sync scenario if searchParam changes
  useEffect(() => {
    if (scenarioFromQuery && SCENARIOS.some((s) => s.id === scenarioFromQuery)) {
      setSelectedScenarioId(scenarioFromQuery);
    }
  }, [scenarioFromQuery]);

  // Modals / Drawers State (Retained for modal triggers when explicitly requested)
  const [isModelDrawerOpen, setIsModelDrawerOpen] = useState(false);
  const [isVesselDrawerOpen, setIsVesselDrawerOpen] = useState(false);
  const [isSarViewerOpen, setIsSarViewerOpen] = useState(false);
  const [isSystemStatusOpen, setIsSystemStatusOpen] = useState(false);

  // Map Controls State
  const [layers, setLayers] = useState({
    sar: true,
    drift: true,
    ais: true,
    grid: true,
  });
  const [focusTarget, setFocusTarget] = useState(null);

  const toggleLayer = (key) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    fetchSpills();
  }, [fetchSpills]);

  const currentScenario = useMemo(() => {
    return SCENARIOS.find((s) => s.id === selectedScenarioId) || SCENARIOS[0];
  }, [selectedScenarioId]);

  useEffect(() => {
    if (currentScenario.slicks && currentScenario.slicks.length > 0) {
      setSelectedSlick(currentScenario.slicks[0]);
    }
    if (currentScenario.vessels && currentScenario.vessels.length > 0) {
      setSelectedCandidate(currentScenario.vessels[0]);
    } else {
      setSelectedCandidate(null);
    }
  }, [currentScenario]);

  const activeSpill = useMemo(() => {
    const slick = selectedSlick || (currentScenario.slicks && currentScenario.slicks[0]);
    const matchingSpill = spills?.find((s) => s.id === slick?.id || s.scenarioId === currentScenario.id);
    if (matchingSpill) {
      return {
        ...matchingSpill,
        latitude: Number(matchingSpill.latitude || slick?.lat || currentScenario.center[0]),
        longitude: Number(matchingSpill.longitude || slick?.lng || currentScenario.center[1]),
        areaKm2: matchingSpill.areaKm2 || slick?.area || currentScenario.areaKm2,
        confidence: matchingSpill.confidence || (slick?.conf || currentScenario.confidence) / 100,
        geomWkt: matchingSpill.geomWkt || currentScenario.spillGeomWkt,
        isRealScene: currentScenario.isRealScene,
      };
    }
    return {
      id: slick?.id || currentScenario.id,
      name: slick?.title || currentScenario.name,
      areaKm2: slick?.area || currentScenario.areaKm2,
      confidence: (slick?.conf || currentScenario.confidence) / 100,
      latitude: slick?.lat || currentScenario.center[0],
      longitude: slick?.lng || currentScenario.center[1],
      geomWkt: currentScenario.spillGeomWkt,
      isRealScene: currentScenario.isRealScene,
    };
  }, [spills, currentScenario, selectedSlick]);

  const mapBounds = useMemo(() => {
    if (!activeSpill) return null;
    const points = [];
    if (activeSpill.latitude && activeSpill.longitude) {
      points.push([Number(activeSpill.latitude), Number(activeSpill.longitude)]);
    }
    if (currentScenario.originCoords && !currentScenario.isRealScene) {
      points.push(currentScenario.originCoords);
    }
    if (currentScenario.vessels && currentScenario.vessels.length > 0 && !currentScenario.isRealScene) {
      points.push([currentScenario.vessels[0].latitude, currentScenario.vessels[0].longitude]);
    }
    const poly = parseWktPolygon(activeSpill.geomWkt);
    if (poly && poly.length > 0) points.push(...poly);
    return points.length > 0 ? calculateBounds(points) : null;
  }, [activeSpill, currentScenario]);

  const filteredSlicks = useMemo(() => {
    let list = currentScenario.slicks || [];
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          (s.mission && s.mission.toLowerCase().includes(q))
      );
    }
    if (filterMode === 'HIGH') {
      list = list.filter((s) => (s.conf || 0) >= 88);
    } else if (filterMode === 'RECENT') {
      list = [...list].reverse();
    }
    return list;
  }, [currentScenario, searchFilter, filterMode]);

  const kpiStats = useMemo(() => {
    const totalSlicks = spills && spills.length > 0 ? spills.length : 40;
    const highConf = spills && spills.length > 0
      ? spills.filter((s) => (s.confidence ?? 0) >= 0.8).length || 20
      : 20;
    const totalArea = spills && spills.length > 0
      ? spills.reduce((sum, s) => sum + (Number(s.areaKm2) || 0), 0).toFixed(2)
      : '91.21';
    const completedMissions = 20;
    return { totalSlicks, highConf, totalArea, completedMissions };
  }, [spills]);

  // Dynamic Investigation Pipeline Stages
  const pipelineStages = useMemo(() => {
    if (currentScenario.isRealScene) {
      return [
        { id: 'sar', name: 'SENTINEL-1', status: 'AVAILABLE', label: 'CDSE PASS', active: true },
        { id: 'detect', name: 'SAR DETECTION', status: 'READY', label: 'RAW SAR', active: true },
        { id: 'drift', name: 'DRIFT MODEL', status: 'NOT ESTABLISHED', label: 'UNLINKED', active: false },
        { id: 'ais', name: 'AIS CORRELATION', status: 'NOT ESTABLISHED', label: 'NO TRACKS', active: false },
        { id: 'vessel', name: 'VESSEL CANDIDATE', status: 'NOT ESTABLISHED', label: 'UNLINKED', active: false },
        { id: 'dossier', name: 'EVIDENCE DOSSIER', status: 'PENDING', label: 'INCOMPLETE', active: false },
      ];
    }
    const candidateCount = currentScenario.vessels?.length || 0;
    const topCandidateName = currentScenario.vessels?.[0]?.name || 'Attributed';
    return [
      { id: 'sar', name: 'SENTINEL-1', status: 'AVAILABLE', label: 'C-BAND SAR', active: true },
      { id: 'detect', name: 'SAR DETECTION', status: 'COMPLETE', label: `${currentScenario.confidence}% CONF`, active: true },
      { id: 'drift', name: 'DRIFT MODEL', status: 'COMPLETE', label: '-24h / +6h', active: true },
      { id: 'ais', name: 'AIS CORRELATION', status: 'COMPLETE', label: `${candidateCount} ${candidateCount === 1 ? 'TRACK' : 'TRACKS'}`, active: true },
      { id: 'vessel', name: 'VESSEL CANDIDATE', status: 'AVAILABLE', label: topCandidateName, active: true },
      { id: 'dossier', name: 'EVIDENCE DOSSIER', status: 'AVAILABLE', label: 'AUDIT READY', active: true },
    ];
  }, [currentScenario]);

  // Top candidate vessels (up to 3)
  const topCandidates = useMemo(() => {
    return (currentScenario.vessels || []).slice(0, 3);
  }, [currentScenario]);

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: 'var(--og-bg, #0A0B0D)',
        color: 'var(--og-text-primary, #E7EAEE)',
        fontFamily: "var(--og-font-body, 'Schibsted Grotesk', -apple-system, sans-serif)",
        padding: '10px 14px',
        boxSizing: 'border-box',
        gap: '8px',
      }}
    >
      {/* ── 1. MISSION CONTEXT HEADER & 4 COMPACT KPIS (TOP COMPACT REGION) ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
        {/* Mission Context Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
          <div>
            <h1
              style={{
                fontFamily: "var(--og-font-display, 'Hanken Grotesk', sans-serif)",
                fontSize: '16px',
                fontWeight: 500,
                color: 'var(--og-text-primary, #ECEEF1)',
                margin: '0 0 2px 0',
                letterSpacing: '-0.01em',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>{currentScenario.sector}</span>
              <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--og-text-muted, #777E87)', fontFamily: "var(--og-font-body, 'Schibsted Grotesk', sans-serif)" }}>
                ({currentScenario.center[0]}°N, {currentScenario.center[1]}°E)
              </span>
            </h1>
            <div style={{ fontSize: '11.5px', color: 'var(--og-text-muted, #777E87)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span>Target: <strong style={{ color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 500 }}>{currentScenario.activeTarget}</strong></span>
              <span style={{ color: 'var(--og-border-strong, #343940)' }}>·</span>
              <span>Area: <strong style={{ color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 500 }}>{currentScenario.areaKm2} km²</strong></span>
              <span style={{ color: 'var(--og-border-strong, #343940)' }}>·</span>
              <span>SAR Conf: <strong style={{ color: 'var(--og-teal-soft, #78DADD)', fontWeight: 500 }}>{currentScenario.confidence}%</strong></span>
              <span style={{ color: 'var(--og-border-strong, #343940)' }}>·</span>
              <span>Origin: <strong style={{ color: 'var(--og-amber-soft, #F2BC62)', fontWeight: 500 }}>{currentScenario.originCoords[0]}°N, {currentScenario.originCoords[1]}°E</strong></span>
            </div>
          </div>

          {/* Scenario Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <select
              value={selectedScenarioId}
              onChange={(e) => setSelectedScenarioId(e.target.value)}
              aria-label="Select Mission Scenario"
              style={{
                background: 'var(--og-surface-recessed, #0C0E11)',
                border: '1px solid var(--og-border, #25292F)',
                color: 'var(--og-text-primary, #ECEEF1)',
                borderRadius: 'var(--og-radius-base, 8px)',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 500,
                cursor: 'pointer',
                outline: 'none',
                fontFamily: "var(--og-font-body, 'Schibsted Grotesk', -apple-system, sans-serif)",
              }}
            >
              {SCENARIOS.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.name}
                </option>
              ))}
            </select>

            <SourceBadge mode={currentScenario.isRealScene ? 'REAL' : 'DEMO'} size="sm" />
          </div>
        </div>

        {/* 4 Ultra-Compact Operational KPI Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: '8px',
          }}
        >
          {/* KPI 1: Potential Oil Slicks */}
          <div
            style={{
              background: 'var(--og-surface, #121417)',
              border: '1px solid var(--og-border-subtle, rgba(255, 255, 255, 0.055))',
              borderRadius: 'var(--og-radius-base, 8px)',
              padding: '6px 12px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '62px',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--og-text-muted, #777E87)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                POTENTIAL OIL SLICKS
              </span>
              <EvidenceBadge type="OBSERVED" size="xs" />
            </div>
            <div
              style={{
                fontFamily: "var(--og-font-display, 'Hanken Grotesk', sans-serif)",
                fontSize: '26px',
                fontWeight: 500,
                color: 'var(--og-text-primary, #ECEEF1)',
                lineHeight: 1.1,
                margin: '2px 0',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {kpiStats.totalSlicks}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--og-text-muted, #777E87)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Current operational theater
            </div>
          </div>

          {/* KPI 2: High Confidence */}
          <div
            style={{
              background: 'var(--og-surface, #121417)',
              border: '1px solid var(--og-border-subtle, rgba(255, 255, 255, 0.055))',
              borderRadius: 'var(--og-radius-base, 8px)',
              padding: '6px 12px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '62px',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--og-text-muted, #777E87)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                HIGH CONFIDENCE (≥80%)
              </span>
              <EvidenceBadge type="OBSERVED" size="xs" />
            </div>
            <div
              style={{
                fontFamily: "var(--og-font-display, 'Hanken Grotesk', sans-serif)",
                fontSize: '26px',
                fontWeight: 500,
                color: 'var(--og-text-primary, #ECEEF1)',
                lineHeight: 1.1,
                margin: '2px 0',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {kpiStats.highConf}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--og-text-muted, #777E87)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Validated dark spot segmentation
            </div>
          </div>

          {/* KPI 3: Affected Marine Area */}
          <div
            style={{
              background: 'var(--og-surface, #121417)',
              border: '1px solid var(--og-border-subtle, rgba(255, 255, 255, 0.055))',
              borderRadius: 'var(--og-radius-base, 8px)',
              padding: '6px 12px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '62px',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--og-text-muted, #777E87)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                AFFECTED MARINE AREA
              </span>
              <EvidenceBadge type="OBSERVED" size="xs" />
            </div>
            <div
              style={{
                fontFamily: "var(--og-font-display, 'Hanken Grotesk', sans-serif)",
                fontSize: '26px',
                fontWeight: 500,
                color: 'var(--og-text-primary, #ECEEF1)',
                lineHeight: 1.1,
                margin: '2px 0',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {kpiStats.totalArea} <span style={{ fontSize: '12px', color: 'var(--og-text-muted, #777E87)', fontWeight: 400 }}>km²</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--og-text-muted, #777E87)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Combined slick footprint surface
            </div>
          </div>

          {/* KPI 4: Completed Missions */}
          <div
            style={{
              background: 'var(--og-surface, #121417)',
              border: '1px solid var(--og-border-subtle, rgba(255, 255, 255, 0.055))',
              borderRadius: 'var(--og-radius-base, 8px)',
              padding: '6px 12px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '62px',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--og-text-muted, #777E87)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                COMPLETED MISSIONS
              </span>
              <EvidenceBadge type="MODELLED" size="xs" />
            </div>
            <div
              style={{
                fontFamily: "var(--og-font-display, 'Hanken Grotesk', sans-serif)",
                fontSize: '26px',
                fontWeight: 500,
                color: 'var(--og-text-primary, #ECEEF1)',
                lineHeight: 1.1,
                margin: '2px 0',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {kpiStats.completedMissions}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--og-text-muted, #777E87)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Drift & attribution runs
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. DOMINANT MAIN WORKSPACE (MAP-FIRST 3-COLUMN WORKSTATION) ──────── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: 'minmax(240px, 23%) 1fr minmax(250px, 23%)',
          gap: '8px',
          alignItems: 'stretch',
          overflow: 'hidden',
        }}
      >
        {/* ── LEFT COLUMN: COMPACT DETECTED SLICKS LIST ─────────────────────── */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--og-surface, #121417)',
            border: '1px solid var(--og-border-subtle, rgba(255, 255, 255, 0.055))',
            borderRadius: 'var(--og-radius-base, 8px)',
            overflow: 'hidden',
            height: '100%',
          }}
        >
          {/* Panel Header */}
          <div
            style={{
              padding: '8px 10px',
              borderBottom: '1px solid var(--og-border-subtle, rgba(255, 255, 255, 0.055))',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              flexShrink: 0,
            }}
          >
            {/* Title & Count Row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 500,
                    color: 'var(--og-text-primary, #ECEEF1)',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    fontFamily: "var(--og-font-display, 'Hanken Grotesk', sans-serif)",
                  }}
                >
                  DETECTED SLICKS
                </div>
                <div style={{ fontSize: '11px', color: 'var(--og-text-muted, #777E87)' }}>
                  SAR dark spot detections
                </div>
              </div>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  color: 'var(--og-text-primary, #ECEEF1)',
                  background: 'var(--og-surface-raised, #171A1E)',
                  border: '1px solid var(--og-border, #25292F)',
                  borderRadius: 'var(--og-radius-sm, 4px)',
                  padding: '2px 7px',
                  fontFamily: "var(--og-font-mono, 'Schibsted Grotesk', monospace)",
                }}
              >
                {filteredSlicks.length}
              </span>
            </div>

            {/* Search Input & Filter Chips */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={12} style={{ position: 'absolute', left: '7px', color: 'var(--og-text-muted, #777E87)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  placeholder="Search detections..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  style={{
                    width: '100%',
                    height: '26px',
                    padding: '0 8px 0 24px',
                    background: 'var(--og-surface-recessed, #0C0E11)',
                    border: '1px solid var(--og-border, #25292F)',
                    borderRadius: 'var(--og-radius-sm, 4px)',
                    color: 'var(--og-text-primary, #ECEEF1)',
                    fontSize: '11px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    fontFamily: "var(--og-font-body, 'Schibsted Grotesk', sans-serif)",
                  }}
                />
              </div>

              {/* Filter Chips */}
              <div style={{ display: 'flex', gap: '4px' }}>
                {[
                  { id: 'ALL', label: 'All' },
                  { id: 'HIGH', label: 'High (≥88%)' },
                  { id: 'RECENT', label: 'Recent' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilterMode(tab.id)}
                    style={{
                      flex: 1,
                      background: filterMode === tab.id ? 'var(--og-surface-elevated, #1D2025)' : 'transparent',
                      color: filterMode === tab.id ? 'var(--og-text-primary, #ECEEF1)' : 'var(--og-text-muted, #777E87)',
                      border: filterMode === tab.id ? '1px solid var(--og-border-strong, #343940)' : '1px solid transparent',
                      borderRadius: 'var(--og-radius-sm, 4px)',
                      padding: '3px 0',
                      fontSize: '11px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      fontFamily: "var(--og-font-body, 'Schibsted Grotesk', sans-serif)",
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Scrollable List Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {isLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    style={{
                      background: 'var(--og-surface, #121417)',
                      border: '1px solid var(--og-border-subtle, rgba(255, 255, 255, 0.055))',
                      borderRadius: 'var(--og-radius-base, 8px)',
                      padding: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '5px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ width: '55%', height: '12px', background: 'var(--og-surface-elevated, #1D2025)', borderRadius: '3px' }} />
                      <div style={{ width: '25%', height: '12px', background: 'var(--og-surface-elevated, #1D2025)', borderRadius: '3px' }} />
                    </div>
                    <div style={{ width: '40%', height: '10px', background: 'var(--og-surface-elevated, #1D2025)', borderRadius: '3px' }} />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div style={{ padding: '16px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '6px' }}>
                <AlertCircle size={18} style={{ color: 'var(--og-error, #F87171)' }} />
                <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--og-text-primary, #ECEEF1)' }}>
                  DETECTION DATA UNAVAILABLE
                </span>
                <button
                  type="button"
                  onClick={() => fetchSpills()}
                  style={{
                    background: 'var(--og-surface-elevated, #1D2025)',
                    border: '1px solid var(--og-border-strong, #343940)',
                    borderRadius: 'var(--og-radius-sm, 4px)',
                    color: 'var(--og-text-primary, #ECEEF1)',
                    fontSize: '11px',
                    padding: '3px 8px',
                    cursor: 'pointer',
                    marginTop: '2px',
                  }}
                >
                  Retry
                </button>
              </div>
            ) : currentScenario.isRealScene && (!filteredSlicks || filteredSlicks.length === 0) ? (
              <div style={{ padding: '16px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '6px' }}>
                <Radar size={18} style={{ color: 'var(--og-teal, #49C6C8)' }} />
                <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--og-text-primary, #ECEEF1)' }}>
                  NO VERIFIED SLICK DETECTION
                </span>
                <span style={{ fontSize: '11px', color: 'var(--og-text-muted, #777E87)', lineHeight: 1.3 }}>
                  Real Sentinel-1 pass is available, but no ground-truth slick is confirmed.
                </span>
              </div>
            ) : filteredSlicks.length === 0 ? (
              <div style={{ padding: '16px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '4px' }}>
                <Droplet size={18} style={{ color: 'var(--og-text-muted, #777E87)' }} />
                <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--og-text-primary, #ECEEF1)' }}>
                  NO DETECTIONS
                </span>
              </div>
            ) : (
              filteredSlicks.map((slick) => {
                const isSelected = selectedSlick?.id === slick.id;
                const provenanceLabel = currentScenario.isRealScene ? 'REAL CDSE' : 'OBSERVED';

                return (
                  <div
                    key={slick.id}
                    onClick={() => {
                      setSelectedSlick(slick);
                      setFocusTarget([slick.lat, slick.lng]);
                    }}
                    style={{
                      background: isSelected ? 'var(--og-surface-raised, #171A1E)' : 'var(--og-surface, #121417)',
                      border: isSelected ? '1px solid var(--og-border-strong, #343940)' : '1px solid var(--og-border-subtle, rgba(255, 255, 255, 0.055))',
                      borderRadius: 'var(--og-radius-base, 8px)',
                      padding: '8px 10px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      transition: 'background 0.15s ease, border-color 0.15s ease',
                      boxSizing: 'border-box',
                    }}
                  >
                    {/* Row 1: Title & Provenance Badge */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--og-teal, #49C6C8)',
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 500,
                            color: 'var(--og-text-primary, #ECEEF1)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {slick.title}
                        </span>
                      </div>
                      <EvidenceBadge type="OBSERVED" label={provenanceLabel} size="xs" />
                    </div>

                    {/* Row 2: Coordinates */}
                    <div style={{ fontSize: '11px', color: 'var(--og-text-muted, #777E87)', fontFamily: "var(--og-font-mono, 'Schibsted Grotesk', monospace)", fontVariantNumeric: 'tabular-nums' }}>
                      {slick.lat}°N, {slick.lng}°E
                    </div>

                    {/* Row 3: Area & Confidence */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11.5px' }}>
                      <span style={{ color: 'var(--og-text-secondary, #B1B6BD)', fontWeight: 400 }}>
                        {slick.area} km²
                      </span>
                      <strong style={{ color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {slick.conf}%
                      </strong>
                    </div>

                    {/* Row 4: Timestamp & Actions */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '11px',
                        color: 'var(--og-text-muted, #777E87)',
                        borderTop: '1px solid var(--og-border-subtle, rgba(255, 255, 255, 0.055))',
                        paddingTop: '4px',
                        marginTop: '2px',
                      }}
                    >
                      <span>{slick.date || '14.5h ago'}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSlick(slick);
                            setFocusTarget([slick.lat, slick.lng]);
                          }}
                          style={{
                            color: isSelected ? 'var(--og-text-primary, #ECEEF1)' : 'var(--og-text-muted, #777E87)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px',
                            fontSize: '11px',
                            fontWeight: 500,
                            cursor: 'pointer',
                          }}
                        >
                          Focus
                        </span>
                        {currentScenario.isRealScene ? (
                          <Link
                            to={`/analysis/REAL_CDSE?tab=sar`}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              color: 'var(--og-violet, #A855F7)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '2px',
                              fontSize: '11px',
                              fontWeight: 500,
                              textDecoration: 'none',
                            }}
                          >
                            Analyze →
                          </Link>
                        ) : (
                          <Link
                            to={`/analysis/${currentScenario.id}?slick=${slick.id}&tab=investigation`}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              color: 'var(--og-violet, #A855F7)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '2px',
                              fontSize: '11px',
                              fontWeight: 500,
                              textDecoration: 'none',
                            }}
                          >
                            Analyze →
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── CENTER COLUMN: LARGE DOMINANT MAP WORKSPACE (HERO) ─────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0px', minWidth: 0, height: '100%', overflow: 'hidden' }}>
          {/* Leaflet Dark Map (DOMINANT HEIGHT - LOCKED INTERNALS) */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              position: 'relative',
              borderRadius: 'var(--og-radius-base, 8px)',
              overflow: 'hidden',
              background: 'var(--og-bg, #0A0B0D)',
              border: '1px solid var(--og-border, #25292F)',
            }}
          >
            {isLoading && spills.length === 0 ? (
              <SkeletonMap height="100%" />
            ) : (
              <MapView
                center={focusTarget || currentScenario.center}
                bounds={focusTarget ? null : mapBounds}
                zoom={10}
                showLegend={false}
                mapMode={mapViewMode}
              >
                {/* Observed Slick Layer (Primary) */}
                {layers.sar && activeSpill && !currentScenario.isRealScene && (
                  <SlickLayer spill={activeSpill} />
                )}

                {/* Modelled Origin Layer (Secondary, without uncertainty radius circle clutter) */}
                {layers.drift && currentScenario.originCoords && !currentScenario.isRealScene && (
                  <OriginLayer
                    origin={{
                      latitude: currentScenario.originCoords[0],
                      longitude: currentScenario.originCoords[1],
                      uncertaintyRadiusKm: currentScenario.uncertaintyKm,
                      timestamp: '2026-09-12T06:32:00Z',
                      scenarioId: currentScenario.id,
                    }}
                    showUncertainty={false}
                  />
                )}

                {/* Top AIS Candidate Vessel Only (Optional, without CPA line clutter) */}
                {layers.ais && currentScenario.vessels && currentScenario.vessels.length > 0 && !currentScenario.isRealScene && (
                  <VesselLayer
                    vessels={[currentScenario.vessels[0]]}
                    selectedVessel={selectedCandidate}
                    showCpaLine={false}
                    onSelectVessel={(cand) => setSelectedCandidate(cand)}
                  />
                )}
              </MapView>
            )}

            {/* ── OPERATIONAL HUD: Top-left situation context ──────────────── */}
            <div
              style={{
                position: 'absolute',
                top: '10px',
                left: '10px',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                pointerEvents: 'auto',
              }}
            >
              {/* Status Beacon + Scene Context */}
              <div
                style={{
                  background: 'rgba(12, 14, 17, 0.92)',
                  border: '1px solid var(--og-border-strong, #343940)',
                  borderRadius: 'var(--og-radius-base, 8px)',
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.55)',
                  maxWidth: '320px',
                }}
              >
                {/* Pulsing Status Beacon */}
                <div style={{ position: 'relative', width: '10px', height: '10px', flexShrink: 0 }}>
                  <span
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: '50%',
                      backgroundColor: currentScenario.isRealScene ? 'var(--og-teal, #49C6C8)' : '#4ADE80',
                      animation: 'ogPulse 2s ease-in-out infinite',
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      inset: '2px',
                      borderRadius: '50%',
                      backgroundColor: currentScenario.isRealScene ? 'var(--og-teal, #49C6C8)' : '#4ADE80',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      color: currentScenario.isRealScene ? 'var(--og-teal-soft, #78DADD)' : '#4ADE80',
                      textTransform: 'uppercase',
                    }}>
                      {currentScenario.isRealScene ? 'LIVE PASS' : 'ACTIVE'}
                    </span>
                    <SourceBadge mode={currentScenario.isRealScene ? 'REAL' : 'DEMO'} size="xs" />
                  </div>
                  <span style={{
                    fontSize: '11.5px',
                    fontWeight: 500,
                    color: 'var(--og-text-primary, #ECEEF1)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {currentScenario.name}
                  </span>
                  <span style={{
                    fontSize: '10px',
                    color: 'var(--og-text-muted, #777E87)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}>
                    <MapPin size={9} />
                    {currentScenario.center[0]}°N, {currentScenario.center[1]}°E
                  </span>
                </div>
              </div>

              {/* Quick Metrics Overlay */}
              {!currentScenario.isRealScene && (
                <div
                  style={{
                    background: 'rgba(12, 14, 17, 0.88)',
                    border: '1px solid var(--og-border, #25292F)',
                    borderRadius: 'var(--og-radius-base, 8px)',
                    padding: '6px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
                    fontSize: '11px',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--og-teal, #49C6C8)' }} />
                    <span style={{ color: 'var(--og-text-muted, #777E87)' }}>Area</span>
                    <strong style={{ color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{currentScenario.areaKm2} km²</strong>
                  </span>
                  <span style={{ color: 'var(--og-border-strong, #343940)' }}>│</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--og-teal, #49C6C8)' }} />
                    <span style={{ color: 'var(--og-text-muted, #777E87)' }}>Conf</span>
                    <strong style={{ color: 'var(--og-teal-soft, #78DADD)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{currentScenario.confidence}%</strong>
                  </span>
                  <span style={{ color: 'var(--og-border-strong, #343940)' }}>│</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--og-amber, #E7A63A)' }} />
                    <span style={{ color: 'var(--og-text-muted, #777E87)' }}>Drift</span>
                    <strong style={{ color: 'var(--og-amber-soft, #F2BC62)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{currentScenario.driftKm} km</strong>
                  </span>
                </div>
              )}
            </div>

            {/* ── TOP-RIGHT: View Switcher + Focus Actions ────────────────── */}
            <div
              style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                alignItems: 'flex-end',
                pointerEvents: 'auto',
              }}
            >
              {/* View Mode Switcher */}
              <div
                style={{
                  background: 'rgba(12, 14, 17, 0.92)',
                  border: '1px solid var(--og-border-strong, #343940)',
                  borderRadius: 'var(--og-radius-base, 8px)',
                  padding: '3px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.55)',
                }}
              >
                {[
                  { id: 'operational', icon: Globe, label: 'Operational' },
                  { id: 'satellite', icon: Satellite, label: 'Satellite' },
                  { id: 'terrain', icon: Mountain, label: 'Terrain' },
                ].map(({ id, icon: Icon, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMapViewMode(id)}
                    title={label}
                    aria-label={`${label} view`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: mapViewMode === id ? '4px 10px' : '4px 7px',
                      background: mapViewMode === id ? 'var(--og-surface-elevated, #1D2025)' : 'transparent',
                      border: mapViewMode === id ? '1px solid var(--og-border-strong, #343940)' : '1px solid transparent',
                      borderRadius: '6px',
                      color: mapViewMode === id ? 'var(--og-text-primary, #ECEEF1)' : 'var(--og-text-muted, #777E87)',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 500,
                      fontFamily: "var(--og-font-body, 'Schibsted Grotesk', sans-serif)",
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Icon size={13} />
                    {mapViewMode === id && <span>{label}</span>}
                  </button>
                ))}
              </div>

              {/* Quick Focus Actions */}
              <div
                style={{
                  background: 'rgba(12, 14, 17, 0.92)',
                  border: '1px solid var(--og-border-strong, #343940)',
                  borderRadius: 'var(--og-radius-base, 8px)',
                  padding: '3px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.55)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setFocusTarget(currentScenario.center)}
                  title="Focus on slick"
                  aria-label="Focus on slick"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '28px',
                    height: '28px',
                    background: 'transparent',
                    border: '1px solid transparent',
                    borderRadius: '6px',
                    color: 'var(--og-teal-soft, #78DADD)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--og-surface-elevated, #1D2025)'; e.currentTarget.style.borderColor = 'var(--og-border-strong, #343940)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
                >
                  <Crosshair size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setFocusTarget(currentScenario.originCoords)}
                  title="Focus on origin"
                  aria-label="Focus on modelled origin"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '28px',
                    height: '28px',
                    background: 'transparent',
                    border: '1px solid transparent',
                    borderRadius: '6px',
                    color: 'var(--og-amber-soft, #F2BC62)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--og-surface-elevated, #1D2025)'; e.currentTarget.style.borderColor = 'var(--og-border-strong, #343940)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
                >
                  <Navigation size={14} />
                </button>
                <div style={{ width: '100%', height: '1px', background: 'var(--og-border, #25292F)', margin: '1px 0' }} />
                <button
                  type="button"
                  onClick={() => setFocusTarget(null)}
                  title="Reset view"
                  aria-label="Reset map view"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '28px',
                    height: '28px',
                    background: 'transparent',
                    border: '1px solid transparent',
                    borderRadius: '6px',
                    color: 'var(--og-text-muted, #777E87)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--og-surface-elevated, #1D2025)'; e.currentTarget.style.borderColor = 'var(--og-border-strong, #343940)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
                >
                  <Globe size={14} />
                </button>
              </div>
            </div>

            {/* ── BOTTOM-LEFT: Layer Controls + Legend ─────────────────── */}
            <div
              style={{
                position: 'absolute',
                bottom: '10px',
                left: '10px',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                pointerEvents: 'auto',
              }}
            >
              {/* Compact Layer Toggle Bar */}
              <div
                style={{
                  background: 'rgba(12, 14, 17, 0.92)',
                  border: '1px solid var(--og-border-strong, #343940)',
                  borderRadius: 'var(--og-radius-base, 8px)',
                  padding: '4px 6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.55)',
                }}
              >
                {[
                  { key: 'sar', label: 'SAR', color: '#49C6C8' },
                  { key: 'drift', label: 'DRIFT', color: '#E7A63A' },
                  { key: 'ais', label: 'AIS', color: '#A855F7' },
                  { key: 'grid', label: 'GRID', color: '#777E87' },
                ].map(({ key: layerKey, label, color: dotColor }) => (
                  <button
                    key={layerKey}
                    type="button"
                    onClick={() => toggleLayer(layerKey)}
                    title={`Toggle ${label} layer`}
                    aria-label={`Toggle ${label} layer`}
                    aria-pressed={layers[layerKey]}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '3px 8px',
                      background: layers[layerKey] ? 'var(--og-surface-elevated, #1D2025)' : 'transparent',
                      border: layers[layerKey] ? '1px solid var(--og-border-strong, #343940)' : '1px solid transparent',
                      borderRadius: '5px',
                      color: layers[layerKey] ? 'var(--og-text-primary, #ECEEF1)' : 'var(--og-text-muted, #777E87)',
                      cursor: 'pointer',
                      fontSize: '10px',
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      fontFamily: "var(--og-font-mono, 'Schibsted Grotesk', monospace)",
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: layers[layerKey] ? dotColor : 'var(--og-border, #25292F)',
                        transition: 'background-color 0.15s ease',
                      }}
                    />
                    {label}
                  </button>
                ))}
              </div>

              {/* Legend Trigger */}
              <button
                type="button"
                onClick={() => setIsLegendOpen(!isLegendOpen)}
                style={{
                  background: 'rgba(12, 14, 17, 0.92)',
                  color: 'var(--og-text-primary, #ECEEF1)',
                  border: '1px solid var(--og-border-strong, #343940)',
                  borderRadius: 'var(--og-radius-base, 8px)',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.55)',
                  fontFamily: "var(--og-font-body, 'Schibsted Grotesk', sans-serif)",
                  width: 'fit-content',
                }}
              >
                <Layers size={12} />
                <span>Legend</span>
                <span style={{ fontSize: '9px', color: 'var(--og-text-muted, #777E87)' }}>{isLegendOpen ? '▼' : '▲'}</span>
              </button>

              {isLegendOpen && (
                <div
                  style={{
                    background: 'rgba(12, 14, 17, 0.95)',
                    border: '1px solid var(--og-border-strong, #343940)',
                    borderRadius: 'var(--og-radius-base, 8px)',
                    padding: '8px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
                    minWidth: '180px',
                    fontSize: '11px',
                  }}
                >
                  <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--og-text-muted, #777E87)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Overview Legend
                  </div>

                  {/* 1. Observed Slick */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '2px',
                        border: '2px solid #49C6C8',
                        background: 'rgba(73, 198, 200, 0.25)',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 500 }}>
                      Observed Slick
                    </span>
                  </div>

                  {/* 2. Modeled Origin */}
                  {!currentScenario.isRealScene && currentScenario.originCoords && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          border: '2px solid #FFFFFF',
                          background: '#E7A63A',
                          boxShadow: '0 0 4px #E7A63A',
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 500 }}>
                        Modeled Origin
                      </span>
                    </div>
                  )}

                  {/* 3. Top Candidate Vessel */}
                  {!currentScenario.isRealScene && currentScenario.vessels && currentScenario.vessels.length > 0 && layers.ais && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          border: '1.5px solid #FFFFFF',
                          background: '#A855F7',
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 500 }}>
                        Top Candidate Vessel
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── BOTTOM-RIGHT: Real CDSE Status or Timestamp ─────────── */}
            <div
              style={{
                position: 'absolute',
                bottom: '10px',
                right: '10px',
                zIndex: 1000,
                pointerEvents: 'auto',
              }}
            >
              {currentScenario.isRealScene ? (
                <div
                  style={{
                    background: 'rgba(12, 14, 17, 0.92)',
                    border: '1px solid var(--og-border-strong, #343940)',
                    borderRadius: 'var(--og-radius-base, 8px)',
                    padding: '6px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.55)',
                  }}
                >
                  <Radar size={13} style={{ color: 'var(--og-teal, #49C6C8)' }} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--og-teal-soft, #78DADD)', letterSpacing: '0.04em' }}>
                      REAL CDSE SENTINEL-1
                    </span>
                    <span style={{ fontSize: '9.5px', color: 'var(--og-text-muted, #777E87)' }}>
                      No ground-truth slick verified
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: 'rgba(12, 14, 17, 0.88)',
                    border: '1px solid var(--og-border, #25292F)',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '10px',
                    color: 'var(--og-text-muted, #777E87)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
                  }}
                >
                  <Clock size={10} />
                  <span style={{ fontFamily: "var(--og-font-mono, 'Schibsted Grotesk', monospace)", fontVariantNumeric: 'tabular-nums' }}>
                    12 Sep 2026 · 06:15 UTC
                  </span>
                </div>
              )}
            </div>

            {/* Pulsing beacon animation (inline keyframes) */}
            <style>{`
              @keyframes ogPulse {
                0%, 100% { opacity: 0.4; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.6); }
              }
            `}</style>
          </div>
        </div>

        {/* ── RIGHT COLUMN: COMPACT CANDIDATE VESSELS ───────────────────────── */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--og-surface, #121417)',
            border: '1px solid var(--og-border-subtle, rgba(255, 255, 255, 0.055))',
            borderRadius: 'var(--og-radius-base, 8px)',
            overflow: 'hidden',
            height: '100%',
          }}
        >
          {/* Panel Header */}
          <div
            style={{
              padding: '8px 10px',
              borderBottom: '1px solid var(--og-border-subtle, rgba(255, 255, 255, 0.055))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--og-text-primary, #ECEEF1)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  fontFamily: "var(--og-font-display, 'Hanken Grotesk', sans-serif)",
                }}
              >
                CANDIDATE VESSELS
              </div>
              <div style={{ fontSize: '11px', color: 'var(--og-text-muted, #777E87)' }}>
                AIS correlated candidates (Top {topCandidates.length})
              </div>
            </div>
            <EvidenceBadge
              type={currentScenario.isRealScene ? 'NOT_ESTABLISHED' : 'DEMONSTRATION'}
              label={currentScenario.isRealScene ? 'UNLINKED' : 'AIS CORRELATED'}
              size="xs"
            />
          </div>

          {/* Scrollable Vessel List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {topCandidates.length > 0 ? (
              topCandidates.map((vessel, idx) => {
                const isSelected = selectedCandidate?.mmsi === vessel.mmsi;
                return (
                  <div
                    key={vessel.mmsi || idx}
                    onClick={() => setSelectedCandidate(vessel)}
                    style={{
                      background: isSelected ? 'var(--og-surface-raised, #171A1E)' : 'var(--og-surface, #121417)',
                      border: isSelected ? '1px solid var(--og-border-strong, #343940)' : '1px solid var(--og-border-subtle, rgba(255, 255, 255, 0.055))',
                      borderRadius: 'var(--og-radius-base, 8px)',
                      padding: '8px 10px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      transition: 'background 0.15s ease, border-color 0.15s ease',
                      boxSizing: 'border-box',
                    }}
                  >
                    {/* Rank, Name & Score */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            color: idx === 0 ? 'var(--og-violet-soft, #C084FC)' : 'var(--og-text-muted, #777E87)',
                            background: idx === 0 ? 'rgba(168, 85, 247, 0.12)' : 'var(--og-surface-recessed, #0C0E11)',
                            border: idx === 0 ? '1px solid rgba(168, 85, 247, 0.24)' : '1px solid var(--og-border, #25292F)',
                            padding: '1px 5px',
                            borderRadius: '3px',
                            fontFamily: "var(--og-font-mono, 'Schibsted Grotesk', monospace)",
                          }}
                        >
                          #{idx + 1}
                        </span>
                        <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--og-text-primary, #ECEEF1)' }}>
                          {vessel.name}
                        </span>
                      </div>
                      <strong style={{ fontSize: '12px', color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {vessel.correlation}%
                      </strong>
                    </div>

                    {/* Metadata */}
                    <div style={{ fontSize: '11px', color: 'var(--og-text-muted, #777E87)' }}>
                      MMSI: {vessel.mmsi} · Flag: {vessel.flag} · {vessel.vesselType}
                    </div>

                    {/* CPA & Time Delta Metrics + Action */}
                    {vessel.evidence && (
                      <div
                        style={{
                          marginTop: '2px',
                          paddingTop: '4px',
                          borderTop: '1px solid var(--og-border-subtle, rgba(255, 255, 255, 0.055))',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '11px',
                        }}
                      >
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <span>
                            <span style={{ color: 'var(--og-text-muted, #777E87)' }}>CPA: </span>
                            <strong style={{ color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 500 }}>{vessel.evidence.closestApproachKm} km</strong>
                          </span>
                          <span>
                            <span style={{ color: 'var(--og-text-muted, #777E87)' }}>Δt: </span>
                            <strong style={{ color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 500 }}>{vessel.evidence.timeDeltaMinutes}m</strong>
                          </span>
                        </div>
                        <Link
                          to={`/analysis/${currentScenario.id}?candidate=${vessel.id || vessel.mmsi}&tab=ais`}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            color: 'var(--og-text-secondary, #B1B6BD)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px',
                            fontSize: '11px',
                            fontWeight: 500,
                            textDecoration: 'none',
                            flexShrink: 0,
                            transition: 'color 0.15s ease',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--og-violet-soft, #C084FC)')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--og-text-secondary, #B1B6BD)')}
                        >
                          Investigate →
                        </Link>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div style={{ padding: '16px 8px', textAlign: 'center', fontSize: '11px', color: 'var(--og-text-muted, #777E87)', lineHeight: 1.4 }}>
                No verified AIS candidates linked to this unlabelled real Sentinel-1 acquisition.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 3. BOTTOM SUMMARY REGION (COMPACT DRIFT & PIPELINE STRIPS) ──────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
        {/* Compact Horizontal Drift Operational Summary */}
        <div
          style={{
            background: 'var(--og-surface, #121417)',
            border: '1px solid var(--og-border-subtle, rgba(255, 255, 255, 0.055))',
            borderRadius: 'var(--og-radius-base, 8px)',
            padding: '6px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexShrink: 0,
            overflowX: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <Navigation size={13} style={{ color: 'var(--og-amber, #E7A63A)' }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--og-amber-soft, #F2BC62)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              DRIFT ANALYSIS
            </span>
            <EvidenceBadge
              type={currentScenario.isRealScene ? 'NOT_ESTABLISHED' : 'MODELLED'}
              label={currentScenario.isRealScene ? 'UNLINKED' : 'LAGRANGIAN'}
              size="xs"
            />
          </div>

          {!currentScenario.isRealScene ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, justifyContent: 'flex-end', minWidth: 0 }}>
              {/* Progress Schematic Narrative */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', background: 'var(--og-surface-recessed, #0C0E11)', padding: '3px 8px', borderRadius: 'var(--og-radius-sm, 4px)', border: '1px solid var(--og-border, #25292F)', flexShrink: 0 }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--og-amber, #E7A63A)' }} />
                <span style={{ color: 'var(--og-amber-soft, #F2BC62)', fontWeight: 500 }}>HINDCAST (-24h)</span>
                <span style={{ color: 'var(--og-text-muted, #777E87)' }}>→</span>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--og-teal, #49C6C8)' }} />
                <span style={{ color: 'var(--og-teal-soft, #78DADD)', fontWeight: 500 }}>OBSERVED</span>
                <span style={{ color: 'var(--og-text-muted, #777E87)' }}>→</span>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--og-text-muted, #777E87)' }} />
                <span style={{ color: 'var(--og-text-muted, #777E87)' }}>FORECAST (+6h)</span>
              </div>

              {/* Tactical Parameters Row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', whiteSpace: 'nowrap' }}>
                <span>Origin: <strong style={{ color: 'var(--og-amber-soft, #F2BC62)', fontFamily: "var(--og-font-mono, 'Schibsted Grotesk', monospace)", fontVariantNumeric: 'tabular-nums' }}>{currentScenario.originCoords[0]}°N, {currentScenario.originCoords[1]}°E</strong></span>
                <span>Uncertainty: <strong style={{ color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 500 }}>±{currentScenario.uncertaintyKm} km</strong></span>
                <span>Drift: <strong style={{ color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 500 }}>{currentScenario.driftSpeed}</strong></span>
                <span>Advection: <strong style={{ color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 500 }}>{currentScenario.driftKm} km</strong></span>
                <Link
                  to={`/analysis/${currentScenario.id}?tab=drift`}
                  style={{
                    color: 'var(--og-amber-soft, #F2BC62)',
                    fontWeight: 500,
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                    marginLeft: '4px',
                    transition: 'color 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#F59E0B')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--og-amber-soft, #F2BC62)')}
                >
                  View Drift Model →
                </Link>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: 'var(--og-text-muted, #777E87)' }}>
              <span>Real Sentinel-1 pass acquired. Numerical drift hindcast is not established for unlabelled real scenes.</span>
              <Link
                to="/analysis/REAL_CDSE?tab=sar"
                style={{ color: 'var(--og-violet, #A855F7)', fontWeight: 500, textDecoration: 'none' }}
              >
                Inspect Real Scene →
              </Link>
            </div>
          )}
        </div>

        {/* Compact Horizontal Investigation Pipeline Strip */}
        <div
          style={{
            background: 'var(--og-surface, #121417)',
            border: '1px solid var(--og-border-subtle, rgba(255, 255, 255, 0.055))',
            borderRadius: 'var(--og-radius-base, 8px)',
            padding: '5px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            flexShrink: 0,
            overflowX: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <Activity size={12} style={{ color: 'var(--og-text-muted, #777E87)' }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--og-text-muted, #777E87)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              PIPELINE
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, justifyContent: 'space-between' }}>
            {pipelineStages.map((stage, idx) => {
              const isLast = idx === pipelineStages.length - 1;

              const tabMap = {
                sar: 'sar',
                detect: 'sar',
                drift: 'drift',
                ais: 'ais',
                vessel: 'ais',
                dossier: 'dossier',
              };
              const targetTab = tabMap[stage.id] || 'investigation';

              // Semantic stage dot indicator colors
              const stageIndicatorColors = {
                sar: 'var(--og-teal, #49C6C8)',
                detect: 'var(--og-teal, #49C6C8)',
                drift: 'var(--og-amber, #E7A63A)',
                ais: 'var(--og-violet, #A855F7)',
                vessel: 'var(--og-violet, #A855F7)',
                dossier: 'var(--og-magenta, #EC4899)',
              };
              const dotColor = stageIndicatorColors[stage.id] || 'var(--og-text-muted, #777E87)';

              return (
                <React.Fragment key={stage.id}>
                  <Link
                    to={`/analysis/${currentScenario.id}?tab=${targetTab}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      background: 'var(--og-surface-raised, #171A1E)',
                      border: '1px solid var(--og-border, #25292F)',
                      borderRadius: 'var(--og-radius-sm, 4px)',
                      padding: '3px 7px',
                      minWidth: 0,
                      textDecoration: 'none',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease, border-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--og-surface-elevated, #1D2025)';
                      e.currentTarget.style.borderColor = 'var(--og-border-strong, #343940)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--og-surface-raised, #171A1E)';
                      e.currentTarget.style.borderColor = 'var(--og-border, #25292F)';
                    }}
                  >
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: dotColor, flexShrink: 0 }} />
                    <span style={{ fontSize: '10px', fontFamily: "var(--og-font-mono, 'Schibsted Grotesk', monospace)", color: 'var(--og-text-muted, #777E87)', fontWeight: 500 }}>
                      0{idx + 1}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--og-text-primary, #ECEEF1)', whiteSpace: 'nowrap' }}>
                      {stage.name}
                    </span>
                    <span
                      style={{
                        fontSize: '9.5px',
                        fontWeight: 500,
                        color: 'var(--og-text-muted, #777E87)',
                        background: 'var(--og-surface-recessed, #0C0E11)',
                        border: '1px solid var(--og-border, #25292F)',
                        padding: '1px 4px',
                        borderRadius: '2px',
                        whiteSpace: 'nowrap',
                        fontFamily: "var(--og-font-mono, 'Schibsted Grotesk', monospace)",
                      }}
                    >
                      {stage.label}
                    </span>
                  </Link>

                  {!isLast && (
                    <ArrowRight size={11} style={{ color: 'var(--og-border-strong, #343940)', flexShrink: 0 }} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modals & Drawers */}
      <ModelDrawer
        isOpen={isModelDrawerOpen}
        onClose={() => setIsModelDrawerOpen(false)}
      />

      <VesselDrawer
        isOpen={isVesselDrawerOpen}
        onClose={() => setIsVesselDrawerOpen(false)}
        vessel={selectedCandidate}
      />

      <SarEvidenceViewer
        isOpen={isSarViewerOpen}
        onClose={() => setIsSarViewerOpen(false)}
        spill={activeSpill}
        scene={{
          id: currentScenario.id,
          sceneId: 'S1A_IW_GRDH_1SDV_20260912T061520',
          sensor: 'Sentinel-1A C-band SAR',
          polarization: 'VV + VH',
          resolution: '10m pixel spacing',
          acquisitionTime: '2026-09-12T06:15:20Z',
          confidence: currentScenario.confidence,
          areaKm2: currentScenario.areaKm2,
        }}
      />

      <SystemStatusModal
        isOpen={isSystemStatusOpen}
        onClose={() => setIsSystemStatusOpen(false)}
      />
    </div>
  );
}

