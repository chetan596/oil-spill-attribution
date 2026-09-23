import React from 'react';
import { CircleMarker, Popup, Polyline } from 'react-leaflet';
import { Ship, Radio, AlertCircle, ExternalLink } from 'lucide-react';

export default function VesselLayer({
  candidateVessels,
  vessels,
  selectedVessel,
  onSelectVessel,
  vesselTrack,
  originCoords,
  showCpaLine = true,
  isRealScene = false,
}) {
  const list = candidateVessels || vessels || [];
  if (!list || list.length === 0) return null;

  // Support both vesselTrack.track and vesselTrack.trackPoints or array
  const rawTrack = Array.isArray(vesselTrack)
    ? vesselTrack
    : vesselTrack?.track || vesselTrack?.trackPoints || [];
  const trackPositions = rawTrack
    .map((pt) => [Number(pt.latitude ?? pt.lat), Number(pt.longitude ?? pt.lng)])
    .filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng));

  return (
    <>
      {/* AIS Historical Track for Selected Vessel (#A855F7 AIS Purple) */}
      {trackPositions.length > 1 && (
        <Polyline
          positions={trackPositions}
          pathOptions={{
            color: '#A855F7',
            weight: 2,
            opacity: 0.8,
            dashArray: '5, 5',
          }}
        />
      )}

      {/* Candidate Vessel Markers & CPA Lines */}
      {list.map((item, idx) => {
        const vessel = item.vessel || item;
        const evidence = item.evidence || {};
        const isRank1 = item.correlation >= 80 || item.rank === 1 || idx === 0;
        const isSelected =
          selectedVessel &&
          (selectedVessel.vessel?.mmsi === vessel.mmsi ||
            selectedVessel.mmsi === vessel.mmsi ||
            selectedVessel.id === item.id);

        const lat = Number(vessel.latitude ?? evidence.passingLat);
        const lng = Number(vessel.longitude ?? evidence.passingLng);

        if (isNaN(lat) || isNaN(lng)) return null;

        const scorePercent = item.correlation ?? Math.round((item.totalScore ?? 0) * 100);

        // CPA coordinates strictly from source data: use authoritative passing coords if available, else vessel position
        const cpaLat = evidence.passingLat != null ? Number(evidence.passingLat) : null;
        const cpaLng = evidence.passingLng != null ? Number(evidence.passingLng) : null;

        // Render CPA connecting line to origin only if enabled, originCoords exist, and authoritative CPA coords are present
        const shouldRenderCpa =
          showCpaLine &&
          isSelected &&
          originCoords &&
          originCoords.length === 2 &&
          cpaLat != null &&
          cpaLng != null &&
          !isNaN(cpaLat) &&
          !isNaN(cpaLng) &&
          !isNaN(originCoords[0]) &&
          !isNaN(originCoords[1]);

        const mmsi = vessel.mmsi || 'UNKNOWN';
        const flag = vessel.flag || 'UNKNOWN';
        const vesselName = vessel.name || 'Candidate Vessel';
        const vesselHeading = vessel.heading != null ? `${vessel.heading}°` : 'N/A';
        const vesselSpeed = vessel.speed != null ? `${vessel.speed} kn` : 'N/A';
        const proximity = evidence.closestApproachKm != null
          ? `${evidence.closestApproachKm} km`
          : (evidence.distanceKm != null ? `${evidence.distanceKm} km` : 'NOT ESTABLISHED');
        const temporalMatch = evidence.timeDeltaMinutes != null
          ? `Δt = ${evidence.timeDeltaMinutes > 0 ? '+' : ''}${evidence.timeDeltaMinutes} min`
          : 'NOT ESTABLISHED';

        return (
          <React.Fragment key={vessel.mmsi || vessel.id || idx}>
            {shouldRenderCpa && (
              <Polyline
                positions={[
                  [cpaLat, cpaLng],
                  [Number(originCoords[0]), Number(originCoords[1])],
                ]}
                pathOptions={{
                  color: '#A855F7',
                  weight: 1.5,
                  opacity: 0.85,
                  dashArray: '3, 5',
                }}
              />
            )}

            <CircleMarker
              center={[lat, lng]}
              radius={isSelected ? 8 : isRank1 ? 6.5 : 5}
              pathOptions={{
                color: isSelected ? '#FFFFFF' : isRank1 ? '#FFFFFF' : 'rgba(255, 255, 255, 0.6)',
                weight: isSelected ? 2.5 : 1.5,
                fillColor: isSelected ? '#A855F7' : isRank1 ? '#A855F7' : 'rgba(168, 85, 247, 0.45)',
                fillOpacity: isSelected ? 1 : isRank1 ? 0.9 : 0.65,
              }}
              eventHandlers={{
                click: () => onSelectVessel && onSelectVessel(item),
              }}
            >
              <Popup
                autoPan={true}
                autoPanPadding={[24, 24]}
                maxWidth={360}
                minWidth={320}
                className="og-vessel-leaflet-popup"
              >
                {/* ── Compact Professional Blue Forensic Card Container ── */}
                <div
                  style={{
                    width: '100%',
                    maxWidth: '350px',
                    backgroundColor: 'var(--og-surface, #0F1620)',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    fontFamily: "var(--og-font-body, 'Schibsted Grotesk', -apple-system, sans-serif)",
                    color: 'var(--og-text-primary, #ECEEF1)',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.7)',
                    border: '1px solid var(--og-border-subtle, #1E2C3D)',
                  }}
                >
                  {/* 1. Header: Vessel Icon, Name, Badge */}
                  <div
                    style={{
                      padding: '10px 14px',
                      backgroundColor: 'var(--og-surface-elevated, #171A1E)',
                      borderBottom: '1px solid var(--og-border-subtle, #1E2C3D)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                        <Ship size={15} style={{ color: 'var(--og-violet, #A855F7)', flexShrink: 0 }} />
                        <span
                          style={{
                            fontSize: '12.5px',
                            fontWeight: 700,
                            color: '#FFFFFF',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {vesselName}
                        </span>
                      </div>

                      <span
                        style={{
                          fontSize: '9.5px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '3px',
                          backgroundColor: isRealScene ? 'rgba(245, 158, 11, 0.16)' : 'rgba(168, 85, 247, 0.16)',
                          color: isRealScene ? 'var(--og-amber, #F59E0B)' : 'var(--og-violet, #A855F7)',
                          border: isRealScene ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(168, 85, 247, 0.35)',
                          letterSpacing: '0.04em',
                          flexShrink: 0,
                        }}
                      >
                        {isRealScene ? 'REAL CDSE / UNCORRELATED' : 'DEMO AIS / MODELLED'}
                      </span>
                    </div>
                  </div>

                  {/* 2. Identity & Correlation Banner */}
                  <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <span style={{ color: 'var(--og-text-muted, #777E87)' }}>MMSI:</span>
                        <span style={{ fontFamily: 'monospace', color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 600 }}>{mmsi}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <span style={{ color: 'var(--og-text-muted, #777E87)' }}>FLAG:</span>
                        <span style={{ color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 600 }}>{flag}</span>
                      </div>
                    </div>

                    {/* Correlation Banner */}
                    <div
                      style={{
                        padding: '8px 10px',
                        borderRadius: '5px',
                        backgroundColor: 'var(--og-surface-recessed, #0C0E11)',
                        border: '1px solid var(--og-border, #25292F)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        <span
                          style={{
                            fontSize: '9.5px',
                            fontFamily: "var(--og-font-mono, 'JetBrains Mono', monospace)",
                            color: 'var(--og-text-muted, #777E87)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}
                        >
                          ATTRIBUTION CORRELATION
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--og-text-muted, #777E87)' }}>
                          Rank #{item.rank || idx + 1} Candidate
                        </span>
                      </div>

                      <span
                        style={{
                          fontSize: '20px',
                          fontFamily: "var(--og-font-mono, 'JetBrains Mono', monospace)",
                          fontWeight: 700,
                          color: 'var(--og-violet, #A855F7)',
                        }}
                      >
                        {scorePercent}%
                      </span>
                    </div>
                  </div>

                  {/* 3. Spatiotemporal AIS Telemetry Section */}
                  <div
                    style={{
                      padding: '10px 14px',
                      borderTop: '1px solid var(--og-border-subtle, #1E2C3D)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '10px',
                        fontFamily: "var(--og-font-mono, 'JetBrains Mono', monospace)",
                        fontWeight: 700,
                        color: 'var(--og-text-muted, #777E87)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <Radio size={12} style={{ color: 'var(--og-violet, #A855F7)' }} />
                      <span>SPATIOTEMPORAL AIS TELEMETRY</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--og-text-muted, #777E87)' }}>Current Heading</span>
                        <span style={{ fontFamily: 'monospace', color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 600 }}>{vesselHeading}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--og-text-muted, #777E87)' }}>Speed Over Ground</span>
                        <span style={{ fontFamily: 'monospace', color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 600 }}>{vesselSpeed}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--og-text-muted, #777E87)' }}>Proximity to Origin</span>
                        <span style={{ fontFamily: 'monospace', color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 600 }}>{proximity}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--og-text-muted, #777E87)' }}>Temporal Match</span>
                        <span style={{ fontFamily: 'monospace', color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 600 }}>{temporalMatch}</span>
                      </div>
                    </div>
                  </div>

                  {/* 4. Attribution Notice (Contained inside popup) */}
                  <div
                    style={{
                      padding: '8px 14px',
                      borderTop: '1px solid var(--og-border-subtle, #1E2C3D)',
                      backgroundColor: 'rgba(12, 14, 17, 0.65)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--og-text-muted, #777E87)' }}>
                      <AlertCircle size={11} />
                      <span
                        style={{
                          fontSize: '9px',
                          fontFamily: "var(--og-font-mono, 'JetBrains Mono', monospace)",
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        ATTRIBUTION NOTICE
                      </span>
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '9.5px',
                        color: 'var(--og-text-muted, #777E87)',
                        lineHeight: 1.35,
                      }}
                    >
                      Correlation is modelled and does not constitute formal legal proof of discharge.
                    </p>
                  </div>

                  {/* 5. Quick Investigation Link */}
                  <div
                    style={{
                      padding: '8px 14px',
                      borderTop: '1px solid var(--og-border-subtle, #1E2C3D)',
                      backgroundColor: 'var(--og-surface-elevated, #171A1E)',
                      display: 'flex',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <button
                      onClick={() => onSelectVessel && onSelectVessel(item)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--og-violet, #A855F7)',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <span>Investigate in Sidebar</span>
                      <ExternalLink size={12} />
                    </button>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          </React.Fragment>
        );
      })}
    </>
  );
}
