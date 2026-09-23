/**
 * ManualDriftLayer — Phase 16.4 Part 4
 *
 * Renders ESTIMATED backward ("ESTIMATED BACKTRACK") and forward ("ESTIMATED FORECAST")
 * drift trajectories for a manual GeoTIFF investigation on the existing react-leaflet map.
 *
 * CRITICAL SCIENTIFIC & VISUAL RULES:
 * - Trajectories are ESTIMATED and MODEL_DERIVED — NOT observed GPS tracks.
 * - Backward label: "ESTIMATED BACKTRACK"
 * - Forward label: "ESTIMATED FORECAST"
 * - Prominently badges "DEMONSTRATION METOCEAN FORCING" when environmentalData.source === 'DEMO'.
 * - Shows disclaimer: "This is NOT an observed vessel trajectory."
 * - Zero AIS / vessel markers rendered.
 *
 * Renders ONLY when:
 *   drift && drift.status === "ESTIMATED"
 */

import React from 'react';
import { Polyline, CircleMarker, Popup, Tooltip } from 'react-leaflet';
import { Navigation, Compass, AlertTriangle, ShieldCheck } from 'lucide-react';
import { normalizeTrajectoryCoords } from '../../utils/realMapModel';

const AMBER = '#E7A63A';
const GREEN = '#4ADE80';
const AMBER_DIM = 'rgba(231, 166, 58, 0.15)';
const GREEN_DIM = 'rgba(74, 222, 128, 0.15)';

