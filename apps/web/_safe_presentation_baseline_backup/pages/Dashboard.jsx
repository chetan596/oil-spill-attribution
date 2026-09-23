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
import { SkeletonMap } from '../components/common/Skeleton';
import { parseWktPolygon, calculateBounds } from '../utils/geo';

export default function Dashboard() {
  const { spills, fetchSpills, isLoading } = useSpillStore();
  const [selectedSpill, setSelectedSpill] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  
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
  const driftVector = '4.2';
  const driftUnit = 'km NW';

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

  return (
    <div className="main flex flex-col gap-4 p-4 md:p-6 bg-[#0A0A0B] min-w-0">
      {/* ── 1. TITLEBAND & INCIDENT KPI STRIP ──────────────────────────────── */}
      <div className="titleband flex items-start justify-between gap-8 flex-wrap">
        <h1 className="pagetitle font-display text-[32px] md:text-[40px] leading-[36px] md:leading-[44px] text-[#e8e8ea] font-medium tracking-tight">
          Incident<br />Command Center
        </h1>

        {/* Metric Row */}
        <div className="metric-row flex items-start gap-8 md:gap-12 flex-wrap" data-brief-id="metrics-row" data-brief-role="metrics-row">
          <div className="metric" data-brief-id="metric-area" data-brief-role="metric">
            <div className="label text-[11px] font-mono tracking-[0.08em] uppercase text-[#5C5C63]">
              Slick area
            </div>
            <div className="val font-display text-[26px] md:text-[28px] leading-[32px] text-[#e8e8ea] mt-1 tabular-nums">
              {slickArea}<span className="unit text-[13px] text-[#5C5C63] ml-1 font-sans">km²</span>
            </div>
          </div>

          <div className="metric" data-brief-id="metric-confidence" data-brief-role="metric">
            <div className="label text-[11px] font-mono tracking-[0.08em] uppercase text-[#5C5C63]">
              Confidence
            </div>
            <div className="val font-display text-[26px] md:text-[28px] leading-[32px] text-[#e8e8ea] mt-1 tabular-nums">
              {confidence}<span className="unit text-[13px] text-[#5C5C63] ml-1 font-sans">%</span>
            </div>
          </div>

          <div className="metric" data-brief-id="metric-drift" data-brief-role="metric">
            <div className="label text-[11px] font-mono tracking-[0.08em] uppercase text-[#5C5C63]">
              Drift
            </div>
            <div className="val font-display text-[26px] md:text-[28px] leading-[32px] text-[#e8e8ea] mt-1 tabular-nums">
              {driftVector}<span className="unit text-[13px] text-[#5C5C63] ml-1 font-sans">{driftUnit}</span>
            </div>
          </div>
        </div>

        {/* Segmented Layer Toggle Pills */}
        <div className="layer-pills ml-auto flex gap-1.5" data-brief-id="layer-pills" data-brief-role="segmented">
          <button
            type="button"
            aria-pressed={layers.sar}
            onClick={() => toggleLayer('sar')}
          >
            SAR
          </button>
          <button
            type="button"
            aria-pressed={layers.drift}
            onClick={() => toggleLayer('drift')}
          >
            Drift
          </button>
          <button
            type="button"
            aria-pressed={layers.ais}
            onClick={() => toggleLayer('ais')}
          >
            AIS
          </button>
        </div>
      </div>

      {/* ── 2. 3-COLUMN INVESTIGATION WORKSPACE ────────────────────────────── */}
      <div className="cols grid grid-cols-1 lg:grid-cols-[1.05fr_1.5fr_0.95fr] gap-4 items-start">
        {/* Left: Evidence Ledger */}
        <EvidenceLedger
          activeEntryId="entry-4"
          onSelectEntry={(entry) => {
            if (entry.coordinates) {
              // Can pan/focus map
            }
          }}
        />

        {/* Center: Dominant Map Stage + Drift Timeline */}
        <div className="map-col flex flex-col gap-4 min-w-0">
          <section data-component="MapStage" data-brief-id="map-slick" data-brief-role="viz">
            <div
              className="map-stage w-full h-[400px] md:h-[440px] rounded-lg overflow-hidden relative bg-[#0a0a0a] border border-[#252529]"
              aria-label="Slick drift trajectory off the Mumbai coast with hindcast origin and candidate vessel"
            >
              {isLoading && spills.length === 0 ? (
                <SkeletonMap height="100%" />
              ) : (
                <MapView
                  center={activeSpill ? [Number(activeSpill.latitude) || 18.94, Number(activeSpill.longitude) || 72.81] : [18.94, 72.81]}
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
                      onSelectVessel={(v) => setSelectedCandidate(v)}
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
        <CandidateVesselPanel
          candidateVessels={demoVessels}
          selectedCandidate={selectedCandidate}
          onSelectCandidate={(v) => setSelectedCandidate(v)}
          onClearSelection={() => setSelectedCandidate(null)}
          isRealScene={false}
        />
      </div>

      {/* ── 3. LIVE DOSSIER EXCERPT (FULL WIDTH BOTTOM PANEL) ──────────────── */}
      <DossierExcerpt
        title="Dossier excerpt — building live"
        content="Backward trajectory isolates a single stationary release at 18.91°N 72.79°E within the −24 h hindcast window [E3]. AIS track of MV Kandla Star intersects this window with 94% correlation on heading and dwell time [E4], and the second SAR pass confirms elongation along the modelled drift axis [E5]. Confidence in vessel attribution is high pending ground-truth sampling [E6]."
      />
    </div>
  );
}
