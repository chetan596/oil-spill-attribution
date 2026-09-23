import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { vesselsApi } from '../api/vessels.api';
import Navbar from '../components/common/Navbar';
import MapView from '../components/map/MapView';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import { calculateBounds } from '../utils/geo';
import { Ship, ArrowLeft, Anchor, Compass, Radio, Activity, Navigation, Calendar } from 'lucide-react';
import { Polyline, CircleMarker, Popup } from 'react-leaflet';

export default function VesselDetails() {
  const { mmsi } = useParams();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadTrack = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await vesselsApi.getTrack(mmsi);
      setData(response.data);
    } catch (err) {
      setError(err.message || 'Failed to load vessel AIS track');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTrack();
  }, [mmsi]);

  const vessel = data?.vessel;
  const trackPoints = data?.trackPoints || data?.track || [];

  const mapBounds = React.useMemo(() => {
    if (!trackPoints || trackPoints.length === 0) return null;
    const points = trackPoints.map((pt) => [Number(pt.latitude), Number(pt.longitude)]).filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng));
    return calculateBounds(points);
  }, [trackPoints]);

  const trackPositions = trackPoints
    .map((pt) => [Number(pt.latitude), Number(pt.longitude)])
    .filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng));

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#020617' }}>
      <Navbar />

      {/* Top Breadcrumb Header */}
      <div
        style={{
          padding: '12px 24px',
          background: '#0a0f1d',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
        role="navigation"
        aria-label="Vessel Breadcrumb Navigation"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Link to="/dashboard" style={{ color: '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem' }}>
            <ArrowLeft size={15} /> Back to Dashboard
          </Link>
          <span style={{ color: '#334155' }}>/</span>
          <span style={{ color: '#f8fafc', fontSize: '0.85rem', fontWeight: 600 }}>
            Candidate Vessel MMSI: <code style={{ color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>{mmsi}</code>
          </span>
        </div>
      </div>

      <main
        style={{
          flex: 1,
          padding: '20px 24px',
          maxWidth: '1600px',
          width: '100%',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
        role="main"
      >
        {error && <ErrorMessage title="Could not load vessel track" message={error} onRetry={loadTrack} />}

        {isLoading && <LoadingSpinner message="Fetching AIS historical telemetry from database..." />}

        {data && !isLoading && (
          <>
            {/* Vessel Specs Header Card */}
            <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '10px',
                    background: 'rgba(56, 189, 248, 0.15)',
                    color: '#38bdf8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ship size={26} />
                </div>
                <div>
                  <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc' }}>
                    {vessel?.name || 'Unknown Vessel'}
                  </h1>
                  <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                    Flag: <strong style={{ color: '#f8fafc' }}>{vessel?.flag || 'Not available'}</strong> | Type: <strong style={{ color: '#f8fafc' }}>{vessel?.vesselType || 'Not available'}</strong> | Length: <strong style={{ color: '#f8fafc' }}>{vessel?.lengthM ? `${vessel.lengthM}m` : 'Not available'}</strong>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ background: '#020617', padding: '8px 14px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>MMSI</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#38bdf8' }}>{vessel?.mmsi || mmsi}</div>
                </div>
                <div style={{ background: '#020617', padding: '8px 14px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>IMO Number</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#f8fafc' }}>{vessel?.imo || 'Not available'}</div>
                </div>
                <div style={{ background: '#020617', padding: '8px 14px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>AIS Points Logged</div>
                  <div style={{ fontWeight: 600, color: '#10b981', fontFamily: 'var(--font-mono)' }}>{data.count || trackPoints.length}</div>
                </div>
              </div>
            </div>

            {/* Split View: Map & Telemetry Log */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', minHeight: '550px' }}>
              {/* Left Column: Interactive Map with Track Polyline */}
              <div
                style={{
                  background: '#0f172a',
                  borderRadius: '8px',
                  border: '1px solid #1e293b',
                  overflow: 'hidden',
                  position: 'relative',
                  minHeight: '480px',
                }}
              >
                <MapView
                  center={trackPositions[0] || [18.921, 72.832]}
                  bounds={mapBounds}
                  zoom={11}
                  showLegend={true}
                >
                  {/* Historical AIS Track Path */}
                  {trackPositions.length > 1 && (
                    <Polyline
                      positions={trackPositions}
                      pathOptions={{
                        color: '#a855f7',
                        weight: 3.5,
                        opacity: 0.9,
                      }}
                    />
                  )}

                  {/* Waypoints */}
                  {trackPoints.map((pt, idx) => {
                    const lat = Number(pt.latitude);
                    const lng = Number(pt.longitude);
                    if (isNaN(lat) || isNaN(lng) || idx % 3 !== 0) return null;
                    const isLatest = idx === 0;

                    return (
                      <CircleMarker
                        key={pt.id || idx}
                        center={[lat, lng]}
                        radius={isLatest ? 7 : 4}
                        pathOptions={{
                          color: isLatest ? '#ffffff' : '#a855f7',
                          weight: isLatest ? 2 : 1,
                          fillColor: isLatest ? '#ef476f' : '#7e22ce',
                          fillOpacity: 1,
                        }}
                      >
                        <Popup>
                          <div style={{ color: '#f8fafc', fontSize: '0.8rem', padding: '4px' }}>
                            <strong>AIS Position #{idx}</strong>
                            <div>Time: {new Date(pt.timestamp).toUTCString()}</div>
                            <div>Speed: {pt.speedKnots != null ? `${pt.speedKnots} kts` : 'Not available'}</div>
                            <div>Coords: [{lat.toFixed(4)}, {lng.toFixed(4)}]</div>
                          </div>
                        </Popup>
                      </CircleMarker>
                    );
                  })}
                </MapView>
              </div>

              {/* Right Column: Telemetry Table */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc', marginBottom: '12px' }}>
                  AIS Telemetry Log ({trackPoints.length} points)
                </h3>

                <div style={{ flex: 1, overflowY: 'auto', maxHeight: '500px' }}>
                  <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', color: '#f8fafc', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textTransform: 'uppercase', fontSize: '0.7rem' }}>
                        <th style={{ padding: '8px' }}>Timestamp</th>
                        <th style={{ padding: '8px' }}>Latitude</th>
                        <th style={{ padding: '8px' }}>Longitude</th>
                        <th style={{ padding: '8px' }}>Speed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trackPoints.map((pt, idx) => (
                        <tr key={pt.id || idx} style={{ borderBottom: '1px solid #1e293b' }}>
                          <td style={{ padding: '8px', color: '#cbd5e1' }}>
                            {new Date(pt.timestamp).toLocaleTimeString()}
                          </td>
                          <td style={{ padding: '8px', fontFamily: 'var(--font-mono)' }}>
                            {Number(pt.latitude).toFixed(4)}°
                          </td>
                          <td style={{ padding: '8px', fontFamily: 'var(--font-mono)' }}>
                            {Number(pt.longitude).toFixed(4)}°
                          </td>
                          <td style={{ padding: '8px', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                            {pt.speedKnots != null ? `${pt.speedKnots} kts` : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
