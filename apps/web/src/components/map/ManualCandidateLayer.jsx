/**
 * ManualCandidateLayer — Phase 16.4 Part 5
 *
 * Renders POTENTIAL AIS CANDIDATES for a manual GeoTIFF investigation
 * on the existing react-leaflet map.
 *
 * CRITICAL SCIENTIFIC & LEGAL GUARDRAILS:
 * - Every candidate is strictly labeled: "POTENTIAL AIS CANDIDATE".
 * - Final attribution is strictly: "NOT_ESTABLISHED".
 * - NEVER claims a vessel caused the spill or is a confirmed polluter.
 * - When isDemo is true, prominently badges: "DEMONSTRATION AIS DATA" and "NOT REAL-WORLD AIS EVIDENCE".
 * - Corridor entry condition is strictly based on closestApproachKm <= originUncertaintyKm
 *   (independent of the wider AIS search radius).
 * - Component renders:
 *     1. Historical AIS trajectory polyline (dashed purple #A855F7).
 *     2. Vessel position marker at closest approach (CircleMarker).
 *     3. Dashed CPA line from closest approach to estimated origin.
 *     4. Informative interactive popup with evidence metrics and legal notice.
 *
 * Renders ONLY when candidates array is present and non-empty.
 */

import React from 'react';
import { CircleMarker, Polyline, Popup, Tooltip } from 'react-leaflet';
import { Ship, Compass, ShieldAlert, AlertTriangle, Info } from 'lucide-react';

const PURPLE_MAIN = '#A855F7';
const PURPLE_LIGHT = '#C084FC';
const PURPLE_BORDER = '#7E22CE';
const PURPLE_DIM = 'rgba(168, 85, 247, 0.15)';
const CPA_LINE_COLOR = '#DDD6FE';
const NEUTRAL_TRACK_COLOR = '#64748B';

