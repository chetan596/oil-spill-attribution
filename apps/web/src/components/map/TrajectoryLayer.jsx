import React from 'react';
import { Polyline, CircleMarker, Popup } from 'react-leaflet';
import { Compass, Navigation } from 'lucide-react';

export default function TrajectoryLayer({ driftData, trajectoryPoints, activeStep = null, simPhase = 'backward' }) {
  if (!driftData && (!trajectoryPoints || trajectoryPoints.length === 0)) return null;

  // Handle direct trajectoryPoints array
  if (trajectoryPoints && trajectoryPoints.length > 0) {
    const points = trajectoryPoints.map((pt) => [
      Number(pt.latitude ?? pt.lat),
      Number(pt.longitude ?? pt.lng),
    ]).filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng));

    return (
      <>
        {points.length > 1 && (
          <Polyline
            positions={points}
            pathOptions={{
              color: '#E7A63A',
              weight: 2.5,
              opacity: 0.85,
              dashArray: '5, 5',
            }}
          />
        )}
        {trajectoryPoints.map((pt, idx) => {
          const lat = Number(pt.latitude ?? pt.lat);
          const lng = Number(pt.longitude ?? pt.lng);
          if (isNaN(lat) || isNaN(lng)) return null;
          const isOrigin = pt.type === 'ORIGIN';
          const isObserved = pt.type === 'OBSERVED';

          return (
            <CircleMarker
              key={`pt-${idx}`}
              center={[lat, lng]}
              radius={isOrigin || isObserved ? 5 : 3.5}
              pathOptions={{
                color: isOrigin ? '#E7A63A' : isObserved ? '#49C6C8' : '#828282',
                weight: 1.5,
                fillColor: isOrigin ? '#E7A63A' : isObserved ? '#49C6C8' : '#141416',
                fillOpacity: 1,
              }}
            >
              <Popup>
                <div style={{ color: '#FFFFFF', padding: '4px', fontFamily: "'Schibsted Grotesk', -apple-system, sans-serif", minWidth: '160px' }}>
                  <div style={{ fontWeight: 700, fontSize: '11px', color: isOrigin ? '#E7A63A' : '#49C6C8', marginBottom: '2px' }}>
                    {pt.type || 'TRAJECTORY STEP'}
                  </div>
                  <div style={{ fontSize: '10px', color: '#828282', fontFamily: 'monospace' }}>
                    {lat.toFixed(4)}°N, {lng.toFixed(4)}°E
                  </div>
                  {pt.timestamp && (
                    <div style={{ fontSize: '9.5px', color: '#DCDCDC', marginTop: '2px' }}>
                      {new Date(pt.timestamp).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </>
    );
  }

  // Handle driftData object
  const rawBackward = driftData.backwardPath || (driftData.points || []).filter((p) => p.phase === 'backward');
  const rawForward = driftData.forwardPath || (driftData.points || []).filter((p) => p.phase === 'forward');

  const backwardPoints = rawBackward.map((pt) => [
    Number(pt.latitude ?? pt.lat),
    Number(pt.longitude ?? pt.lng),
  ]).filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng));

  const forwardPoints = rawForward.map((pt) => [
    Number(pt.latitude ?? pt.lat),
    Number(pt.longitude ?? pt.lng),
  ]).filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng));

  // Determine active animated point during simulation playback
  const activePath = simPhase === 'forward' ? rawForward : rawBackward;
  const activePoint = activeStep != null && activePath && activePath[activeStep] ? activePath[activeStep] : null;
  const activeLat = activePoint ? Number(activePoint.latitude ?? activePoint.lat) : null;
  const activeLng = activePoint ? Number(activePoint.longitude ?? activePoint.lng) : null;

  // Split paths into active (traversed) and inactive (remaining) when activeStep is provided
  const isBackwardActive = activeStep != null && simPhase === 'backward';
  const isForwardActive = activeStep != null && simPhase === 'forward';

  return (
    <>
      {/* Modelled Backward Reverse Hindcast Path (#E7A63A Modelled Amber) */}
      {backwardPoints.length > 1 && (
        <>
          {isBackwardActive ? (
            <>
              {/* Traversed Active Segment */}
              {activeStep > 0 && (
                <Polyline
                  positions={backwardPoints.slice(0, activeStep + 1)}
                  pathOptions={{
                    color: '#E7A63A',
                    weight: 3.5,
                    opacity: 1,
                  }}
                />
              )}
              {/* Remaining Path (Restrained) */}
              <Polyline
                positions={backwardPoints.slice(activeStep)}
                pathOptions={{
                  color: '#E7A63A',
                  weight: 1.5,
                  opacity: 0.4,
                  dashArray: '4, 5',
                }}
              />
            </>
          ) : (
            <Polyline
              positions={backwardPoints}
              pathOptions={{
                color: '#E7A63A',
                weight: 2.5,
                opacity: 0.9,
                dashArray: '6, 5',
              }}
            />
          )}
        </>
      )}

      {/* Modelled Backward Waypoints */}
      {rawBackward.map((pt, idx) => {
        const lat = Number(pt.latitude ?? pt.lat);
        const lng = Number(pt.longitude ?? pt.lng);
        if (isNaN(lat) || isNaN(lng)) return null;

        const isT0 = idx === 0;
        const isOrigin = idx === rawBackward.length - 1;
        const isCurrentActive = isBackwardActive && activeStep === idx;

        return (
          <CircleMarker
            key={`bwd-pt-${idx}`}
            center={[lat, lng]}
            radius={isCurrentActive ? 6.5 : (isT0 || isOrigin ? 4.5 : 3)}
            pathOptions={{
              color: isCurrentActive ? '#FFFFFF' : '#E7A63A',
              weight: isCurrentActive ? 2.5 : 1.5,
              fillColor: isT0 ? '#49C6C8' : '#E7A63A',
              fillOpacity: isCurrentActive ? 1 : 0.85,
            }}
          >
            <Popup autoPan={true} autoPanPadding={[24, 24]} maxWidth={220} minWidth={160}>
              <div style={{ color: '#FFFFFF', padding: '3px 4px', fontFamily: "'Schibsted Grotesk', -apple-system, sans-serif", fontSize: '11px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', marginBottom: '2px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '3px' }}>
                  <span style={{ fontWeight: 700, color: isT0 ? '#49C6C8' : '#E7A63A' }}>
                    {isT0 ? 'OBSERVED TIME (T0)' : isOrigin ? 'MODELLED ORIGIN' : `HINDCAST T-${idx * 6}h`}
                  </span>
                  <span style={{ fontSize: '8.5px', fontWeight: 700, padding: '1px 4px', borderRadius: '2px', background: isT0 ? 'rgba(73, 198, 200, 0.2)' : 'rgba(231, 166, 58, 0.2)', color: isT0 ? '#49C6C8' : '#E7A63A' }}>
                    {isT0 ? 'OBSERVED' : 'MODELLED'}
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: '#828282', fontFamily: 'monospace', margin: '2px 0' }}>
                  {lat.toFixed(4)}°N, {lng.toFixed(4)}°E
                </div>
                {pt.timestamp && (
                  <div style={{ fontSize: '9.5px', color: '#DCDCDC' }}>
                    {new Date(pt.timestamp).toUTCString()}
                  </div>
                )}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      {/* Modelled Forward Forecast Drift Path (#4ADE80 Modelled Green) */}
      {forwardPoints.length > 1 && (
        <>
          {isForwardActive ? (
            <>
              {/* Traversed Active Segment */}
              {activeStep > 0 && (
                <Polyline
                  positions={forwardPoints.slice(0, activeStep + 1)}
                  pathOptions={{
                    color: '#4ADE80',
                    weight: 3.5,
                    opacity: 1,
                  }}
                />
              )}
              {/* Remaining Path (Restrained) */}
              <Polyline
                positions={forwardPoints.slice(activeStep)}
                pathOptions={{
                  color: '#4ADE80',
                  weight: 1.5,
                  opacity: 0.4,
                  dashArray: '4, 4',
                }}
              />
            </>
          ) : (
            <Polyline
              positions={forwardPoints}
              pathOptions={{
                color: '#4ADE80',
                weight: 2,
                opacity: 0.85,
                dashArray: '4, 4',
              }}
            />
          )}
        </>
      )}

      {/* Modelled Forward Waypoints */}
      {rawForward.map((pt, idx) => {
        const lat = Number(pt.latitude ?? pt.lat);
        const lng = Number(pt.longitude ?? pt.lng);
        if (isNaN(lat) || isNaN(lng)) return null;

        const isCurrentActive = isForwardActive && activeStep === idx;

        return (
          <CircleMarker
            key={`fwd-pt-${idx}`}
            center={[lat, lng]}
            radius={isCurrentActive ? 6.5 : (idx === rawForward.length - 1 ? 4.5 : 3)}
            pathOptions={{
              color: isCurrentActive ? '#FFFFFF' : '#4ADE80',
              weight: isCurrentActive ? 2.5 : 1.5,
              fillColor: '#4ADE80',
              fillOpacity: isCurrentActive ? 1 : 0.85,
            }}
          >
            <Popup autoPan={true} autoPanPadding={[24, 24]} maxWidth={220} minWidth={160}>
              <div style={{ color: '#FFFFFF', padding: '3px 4px', fontFamily: "'Schibsted Grotesk', -apple-system, sans-serif", fontSize: '11px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', marginBottom: '2px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '3px' }}>
                  <span style={{ fontWeight: 700, color: '#4ADE80' }}>
                    {`FORECAST T+${(idx + 1) * 6}h`}
                  </span>
                  <span style={{ fontSize: '8.5px', fontWeight: 700, padding: '1px 4px', borderRadius: '2px', background: 'rgba(74, 222, 128, 0.2)', color: '#4ADE80' }}>
                    MODELLED FORECAST
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: '#828282', fontFamily: 'monospace', margin: '2px 0' }}>
                  {lat.toFixed(4)}°N, {lng.toFixed(4)}°E
                </div>
                {pt.timestamp && (
                  <div style={{ fontSize: '9.5px', color: '#DCDCDC' }}>
                    {new Date(pt.timestamp).toUTCString()}
                  </div>
                )}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      {/* Active Animated Timestep Indicator Pulse */}
      {activeLat != null && activeLng != null && !isNaN(activeLat) && !isNaN(activeLng) && (
        <>
          <CircleMarker
            center={[activeLat, activeLng]}
            radius={10}
            pathOptions={{
              color: simPhase === 'forward' ? '#4ADE80' : '#E7A63A',
              weight: 2,
              fillColor: simPhase === 'forward' ? '#4ADE80' : '#E7A63A',
              fillOpacity: 0.35,
            }}
          />
          <CircleMarker
            center={[activeLat, activeLng]}
            radius={4.5}
            pathOptions={{
              color: '#FFFFFF',
              weight: 2,
              fillColor: simPhase === 'forward' ? '#4ADE80' : '#E7A63A',
              fillOpacity: 1,
            }}
          />
        </>
      )}
    </>
  );
}
