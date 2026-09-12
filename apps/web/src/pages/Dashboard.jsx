import React, { useEffect, useState } from 'react';
import { useSpillStore } from '../app/store/spillStore';
import Navbar from '../components/common/Navbar';
import MapView from '../components/map/MapView';
import SlickLayer from '../components/map/SlickLayer';
import SpillCard from '../components/spills/SpillCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import EmptyState from '../components/common/EmptyState';
import { PlusCircle, RefreshCw, Droplet, ShieldCheck, Layers, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { spills, totalSpills, fetchSpills, isLoading, error } = useSpillStore();
  const [selectedSpill, setSelectedSpill] = useState(null);

  useEffect(() => {
    fetchSpills();
  }, [fetchSpills]);

  useEffect(() => {
    if (spills && spills.length > 0 && !selectedSpill) {
      setSelectedSpill(spills[0]);
    }
  }, [spills, selectedSpill]);

  // Derived metrics strictly from actual backend data
  const highConfidenceCount = (spills || []).filter((s) => Number(s.confidence) >= 0.8).length;
  const totalAreaKm2 = (spills || []).reduce((acc, s) => acc + Number(s.areaKm2 || 0), 0).toFixed(2);
  const distinctAnalyses = new Set((spills || []).map((s) => s.analysisId).filter(Boolean)).size;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#020617' }}>
      <Navbar />

      {/* Main Content Area */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '20px 24px',
          gap: '20px',
          maxWidth: '1600px',
          width: '100%',
          margin: '0 auto',
        }}
        role="main"
      >
        {/* KPI Metrics Row — Calculated strictly from backend data */}
        <section
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}
          aria-label="Key Operational Metrics"
        >
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(244, 63, 94, 0.15)', color: '#f43f5e' }}>
              <Droplet size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Potential Oil Slicks</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                {totalSpills ?? spills.length}
              </div>
            </div>
          </div>

          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
              <ShieldCheck size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>High Confidence (≥80%)</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                {highConfidenceCount}
              </div>
            </div>
          </div>

          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
              <Layers size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Affected Marine Area</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                {totalAreaKm2} km²
              </div>
            </div>
          </div>

          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.15)', color: '#a855f7' }}>
              <Activity size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Completed Analyses</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#a855f7', fontFamily: 'var(--font-mono)' }}>
                {distinctAnalyses || spills.length}
              </div>
            </div>
          </div>
        </section>

        {/* Dashboard Split View: Left List, Right Map */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(340px, 420px) 1fr',
            gap: '20px',
            flex: 1,
            minHeight: '600px',
          }}
        >
          {/* Left Column: Incidents List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
                Detected Incidents ({spills.length})
              </h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => fetchSpills()}
                  className="btn-secondary"
                  style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                  title="Refresh Spills"
                  aria-label="Refresh Spills list"
                >
                  <RefreshCw size={14} />
                </button>
                <Link
                  to="/analysis/new"
                  className="btn-primary"
                  style={{ padding: '6px 12px', fontSize: '0.8rem', textDecoration: 'none' }}
                  aria-label="Initiate new analysis"
                >
                  <PlusCircle size={14} /> New
                </Link>
              </div>
            </div>

            {error && <ErrorMessage title="Failed to fetch incidents" message={error} onRetry={() => fetchSpills()} />}

            {isLoading && spills.length === 0 && <LoadingSpinner message="Querying PostgreSQL for spill records..." />}

            {!isLoading && spills.length === 0 && !error && (
              <EmptyState
                title="No Potential Oil Slicks"
                description="No spill records found in the database. Run an automated Sentinel-1 SAR analysis job to generate incidents."
                actionText="Initiate First Analysis"
                actionLink="/analysis/new"
              />
            )}

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                overflowY: 'auto',
                maxHeight: '650px',
                paddingRight: '4px',
              }}
              role="feed"
              aria-label="List of detected incidents"
            >
              {spills.map((spill) => (
                <SpillCard
                  key={spill.id}
                  spill={spill}
                  isSelected={selectedSpill?.id === spill.id}
                  onSelect={(s) => setSelectedSpill(s)}
                />
              ))}
            </div>
          </div>

          {/* Right Column: Interactive Maritime Map */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: '600px', height: '100%' }}>
            <div
              style={{
                flex: 1,
                background: '#0f172a',
                borderRadius: '8px',
                border: '1px solid #1e293b',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <MapView
                center={selectedSpill ? [Number(selectedSpill.latitude), Number(selectedSpill.longitude)] : [18.921, 72.832]}
                zoom={selectedSpill ? 11 : 9}
                showLegend={true}
              >
                {/* Render all spills on Map */}
                {spills.map((spill) => (
                  <SlickLayer key={spill.id} spill={spill} />
                ))}
              </MapView>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