export default function ManualCandidateLayer({
  candidates = [],
  allTracks = [],
  origin = null,
  isDemo = true,
  searchRadiusKm = 50,
  selectedCandidateId = null,
  onSelectCandidate = null,
  activeMapContext = null,
}) {
  const candidateList = Array.isArray(candidates) ? candidates : [];
  const trackList = Array.isArray(allTracks) ? allTracks : [];

  if (candidateList.length === 0 && trackList.length === 0) {
    return null;
  }

  const originLat = origin?.estimatedPoint?.latitude != null ? Number(origin.estimatedPoint.latitude) : null;
  const originLng = origin?.estimatedPoint?.longitude != null ? Number(origin.estimatedPoint.longitude) : null;
  const hasOrigin = originLat != null && originLng != null && !isNaN(originLat) && !isNaN(originLng);
  const originUncertaintyKm = origin?.uncertainty?.radiusKm ?? 2.5;

  const candidateMmsis = new Set(candidateList.map((c) => String(c.vesselId?.mmsi || (typeof c.vesselId === 'string' ? c.vesselId : '') || c.mmsi || '')));
  const nonCandidateTracks = trackList.filter((t) => !candidateMmsis.has(String(t.mmsi || '')));

  // Development diagnostic for GFW Analysis Map verification
  if (process.env.NODE_ENV !== 'production' && candidateList.length > 0) {
    const isVesselPres = candidateList.some(
      (c) => c.observationLevel === 'VESSEL_PRESENCE' || c.aisEvidence?.observationLevel === 'VESSEL_PRESENCE'
    );
    if (isVesselPres) {
      let cellCount = 0;
      candidateList.forEach((c) => {
        const cells = (c.aisEvidence?.presenceCells && c.aisEvidence.presenceCells.length > 0)
          ? c.aisEvidence.presenceCells
          : (Array.isArray(c.presenceCells) ? c.presenceCells : []);
        cellCount += cells.length;
      });
      console.log('[GFW Analysis Map]', {
        provider: 'GLOBAL_FISHING_WATCH',
        observationLevel: 'VESSEL_PRESENCE',
        candidateCount: candidateList.length,
        presenceCellCount: cellCount,
        renderedMarkerCount: cellCount,
      });
    }
  }

  return (
    <>
      {/* 0. All Non-Candidate Historical Vessel Tracks (Neutral background) */}
      {nonCandidateTracks.map((trk, tIdx) => {
        const pts = trk.trackPoints || trk.points || [];
        const coords = pts
          .map((pt) => [Number(pt.latitude ?? pt.lat), Number(pt.longitude ?? pt.lng)])
          .filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng));

        if (coords.length < 2) {
          if (Array.isArray(trk.presenceCells) && trk.presenceCells.length > 0) {
            return (
              <React.Fragment key={`bg-presence-${trk.mmsi || tIdx}`}>
                {trk.presenceCells.map((c, cIdx) => {
                  const bgLat = Number(c.latitude ?? c.lat);
                  const bgLng = Number(c.longitude ?? c.lon ?? c.lng);
                  if (isNaN(bgLat) || isNaN(bgLng)) return null;
                  return (
                    <CircleMarker
                      key={`bg-cell-${trk.mmsi || tIdx}-${cIdx}`}
                      center={[bgLat, bgLng]}
                      radius={3.5}
                      pathOptions={{
                        color: '#64748B',
                        fillColor: '#94A3B8',
                        fillOpacity: 0.4,
                        weight: 1,
                      }}
                    >
                      <Tooltip sticky direction="top" opacity={0.8}>
                        <div style={{ fontFamily: "var(--og-font-mono, monospace)", fontSize: '10px' }}>
                          <div>{trk.shipName || trk.vesselName || `MMSI: ${trk.mmsi}`}</div>
                          <div>GFW AIS Vessel Presence (Non-Candidate)</div>
                        </div>
                      </Tooltip>
                    </CircleMarker>
                  );
                })}
              </React.Fragment>
            );
          }
          return null;
        }

        return (
          <Polyline
            key={`bg-track-${trk.mmsi || tIdx}`}
            positions={coords}
            pathOptions={{
              color: NEUTRAL_TRACK_COLOR,
              weight: 1.5,
              dashArray: '3, 5',
              opacity: 0.65,
            }}
          >
            <Tooltip sticky direction="top" opacity={0.9}>
              <div style={{ fontFamily: "var(--og-font-mono, monospace)", fontSize: '11px', color: '#0F172A' }}>
                <strong>{trk.vesselName || trk.name || `MMSI: ${trk.mmsi}`}</strong>
                <div>Historical AIS Track ({coords.length} points)</div>
                <div style={{ color: '#64748B', fontSize: '10px' }}>Non-Correlated Vessel</div>
              </div>
            </Tooltip>
          </Polyline>
        );
      })}

      {/* 1. Potential Candidate Tracks and CPA Corridors */}
      {candidateList.map((candidate, idx) => {
        const vesselId = candidate.vesselId || {};
        const correlation = candidate.correlation || {};
        const aisEvidence = candidate.aisEvidence || {};
        const track = aisEvidence.track || candidate.trackPoints || [];

        const rawCoords = track
          .map((pt) => [Number(pt.latitude ?? pt.lat), Number(pt.longitude ?? pt.lng)])
          .filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng));

        const isPresence = candidate.observationLevel === 'VESSEL_PRESENCE' ||
          aisEvidence.observationLevel === 'VESSEL_PRESENCE' ||
          candidate.type === 'GFW_VESSEL_PRESENCE' ||
          (Array.isArray(aisEvidence.presenceCells) && aisEvidence.presenceCells.length > 0) ||
          (Array.isArray(candidate.presenceCells) && candidate.presenceCells.length > 0 && rawCoords.length === 0);

        // Build polyline coordinates [[lat, lng], ...] only if raw positions exist
        const trackCoords = !isPresence ? rawCoords : [];

        // Find closest point or terminal point
        let cpaLat = null;
        let cpaLng = null;
        if (!isPresence && trackCoords.length > 0) {
          // If closestApproachTimestamp matches a point
          const cpaTime = correlation.closestApproachTimestamp;
          const matchPt = track.find((p) => p.timestamp === cpaTime);
          if (matchPt) {
            cpaLat = Number(matchPt.latitude);
            cpaLng = Number(matchPt.longitude);
          } else {
            // Default to first track point or midpoint
            cpaLat = trackCoords[0][0];
            cpaLng = trackCoords[0][1];
          }
        }

        const mmsi = (typeof vesselId === 'object' ? vesselId.mmsi : vesselId) || candidate.mmsi || 'UNKNOWN';
        const vesselName = (typeof vesselId === 'object' ? vesselId.name : null) || candidate.vesselName || candidate.shipName || `MMSI: ${mmsi}`;
        const closestKm = correlation.closestApproachKm != null ? correlation.closestApproachKm.toFixed(2) : 'N/A';
        const enteredCorridor = correlation.enteredOriginUncertaintyCorridor === true;
        const trajConsistency = correlation.trajectoryConsistency || 'INCONCLUSIVE';
        const presenceCells = (Array.isArray(aisEvidence.presenceCells) && aisEvidence.presenceCells.length > 0)
          ? aisEvidence.presenceCells
          : (Array.isArray(candidate.presenceCells) ? candidate.presenceCells : []);
        const totalHours = aisEvidence.presenceHours ?? candidate.totalPresenceHours ?? candidate.hours ?? (presenceCells.reduce((sum, c) => sum + (c.hours || 0), 0) || 1);

        const isSelected = selectedCandidateId != null && (
          String(candidate.id || '') === String(selectedCandidateId) ||
          String(mmsi) === String(selectedCandidateId) ||
          String(vesselId.mmsi || '') === String(selectedCandidateId)
        );
        const hasSelection = selectedCandidateId != null;

        let cellRadius, cellWeight, cellBorderColor, cellFillColor, cellFillOpacity;
        if (activeMapContext === 'ais') {
          cellRadius = isSelected ? 9 : (hasSelection ? 5.5 : 7);
          cellWeight = isSelected ? 2.5 : 2.0;
          cellBorderColor = isSelected ? '#F3E8FF' : (hasSelection ? '#7E22CE' : PURPLE_BORDER);
          cellFillColor = isSelected ? '#C084FC' : (hasSelection ? '#A855F7' : PURPLE_MAIN);
          cellFillOpacity = isSelected ? 0.98 : (hasSelection ? 0.60 : 0.90);
        } else if (activeMapContext === 'sar' || activeMapContext === 'drift') {
          cellRadius = isSelected ? 7 : (hasSelection ? 3.5 : 4.5);
          cellWeight = isSelected ? 2.0 : 1.0;
          cellBorderColor = isSelected ? '#F3E8FF' : (hasSelection ? '#7E22CE' : PURPLE_BORDER);
          cellFillColor = isSelected ? '#C084FC' : (hasSelection ? '#A855F7' : PURPLE_MAIN);
          cellFillOpacity = isSelected ? 0.85 : 0.30;
        } else {
          cellRadius = isSelected ? 8 : (hasSelection ? 5 : 6);
          cellWeight = isSelected ? 2.5 : (hasSelection ? 1 : 1.5);
          cellBorderColor = isSelected ? '#F3E8FF' : (hasSelection ? '#7E22CE' : PURPLE_BORDER);
          cellFillColor = isSelected ? '#C084FC' : (hasSelection ? '#A855F7' : PURPLE_MAIN);
          cellFillOpacity = isSelected ? 0.95 : (hasSelection ? 0.40 : 0.85);
        }

        // If GFW presence cells are present, render cell markers without fake tracks or CPA lines
        if (isPresence) {
          // If candidate has presenceCells list, render each cell
          const cellsToRender = presenceCells.length > 0 ? presenceCells : (
            (correlation.closestCellCoordinates?.latitude != null && correlation.closestCellCoordinates?.longitude != null)
              ? [{ latitude: correlation.closestCellCoordinates.latitude, longitude: correlation.closestCellCoordinates.longitude, hours: totalHours }]
              : ((candidate.latitude != null || candidate.lat != null)
                ? [{ latitude: candidate.latitude ?? candidate.lat, longitude: candidate.longitude ?? candidate.lon, hours: totalHours }]
                : [])
          );

          return (
            <React.Fragment key={`manual-cand-presence-${mmsi}-${idx}-${isSelected ? 'selected' : 'normal'}`}>
              {cellsToRender.map((cell, cIdx) => {
                const cLat = Number(cell.latitude ?? cell.lat);
                const cLng = Number(cell.longitude ?? cell.lon ?? cell.lng);
                if (isNaN(cLat) || isNaN(cLng)) return null;

                let distToOriginKm = cell.distanceKm != null ? Number(cell.distanceKm) : null;
                if (distToOriginKm == null && hasOrigin) {
                  const dLat = ((cLat - originLat) * Math.PI) / 180;
                  const dLon = ((cLng - originLng) * Math.PI) / 180;
                  const a =
                    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos((originLat * Math.PI) / 180) * Math.cos((cLat * Math.PI) / 180) *
                    Math.sin(dLon / 2) * Math.sin(dLon / 2);
                  distToOriginKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                } else if (distToOriginKm == null && correlation.closestCellDistanceKm != null) {
                  distToOriginKm = Number(correlation.closestCellDistanceKm);
                }
                const distToOriginStr = distToOriginKm != null && !isNaN(distToOriginKm) ? `${distToOriginKm.toFixed(2)} km` : 'N/A';

                let tempDiffStr = 'N/A';
                const cellTime = cell.timestamp || candidate.timestamp || candidate.firstSeen || aisEvidence.firstSeen;
                const originTime = origin?.estimatedReleaseTime || origin?.originTimestamp || origin?.timestamp;
                if (cellTime && originTime) {
                  const diffMs = Math.abs(new Date(cellTime).getTime() - new Date(originTime).getTime());
                  if (!isNaN(diffMs)) {
                    tempDiffStr = `${(diffMs / 3600000).toFixed(1)} hours`;
                  }
                } else if (candidate.evidence?.timeDiffHours != null) {
                  tempDiffStr = `${Number(candidate.evidence.timeDiffHours).toFixed(1)} hours`;
                }

                return (
                  <CircleMarker
                    key={`presence-cell-${mmsi}-${cIdx}-${isSelected ? 'selected' : 'normal'}`}
                    center={[cLat, cLng]}
                    radius={cellRadius}
                    pathOptions={{
                      color: cellBorderColor,
                      fillColor: cellFillColor,
                      fillOpacity: cellFillOpacity,
                      weight: cellWeight,
                    }}
                    eventHandlers={{
                      click: () => {
                        if (onSelectCandidate) onSelectCandidate(candidate);
                      },
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                      <div style={{ fontFamily: "var(--og-font-mono, monospace)", fontSize: '11px', lineHeight: 1.45 }}>
                        <div style={{ fontWeight: 800, color: '#6D28D9', marginBottom: '2px' }}>GFW AIS VESSEL PRESENCE — HOURLY</div>
                        <div><strong>Vessel:</strong> {vesselName}</div>
                        <div><strong>MMSI:</strong> {mmsi}</div>
                        <div><strong>Presence:</strong> {cell.hours || totalHours || 1} hours</div>
                        <div><strong>Cell:</strong> {cLat.toFixed(4)}, {cLng.toFixed(4)}</div>
                        <div><strong>Distance to Origin:</strong> {distToOriginStr}</div>
                        <div><strong>Time Delta:</strong> {tempDiffStr}</div>
                        <div><strong>Classification:</strong> POTENTIAL CANDIDATE</div>
                        <div><strong>Attribution:</strong> NOT ESTABLISHED</div>
                      </div>
                    </Tooltip>

                    <Popup maxWidth={340} className="og-leaflet-popup">
                      <div
                        style={{
                          fontFamily: "var(--og-font-display, 'Hanken Grotesk', sans-serif)",
                          fontSize: '11px',
                          color: 'var(--og-text-primary, #E2E8F0)',
                          backgroundColor: 'var(--og-surface-base, #0F172A)',
                          padding: '12px',
                          borderRadius: '8px',
                          border: '1px solid rgba(168, 85, 247, 0.4)',
                          lineHeight: '1.45',
                        }}
                      >
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Ship size={14} color={PURPLE_LIGHT} />
                            <span style={{ fontWeight: 800, fontSize: '12px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                              {vesselName}
                            </span>
                          </div>
                          <span
                            style={{
                              fontSize: '9px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(168, 85, 247, 0.2)',
                              color: PURPLE_LIGHT,
                              border: '1px solid rgba(168, 85, 247, 0.4)',
                            }}
                          >
                            RANK #{candidate.rank || (idx + 1)}
                          </span>
                        </div>

                        {/* Status Badges */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              fontSize: '9.5px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(147, 51, 234, 0.25)',
                              color: '#DDD6FE',
                              letterSpacing: '0.03em',
                            }}
                          >
                            POTENTIAL AIS CANDIDATE
                          </span>
                          <span
                            style={{
                              display: 'inline-block',
                              fontSize: '9px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(56, 189, 248, 0.2)',
                              color: '#38BDF8',
                              border: '1px solid rgba(56, 189, 248, 0.3)',
                            }}
                          >
                            GFW AIS Vessel Presence — Hourly
                          </span>
                        </div>

                        {/* Mandatory Legal & Scientific Guardrail Notice */}
                        <div
                          style={{
                            backgroundColor: 'rgba(59, 130, 246, 0.12)',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            borderRadius: '4px',
                            padding: '6px 8px',
                            marginBottom: '8px',
                            fontSize: '9px',
                            color: '#93C5FD',
                          }}
                        >
                          <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <ShieldAlert size={11} color="#60A5FA" />
                            ATTRIBUTION: NOT ESTABLISHED
                          </div>
                          <div style={{ fontSize: '8.5px', marginTop: '2px', color: '#BFDBFE' }}>
                            Observed GFW vessel-presence cell (NOT exact vessel position). Aggregated presence cells do not establish an AIS track, speed, heading, or closest point of approach (CPA).
                          </div>
                        </div>

                        {/* Presence Evidence Metrics */}
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '6px',
                            marginBottom: '8px',
                            fontFamily: "var(--og-font-mono, monospace)",
                            fontSize: '10px',
                          }}
                        >
                          <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', padding: '4px 6px', borderRadius: '4px' }}>
                            <div style={{ color: 'var(--og-text-muted, #94A3B8)', fontSize: '8.5px' }}>TOTAL PRESENCE</div>
                            <div style={{ fontWeight: 700, color: PURPLE_LIGHT }}>{totalHours} hrs</div>
                          </div>

                          <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', padding: '4px 6px', borderRadius: '4px' }}>
                            <div style={{ color: 'var(--og-text-muted, #94A3B8)', fontSize: '8.5px' }}>CELL DISTANCE</div>
                            <div style={{ fontWeight: 700, color: '#E2E8F0' }}>
                              {distToOriginStr}
                            </div>
                          </div>

                          <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', padding: '4px 6px', borderRadius: '4px' }}>
                            <div style={{ color: 'var(--og-text-muted, #94A3B8)', fontSize: '8.5px' }}>CPA DISTANCE</div>
                            <div style={{ fontWeight: 700, color: '#94A3B8' }}>NOT AVAILABLE</div>
                          </div>

                          <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', padding: '4px 6px', borderRadius: '4px' }}>
                            <div style={{ color: 'var(--og-text-muted, #94A3B8)', fontSize: '8.5px' }}>HEADING / SPEED</div>
                            <div style={{ fontWeight: 700, color: '#94A3B8' }}>NOT AVAILABLE</div>
                          </div>
                        </div>

                        {/* Vessel Specifications */}
                        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '6px', fontSize: '9.5px', color: 'var(--og-text-secondary, #94A3B8)' }}>
                          <div>MMSI: <span style={{ color: '#E2E8F0', fontFamily: 'monospace' }}>{mmsi}</span></div>
                          {vesselId.imo && <div>IMO: <span style={{ color: '#E2E8F0', fontFamily: 'monospace' }}>{vesselId.imo}</span></div>}
                          {vesselId.vesselType && <div>Type: <span style={{ color: '#E2E8F0' }}>{vesselId.vesselType}</span></div>}
                          {vesselId.flag && <div>Flag: <span style={{ color: '#E2E8F0' }}>{vesselId.flag}</span></div>}
                          <div>Cell: <span style={{ color: '#E2E8F0', fontFamily: 'monospace' }}>{cLat.toFixed(3)}°, {cLng.toFixed(3)}°</span></div>
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </React.Fragment>
          );
        }

        return (
          <React.Fragment key={`manual-cand-${mmsi}-${idx}`}>
            {/* 1. Historical AIS Track Polyline */}
            {trackCoords.length > 1 && (
              <Polyline
                positions={trackCoords}
                pathOptions={{
                  color: PURPLE_MAIN,
                  weight: 2,
                  dashArray: '4, 4',
                  opacity: 0.8,
                }}
              >
                <Tooltip sticky direction="top" opacity={0.95}>
                  <div style={{ fontFamily: "var(--og-font-mono, monospace)", fontSize: '11px', color: '#1E1B4B' }}>
                    <strong>{vesselName}</strong>
                    <div>AIS Track ({track.length} points)</div>
                  </div>
                </Tooltip>
              </Polyline>
            )}

            {/* 2. CPA Connection Line to Estimated Origin (if both exist) */}
            {hasOrigin && cpaLat != null && cpaLng != null && (
              <Polyline
                positions={[
                  [cpaLat, cpaLng],
                  [originLat, originLng],
                ]}
                pathOptions={{
                  color: CPA_LINE_COLOR,
                  weight: 1.5,
                  dashArray: '2, 5',
                  opacity: 0.7,
                }}
              />
            )}

            {/* 3. Candidate Vessel Marker at Closest Approach */}
            {cpaLat != null && cpaLng != null && (
              <CircleMarker
                center={[cpaLat, cpaLng]}
                radius={7}
                pathOptions={{
                  color: PURPLE_BORDER,
                  fillColor: PURPLE_MAIN,
                  fillOpacity: 0.9,
                  weight: 2,
                }}
              >
                <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
                  <div style={{ fontFamily: "var(--og-font-mono, monospace)", fontSize: '11px' }}>
                    <div style={{ fontWeight: 700, color: '#4C1D95' }}>{vesselName}</div>
                    <div style={{ color: '#6B7280', fontSize: '10px' }}>POTENTIAL AIS CANDIDATE</div>
                    <div style={{ color: '#374151', marginTop: '2px' }}>
                      CPA: {closestKm} km
                      {enteredCorridor ? ' (Inside Corridor)' : ' (Outside Corridor)'}
                    </div>
                  </div>
                </Tooltip>

                <Popup maxWidth={340} className="og-leaflet-popup">
                  <div
                    style={{
                      fontFamily: "var(--og-font-display, 'Hanken Grotesk', sans-serif)",
                      fontSize: '11px',
                      color: 'var(--og-text-primary, #E2E8F0)',
                      backgroundColor: 'var(--og-surface-base, #0F172A)',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(168, 85, 247, 0.4)',
                      lineHeight: '1.45',
                    }}
                  >
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Ship size={14} color={PURPLE_LIGHT} />
                        <span style={{ fontWeight: 800, fontSize: '12px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                          {vesselName}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(168, 85, 247, 0.2)',
                          color: PURPLE_LIGHT,
                          border: '1px solid rgba(168, 85, 247, 0.4)',
                        }}
                      >
                        RANK #{candidate.rank || (idx + 1)}
                      </span>
                    </div>

                    {/* Status Badge */}
                    <div style={{ marginBottom: '8px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          fontSize: '9.5px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(147, 51, 234, 0.25)',
                          color: '#DDD6FE',
                          letterSpacing: '0.03em',
                        }}
                      >
                        POTENTIAL AIS CANDIDATE
                      </span>
                    </div>

                    {/* Demo Warning if applicable */}
                    {isDemo && (
                      <div
                        style={{
                          backgroundColor: 'rgba(239, 68, 68, 0.15)',
                          border: '1px solid rgba(239, 68, 68, 0.35)',
                          borderRadius: '4px',
                          padding: '6px 8px',
                          marginBottom: '8px',
                          fontSize: '9.5px',
                          color: '#FCA5A5',
                        }}
                      >
                        <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <AlertTriangle size={11} color="#EF4444" />
                          DEMONSTRATION AIS DATA
                        </div>
                        <div style={{ fontSize: '9px', marginTop: '2px', color: '#F87171' }}>
                          DATA SOURCE: DEMO AIS — NOT REAL-WORLD AIS EVIDENCE
                        </div>
                      </div>
                    )}

                    {/* Mandatory Legal & Scientific Guardrail Notice */}
                    <div
                      style={{
                        backgroundColor: 'rgba(59, 130, 246, 0.12)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: '4px',
                        padding: '6px 8px',
                        marginBottom: '8px',
                        fontSize: '9px',
                        color: '#93C5FD',
                      }}
                    >
                      <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <ShieldAlert size={11} color="#60A5FA" />
                        ATTRIBUTION: NOT ESTABLISHED
                      </div>
                      <div style={{ fontSize: '8.5px', marginTop: '2px', color: '#BFDBFE' }}>
                        AIS movement is spatially and temporally correlated with the model-derived estimated spill origin. This does NOT establish responsibility.
                      </div>
                    </div>

                    {/* Correlation Evidence Metrics */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '6px',
                        marginBottom: '8px',
                        fontFamily: "var(--og-font-mono, monospace)",
                        fontSize: '10px',
                      }}
                    >
                      <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', padding: '4px 6px', borderRadius: '4px' }}>
                        <div style={{ color: 'var(--og-text-muted, #94A3B8)', fontSize: '8.5px' }}>CLOSEST DISTANCE</div>
                        <div style={{ fontWeight: 700, color: PURPLE_LIGHT }}>{closestKm} km</div>
                      </div>

                      <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', padding: '4px 6px', borderRadius: '4px' }}>
                        <div style={{ color: 'var(--og-text-muted, #94A3B8)', fontSize: '8.5px' }}>UNCERTAINTY CORRIDOR</div>
                        <div style={{ fontWeight: 700, color: enteredCorridor ? '#4ADE80' : '#F87171' }}>
                          {enteredCorridor ? 'ENTERED' : 'OUTSIDE'}
                        </div>
                      </div>

                      <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', padding: '4px 6px', borderRadius: '4px' }}>
                        <div style={{ color: 'var(--og-text-muted, #94A3B8)', fontSize: '8.5px' }}>TRAJECTORY MATCH</div>
                        <div style={{ fontWeight: 700, color: '#E2E8F0' }}>{trajConsistency}</div>
                      </div>

                      <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', padding: '4px 6px', borderRadius: '4px' }}>
                        <div style={{ color: 'var(--og-text-muted, #94A3B8)', fontSize: '8.5px' }}>EVIDENCE METRIC</div>
                        <div style={{ fontWeight: 700, color: '#E2E8F0' }}>
                          {correlation.score != null ? correlation.score.toFixed(3) : 'N/A'}
                        </div>
                      </div>
                    </div>

                    {/* Vessel Specifications */}
                    <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '6px', fontSize: '9.5px', color: 'var(--og-text-secondary, #94A3B8)' }}>
                      <div>MMSI: <span style={{ color: '#E2E8F0', fontFamily: 'monospace' }}>{mmsi}</span></div>
                      {vesselId.imo && <div>IMO: <span style={{ color: '#E2E8F0', fontFamily: 'monospace' }}>{vesselId.imo}</span></div>}
                      {vesselId.vesselType && <div>Type: <span style={{ color: '#E2E8F0' }}>{vesselId.vesselType}</span></div>}
                      {vesselId.flag && <div>Flag: <span style={{ color: '#E2E8F0' }}>{vesselId.flag}</span></div>}
                      {vesselId.lengthM != null && <div>Length: <span style={{ color: '#E2E8F0' }}>{vesselId.lengthM} m</span></div>}
                      <div style={{ marginTop: '2px', color: 'var(--og-text-muted, #64748B)', fontSize: '8.5px' }}>
                        AIS Points: {aisEvidence.positionCount || track.length}
                      </div>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}
