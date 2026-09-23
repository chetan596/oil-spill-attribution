import React from 'react';
import { CircleMarker, Popup, Polyline, Marker } from 'react-leaflet';
import L from 'leaflet';
import { Ship, Database, Compass, Navigation, Crosshair } from 'lucide-react';
import EvidenceBadge from '../common/EvidenceBadge';

// Helper to create a custom rotated ship SVG icon
function createShipIcon(heading = 0, isRank1 = false, isSelected = false, isDimmed = false) {
  const fillColor = isSelected ? '#ffc44d' : isRank1 ? '#ffb84a' : '#a56bff';
  const strokeColor = isSelected ? '#ffffff' : isRank1 ? '#ffffff' : '#07100D';
  const size = isSelected ? 26 : isRank1 ? 22 : 18;
  const opacity = isDimmed ? 0.35 : 1;

  const svgHtml = `
    <div style="transform: rotate(${heading}deg); transform-origin: center; width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center; opacity: ${opacity}; transition: all 0.2s ease;">
      <svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${isSelected ? 2 : 1.5}" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 2px ${isSelected ? '6px rgba(255,196,77,0.7)' : '4px rgba(0,0,0,0.6)'});">
        <polygon points="12 2 19 21 12 17 5 21 12 2" />
      </svg>
    </div>
  `;

  return L.divIcon({
    html: svgHtml,
    className: 'vessel-map-icon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// CPA Crosshair Marker Icon
function createCpaIcon() {
  const svgHtml = `
    <div style="width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; background: rgba(255, 196, 77, 0.2); border: 1.5px solid #ffc44d; border-radius: 50%;">
      <div style="width: 6px; height: 6px; background: #ffc44d; border-radius: 50%;"></div>
    </div>
  `;
  return L.divIcon({
    html: svgHtml,
    className: 'cpa-marker-icon',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

export default function VesselLayer({
  candidateVessels = [],
  selectedVessel = null,
  onSelectVessel,
  vesselTrack,
  originCoord = null,
  showVessels = true,
  showTracks = true,
  showCpa = true,
}) {
  if (!candidateVessels || candidateVessels.length === 0) return null;

  // Find selected candidate evidence for CPA
  const activeCandidate = selectedVessel
    ? candidateVessels.find(
        (c) =>
          (c.vessel?.mmsi || c.mmsi) ===
          (selectedVessel.vessel?.mmsi || selectedVessel.mmsi)
      ) || selectedVessel
    : null;

  const activeEvidence = activeCandidate?.evidence || {};
  const cpaLat = activeEvidence.passingLat != null ? Number(activeEvidence.passingLat) : null;
  const cpaLng = activeEvidence.passingLng != null ? Number(activeEvidence.passingLng) : null;
  const hasValidCpa = cpaLat != null && cpaLng != null && !isNaN(cpaLat) && !isNaN(cpaLng);

  return (
    <>
      {/* AIS Historical Track for Selected Vessel (Thin Crisp Dashed Line) */}
      {showTracks && vesselTrack && vesselTrack.track && vesselTrack.track.length > 1 && (
        <Polyline
          positions={vesselTrack.track.map((pt) => [Number(pt.latitude), Number(pt.longitude)])}
          pathOptions={{
            color: '#ffc44d',
            weight: 2.5,
            opacity: 0.9,
            dashArray: '4, 6',
          }}
        />
      )}
      {showTracks && vesselTrack && vesselTrack.trackPoints && vesselTrack.trackPoints.length > 1 && (
        <Polyline
          positions={vesselTrack.trackPoints.map((pt) => [Number(pt.latitude), Number(pt.longitude)])}
          pathOptions={{
            color: '#ffc44d',
            weight: 2.5,
            opacity: 0.9,
            dashArray: '4, 6',
          }}
        />
      )}

      {/* CPA Measurement Vector Line from Vessel Track CPA location to Modelled Origin */}
      {showCpa && hasValidCpa && originCoord && originCoord.length === 2 && !isNaN(originCoord[0]) && !isNaN(originCoord[1]) && (
        <>
          <Polyline
            positions={[
              [cpaLat, cpaLng],
              [Number(originCoord[0]), Number(originCoord[1])],
            ]}
            pathOptions={{
              color: '#ffc44d',
              weight: 2,
              opacity: 0.9,
              dashArray: '3, 4',
            }}
          />

          {/* CPA Exact Marker on Track */}
          <Marker position={[cpaLat, cpaLng]} icon={createCpaIcon()}>
            <Popup>
              <div style={{ color: 'var(--text-primary)', padding: '4px', minWidth: '190px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#ffc44d', fontWeight: 800, fontSize: '0.82rem' }}>
                    <Crosshair size={14} />
                    <span>CLOSEST POINT OF APPROACH (CPA)</span>
                  </div>
                  <EvidenceBadge classification="MODELLED" size="sm" />
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <div>
                    Distance to Origin: <strong style={{ color: '#ffc44d', fontFamily: 'var(--font-mono)' }}>{activeEvidence.distanceKm} km</strong>
                  </div>
                  {activeEvidence.timeDiffHours != null && (
                    <div>
                      Time Delta: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{activeEvidence.timeDiffHours}h</strong>
                    </div>
                  )}
                  {activeEvidence.speedAtPassingKts != null && (
                    <div>
                      Speed at CPA: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{activeEvidence.speedAtPassingKts} kts</strong>
                    </div>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        </>
      )}

      {/* Candidate Vessel Markers */}
      {showVessels && candidateVessels.map((item, idx) => {
        const vessel = item.vessel || item;
        const evidence = item.evidence || {};
        const isRank1 = item.rank === 1 || idx === 0;
        const hasSelection = Boolean(selectedVessel);
        const isSelected =
          selectedVessel &&
          (selectedVessel.vessel?.mmsi === vessel.mmsi || selectedVessel.mmsi === vessel.mmsi);
        const isDimmed = hasSelection && !isSelected;

        const lat = Number(evidence.passingLat ?? evidence.latitude ?? (18.98 + idx * 0.04));
        const lng = Number(evidence.passingLng ?? evidence.longitude ?? (72.72 - idx * 0.05));
        const heading = Number(evidence.headingAtPassingDeg ?? evidence.courseOverGround ?? evidence.heading ?? 245 + idx * 15);

        if (isNaN(lat) || isNaN(lng)) return null;

        const scorePercent = Math.round((item.totalScore ?? 0.5) * 100);

        return (
          <Marker
            key={vessel.mmsi || idx}
            position={[lat, lng]}
            icon={createShipIcon(heading, isRank1, isSelected, isDimmed)}
            eventHandlers={{
              click: () => onSelectVessel && onSelectVessel(item),
            }}
          >
            <Popup>
              <div style={{ color: 'var(--text-primary)', padding: '6px', minWidth: '230px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: isSelected ? '#ffc44d' : isRank1 ? '#ffb84a' : '#38bdf8', fontWeight: 800, fontSize: '0.88rem' }}>
                    <Ship size={15} />
                    <span>{vessel.name || 'Candidate Vessel'}</span>
                  </div>
                  <EvidenceBadge type="DEMONSTRATION" label="DEMO AIS" size="xs" />
                </div>

                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  MMSI: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{vessel.mmsi}</span> | Flag: <span style={{ color: 'var(--text-primary)' }}>{vessel.flag || 'N/A'}</span>
                </div>

                <div
                  style={{
                    margin: '6px 0',
                    padding: '6px 8px',
                    background: isSelected ? 'rgba(255, 196, 77, 0.1)' : 'var(--surface-sunken)',
                    border: `1px solid ${isSelected ? 'rgba(255, 196, 77, 0.4)' : 'var(--border-color)'}`,
                    borderRadius: '4px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Attribution Score</span>
                  <span style={{ color: isSelected ? '#ffc44d' : isRank1 ? '#ffb84a' : '#38bdf8', fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>
                    {scorePercent}% (Rank #{item.rank || idx + 1})
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {evidence.distanceKm != null && (
                    <div>
                      CPA Distance: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{evidence.distanceKm} km</strong>
                    </div>
                  )}
                  {evidence.speedAtPassingKts != null && (
                    <div>
                      Speed at Passing: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{evidence.speedAtPassingKts} kts</strong>
                    </div>
                  )}
                  {evidence.timeDiffHours != null && (
                    <div>
                      Time Window Delta: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{evidence.timeDiffHours}h</strong>
                    </div>
                  )}
                </div>

                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '6px', borderTop: '1px solid var(--border-color)', paddingTop: '4px' }}>
                  Demonstration AIS candidate correlation
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

