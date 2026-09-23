import React, { useEffect, useState, useMemo } from 'react';
import { useSpillStore } from '../app/store/spillStore';
import MapView from '../components/map/MapView';
import SlickLayer from '../components/map/SlickLayer';
import OriginLayer from '../components/map/OriginLayer';
import TrajectoryLayer from '../components/map/TrajectoryLayer';
import VesselLayer from '../components/map/VesselLayer';
import EvidenceLedger from '../components/analysis/EvidenceLedger';
import DriftTimeline from '../components/analysis/DriftTimeline';
import CandidateVesselPanel from '../components/vessels/CandidateVesselPanel';
import DossierExcerpt from '../components/analysis/DossierExcerpt';
import IncidentList from '../components/dashboard/IncidentList';
import ModelDrawer from '../components/analysis/ModelDrawer';
import VesselDrawer from '../components/vessels/VesselDrawer';
import ModelBadge from '../components/common/ModelBadge';
import SourceBadge from '../components/common/SourceBadge';
import { SkeletonMap } from '../components/common/Skeleton';
import { parseWktPolygon, calculateBounds } from '../utils/geo';
import { Radio, Layers, Satellite, Compass, ShieldAlert, Cpu } from 'lucide-react';

export default function Dashboard() {
  const { spills, fetchSpills, isLoading } = useSpillStore();
  const [selectedSpill, setSelectedSpill] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [leftTab, setLeftTab] = useState('incidents'); // 'incidents' | 'evidence'
  const [isModelDrawerOpen, setIsModelDrawerOpen] = useState(false);
  const [isVesselDrawerOpen, setIsVesselDrawerOpen] = useState(false);
  
  // Layer Toggles
  const [layers, setLayers] = useState({
    sar: true,
    drift: true,
    ais: false,
  });

  const toggleLayer = (key) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    fetchSpills();
  }, [fetchSpills]);

  useEffect(() => {
    if (spills && spills.length > 0 && !selectedSpill) {
      setSelectedSpill(spills[0]);
    }
  }, [spills, selectedSpill]);

  const activeSpill = selectedSpill || (spills && spills.length > 0 ? spills[0] : null);

  // Dynamic KPI Metrics derived from active spill or scenario baseline
  const slickArea = activeSpill?.areaKm2 ? `${Number(activeSpill.areaKm2).toFixed(1)}` : '2.3';
  const confidence = activeSpill?.confidence ? `${Math.round(activeSpill.confidence * 100)}` : '92';
  const totalSlicksCount = spills && spills.length > 0 ? spills.length : 40;

  const mapCenter = useMemo(() => {
    if (activeSpill && activeSpill.latitude && activeSpill.longitude) {
      return [Number(activeSpill.latitude), Number(activeSpill.longitude)];
    }
    return [18.94, 72.81];
  }, [activeSpill]);

  const mapBounds = useMemo(() => {
    if (!activeSpill) return null;
    const points = [];
    if (activeSpill.latitude && activeSpill.longitude) {
      points.push([Number(activeSpill.latitude), Number(activeSpill.longitude)]);
    }
    const poly = parseWktPolygon(activeSpill.geomWkt);
    if (poly && poly.length > 0) points.push(...poly);
    return points.length > 0 ? calculateBounds(points) : null;
  }, [activeSpill]);

  // Demo trajectory points matching the canonical reference
  const demoTrajectory = useMemo(() => {
    return [
      { latitude: 18.94, longitude: 72.81, timestamp: '2026-09-12T06:15:00Z', type: 'OBSERVED' },
      { latitude: 18.92, longitude: 72.80, timestamp: '2026-09-12T06:20:00Z', type: 'HINDCAST' },
      { latitude: 18.91, longitude: 72.79, timestamp: '2026-09-12T06:32:00Z', type: 'ORIGIN' },
      { latitude: 18.92, longitude: 72.78, timestamp: '2026-09-12T07:04:00Z', type: 'VESSEL_MATCH' },
    ];
  }, []);

  const demoVessels = useMemo(() => {
    return [
      {
        mmsi: '419001234',
        name: 'Vessel X · MV Kandla Star',
        latitude: 18.92,
        longitude: 72.78,
        heading: 285,
        speed: 12.4,
        correlation: 94,
        sub: 'AIS · heading 285° · 72.78°E',
      },
      {
        mmsi: '419005678',
        name: 'Vessel Y · MT Indrayani',
        latitude: 18.89,
        longitude: 72.85,
        heading: 212,
        speed: 8.2,
        correlation: 41,
        sub: 'AIS · heading 212° · 72.85°E',
      },
      {
        mmsi: '419009999',
        name: 'Vessel Z · Unknown trawler',
        latitude: 18.95,
        longitude: 72.90,
        heading: 140,
        speed: 5.1,
        correlation: 18,
        sub: 'No AIS · radar return · 72.90°E',
      },
    ];
  }, []);

  const handleSelectCandidate = (candidate) => {
    setSelectedCandidate(candidate);
    setIsVesselDrawerOpen(true);
  };

  return (
    <div className="main flex flex-col gap-5 p-4 md:p-6 bg-[#0A0A0B] min-w-0">
      {/* ── 1. MISSION TITLEBAND & KPI TELEMETRY STRIP ──────────────────────── */}
      <div className="titleband flex items-start justify-between gap-6 flex-wrap pb-2 border-b border-[#252529]/60">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono tracking-[0.08em] uppercase text-[#71717A] px-1.5 py-0.5 rounded bg-[#141416] border border-[#252529]">
              Operational Mission
            </span>
            <span className="text-xs font-mono text-[#5C5C63]">
              Scene: <b className="text-[#C8C8CE] font-normal">demo-scene-001</b> · Sensor: <b className="text-[#C8C8CE] font-normal">SAR VV+VH</b>
            </span>
          </div>
          <h1 className="pagetitle font-display text-[28px] md:text-[36px] leading-tight text-[#E8E8EA] font-medium tracking-tight">
            Incident Command Center
          </h1>
        </div>

        {/* Operational KPI Strip */}
        <div className="metric-row flex items-start gap-6 md:gap-10 flex-wrap" data-brief-id="metrics-row" data-brief-role="metrics-row">
          <div className="metric" data-brief-id="metric-slicks" data-brief-role="metric">
            <div className="flex items-center gap-1.5">
              <span className="label text-[10px] font-mono tracking-[0.08em] uppercase text-[#5C5C63]">
                Potential Slicks
              </span>
              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-[rgba(255,255,255,0.04)] text-[#71717A]">
                OBSERVED
              </span>
            </div>
            <div className="val font-display text-[22px] md:text-[26px] leading-tight text-[#E8E8EA] mt-0.5 tabular-nums">
              {totalSlicksCount}
            </div>
            <span className="text-[10px] text-[#5C5C63] font-sans block mt-0.5">Active theater</span>
          </div>

          <div className="metric" data-brief-id="metric-area" data-brief-role="metric">
            <div className="flex items-center gap-1.5">
              <span className="label text-[10px] font-mono tracking-[0.08em] uppercase text-[#5C5C63]">
                Marine Area
              </span>
              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-[rgba(255,255,255,0.04)] text-[#71717A]">
                OBSERVED
              </span>
            </div>
            <div className="val font-display text-[22px] md:text-[26px] leading-tight text-[#E8E8EA] mt-0.5 tabular-nums">
              {slickArea}<span className="unit text-[12px] text-[#5C5C63] ml-1 font-sans">km²</span>
            </div>
            <span className="text-[10px] text-[#5C5C63] font-sans block mt-0.5">Dark surface footprint</span>
          </div>

          <div className="metric" data-brief-id="metric-confidence" data-brief-role="metric">
            <div className="flex items-center gap-1.5">
              <span className="label text-[10px] font-mono tracking-[0.08em] uppercase text-[#5C5C63]">
                Confidence
              </span>
              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-[rgba(168,85,247,0.1)] text-[#C084FC]">
                MODELLED
              </span>
            </div>
            <div className="val font-display text-[22px] md:text-[26px] leading-tight text-[#E8E8EA] mt-0.5 tabular-nums">
              {confidence}<span className="unit text-[12px] text-[#5C5C63] ml-1 font-sans">%</span>
            </div>
            <span className="text-[10px] text-[#5C5C63] font-sans block mt-0.5">Deep learning U-Net</span>
          </div>

          <div className="metric hidden sm:block" data-brief-id="metric-drift" data-brief-role="metric">
            <div className="flex items-center gap-1.5">
              <span className="label text-[10px] font-mono tracking-[0.08em] uppercase text-[#5C5C63]">
                Drift Hindcast
              </span>
              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-[rgba(168,85,247,0.1)] text-[#C084FC]">
                MODELLED
              </span>
            </div>
            <div className="val font-display text-[22px] md:text-[26px] leading-tight text-[#E8E8EA] mt-0.5 tabular-nums">
              4.2<span className="unit text-[12px] text-[#5C5C63] ml-1 font-sans">km NW</span>
            </div>
            <span className="text-[10px] text-[#5C5C63] font-sans block mt-0.5">Lagrangian -24h origin</span>
          </div>
        </div>

        {/* Right Action: Model Drawer Badge & Layer Toggles */}
        <div className="flex items-center gap-3 ml-auto">
          <ModelBadge onClick={() => setIsModelDrawerOpen(true)} />

          <div className="layer-pills flex gap-1 bg-[#141416] p-1 rounded-md border border-[#252529]" data-brief-id="layer-pills" data-brief-role="segmented">
            <button
              type="button"
              aria-pressed={layers.sar}
              onClick={() => toggleLayer('sar')}
              className={`px-2.5 py-1 text-xs font-mono rounded transition-colors ${
                layers.sar ? 'bg-[#222224] text-[#F5F5F5]' : 'text-[#5C5C63] hover:text-[#C8C8CE]'
              }`}
            >
              SAR
            </button>
            <button
              type="button"
              aria-pressed={layers.drift}
              onClick={() => toggleLayer('drift')}
              className={`px-2.5 py-1 text-xs font-mono rounded transition-colors ${
                layers.drift ? 'bg-[#222224] text-[#F5F5F5]' : 'text-[#5C5C63] hover:text-[#C8C8CE]'
              }`}
            >
              Drift
            </button>
            <button
              type="button"
              aria-pressed={layers.ais}
              onClick={() => toggleLayer('ais')}
              className={`px-2.5 py-1 text-xs font-mono rounded transition-colors ${
                layers.ais ? 'bg-[#222224] text-[#F5F5F5]' : 'text-[#5C5C63] hover:text-[#C8C8CE]'
              }`}
            >
              AIS
            </button>
          </div>
        </div>
      </div>

      {/* ── 2. 3-COLUMN INVESTIGATION WORKSPACE ────────────────────────────── */}
      <div className="cols grid grid-cols-1 lg:grid-cols-[1.1fr_1.8fr_1fr] gap-4 items-start">
        {/* Left Column: Switchable Incident List & Forensic Evidence Ledger */}
        <div className="left-panel flex flex-col gap-3 min-w-0">
          <div className="flex items-center gap-1 p-1 bg-[#141416] border border-[#252529] rounded-lg">
            <button
              type="button"
              onClick={() => setLeftTab('incidents')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                leftTab === 'incidents'
                  ? 'bg-[#222224] text-[#F5F5F5]'
                  : 'text-[#5C5C63] hover:text-[#C8C8CE]'
              }`}
            >
              Incidents ({spills.length || 3})
            </button>
            <button
              type="button"
              onClick={() => setLeftTab('evidence')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                leftTab === 'evidence'
                  ? 'bg-[#222224] text-[#F5F5F5]'
                  : 'text-[#5C5C63] hover:text-[#C8C8CE]'
              }`}
            >
              Evidence Ledger (6)
            </button>
          </div>

          {leftTab === 'incidents' ? (
            <IncidentList
              spills={spills}
              selectedSpill={activeSpill}
              onSelectSpill={(spill) => setSelectedSpill(spill)}
            />
          ) : (
            <EvidenceLedger
              activeEntryId="entry-4"
              onSelectEntry={(entry) => {
                if (entry.coordinates) {
                  // Pan or focus coordinate
                }
              }}
            />
          )}
        </div>

        {/* Center: Dominant Large Map Stage + Drift Timeline */}
        <div className="map-col flex flex-col gap-4 min-w-0">
          <section data-component="MapStage" data-brief-id="map-slick" data-brief-role="viz">
            <div
              className="map-stage w-full h-[440px] md:h-[480px] rounded-lg overflow-hidden relative bg-[#0a0a0a] border border-[#252529]"
              aria-label="Slick drift trajectory off the Mumbai coast with hindcast origin and candidate vessel"
            >
              {isLoading && spills.length === 0 ? (
                <SkeletonMap height="100%" />
              ) : (
                <MapView
                  center={mapCenter}
                  bounds={mapBounds}
                  zoom={11}
                  showLegend={false}
                >
                  {/* Layer: Observed Slick */}
                  {layers.sar && activeSpill && (
                    <SlickLayer spill={activeSpill} />
                  )}

                  {/* Layer: Modelled Origin Fix */}
                  {layers.drift && (
                    <OriginLayer
                      origin={{
                        latitude: 18.91,
                        longitude: 72.79,
                        uncertaintyRadiusKm: 1.2,
                        timestamp: '2026-09-12T06:32:00Z',
                      }}
                    />
                  )}

                  {/* Layer: Backward Hindcast & Forward Forecast Trajectory */}
                  {layers.drift && (
                    <TrajectoryLayer
                      trajectoryPoints={demoTrajectory}
                    />
                  )}

                  {/* Layer: Candidate Vessels */}
                  {layers.ais && (
                    <VesselLayer
                      vessels={demoVessels}
                      selectedVessel={selectedCandidate}
                      onSelectVessel={handleSelectCandidate}
                    />
                  )}
                </MapView>
              )}
            </div>
          </section>

          {/* Drift Timeline Underneath Map */}
          <DriftTimeline
            initialTime="16:00 UTC"
            hindcastHours={-24}
            forecastHours={6}
          />
        </div>

        {/* Right: Candidate Vessels Panel */}
        <div className="right-panel flex flex-col gap-3 min-w-0">
          <CandidateVesselPanel
            candidateVessels={demoVessels}
            selectedCandidate={selectedCandidate}
            onSelectCandidate={handleSelectCandidate}
            onClearSelection={() => setSelectedCandidate(null)}
            isRealScene={false}
          />
        </div>
      </div>

      {/* ── 3. LIVE DOSSIER EXCERPT (FULL WIDTH BOTTOM PANEL) ──────────────── */}
      <DossierExcerpt
        title="Dossier excerpt — building live"
        content="Backward trajectory isolates a single stationary release at 18.91°N 72.79°E within the −24 h hindcast window [E3]. AIS track of MV Kandla Star intersects this window with 94% correlation on heading and dwell time [E4], and the second SAR pass confirms elongation along the modelled drift axis [E5]. Confidence in vessel attribution is high pending ground-truth sampling [E6]."
      />

      {/* ── Modals & Drawers ──────────────────────────────────────────────── */}
      <ModelDrawer
        isOpen={isModelDrawerOpen}
        onClose={() => setIsModelDrawerOpen(false)}
      />

      <VesselDrawer
        isOpen={isVesselDrawerOpen}
        onClose={() => setIsVesselDrawerOpen(false)}
        vessel={selectedCandidate}
      />
    </div>
  );
}
