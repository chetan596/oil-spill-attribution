import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { spillsApi } from '../api/spills.api';
import MapView from '../components/map/MapView';
import SlickLayer from '../components/map/SlickLayer';
import OriginLayer from '../components/map/OriginLayer';
import TrajectoryLayer from '../components/map/TrajectoryLayer';
import VesselLayer from '../components/map/VesselLayer';
import SpillDetailsComponent from '../components/spills/SpillDetails';
import VesselRankTable from '../components/vessels/VesselRankTable';
import VesselDetailsComponent from '../components/vessels/VesselDetails';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import EvidenceBadge from '../components/common/EvidenceBadge';
import { calculateBounds, parseWktPolygon } from '../utils/geo';
import { ArrowLeft, RefreshCw, FileText, Droplet, Radio } from 'lucide-react';

export default function SpillDetails() {
  const { id } = useParams();
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

      if (spillRes.status === 'fulfilled') {
        setSpill(spillRes.value.data);
      } else {
        throw new Error('Spill record not found.');
      }

      if (driftRes.status === 'fulfilled') {
        const rawDrift = driftRes.value.data;
        const drift = rawDrift
          ? {
              ...rawDrift,
              originLat: rawDrift.originLat ?? rawDrift.latitude,
              originLng: rawDrift.originLng ?? rawDrift.longitude,
              backwardPath: rawDrift.backwardPath || (rawDrift.points || []).filter((p) => p.phase === 'backward'),
              forwardPath: rawDrift.forwardPath || (rawDrift.points || []).filter((p) => p.phase === 'forward'),
            }
          : null;
        setDriftData(drift);
      }

      if (vesselsRes.status === 'fulfilled') {
        const vList = vesselsRes.value.data || [];
        setCandidateVessels(vList);
        setSelectedCandidate(vList[0] || null);
      }
    } catch (err) {
      setError(err.message || 'Failed to load spill incident details');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const mapBounds = React.useMemo(() => {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      {/* Top Breadcrumb Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
        role="navigation"
        aria-label="Spill Details Navigation"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Link
            to="/dashboard"
            style={{
              color: 'var(--text-muted)',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.8rem',
            }}
          >
            <ArrowLeft size={14} /> Incidents
          </Link>
          <span style={{ color: 'var(--text-muted)' }}>/</span>
          <span style={{ color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 700 }}>
            Incident Target: <code style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>#{id?.slice(0, 8)}</code>
          </span>
          <EvidenceBadge type="OBSERVED" size="xs" />
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={loadData} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
            <RefreshCw size={12} /> Refresh
          </button>
          {spill?.analysisId && (
            <Link
              to={`/analysis/${spill.analysisId}`}
              className="btn-primary"
              style={{ padding: '4px 12px', fontSize: '0.75rem', textDecoration: 'none' }}
            >
              Command Center
            </Link>
          )}
        </div>
      </div>

      {error && <ErrorMessage title="Could not load incident" message={error} onRetry={loadData} />}

      {isLoading && <LoadingSpinner message="Fetching incident records and drift vectors from database..." />}

      {spill && !isLoading && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', minHeight: '620px' }}>
          {/* Map Column */}
          <div
            style={{
              background: 'var(--surface-base)',
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
              overflow: 'hidden',
              minHeight: '480px',
            }}
          >
            <MapView
              center={[Number(spill.latitude), Number(spill.longitude)]}
              bounds={mapBounds}
              zoom={10}
            >
              <SlickLayer spill={spill} />
              {driftData && <OriginLayer driftData={driftData} />}
              {driftData && <TrajectoryLayer driftData={driftData} />}
              <VesselLayer
                candidateVessels={candidateVessels}
                selectedVessel={selectedCandidate}
                onSelectVessel={(v) => setSelectedCandidate(v)}
              />
            </MapView>
          </div>

          {/* Evidence & Vessels Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', maxHeight: '720px' }}>
            <SpillDetailsComponent spill={spill} />

            {selectedCandidate && <VesselDetailsComponent candidate={selectedCandidate} />}

            <div className="card" style={{ padding: '16px' }}>
              <h3 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
                Candidate Vessel Attribution Rankings
              </h3>
              <VesselRankTable
                rankedVessels={candidateVessels}
                selectedVessel={selectedCandidate}
                onSelectVessel={(v) => setSelectedCandidate(v)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
