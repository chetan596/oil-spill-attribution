import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { vesselsApi } from '../api/vessels.api';
import MapView from '../components/map/MapView';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import EvidenceBadge from '../components/common/EvidenceBadge';
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
    const points = trackPoints
      .map((pt) => [Number(pt.latitude), Number(pt.longitude)])
      .filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng));
    return calculateBounds(points);
  }, [trackPoints]);

  const trackPositions = trackPoints
    .map((pt) => [Number(pt.latitude), Number(pt.longitude)])
    .filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng));

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
        aria-label="Vessel Breadcrumb Navigation"
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
            Candidate Vessel: <code style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>{mmsi}</code>
          </span>
          <EvidenceBadge type="DEMONSTRATION" label="DEMO AIS" size="xs" />
        </div>
      </div>

      {error && <ErrorMessage title="Could not load vessel track" message={error} onRetry={loadTrack} />}

      {isLoading && <LoadingSpinner message="Fetching AIS historical telemetry from database..." />}

      {data && !isLoading && (
        <>
          {/* Vessel Specs Header Card */}
          <div
            className="card"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '16px',
              padding: '16px 20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                <Ship size={22} />
              </div>
              <div>
                <h1 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  {vessel?.name || 'Unknown Vessel'}
                </h1>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Flag: <strong style={{ color: 'var(--text-primary)' }}>{vessel?.flag || 'N/A'}</strong> | Type: <strong style={{ color: 'var(--text-primary)' }}>{vessel?.vesselType || 'Cargo'}</strong> | Length: <strong style={{ color: 'var(--text-primary)' }}>{vessel?.lengthM ? `${vessel.lengthM}m` : 'N/A'}</strong>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ background: 'var(--surface-sunken)', padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>MMSI</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-cyan)', fontSize: '0.82rem' }}>{vessel?.mmsi || mmsi}</div>
              </div>
              <div style={{ background: 'var(--surface-sunken)', padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>IMO</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.82rem' }}>{vessel?.imo || 'N/A'}</div>
              </div>
              <div style={{ background: 'var(--surface-sunken)', padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Logged Waypoints</div>
                <div style={{ fontWeight: 800, color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>{data.count || trackPoints.length}</div>
              </div>
            </div>
          </div>

          {/* Split View: Map & Telemetry Log */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', minHeight: '520px' }}>
            {/* Left Column: Interactive Map with Track Polyline */}
            <div
              style={{
                background: 'var(--surface-base)',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
                overflow: 'hidden',
                position: 'relative',
                minHeight: '460px',
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
                        <div style={{ color: 'var(--text-primary)', fontSize: '0.78rem', padding: '4px' }}>
                          <strong style={{ color: 'var(--accent-purple)' }}>AIS Position #{idx}</strong>
                          <div>Time: {new Date(pt.timestamp).toUTCString()}</div>
                          <div>Speed: {pt.speedKnots != null ? `${pt.speedKnots} kts` : 'N/A'}</div>
                          <div style={{ fontFamily: 'var(--font-mono)' }}>[{lat.toFixed(4)}°N, {lng.toFixed(4)}°E]</div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}
              </MapView>
            </div>

            {/* Right Column: Telemetry Table */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  AIS Telemetry Log ({trackPoints.length} points)
                </h3>
                <EvidenceBadge type="DEMONSTRATION" size="xs" />
              </div>

              <div style={{ flex: 1, overflowY: 'auto', maxHeight: '460px' }}>
                <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', color: 'var(--text-primary)', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.68rem' }}>
                      <th style={{ padding: '6px' }}>Timestamp</th>
                      <th style={{ padding: '6px' }}>Latitude</th>
                      <th style={{ padding: '6px' }}>Longitude</th>
                      <th style={{ padding: '6px' }}>Speed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trackPoints.map((pt, idx) => (
                      <tr key={pt.id || idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '6px', color: 'var(--text-secondary)' }}>
                          {new Date(pt.timestamp).toLocaleTimeString()}
                        </td>
                        <td style={{ padding: '6px', fontFamily: 'var(--font-mono)' }}>
                          {Number(pt.latitude).toFixed(4)}°
                        </td>
                        <td style={{ padding: '6px', fontFamily: 'var(--font-mono)' }}>
                          {Number(pt.longitude).toFixed(4)}°
                        </td>
                        <td style={{ padding: '6px', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
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
    </div>
  );
}
