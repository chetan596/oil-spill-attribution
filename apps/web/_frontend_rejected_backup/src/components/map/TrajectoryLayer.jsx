import React from 'react';
import { Polyline, CircleMarker, Popup } from 'react-leaflet';
import { Compass, Navigation } from 'lucide-react';
import EvidenceBadge from '../common/EvidenceBadge';

export default function TrajectoryLayer({
  driftData,
  currentStep = null,
  simPhase = 'backward',
  isPlaying = false,
}) {
  if (!driftData) return null;

  const rawBackward = driftData.backwardPath || (driftData.points || []).filter((p) => p.phase === 'backward');
  const rawForward = driftData.forwardPath || (driftData.points || []).filter((p) => p.phase === 'forward');

  // Progressive playback slicing
  let visibleBackward = rawBackward;
  if (simPhase === 'backward' && currentStep !== null && (isPlaying || currentStep < rawBackward.length - 1)) {
    visibleBackward = rawBackward.slice(0, Math.max(1, currentStep + 1));
  }

  let visibleForward = rawForward;
  if (simPhase === 'forward' && currentStep !== null && (isPlaying || currentStep < rawForward.length - 1)) {
    visibleForward = rawForward.slice(0, Math.max(1, currentStep + 1));
  }

  const backwardPoints = visibleBackward
    .map((pt) => [Number(pt.latitude ?? pt.lat), Number(pt.longitude ?? pt.lng)])
    .filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng));

  const forwardPoints = visibleForward
    .map((pt) => [Number(pt.latitude ?? pt.lat), Number(pt.longitude ?? pt.lng)])
    .filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng));

  return (
    <>
      {/* Backward Reverse Hindcast Path (Cyan with Time Gradient & Glow) */}
      {backwardPoints.length > 1 && (
        <>
          <Polyline
            positions={backwardPoints}
            pathOptions={{
              color: '#33d6ff',
              weight: 3,
              opacity: 0.9,
              dashArray: '5, 5',
              className: 'hindcast-polyline-glow',
            }}
          />

          {/* Waypoint markers along backward path */}
          {visibleBackward.map((pt, idx) => {
            const lat = Number(pt.latitude ?? pt.lat);
            const lng = Number(pt.longitude ?? pt.lng);
            if (isNaN(lat) || isNaN(lng) || (idx % 3 !== 0 && idx !== visibleBackward.length - 1)) return null;
            const uncertainty = pt.uncertaintyRadiusKm ?? pt.uncertainty_radius_km ?? 1.5;
            const isHead = idx === visibleBackward.length - 1;
            const opacityFactor = 0.4 + (idx / Math.max(1, visibleBackward.length - 1)) * 0.6;

            return (
              <CircleMarker
                key={`bwd-${idx}`}
                center={[lat, lng]}
                radius={isHead ? 6 : 4}
                pathOptions={{
                  color: isHead ? '#ffffff' : '#33d6ff',
                  weight: isHead ? 2 : 1,
                  fillColor: isHead ? '#33d6ff' : '#0284c7',
                  fillOpacity: opacityFactor,
                }}
              >
                <Popup>
                  <div style={{ color: 'var(--text-primary)', fontSize: '0.8rem', minWidth: '200px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#33d6ff', fontWeight: 800 }}>
                        <Compass size={14} />
                        <span>Hindcast Step #{idx} (-{idx}h)</span>
                      </div>
                      <EvidenceBadge type="MODELLED" size="xs" />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.75rem' }}>
                      <div style={{ color: 'var(--text-secondary)' }}>
                        Time: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{new Date(pt.timestamp).toLocaleTimeString()}</strong>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        [{lat.toFixed(4)}°N, {lng.toFixed(4)}°E]
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#ffb84a', marginTop: '2px' }}>
                        Modelled Drift Uncertainty: &plusmn;{Number(uncertainty).toFixed(1)} km
                      </div>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </>
      )}

      {/* Modelled Forward Forecast Drift Path (Green Dashed with Endpoint Beacon) */}
      {forwardPoints.length > 1 && (
        <>
          <Polyline
            positions={forwardPoints}
            pathOptions={{
              color: '#43e08a',
              weight: 2.8,
              opacity: 0.9,
              dashArray: '6, 6',
            }}
          />

          {/* Forward forecast endpoint marker */}
          {visibleForward.length > 0 && (
            <CircleMarker
              center={[
                Number(visibleForward[visibleForward.length - 1].latitude ?? visibleForward[visibleForward.length - 1].lat),
                Number(visibleForward[visibleForward.length - 1].longitude ?? visibleForward[visibleForward.length - 1].lng),
              ]}
              radius={6}
              pathOptions={{
                color: '#ffffff',
                weight: 1.5,
                fillColor: '#43e08a',
                fillOpacity: 1,
              }}
            >
              <Popup>
                <div style={{ color: 'var(--text-primary)', fontSize: '0.8rem', minWidth: '190px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#43e08a', fontWeight: 800 }}>
                      <Navigation size={14} />
                      <span>MODELLED FORECAST</span>
                    </div>
                    <EvidenceBadge type="MODELLED" size="xs" />
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    Projection (+{visibleForward.length - 1}h): <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{new Date(visibleForward[visibleForward.length - 1].timestamp).toLocaleTimeString()}</strong>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Forward Lagrangian transport projection (T0 &rarr; T+6h)
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          )}
        </>
      )}
    </>
  );
}

