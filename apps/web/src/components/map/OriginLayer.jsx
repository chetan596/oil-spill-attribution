import React from 'react';
import { CircleMarker, Circle, Popup } from 'react-leaflet';
import { Target } from 'lucide-react';

export default function OriginLayer({ origin, driftData, showUncertainty = true }) {
  const data = origin || driftData;
  if (!data) return null;

  const lat = Number(data.originLat ?? data.latitude);
  const lng = Number(data.originLng ?? data.longitude);
  const uncertaintyRadiusKm = Number(
    data.uncertaintyRadiusKm ?? data.uncertaintyKm ?? data.simulationMeta?.uncertaintyRadiusKm ?? 2.5
  );

  if (isNaN(lat) || isNaN(lng)) return null;

  const uncertaintyRadiusMeters = uncertaintyRadiusKm * 1000.0;

  return (
    <>
      {/* Modelled Origin Uncertainty Radius Circle (Analysis mode) */}
      {showUncertainty && (
        <Circle
          center={[lat, lng]}
          radius={uncertaintyRadiusMeters}
          pathOptions={{
            color: '#E7A63A',
            weight: 1.5,
            fillColor: '#E7A63A',
            fillOpacity: 0.12,
            dashArray: '4, 4',
          }}
        />
      )}

      {/* Origin Outer Target Ring */}
      <CircleMarker
        center={[lat, lng]}
        radius={10}
        pathOptions={{
          color: '#E7A63A',
          weight: 1.5,
          fillColor: '#E7A63A',
          fillOpacity: 0.15,
          dashArray: '2, 4',
        }}
      />

      {/* Origin Center Point */}
      <CircleMarker
        center={[lat, lng]}
        radius={6}
        pathOptions={{
          color: '#FFFFFF',
          weight: 2,
          fillColor: '#E7A63A',
          fillOpacity: 1,
        }}
      >
        <Popup autoPan={true} autoPanPadding={[24, 24]} maxWidth={220} minWidth={160}>
          <div style={{ color: '#FFFFFF', padding: '6px 8px', fontFamily: "'Schibsted Grotesk', -apple-system, sans-serif", minWidth: '220px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '4px', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#E7A63A', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                <Target size={13} />
                <span>MODELLED SPILL ORIGIN</span>
              </div>
              <span style={{ fontSize: '9px', fontWeight: 700, color: '#E7A63A', background: 'rgba(231, 166, 58, 0.15)', padding: '1px 5px', borderRadius: '3px' }}>
                MODELLED
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', marginBottom: '3px' }}>
              <span style={{ color: '#B1B6BD' }}>Origin Coordinates:</span>
              <span style={{ color: '#FFFFFF', fontFamily: 'monospace', fontWeight: 600 }}>
                {lat.toFixed(4)}°N, {lng.toFixed(4)}°E
              </span>
            </div>

            {(data.dischargeTime || data.originTimestamp || data.estimatedDischargeTime) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', marginBottom: '4px' }}>
                <span style={{ color: '#B1B6BD' }}>Discharge Time:</span>
                <span style={{ color: '#FFFFFF', fontSize: '10px' }}>
                  {new Date(data.dischargeTime || data.originTimestamp || data.estimatedDischargeTime).toUTCString()}
                </span>
              </div>
            )}

            <div style={{ background: 'rgba(231, 166, 58, 0.08)', border: '1px solid rgba(231, 166, 58, 0.25)', borderRadius: '4px', padding: '5px 8px', margin: '5px 0' }}>
              <div style={{ fontSize: '9.5px', color: '#B1B6BD' }}>Modelled Origin Uncertainty Radius</div>
              <strong style={{ color: '#E7A63A', fontSize: '11px' }}>&plusmn;{uncertaintyRadiusKm.toFixed(1)} km</strong>
            </div>

            <div style={{ fontSize: '9px', color: '#828282', marginTop: '4px', lineHeight: 1.3 }}>
              Engine: {data.engine || data.simulationMeta?.engine || 'BUILT-IN DEMONSTRATION LAGRANGIAN MODEL (24h Reverse Trace)'}
            </div>

            <div style={{ marginTop: '6px', paddingTop: '4px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <a
                href={`/analysis/${data.scenarioId || 'demo-scene-001'}?tab=drift`}
                style={{ color: '#E7A63A', fontSize: '11px', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}
              >
                View Drift & Forecast →
              </a>
            </div>
          </div>
        </Popup>
      </CircleMarker>
    </>
  );
}
