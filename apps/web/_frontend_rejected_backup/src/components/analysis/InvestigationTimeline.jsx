import React from 'react';
import EvidenceBadge from '../common/EvidenceBadge';
import { Clock, Satellite, Compass, Ship, Target, AlertCircle, Crosshair } from 'lucide-react';

/**
 * InvestigationTimeline — Visual chronological progression of Observed, Modelled, and Candidate Vessel events.
 * Interactive: Clicking any event triggers map focus and telemetry alignment.
 */
export default function InvestigationTimeline({
  spill,
  driftData,
  candidateVessels = [],
  onFocusTarget = null,
}) {
  if (!spill && !driftData) return null;

  const detectedAt = spill?.detectedAt ? new Date(spill.detectedAt) : new Date('2026-03-10T12:00:00Z');
  const originTimestamp = driftData?.originTimestamp
    ? new Date(driftData.originTimestamp)
    : new Date(detectedAt.getTime() - 24 * 3600 * 1000);

  const forecastEnd = new Date(detectedAt.getTime() + 6 * 3600 * 1000);

  // Top candidate info
  const topCandidate = candidateVessels?.[0];
  const topVesselName = topCandidate?.vessel?.name || topCandidate?.name || 'ARABIAN FORTUNE';
  const cpaDist = topCandidate?.evidence?.closestApproachKm ?? topCandidate?.evidence?.distanceKm ?? '1.24';

  const originCoords = [Number(driftData?.originLat || 19.113), Number(driftData?.originLng || 72.544)];
  const spillCoords = [Number(spill?.latitude || 18.921), Number(spill?.longitude || 72.832)];
  const cpaCoords = [
    Number(topCandidate?.evidence?.passingLat ?? 18.98),
    Number(topCandidate?.evidence?.passingLng ?? 72.72),
  ];
  const forecastCoords = driftData?.forwardPath && driftData.forwardPath.length > 0
    ? [
        Number(driftData.forwardPath[driftData.forwardPath.length - 1].latitude ?? driftData.forwardPath[driftData.forwardPath.length - 1].lat),
        Number(driftData.forwardPath[driftData.forwardPath.length - 1].longitude ?? driftData.forwardPath[driftData.forwardPath.length - 1].lng),
      ]
    : [18.87, 72.90];

  const events = [
    {
      id: 'origin',
      time: originTimestamp.toUTCString(),
      label: 'T - 24h: Modelled Spill Origin',
      badgeType: 'MODELLED',
      badgeLabel: 'MODELLED ORIGIN',
      icon: Target,
      iconColor: 'var(--accent-amber)',
      borderColor: 'rgba(245, 158, 11, 0.3)',
      bgColor: 'rgba(245, 158, 11, 0.05)',
      targetCoords: originCoords,
      targetZoom: 12,
      description: `Estimated release window at coordinates [${originCoords[0].toFixed(3)}°N, ${originCoords[1].toFixed(3)}°E] with a Modelled Origin Uncertainty Radius of ±${Number(driftData?.uncertaintyRadiusKm || 2.6).toFixed(1)} km.`,
    },
    {
      id: 'hindcast',
      time: 'T - 24h → T0',
      label: 'Modelled Backward Drift Trajectory',
      badgeType: 'MODELLED',
      badgeLabel: 'LAGRANGIAN HINDCAST',
      icon: Compass,
      iconColor: 'var(--accent-cyan)',
      borderColor: 'rgba(56, 189, 248, 0.25)',
      bgColor: 'rgba(56, 189, 248, 0.04)',
      targetCoords: originCoords,
      targetZoom: 11,
      description: `24-hour backward Lagrangian advection under demonstration MetOcean forcing (12.4 kts NW wind, 0.8 kts SE surface current). 25 hourly waypoints computed.`,
    },
    ...(topCandidate
      ? [
          {
            id: 'cpa',
            time: 'T - 18h → T - 12h (CPA Window)',
            label: `Candidate Vessel AIS Proximity: ${topVesselName}`,
            badgeType: 'DEMONSTRATION',
            badgeLabel: 'DEMO AIS TRACK',
            icon: Ship,
            iconColor: 'var(--accent-purple)',
            borderColor: 'rgba(168, 85, 247, 0.3)',
            bgColor: 'rgba(168, 85, 247, 0.04)',
            targetCoords: cpaCoords,
            targetZoom: 12,
            description: `${topVesselName} tracked in proximity to Modelled Origin with a Closest Point of Approach (CPA) of ${cpaDist} km. Kinematic correlation: ${Math.round((topCandidate?.totalScore || 0.564) * 100)}% Attribution Score.`,
          },
        ]
      : []),
    {
      id: 'spill',
      time: detectedAt.toUTCString(),
      label: 'T0: Observed Sentinel-1 SAR Detection',
      badgeType: 'OBSERVED',
      badgeLabel: 'SAR OBSERVATION',
      icon: Satellite,
      iconColor: 'var(--accent-emerald)',
      borderColor: 'rgba(16, 185, 129, 0.3)',
      bgColor: 'rgba(16, 185, 129, 0.04)',
      targetCoords: spillCoords,
      targetZoom: 11,
      description: `C-band SAR radar imagery acquired. Potential Oil Slick footprint detected covering ${spill?.areaKm2 || 4.73} km² at centroid [${spillCoords[0].toFixed(3)}°N, ${spillCoords[1].toFixed(3)}°E] with ${Math.round((spill?.confidence || 0.94) * 100)}% detection confidence.`,
    },
    {
      id: 'forecast',
      time: forecastEnd.toUTCString(),
      label: 'T + 6h: Modelled Forward Forecast',
      badgeType: 'MODELLED',
      badgeLabel: 'FORWARD FORECAST',
      icon: Compass,
      iconColor: 'var(--accent-emerald)',
      borderColor: 'rgba(16, 185, 129, 0.25)',
      bgColor: 'rgba(16, 185, 129, 0.03)',
      targetCoords: forecastCoords,
      targetZoom: 11,
      description: `Projected 6-hour forward drift trajectory and expanding dispersion envelope under persistent hydrodynamic conditions.`,
    },
  ];

  return (
    <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Clock size={15} style={{ color: 'var(--accent-cyan)' }} />
          <h3 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Chronological Timeline
          </h3>
        </div>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          Click an event to focus map
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative' }}>
        {events.map((evt) => {
          const IconComp = evt.icon;
          return (
            <div
              key={evt.id}
              onClick={() => onFocusTarget && onFocusTarget(evt.targetCoords, evt.targetZoom, evt.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                padding: '10px 12px',
                background: evt.bgColor,
                border: `1px solid ${evt.borderColor}`,
                borderRadius: '4px',
                position: 'relative',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              role="button"
              tabIndex={0}
              aria-label={`Focus map on ${evt.label}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  onFocusTarget && onFocusTarget(evt.targetCoords, evt.targetZoom, evt.id);
                }
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <IconComp size={13} style={{ color: evt.iconColor }} />
                  <strong style={{ color: 'var(--text-primary)', fontSize: '0.8rem' }}>{evt.label}</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <EvidenceBadge type={evt.badgeType} label={evt.badgeLabel} size="xs" />
                  <Crosshair size={12} style={{ color: 'var(--accent-cyan)', opacity: 0.8 }} />
                </div>
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {evt.time}
              </div>
              <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                {evt.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
