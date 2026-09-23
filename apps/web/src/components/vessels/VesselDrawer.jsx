import React from 'react';
import Drawer from '../common/Drawer';
import EvidenceBadge from '../common/EvidenceBadge';
import { Ship, Radio, AlertCircle, Compass, Gauge, Clock, Target } from 'lucide-react';

export default function VesselDrawer({
  isOpen = false,
  onClose,
  vessel = null,
}) {
  if (!vessel) return null;

  const mmsi = vessel.mmsi || '419001234';
  const flag = vessel.flag || 'IN';
  const name = vessel.name || 'MV Kandla Star';
  const type = vessel.vesselType || vessel.type || 'Chemical Tanker';
  const score = vessel.correlation ? Math.round(vessel.correlation) : (vessel.totalScore ? Math.round(vessel.totalScore * 100) : 94);
  const heading = vessel.heading ? `${vessel.heading}°` : '285° (WNW)';
  const speed = vessel.speed ? `${vessel.speed} kn` : '12.4 kn';
  const distance = vessel.evidence?.closestApproachKm != null
    ? `${vessel.evidence.closestApproachKm} km`
    : (vessel.evidence?.distanceKm != null ? `${vessel.evidence.distanceKm} km` : '0.8 km');
  const timeDelta = vessel.evidence?.timeDeltaMinutes != null
    ? `Δt = ${vessel.evidence.timeDeltaMinutes > 0 ? '+' : ''}${vessel.evidence.timeDeltaMinutes} min`
    : 'Δt = −14 min';

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={name}
      subtitle={`MMSI: ${mmsi} · Flag: ${flag}`}
      width="380px"
    >
      {/* ── Correlation Score Banner ── */}
      <div
        style={{
          padding: '14px',
          borderRadius: '8px',
          backgroundColor: 'var(--og-surface-recessed, #0C0E11)',
          border: '1px solid var(--og-border, #25292F)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span
            style={{
              fontSize: '10px',
              fontFamily: "var(--og-font-mono, 'JetBrains Mono', monospace)",
              color: 'var(--og-text-muted, #777E87)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            ATTRIBUTION CORRELATION
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span
              style={{
                fontSize: '24px',
                fontFamily: "var(--og-font-mono, 'JetBrains Mono', monospace)",
                fontWeight: 700,
                color: 'var(--og-violet, #A855F7)',
                lineHeight: 1.1,
              }}
            >
              {score}%
            </span>
            <span
              style={{
                fontSize: '10px',
                color: 'var(--og-text-muted, #777E87)',
                fontWeight: 500,
              }}
            >
              Rank #{vessel.rank || 1}
            </span>
          </div>
        </div>

        <span
          style={{
            fontSize: '9.5px',
            fontWeight: 700,
            padding: '4px 8px',
            borderRadius: '4px',
            backgroundColor: 'rgba(168, 85, 247, 0.16)',
            color: 'var(--og-violet, #A855F7)',
            border: '1px solid rgba(168, 85, 247, 0.35)',
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
          }}
        >
          DEMO AIS / MODELLED
        </span>
      </div>

      {/* ── Vessel Metadata Card ── */}
      <div
        style={{
          padding: '12px 14px',
          borderRadius: '6px',
          backgroundColor: 'var(--og-surface-recessed, #0C0E11)',
          border: '1px solid var(--og-border, #25292F)',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          fontSize: '11px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--og-text-muted, #777E87)' }}>MMSI</span>
          <span style={{ fontFamily: "var(--og-font-mono, monospace)", color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 600 }}>
            {mmsi}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--og-text-muted, #777E87)' }}>FLAG STATE</span>
          <span style={{ color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 600 }}>
            {flag}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--og-text-muted, #777E87)' }}>VESSEL TYPE</span>
          <span style={{ color: 'var(--og-text-primary, #ECEEF1)' }}>
            {type}
          </span>
        </div>
      </div>

      {/* ── Telemetry & AIS Fixes (Clean 2-column key-value rows) ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h4
          style={{
            fontSize: '10.5px',
            fontFamily: "var(--og-font-mono, 'JetBrains Mono', monospace)",
            fontWeight: 700,
            color: 'var(--og-text-muted, #777E87)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Radio size={13} style={{ color: 'var(--og-violet, #A855F7)' }} />
          <span>SPATIOTEMPORAL AIS TELEMETRY</span>
        </h4>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
          }}
        >
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '6px',
              backgroundColor: 'var(--og-surface-recessed, #0C0E11)',
              border: '1px solid var(--og-border, #25292F)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <span style={{ fontSize: '9.5px', fontFamily: "var(--og-font-mono, monospace)", color: 'var(--og-text-muted, #777E87)', textTransform: 'uppercase' }}>
              Current Heading
            </span>
            <span style={{ fontSize: '12px', fontFamily: "var(--og-font-mono, monospace)", color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 600 }}>
              {heading}
            </span>
          </div>

          <div
            style={{
              padding: '10px 12px',
              borderRadius: '6px',
              backgroundColor: 'var(--og-surface-recessed, #0C0E11)',
              border: '1px solid var(--og-border, #25292F)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <span style={{ fontSize: '9.5px', fontFamily: "var(--og-font-mono, monospace)", color: 'var(--og-text-muted, #777E87)', textTransform: 'uppercase' }}>
              Speed Over Ground
            </span>
            <span style={{ fontSize: '12px', fontFamily: "var(--og-font-mono, monospace)", color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 600 }}>
              {speed}
            </span>
          </div>

          <div
            style={{
              padding: '10px 12px',
              borderRadius: '6px',
              backgroundColor: 'var(--og-surface-recessed, #0C0E11)',
              border: '1px solid var(--og-border, #25292F)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <span style={{ fontSize: '9.5px', fontFamily: "var(--og-font-mono, monospace)", color: 'var(--og-text-muted, #777E87)', textTransform: 'uppercase' }}>
              Proximity to Origin
            </span>
            <span style={{ fontSize: '12px', fontFamily: "var(--og-font-mono, monospace)", color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 600 }}>
              {distance} (CPA)
            </span>
          </div>

          <div
            style={{
              padding: '10px 12px',
              borderRadius: '6px',
              backgroundColor: 'var(--og-surface-recessed, #0C0E11)',
              border: '1px solid var(--og-border, #25292F)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <span style={{ fontSize: '9.5px', fontFamily: "var(--og-font-mono, monospace)", color: 'var(--og-text-muted, #777E87)', textTransform: 'uppercase' }}>
              Temporal Match
            </span>
            <span style={{ fontSize: '12px', fontFamily: "var(--og-font-mono, monospace)", color: 'var(--og-text-primary, #ECEEF1)', fontWeight: 600 }}>
              {timeDelta}
            </span>
          </div>
        </div>
      </div>

      {/* ── Attribution Notice (Contained inside card) ── */}
      <div
        style={{
          padding: '12px 14px',
          borderRadius: '6px',
          backgroundColor: 'var(--og-surface-recessed, #0C0E11)',
          border: '1px solid var(--og-border, #25292F)',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--og-text-muted, #777E87)' }}>
          <AlertCircle size={13} />
          <span
            style={{
              fontSize: '10px',
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
            fontSize: '10.5px',
            color: 'var(--og-text-secondary, #B1B6BD)',
            lineHeight: 1.45,
          }}
        >
          Attribution rankings reflect mathematical spatiotemporal correlation with the reverse drift hindcast trajectory. Correlation is not formal legal proof of discharge. Ground-truth inspection is recommended.
        </p>
      </div>
    </Drawer>
  );
}
