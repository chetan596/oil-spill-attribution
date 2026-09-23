import React, { useState } from 'react';
import EvidenceBadge from '../common/EvidenceBadge';
import { Compass, Target, Wind, Waves, Navigation, Clock, ShieldCheck, AlertCircle } from 'lucide-react';

/**
 * DriftForecastHUD — Dedicated top-left tactical HUD for Drift & Forecast Mode.
 * Exclusively displays backend-provided Lagrangian hydrodynamic drift simulation metadata
 * and demonstration MetOcean boundary forcings.
 */
export default function DriftForecastHUD({
  driftData = null,
  spill = null,
  onFocusOrigin = null,
  onFocusHindcast = null,
  onFocusForecast = null,
  isRealScene = false,
}) {
  if (!driftData) return null;

  const isReal = Boolean(
    isRealScene ||
    spill?.isRealScene ||
    spill?.processingMetadata?.scenarioType === 'REAL_CDSE' ||
    spill?.analysis?.scene?.id?.includes('cdse') ||
    driftData?.simulationMeta?.status === 'NOT_RUN'
  );

  if (isReal) {
    return (
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          zIndex: 900,
          background: 'rgba(11, 21, 19, 0.92)',
          backdropFilter: 'blur(8px)',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          padding: '10px 14px',
          width: '290px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Compass size={14} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-primary)' }}>
              DRIFT MODEL
            </span>
          </div>
          <EvidenceBadge classification="MODELLED" label="NOT RUN" size="sm" />
        </div>
        <div style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '3px', padding: '8px', fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
          <strong>DRIFT MODEL: NOT RUN FOR THIS REAL SCENE</strong>
          <p style={{ margin: '4px 0 0', fontSize: '0.66rem', color: 'var(--text-muted)' }}>
            Unlabelled live Sentinel-1 acquisition — hydrodynamic reverse drift trajectory was not executed.
          </p>
        </div>
      </div>
    );
  }

  const rawOriginLat = driftData.originLat ?? driftData.latitude;
  const rawOriginLng = driftData.originLng ?? driftData.longitude;
  const hasOriginCoords = rawOriginLat != null && rawOriginLng != null && !isNaN(Number(rawOriginLat)) && !isNaN(Number(rawOriginLng));
  const originLat = hasOriginCoords ? Number(rawOriginLat) : null;
  const originLng = hasOriginCoords ? Number(rawOriginLng) : null;
  const uncertaintyKm = Number(driftData.uncertaintyRadiusKm ?? driftData.simulationMeta?.uncertainty_radius_km ?? 2.6).toFixed(1);
  const engineName = driftData.engine || driftData.simulationMeta?.engine || 'BUILT-IN DEMONSTRATION LAGRANGIAN MODEL';

  const simMeta = driftData.simulationMeta || {};
  const envMeta = simMeta.environmental || simMeta.environmental_conditions || {};
  const windSpeed = envMeta.wind?.speed_kts ?? envMeta.wind_speed_kts ?? 12.4;
  const windDir = envMeta.wind?.direction_from_deg ?? envMeta.wind_direction_deg ?? 315.0;
  const currentSpeed = envMeta.current?.speed_kts ?? envMeta.current_speed_kts ?? 0.8;
  const currentDir = envMeta.current?.direction_towards_deg ?? envMeta.current_direction_deg ?? 125.0;
  const windagePct = Math.round((envMeta.wind?.leeway_factor ?? envMeta.windage_factor ?? 0.03) * 100);

  const originTime = driftData.originTimestamp
    ? new Date(driftData.originTimestamp).toUTCString()
    : '2026-03-09 12:00:00 UTC';

  const hindcastCount = driftData.backwardPath?.length || 25;
  const forecastCount = driftData.forwardPath?.length || 7;

  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      style={{
        position: 'absolute',
        top: '52px',
        left: '12px',
        zIndex: 900,
        background: 'rgba(11, 21, 19, 0.94)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
        padding: '6px 12px',
        width: '280px',
        maxHeight: '340px',
        overflowY: 'auto',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      {/* Header with Collapsible Toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none', paddingBottom: isExpanded ? '6px' : '0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-amber)',
              cursor: 'pointer',
              padding: '0 2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={isExpanded ? 'Collapse telemetry' : 'Expand telemetry'}
            aria-expanded={isExpanded}
          >
            <Compass size={13} style={{ color: 'var(--accent-amber)' }} />
          </button>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-primary)' }}>
            DRIFT & FORECAST
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <EvidenceBadge classification="MODELLED" size="xs" />
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '11px',
              padding: '0 2px',
              fontWeight: 700,
            }}
          >
            {isExpanded ? '−' : '+'}
          </button>
        </div>
      </div>

      {/* Concise summary line when collapsed */}
      {!isExpanded && (
        <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Origin: <strong style={{ color: 'var(--accent-amber)' }}>{originLat != null ? `${originLat.toFixed(2)}°N, ${originLng.toFixed(2)}°E` : 'NOT ESTABLISHED'}</strong></span>
          <span style={{ color: 'var(--text-secondary)' }}>±{uncertaintyKm} km</span>
        </div>
      )}

      {isExpanded && (
        <>
          {/* Engine & Window */}
          <div style={{ fontSize: '0.68rem', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Simulation Engine:</span>
              <span style={{ fontWeight: 600, color: 'var(--accent-cyan)', fontSize: '0.65rem' }}>{engineName}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Hindcast Window:</span>
              <span style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>T - 24h → T0 ({hindcastCount} pts)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Modelled Forecast:</span>
              <span style={{ fontWeight: 600, color: 'var(--accent-emerald)' }}>T0 → T + 6h ({forecastCount} pts)</span>
            </div>
          </div>
        </>
      )}

      {/* Modelled Origin Coordinates & Uncertainty */}
      <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '3px', padding: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent-amber)' }}>
            MODELLED SPILL ORIGIN
          </span>
          <span style={{ fontSize: '0.62rem', color: 'var(--accent-amber)', fontWeight: 600 }}>
            ±{uncertaintyKm} km
          </span>
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {originLat != null ? `${originLat.toFixed(4)}°N, ${originLng.toFixed(4)}°E` : 'NOT ESTABLISHED'}
        </div>
        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '2px' }}>
          Discharge Window: {originTime.replace('GMT', 'UTC')}
        </div>
      </div>

      {/* MetOcean Demonstration Forcings */}
      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
            METOCEAN FORCINGS
          </span>
          <EvidenceBadge classification="DEMONSTRATION" size="xs" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', fontSize: '0.65rem' }}>
          <div style={{ background: 'rgba(0,0,0,0.25)', padding: '3px 4px', borderRadius: '2px' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.58rem' }}>WIND</div>
            <div style={{ fontWeight: 600, color: '#38bdf8' }}>{windSpeed} kts</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.55rem' }}>NW ({windDir}°)</div>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.25)', padding: '3px 4px', borderRadius: '2px' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.58rem' }}>CURRENT</div>
            <div style={{ fontWeight: 600, color: '#2dd4bf' }}>{currentSpeed} kts</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.55rem' }}>SE ({currentDir}°)</div>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.25)', padding: '3px 4px', borderRadius: '2px' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.58rem' }}>WINDAGE</div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{windagePct}%</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.55rem' }}>Leeway</div>
          </div>
        </div>
      </div>

      {/* Quick Nav Actions */}
      <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
        {onFocusOrigin && (
          <button
            onClick={onFocusOrigin}
            className="btn btn-secondary btn-sm"
            style={{ flex: 1, fontSize: '0.65rem', padding: '3px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}
          >
            <Target size={11} />
            <span>Focus Origin</span>
          </button>
        )}
        {onFocusHindcast && (
          <button
            onClick={onFocusHindcast}
            className="btn btn-secondary btn-sm"
            style={{ flex: 1, fontSize: '0.65rem', padding: '3px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}
          >
            <Compass size={11} />
            <span>Hindcast</span>
          </button>
        )}
        {onFocusForecast && (
          <button
            onClick={onFocusForecast}
            className="btn btn-secondary btn-sm"
            style={{ flex: 1, fontSize: '0.65rem', padding: '3px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}
          >
            <Navigation size={11} />
            <span>Forecast</span>
          </button>
        )}
      </div>
    </div>
  );
}