export default function ManualDriftLayer({ drift, isForecastFocused = false, activeMapContext = null }) {
  if (!drift || drift.status !== 'ESTIMATED') return null;

  const {
    backward,
    forward,
    environmentalData,
    uncertainty,
    engine,
    timestampSource,
  } = drift;

  const isDemo = environmentalData?.source === 'DEMO' || environmentalData?.isDemo === true;
  const envSourceLabel = isDemo ? 'DEMO' : (environmentalData?.source || 'NOT_AVAILABLE');
  const uncertaintyRadiusKm = uncertainty?.radiusKm ?? 2.5;

  // Extract backward path coordinates [[lat, lng], ...] supporting both GeoJSON Feature and points array
  const backwardCoords = normalizeTrajectoryCoords(backward);

  // Extract forward path coordinates [[lat, lng], ...] if supported
  const forwardCoords = normalizeTrajectoryCoords(forward);
  const hasForward = Boolean(forward && (forward.status === 'ESTIMATED' || (!forward.status && forwardCoords.length > 0)));

  const backwardPoints = Array.isArray(backward?.points) ? backward.points : [];
  const forwardPoints = (hasForward && Array.isArray(forward?.points)) ? forward.points : [];

  const isEmphasized = isForecastFocused || activeMapContext === 'drift';
  const isDeemphasized = !isForecastFocused && (activeMapContext === 'sar' || activeMapContext === 'ais');

  return (
    <>
      {/* ── 1. Backward Trajectory: ESTIMATED BACKTRACK (#E7A63A Amber) ── */}
      {backwardCoords.length > 1 && (
        <Polyline
          key={`manual-bwd-poly-${isEmphasized ? 'focused' : (isDeemphasized ? 'dim' : 'normal')}`}
          positions={backwardCoords}
          pathOptions={{
            color: AMBER,
            weight: isEmphasized ? 3.5 : (isDeemphasized ? 1.5 : 2.5),
            opacity: isEmphasized ? 1.0 : (isDeemphasized ? 0.35 : 0.9),
            dashArray: '6, 5',
          }}
        >
          <Tooltip permanent={false} direction="center" opacity={0.95}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: AMBER, textTransform: 'uppercase' }}>
              ESTIMATED BACKTRACK ({backward?.hours ?? 24}h)
            </span>
          </Tooltip>
        </Polyline>
      )}

      {/* Backward Waypoint Markers */}
      {backwardPoints.map((pt, idx) => {
        const lat = Number(pt.latitude ?? pt.lat);
        const lng = Number(pt.longitude ?? pt.lng);
        if (isNaN(lat) || isNaN(lng)) return null;

        const isT0 = idx === 0;
        const isTerminal = idx === backwardPoints.length - 1;

        return (
          <CircleMarker
            key={`manual-bwd-pt-${idx}`}
            center={[lat, lng]}
            radius={isT0 ? 5 : isTerminal ? 4.5 : 3}
            pathOptions={{
              color: isT0 ? '#49C6C8' : AMBER,
              weight: isT0 ? 2 : 1.5,
              fillColor: isT0 ? '#49C6C8' : AMBER,
              fillOpacity: 0.9,
            }}
          >
            <Popup autoPan maxWidth={260} minWidth={210}>
              <div style={{
                color: '#FFFFFF',
                padding: '4px 6px',
                fontFamily: "'Schibsted Grotesk', -apple-system, sans-serif",
                fontSize: '11px',
              }}>
                {/* Header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '4px',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                  paddingBottom: '4px',
                  marginBottom: '5px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: AMBER, fontWeight: 700 }}>
                    <Navigation size={12} />
                    <span>{isT0 ? 'SPILL CENTROID (T0)' : isTerminal ? 'ESTIMATED ORIGIN' : `BACKTRACK T-${pt.elapsedHours ?? idx}h`}</span>
                  </div>
                  <span style={{
                    fontSize: '8.5px',
                    fontWeight: 700,
                    padding: '1px 4px',
                    borderRadius: '2px',
                    background: AMBER_DIM,
                    color: AMBER,
                    border: '1px solid rgba(231,166,58,0.3)',
                  }}>
                    MODEL-DERIVED
                  </span>
                </div>

                {/* Coordinates */}
                <div style={{ fontSize: '10px', color: '#828282', fontFamily: 'monospace', marginBottom: '4px' }}>
                  {lat.toFixed(5)}°N, {lng.toFixed(5)}°E
                </div>

                {/* Duration & Direction */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: '#B1B6BD', marginBottom: '3px' }}>
                  <span>Direction:</span>
                  <span style={{ color: '#FFFFFF', fontWeight: 600 }}>ESTIMATED BACKTRACK</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: '#B1B6BD', marginBottom: '3px' }}>
                  <span>Elapsed Duration:</span>
                  <span style={{ color: '#FFFFFF', fontWeight: 600 }}>{pt.elapsedHours ?? idx} hours</span>
                </div>

                {/* Environmental Source */}
                <div style={{
                  background: isDemo ? 'rgba(239,68,68,0.12)' : 'rgba(74,222,128,0.12)',
                  border: `1px solid ${isDemo ? 'rgba(239,68,68,0.3)' : 'rgba(74,222,128,0.3)'}`,
                  borderRadius: '3px',
                  padding: '3px 6px',
                  margin: '4px 0',
                  fontSize: '9px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: isDemo ? '#F87171' : GREEN, fontWeight: 700 }}>
                    {isDemo ? <AlertTriangle size={10} /> : <ShieldCheck size={10} />}
                    <span>{isDemo ? 'DEMONSTRATION METOCEAN FORCING' : 'REAL METOCEAN DATA'}</span>
                  </div>
                  <div style={{ color: '#A0AEC0', marginTop: '1px', fontSize: '8.5px' }}>
                    Source: {envSourceLabel}
                  </div>
                </div>

                {/* Timestamp Source */}
                {timestampSource && (
                  <div style={{ fontSize: '8.5px', color: '#718096', marginBottom: '3px' }}>
                    Temporal: {timestampSource}
                  </div>
                )}

                {/* Uncertainty */}
                <div style={{ fontSize: '9px', color: AMBER, marginBottom: '4px' }}>
                  Estimated Uncertainty: ±{uncertaintyRadiusKm.toFixed(1)} km
                </div>

                {/* Disclaimer */}
                <div style={{
                  fontSize: '8px',
                  color: '#718096',
                  lineHeight: 1.3,
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  paddingTop: '4px',
                }}>
                  This is NOT an observed vessel trajectory.
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      {/* ── 2. Forward Trajectory: ESTIMATED FORECAST (#4ADE80 Green) ── */}
      {hasForward && forwardCoords.length > 1 && (
        <Polyline
          key={`manual-fwd-poly-${isEmphasized ? 'focused' : (isDeemphasized ? 'dim' : 'normal')}`}
          positions={forwardCoords}
          pathOptions={{
            color: isEmphasized ? '#86EFAC' : GREEN,
            weight: isEmphasized ? 4 : (isDeemphasized ? 1.5 : 2),
            opacity: isEmphasized ? 1 : (isDeemphasized ? 0.35 : 0.85),
            dashArray: isEmphasized ? '6, 3' : '4, 4',
          }}
        >
          <Tooltip permanent={false} direction="center" opacity={0.95}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: isForecastFocused ? '#86EFAC' : GREEN, textTransform: 'uppercase' }}>
              ESTIMATED FORECAST ({forward?.hours ?? 6}h)
            </span>
          </Tooltip>
        </Polyline>
      )}

      {/* Forward Waypoint Markers */}
      {hasForward && forwardPoints.map((pt, idx) => {
        const lat = Number(pt.latitude ?? pt.lat);
        const lng = Number(pt.longitude ?? pt.lng);
        if (isNaN(lat) || isNaN(lng)) return null;

        return (
          <CircleMarker
            key={`manual-fwd-pt-${idx}`}
            center={[lat, lng]}
            radius={idx === forwardPoints.length - 1 ? 4.5 : 3}
            pathOptions={{
              color: GREEN,
              weight: 1.5,
              fillColor: GREEN,
              fillOpacity: 0.85,
            }}
          >
            <Popup autoPan maxWidth={260} minWidth={210}>
              <div style={{
                color: '#FFFFFF',
                padding: '4px 6px',
                fontFamily: "'Schibsted Grotesk', -apple-system, sans-serif",
                fontSize: '11px',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '4px',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                  paddingBottom: '4px',
                  marginBottom: '5px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: GREEN, fontWeight: 700 }}>
                    <Compass size={12} />
                    <span>FORECAST T+{pt.elapsedHours ?? (idx + 1) * 6}h</span>
                  </div>
                  <span style={{
                    fontSize: '8.5px',
                    fontWeight: 700,
                    padding: '1px 4px',
                    borderRadius: '2px',
                    background: GREEN_DIM,
                    color: GREEN,
                    border: '1px solid rgba(74,222,128,0.3)',
                  }}>
                    MODEL-DERIVED
                  </span>
                </div>

                <div style={{ fontSize: '10px', color: '#828282', fontFamily: 'monospace', marginBottom: '4px' }}>
                  {lat.toFixed(5)}°N, {lng.toFixed(5)}°E
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: '#B1B6BD', marginBottom: '3px' }}>
                  <span>Direction:</span>
                  <span style={{ color: '#FFFFFF', fontWeight: 600 }}>ESTIMATED FORECAST</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: '#B1B6BD', marginBottom: '3px' }}>
                  <span>Duration:</span>
                  <span style={{ color: '#FFFFFF', fontWeight: 600 }}>+{pt.elapsedHours ?? (idx + 1) * 6} hours</span>
                </div>

                <div style={{
                  background: isDemo ? 'rgba(239,68,68,0.12)' : 'rgba(74,222,128,0.12)',
                  border: `1px solid ${isDemo ? 'rgba(239,68,68,0.3)' : 'rgba(74,222,128,0.3)'}`,
                  borderRadius: '3px',
                  padding: '3px 6px',
                  margin: '4px 0',
                  fontSize: '9px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: isDemo ? '#F87171' : GREEN, fontWeight: 700 }}>
                    {isDemo ? <AlertTriangle size={10} /> : <ShieldCheck size={10} />}
                    <span>{isDemo ? 'DEMONSTRATION METOCEAN FORCING' : 'REAL METOCEAN DATA'}</span>
                  </div>
                  <div style={{ color: '#A0AEC0', marginTop: '1px', fontSize: '8.5px' }}>
                    Source: {envSourceLabel}
                  </div>
                </div>

                <div style={{
                  fontSize: '8px',
                  color: '#718096',
                  lineHeight: 1.3,
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  paddingTop: '4px',
                }}>
                  This is NOT an observed vessel trajectory.
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}
