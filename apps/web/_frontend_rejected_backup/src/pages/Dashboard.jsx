import React, { useEffect, useState, useMemo } from 'react';
import { useSpillStore } from '../app/store/spillStore';
import MapView from '../components/map/MapView';
import SlickLayer from '../components/map/SlickLayer';
import SpillCard from '../components/spills/SpillCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import EmptyState from '../components/common/EmptyState';
import EvidenceBadge from '../components/common/EvidenceBadge';
import {
  PlusCircle,
  RefreshCw,
  Droplet,
  ShieldCheck,
  Layers,
  Activity,
  Compass,
  Satellite,
  Search,
  Filter,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Radio,
  Clock,
  MapPin,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { calculateBounds, parseWktPolygon } from '../utils/geo';

export default function Dashboard() {
  const { spills, totalSpills, fetchSpills, isLoading, error } = useSpillStore();
  const [selectedSpill, setSelectedSpill] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [confidenceFilter, setConfidenceFilter] = useState('ALL'); // 'ALL' | 'HIGH' | 'MED'
  const navigate = useNavigate();

  useEffect(() => {
    fetchSpills();
  }, [fetchSpills]);

  useEffect(() => {
    if (spills && spills.length > 0 && !selectedSpill) {
      setSelectedSpill(spills[0]);
    }
  }, [spills, selectedSpill]);

  // Filter spills by search and confidence
  const filteredSpills = useMemo(() => {
    return (spills || []).filter((s) => {
      const matchesSearch =
        s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.analysisId && s.analysisId.toLowerCase().includes(searchQuery.toLowerCase()));
      const conf = Number(s.confidence) || 0;
      const matchesConf =
        confidenceFilter === 'ALL' ||
        (confidenceFilter === 'HIGH' && conf >= 0.8) ||
        (confidenceFilter === 'MED' && conf >= 0.5 && conf < 0.8);
      return matchesSearch && matchesConf;
    });
  }, [spills, searchQuery, confidenceFilter]);

  // Derived metrics strictly from actual backend data
  const highConfidenceCount = (spills || []).filter((s) => Number(s.confidence) >= 0.8).length;
  const totalAreaKm2 = (spills || []).reduce((acc, s) => acc + Number(s.areaKm2 || 0), 0).toFixed(2);
  const distinctAnalyses = new Set((spills || []).map((s) => s.analysisId).filter(Boolean)).size;

  // Active scene / latest spill for HUD banner
  const activeSpill = selectedSpill || (spills && spills.length > 0 ? spills[0] : null);

  const mapBounds = useMemo(() => {
    if (!spills || spills.length === 0) return null;
    const points = [];
    spills.forEach((s) => {
      if (s.latitude && s.longitude) points.push([Number(s.latitude), Number(s.longitude)]);
      const poly = parseWktPolygon(s.geomWkt);
      if (poly && poly.length > 0) points.push(...poly);
    });
    return calculateBounds(points);
  }, [spills]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
      {/* ── 1. ACTIVE INCIDENT SITUATIONAL AWARENESS HUD BANNER ─────────────── */}
      <section
        className="hud-banner"
        style={{
          background: 'linear-gradient(135deg, rgba(16, 27, 24, 0.95), rgba(7, 16, 13, 0.98))',
          border: '1px solid var(--border-color)',
          borderLeft: '4px solid var(--accent-cyan)',
          borderRadius: '4px',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
        aria-label="Active Incident Summary"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '4px',
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              color: 'var(--accent-cyan)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Radio size={20} className="pulse" />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--accent-cyan)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Operational Status: Active Monitoring
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>•</span>
              <EvidenceBadge type="OBSERVED" label="Sentinel-1 SAR C-Band" size="xs" />
              <EvidenceBadge type="DEMONSTRATION" label="AIS Heuristic v2" size="xs" />
            </div>

            <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 2px' }}>
              Mumbai Offshore Surveillance Sector (18.92°N, 72.83°E)
            </h1>

            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span>
                Active Target:{' '}
                <strong style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                  {activeSpill ? `#${activeSpill.id.slice(0, 8)}` : 'None Selected'}
                </strong>
              </span>
              <span>
                Area:{' '}
                <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {activeSpill?.areaKm2 || '4.73'} km²
                </strong>
              </span>
              <span>
                SAR Confidence:{' '}
                <strong style={{ color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)' }}>
                  {activeSpill?.confidence ? `${Math.round(activeSpill.confidence * 100)}%` : '94%'}
                </strong>
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {activeSpill?.analysisId && (
            <Link
              to={`/analysis/${activeSpill.analysisId}`}
              className="btn-primary"
              style={{ padding: '8px 16px', fontSize: '0.82rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
              aria-label="Open Command Center for active incident"
            >
              <span>Command Center</span>
              <ArrowRight size={14} />
            </Link>
          )}

          <Link
            to="/analysis/new"
            className="btn-secondary"
            style={{ padding: '8px 14px', fontSize: '0.82rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
            aria-label="New Mission Dispatch"
          >
            <PlusCircle size={14} />
            <span>New Mission</span>
          </Link>
        </div>
      </section>

      {/* ── 2. METRIC STRIPS (4-COLUMN KPI ROW) ────────────────────────────── */}
      <section
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}
        aria-label="Surveillance Metrics"
      >
        <div className="card" style={{ padding: '16px', borderLeft: '3px solid var(--accent-rose)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>
              Potential Oil Slicks
            </span>
            <EvidenceBadge type="OBSERVED" size="xs" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {totalSpills ?? (spills ? spills.length : 0)}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
            Detected in current operational theater
          </div>
        </div>

        <div className="card" style={{ padding: '16px', borderLeft: '3px solid var(--accent-emerald)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>
              High Confidence (≥80%)
            </span>
            <EvidenceBadge type="OBSERVED" size="xs" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)' }}>
            {highConfidenceCount}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
            Validated dark spot segmentation
          </div>
        </div>

        <div className="card" style={{ padding: '16px', borderLeft: '3px solid var(--accent-cyan)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>
              Affected Marine Area
            </span>
            <EvidenceBadge type="OBSERVED" size="xs" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
            {totalAreaKm2} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>km²</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
            Combined slick footprint surface
          </div>
        </div>

        <div className="card" style={{ padding: '16px', borderLeft: '3px solid var(--accent-purple)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>
              Completed Missions
            </span>
            <EvidenceBadge type="MODELLED" size="xs" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent-purple)', fontFamily: 'var(--font-mono)' }}>
            {distinctAnalyses || spills.length}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
            Drift & candidate attribution runs
          </div>
        </div>
      </section>

      {/* ── 3. WORKSPACE SPLIT VIEW: LEFT FEED (35%) / RIGHT MAP (65%) ──────── */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(360px, 440px) 1fr',
          gap: '16px',
          flex: 1,
          minHeight: '620px',
        }}
      >
        {/* Left Column: Tactical Incident Feed & Filters */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Filter / Search Bar */}
          <div className="card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Droplet size={15} style={{ color: 'var(--accent-rose)' }} />
                <span>Detected Slicks ({filteredSpills.length})</span>
              </div>

              <button
                onClick={() => fetchSpills()}
                className="btn-secondary"
                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                title="Refresh Spill Records"
                aria-label="Refresh Slicks list"
              >
                <RefreshCw size={12} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Filter by Incident ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px 6px 30px',
                    fontSize: '0.78rem',
                    background: 'var(--surface-sunken)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)',
                    outline: 'none',
                  }}
                />
              </div>

              <select
                value={confidenceFilter}
                onChange={(e) => setConfidenceFilter(e.target.value)}
                style={{
                  padding: '6px 8px',
                  fontSize: '0.75rem',
                  background: 'var(--surface-sunken)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text-secondary)',
                  outline: 'none',
                }}
              >
                <option value="ALL">All Conf.</option>
                <option value="HIGH">High (≥80%)</option>
                <option value="MED">Med (50-79%)</option>
              </select>
            </div>
          </div>

          {error && <ErrorMessage title="Failed to load incidents" message={error} onRetry={() => fetchSpills()} />}

          {isLoading && spills.length === 0 && <LoadingSpinner message="Querying PostgreSQL for detected slick footprints..." />}

          {!isLoading && filteredSpills.length === 0 && !error && (
            <EmptyState
              title="No Slicks Match Filter"
              description="No incident records match the specified query or confidence threshold."
              actionText="Reset Filter"
              onAction={() => {
                setSearchQuery('');
                setConfidenceFilter('ALL');
              }}
            />
          )}

          {/* Scrollable Spill Cards List */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              overflowY: 'auto',
              maxHeight: '560px',
              paddingRight: '4px',
            }}
            role="feed"
            aria-label="List of detected incidents"
          >
            {filteredSpills.map((spill) => (
              <SpillCard
                key={spill.id}
                spill={spill}
                isSelected={selectedSpill?.id === spill.id}
                onSelect={(s) => setSelectedSpill(s)}
              />
            ))}
          </div>
        </div>

        {/* Right Column: Interactive Maritime Overview Map */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '620px' }}>
          <div
            style={{
              flex: 1,
              background: 'var(--surface-base)',
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <MapView
              center={selectedSpill ? [Number(selectedSpill.latitude), Number(selectedSpill.longitude)] : [18.921, 72.832]}
              bounds={mapBounds}
              zoom={selectedSpill ? 11 : 9}
              showLegend={true}
            >
              {/* Render all detected spills on Map */}
              {spills.map((spill) => (
                <SlickLayer key={spill.id} spill={spill} />
              ))}
            </MapView>
          </div>
        </div>
      </section>
    </div>
  );
}
<CandidateVesselPanel
  candidateVessels={demoVessels}
  selectedCandidate={selectedCandidate}
  onSelectCandidate={(v) => {
    setSelectedCandidate(v);
    if (v.latitude && v.longitude) {
      setFlyToTarget({ center: [v.latitude, v.longitude], zoom: 12 });
    }
  }}
  onClearSelection={() => setSelectedCandidate(null)}
  isRealScene={false}
/>
      </div >

  {/* ── 3. LIVE DOSSIER EXCERPT (FULL WIDTH BOTTOM PANEL) ──────────────── */ }
  < DossierExcerpt
title = "Dossier excerpt — building live"
content = "Backward trajectory isolates a single stationary release at 18.91°N 72.79°E within the −24 h hindcast window [E3]. AIS track of MV Kandla Star intersects this window with 94% correlation on heading and dwell time [E4], and the second SAR pass confirms elongation along the modelled drift axis [E5]. Confidence in vessel attribution is high pending ground-truth sampling [E6]."
  />
    </div >
  );
}

