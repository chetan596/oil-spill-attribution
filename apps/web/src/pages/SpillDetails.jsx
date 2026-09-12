import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { spillsApi } from '../api/spills.api';
import Navbar from '../components/common/Navbar';
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
import { calculateBounds, parseWktPolygon } from '../utils/geo';
import { ArrowLeft, RefreshCw, FileText } from 'lucide-react';

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
        const drift = rawDrift ? {
          ...rawDrift,
          originLat: rawDrift.originLat ?? rawDrift.latitude,
          originLng: rawDrift.originLng ?? rawDrift.longitude,
          backwardPath: rawDrift.backwardPath || (rawDrift.points || []).filter((p) => p.phase === 'backward'),
          forwardPath: rawDrift.forwardPath || (rawDrift.points || []).filter((p) => p.phase === 'forward'),
        } : null;
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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#020617' }}>
      <Navbar />

      <div style={{
        padding: '12px 24px',
        background: '#0a0f1d',
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <Link to="/dashboard" style={{ color: '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={loadData} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
            <RefreshCw size={14} /> Refresh
          </button>
          <Link to="/reports" className="btn-primary" style={{ padding: '4px 12px', fontSize: '0.8rem', textDecoration: 'none' }}>
            <FileText size={14} /> Generate Dossier
          </Link>
        </div>
      </div>

      <main style={{ flex: 1, padding: '20px 24px', maxWidth: '1600px', width: '100%', margin: '0 auto' }}>
        {error && <ErrorMessage title="Could not load incident" message={error} onRetry={loadData} />}

        {isLoading && <LoadingSpinner message="Fetching incident records and drift vectors from database..." />}

        {spill && !isLoading && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', minHeight: '650px' }}>
            {/* Map Column */}
            <div style={{
              background: '#0f172a',
              borderRadius: '8px',
              border: '1px solid #1e293b',
              overflow: 'hidden',
              minHeight: '500px',
            }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', maxHeight: '750px' }}>
              <SpillDetailsComponent spill={spill} />

              {selectedCandidate && (
                <VesselDetailsComponent candidate={selectedCandidate} />
              )}

              <div className="card">
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc', marginBottom: '12px' }}>
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
      </main>
    </div>
  );
}
