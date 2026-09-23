import React from 'react';
import { Target, Droplet, Crosshair, Ship, Navigation, Maximize2 } from 'lucide-react';

export default function MapFocusActions({
  onFocusIncident,
  onFocusOrigin,
  onFocusCpa,
  onFocusVessel,
  onFocusForecast,
  onFitAll,
  hasSlick = true,
  hasOrigin = true,
  hasSelectedCandidate = false,
  hasVessel = false,
  hasCpa = false,
  hasForecast = false,
  hasReset = true,
  activeFocus = null,
  isReal = false,
  style = {},
}) {
  const isSlickEnabled = Boolean(hasSlick);
  const isOriginEnabled = Boolean(hasOrigin);
  const isVesselEnabled = isReal ? Boolean(hasVessel || hasSelectedCandidate) : Boolean(hasSelectedCandidate);
  const isCpaEnabled = Boolean(hasCpa);
  const isForecastEnabled = Boolean(hasForecast);
  const isResetEnabled = Boolean(hasReset);

  return (
    <div
      style={{
        position: 'absolute',
        top: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 950,
        background: 'rgba(11, 21, 19, 0.94)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--og-border, #25292F)',
        borderRadius: '6px',
        padding: '3px 6px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
        pointerEvents: 'auto',
        ...style,
      }}
      aria-label="Tactical Map Focus Actions"
    >
      <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--og-text-muted, #777E87)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 4px' }}>
        Focus:
      </span>

      {/* Incident / Slick Focus */}
      <button
        onClick={onFocusIncident}
        disabled={!isSlickEnabled}
        className="og-btn og-btn-secondary"
        style={{
          padding: '4px 8px',
          fontSize: '0.72rem',
          gap: '4px',
          opacity: !isSlickEnabled ? 0.4 : 1,
          cursor: !isSlickEnabled ? 'not-allowed' : 'pointer',
          background: activeFocus === 'slick' ? 'rgba(73, 198, 200, 0.22)' : undefined,
          border: activeFocus === 'slick' ? '1px solid #49C6C8' : undefined,
        }}
        title={isSlickEnabled ? 'Focus on Observed Potential Oil Slick' : 'Slick location unavailable'}
        aria-label="Focus Slick"
      >
        <Droplet size={12} style={{ color: '#49C6C8' }} />
        <span>Slick</span>
      </button>

      {/* Origin Focus */}
      <button
        onClick={onFocusOrigin}
        disabled={!isOriginEnabled}
        className="og-btn og-btn-secondary"
        style={{
          padding: '4px 8px',
          fontSize: '0.72rem',
          gap: '4px',
          opacity: !isOriginEnabled ? 0.4 : 1,
          cursor: !isOriginEnabled ? 'not-allowed' : 'pointer',
          background: activeFocus === 'origin' ? 'rgba(231, 166, 58, 0.22)' : undefined,
          border: activeFocus === 'origin' ? '1px solid #E7A63A' : undefined,
        }}
        title={isOriginEnabled ? 'Focus on Estimated Spill Origin & Uncertainty' : 'Origin not established'}
        aria-label="Focus Origin"
      >
        <Target size={12} style={{ color: '#E7A63A' }} />
        <span>Origin</span>
      </button>

      {/* CPA Focus (Strictly disabled for GFW VESSEL_PRESENCE with explanatory tooltip) */}
      <button
        onClick={onFocusCpa}
        disabled={!isCpaEnabled}
        className="og-btn og-btn-secondary"
        style={{
          padding: '4px 8px',
          fontSize: '0.72rem',
          gap: '4px',
          opacity: !isCpaEnabled ? 0.4 : 1,
          cursor: !isCpaEnabled ? 'not-allowed' : 'pointer',
          background: activeFocus === 'cpa' ? 'rgba(231, 166, 58, 0.22)' : undefined,
          border: activeFocus === 'cpa' ? '1px solid #E7A63A' : undefined,
        }}
        title={!isCpaEnabled ? 'CPA unavailable — GFW provider supplies aggregated vessel presence, not raw AIS tracks.' : 'Focus on Closest Point of Approach (CPA)'}
        aria-label="Focus CPA"
      >
        <Crosshair size={12} style={{ color: '#E7A63A' }} />
        <span>CPA</span>
      </button>

      {/* Vessel Focus */}
      <button
        onClick={onFocusVessel}
        disabled={!isVesselEnabled}
        className="og-btn og-btn-secondary"
        style={{
          padding: '4px 8px',
          fontSize: '0.72rem',
          gap: '4px',
          opacity: !isVesselEnabled ? 0.4 : 1,
          cursor: !isVesselEnabled ? 'not-allowed' : 'pointer',
          background: (activeFocus === 'vessel' || activeFocus === 'candidate') ? 'rgba(168, 85, 247, 0.22)' : undefined,
          border: (activeFocus === 'vessel' || activeFocus === 'candidate') ? '1px solid #A855F7' : undefined,
        }}
        title={isVesselEnabled ? (isReal ? 'Focus on GFW Vessel Presence Cells' : 'Focus on Selected Candidate Vessel Position') : 'Vessel presence cells unavailable'}
        aria-label="Focus Vessel"
      >
        <Ship size={12} style={{ color: '#A855F7' }} />
        <span>Vessel</span>
      </button>

      {/* Forecast Focus */}
      <button
        onClick={onFocusForecast}
        disabled={!isForecastEnabled}
        className="og-btn og-btn-secondary"
        style={{
          padding: '4px 8px',
          fontSize: '0.72rem',
          gap: '4px',
          opacity: !isForecastEnabled ? 0.4 : 1,
          cursor: !isForecastEnabled ? 'not-allowed' : 'pointer',
          background: activeFocus === 'forecast' ? 'rgba(74, 222, 128, 0.22)' : undefined,
          border: activeFocus === 'forecast' ? '1px solid #4ADE80' : undefined,
        }}
        title={isForecastEnabled ? 'Focus on Forward Forecast Drift Projection' : 'Forecast trajectory unavailable'}
        aria-label="Focus Forecast"
      >
        <Navigation size={12} style={{ color: '#4ADE80' }} />
        <span>Forecast</span>
      </button>

      {/* Fit All Overview / Reset */}
      <button
        onClick={onFitAll}
        disabled={!isResetEnabled}
        className="og-btn og-btn-secondary"
        style={{
          padding: '4px 8px',
          fontSize: '0.72rem',
          gap: '4px',
          marginLeft: '2px',
          opacity: !isResetEnabled ? 0.4 : 1,
          cursor: !isResetEnabled ? 'not-allowed' : 'pointer',
          background: activeFocus === 'bounds' ? 'rgba(73, 198, 200, 0.22)' : undefined,
          border: activeFocus === 'bounds' ? '1px solid #49C6C8' : undefined,
        }}
        title={isResetEnabled ? 'Reset camera to fit entire investigation boundary' : 'Reset view'}
        aria-label="Reset View"
      >
        <Maximize2 size={12} style={{ color: '#49C6C8' }} />
        <span>Reset</span>
      </button>
    </div>
  );
}
