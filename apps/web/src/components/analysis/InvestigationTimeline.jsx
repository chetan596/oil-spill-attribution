import React from 'react';
import EvidenceBadge from '../common/EvidenceBadge';
import { Clock, Satellite, Compass, Ship, ArrowDown, Target, AlertCircle } from 'lucide-react';

/**
 * InvestigationTimeline — Visual chronological progression of Observed, Modelled, and Candidate Vessel events.
 */
export default function InvestigationTimeline({ spill, driftData, candidateVessels = [] }) {
  if (!spill && !driftData) return null;

  const detectedAt = spill?.detectedAt ? new Date(spill.detectedAt) : new Date('2026-03-10T12:00:00Z');
  const originTimestamp = driftData?.originTimestamp
    ? new Date(driftData.originTimestamp)
    : new Date(detectedAt.getTime() - 24 * 3600 * 1000);

  const forecastEnd = new Date(detectedAt.getTime() + 6 * 3600 * 1000);

  // Top candidate info
  const topCandidate = candidateVessels?.[0];
  const topVesselName = topCandidate?.vessel?.name || topCandidate?.name || 'DEMO MARINER ALPHA';
  const cpaDist = topCandidate?.evidence?.closestApproachKm ?? topCandidate?.evidence?.distanceKm ?? '1.24';

  // Coordinates resolution
  const originLat = driftData?.originLat;
  const originLng = driftData?.originLng;
  const originCoordStr = (originLat != null && originLng != null)
    ? `[${Number(originLat).toFixed(3)}°N, ${Number(originLng).toFixed(3)}°E]`
    : 'NOT ESTABLISHED';

  const spillLat = spill?.lat ?? spill?.latitude;
  const spillLng = spill?.lng ?? spill?.longitude;
  const spillCoordStr = (spillLat != null && spillLng != null)
    ? `[${Number(spillLat).toFixed(3)}°N, ${Number(spillLng).toFixed(3)}°E]`
    : 'NOT ESTABLISHED';

  const events = [
    {
      time: originTimestamp.toUTCString(),
      label: 'T - 24h: Modelled Spill Origin',
      badgeType: 'MODELLED',
      badgeLabel: 'MODELLED ORIGIN',
      icon: Target,
      iconColor: 'var(--og-amber, #E7A63A)',
      borderColor: 'var(--og-amber-border, rgba(231, 166, 58, 0.3))',
      bgColor: 'var(--og-amber-soft, rgba(231, 166, 58, 0.05))',
      description: `Estimated release window at coordinates ${originCoordStr}${driftData?.uncertaintyRadiusKm != null ? ` with a Modelled Origin Uncertainty Radius of ±${Number(driftData.uncertaintyRadiusKm).toFixed(1)} km.` : '.'}`,
    },
    {
      time: 'T - 24h → T0',
      label: 'Modelled Backward Drift Trajectory',
      badgeType: 'MODELLED',
      badgeLabel: 'LAGRANGIAN HINDCAST',
      icon: Compass,
      iconColor: 'var(--og-amber, #E7A63A)',
      borderColor: 'var(--og-amber-border, rgba(231, 166, 58, 0.3))',
      bgColor: 'var(--og-amber-soft, rgba(231, 166, 58, 0.05))',
      description: `24-hour backward Lagrangian advection under demonstration MetOcean forcing (12.4 kts NW wind, 0.8 kts SE surface current). 25 hourly waypoints computed.`,
    },
    ...(topCandidate
      ? [
          {
            time: 'T - 18h → T - 12h (CPA Window)',
            label: `Candidate Vessel AIS Proximity: ${topVesselName}`,
            badgeType: 'DEMONSTRATION',
            badgeLabel: 'DEMO AIS TRACK',
            icon: Ship,
            iconColor: 'var(--og-violet, #A855F7)',
            borderColor: 'var(--og-violet-border, rgba(168, 85, 247, 0.3))',
            bgColor: 'var(--og-violet-soft, rgba(168, 85, 247, 0.05))',
            description: `${topVesselName} tracked in proximity to Modelled Origin with a Closest Point of Approach (CPA) of ${cpaDist} km. Kinematic correlation: ${Math.round((topCandidate?.totalScore || 0.564) * 100)}% Attribution Score.`,
          },
        ]
      : []),
    {
      time: detectedAt.toUTCString(),
      label: 'T0: Observed Sentinel-1 SAR Detection',
      badgeType: 'OBSERVED',
      badgeLabel: 'SAR OBSERVATION',
      icon: Satellite,
      iconColor: 'var(--og-teal, #49C6C8)',
      borderColor: 'var(--og-teal-border, rgba(73, 198, 200, 0.3))',
      bgColor: 'var(--og-teal-soft, rgba(73, 198, 200, 0.05))',
      description: `C-band SAR radar imagery acquired. Potential Oil Slick footprint detected covering ${spill?.areaKm2 || 4.73} km² at centroid ${spillCoordStr} with ${Math.round((spill?.confidence || 0.94) * 100)}% detection confidence.`,
    },
    {
      time: forecastEnd.toUTCString(),
      label: 'T + 6h: Modelled Forward Forecast',
      badgeType: 'MODELLED',
      badgeLabel: 'FORWARD FORECAST',
      icon: Compass,
      iconColor: 'var(--og-green, #34D399)',
      borderColor: 'var(--og-green-border, rgba(52, 211, 153, 0.3))',
      bgColor: 'var(--og-green-soft, rgba(52, 211, 153, 0.05))',
      description: `Projected 6-hour forward drift trajectory and expanding dispersion envelope under persistent hydrodynamic conditions.`,
    },
  ];

  return (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={16} style={{ color: 'var(--og-violet, #A855F7)' }} />
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--og-text-primary, #ECEEF1)', margin: 0 }}>
            Investigation Chronological Timeline
          </h3>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--og-text-muted, #777E87)' }}>
          Correlated event sequencing across T - 24h to T + 6h
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }}>
        {events.map((evt, idx) => {
          const IconComp = evt.icon;
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                padding: '14px 16px',
                background: evt.bgColor,
                border: `1px solid ${evt.borderColor}`,
                borderRadius: '6px',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <IconComp size={15} style={{ color: evt.iconColor }} />
                  <strong style={{ color: 'var(--og-text-primary, #ECEEF1)', fontSize: '0.86rem' }}>{evt.label}</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--og-text-secondary, #B1B6BD)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                    {evt.time}
                  </span>
                  <EvidenceBadge type={evt.badgeType} label={evt.badgeLabel} size="xs" />
                </div>
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--og-text-secondary, #B1B6BD)', lineHeight: 1.5 }}>
                {evt.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
