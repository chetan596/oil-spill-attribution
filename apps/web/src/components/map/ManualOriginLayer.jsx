/**
 * ManualOriginLayer — Phase 16.4 Part 3
 *
 * Renders the ESTIMATED SPILL ORIGIN for a manual GeoTIFF investigation
 * on the existing react-leaflet map.
 *
 * CRITICAL LANGUAGE RULES:
 * - Label: "ESTIMATED SPILL ORIGIN" — never "CONFIRMED SOURCE" or "ACTUAL ORIGIN"
 * - Provenance badge: "MODEL-DERIVED"
 * - Vessel attribution: NOT DISPLAYED here
 * - AIS: NOT DISPLAYED here
 *
 * This component renders ONLY when:
 *   origin.status === "ESTIMATED"
 *   AND origin.estimatedPoint.latitude / longitude are valid finite numbers
 *
 * It renders nothing (null) for: NOT_AVAILABLE, INSUFFICIENT_DATA, FAILED
 */

import React from 'react';
import { CircleMarker, Circle, Popup, Tooltip } from 'react-leaflet';
import { Crosshair } from 'lucide-react';

/**
 * @param {Object} props
 * @param {Object|null} props.origin - Canonical origin block from backend
 *   { status, estimatedPoint, uncertainty, method, engine, provenance, timestampSource, ... }
 */
export default function ManualOriginLayer({ origin, isFocused = false, activeMapContext = null }) {
  // Only render when status is ESTIMATED and coords are valid
  if (!origin || origin.status !== 'ESTIMATED') return null;

  const { estimatedPoint, uncertainty, method, engine, timestampSource } = origin;
  if (!estimatedPoint) return null;

  const lat = Number(estimatedPoint.latitude);
  const lng = Number(estimatedPoint.longitude);

  if (isNaN(lat) || isNaN(lng) || !isFinite(lat) || !isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const uncertaintyRadiusKm = uncertainty?.radiusKm ?? 2.5;
  const uncertaintyRadiusM = uncertaintyRadiusKm * 1000;

  const isEmphasized = isFocused || activeMapContext === 'drift';
  const isDeemphasized = !isFocused && (activeMapContext === 'sar' || activeMapContext === 'ais');

  // Amber-orange palette — same as OriginLayer for visual continuity,
  // but distinct dashed style signals ESTIMATED vs MODELLED (demo scenario)
  const AMBER = '#E7A63A';
  const AMBER_DIM = 'rgba(231, 166, 58, 0.13)';
  const AMBER_BORDER = 'rgba(231, 166, 58, 0.28)';

  return (
    <>
      {/* Uncertainty radius circle (dashed, translucent amber) */}
      {uncertaintyRadiusKm > 0 && (
        <Circle
          key={`origin-circle-${lat}-${lng}-${isEmphasized ? 'focused' : (isDeemphasized ? 'dim' : 'normal')}`}
          center={[lat, lng]}
          radius={uncertaintyRadiusM}
          pathOptions={{
            color: AMBER,
            weight: isEmphasized ? 2.5 : (isDeemphasized ? 1.0 : 1.5),
            fillColor: AMBER,
            fillOpacity: isEmphasized ? 0.20 : (isDeemphasized ? 0.04 : 0.08),
            dashArray: '6, 5',
          }}
        />
      )}

      {/* Outer target ring */}
      <CircleMarker
        key={`origin-ring-${lat}-${lng}-${isEmphasized ? 'focused' : (isDeemphasized ? 'dim' : 'normal')}`}
        center={[lat, lng]}
        radius={isEmphasized ? 16 : (isDeemphasized ? 10 : 12)}
        pathOptions={{
          color: AMBER,
          weight: isEmphasized ? 2.5 : (isDeemphasized ? 1.0 : 1.5),
          fillColor: AMBER,
          fillOpacity: isEmphasized ? 0.24 : (isDeemphasized ? 0.06 : 0.12),
          dashArray: '3, 5',
        }}
      />

      {/* Inner centre dot with popup */}
      <CircleMarker
        key={`origin-dot-${lat}-${lng}-${isEmphasized ? 'focused' : (isDeemphasized ? 'dim' : 'normal')}`}
        center={[lat, lng]}
        radius={isEmphasized ? 6 : (isDeemphasized ? 3.5 : 4.5)}
        pathOptions={{
          color: '#ffffff',
          weight: isEmphasized ? 2.5 : 1.5,
          fillColor: AMBER,
          fillOpacity: 1,
        }}
      >
        <Tooltip
          permanent={false}
          direction="top"
          offset={[0, -10]}
          opacity={0.95}
        >
          <span style={{ fontSize: '10px', fontWeight: 700, color: AMBER, textTransform: 'uppercase' }}>
            ESTIMATED SPILL ORIGIN
          </span>
        </Tooltip>

        <Popup autoPan maxWidth={260} minWidth={200}>
          <div style={{
            color: '#FFFFFF',
            padding: '6px 8px',
            fontFamily: "'Schibsted Grotesk', -apple-system, sans-serif",
            minWidth: '220px',
          }}>
            {/* ── Header ── */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '6px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              paddingBottom: '5px',
              marginBottom: '6px',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                color: AMBER, fontWeight: 700, fontSize: '11px',
                textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>
                <Crosshair size={13} />
                <span>ESTIMATED SPILL ORIGIN</span>
              </div>
              <span style={{
                fontSize: '9px', fontWeight: 700, color: AMBER,
                background: AMBER_DIM, border: `1px solid ${AMBER_BORDER}`,
                padding: '1px 5px', borderRadius: '3px',
              }}>
                MODEL-DERIVED
              </span>
            </div>

            {/* ── Coordinates ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', marginBottom: '4px' }}>
              <span style={{ color: '#B1B6BD' }}>Estimated Coordinates:</span>
              <span style={{ color: '#FFFFFF', fontFamily: 'monospace', fontWeight: 600 }}>
                {lat.toFixed(5)}°N, {lng.toFixed(5)}°E
              </span>
            </div>

            {/* ── Uncertainty ── */}
            <div style={{
              background: AMBER_DIM, border: `1px solid ${AMBER_BORDER}`,
              borderRadius: '4px', padding: '5px 8px', margin: '5px 0',
            }}>
              <div style={{ fontSize: '9.5px', color: '#B1B6BD' }}>
                Uncertainty Radius
              </div>
              <strong style={{ color: AMBER, fontSize: '11px' }}>
                ±{uncertaintyRadiusKm.toFixed(1)} km
              </strong>
              {uncertainty?.confidence && (
                <div style={{ fontSize: '9px', color: '#828282', marginTop: '1px' }}>
                  Confidence: {uncertainty.confidence}
                </div>
              )}
            </div>

            {/* ── Method ── */}
            {method && (
              <div style={{ fontSize: '9.5px', color: '#B1B6BD', marginBottom: '3px' }}>
                <span style={{ color: '#777E87' }}>Method: </span>{method}
              </div>
            )}

            {/* ── Engine ── */}
            {engine && (
              <div style={{ fontSize: '9px', color: '#828282', marginBottom: '3px' }}>
                Engine: {engine}
              </div>
            )}

            {/* ── Timestamp source ── */}
            {timestampSource && (
              <div style={{ fontSize: '9px', color: '#777E87', marginBottom: '3px' }}>
                {timestampSource}
              </div>
            )}

            {/* ── Scientific disclaimer ── */}
            <div style={{
              marginTop: '6px', paddingTop: '5px',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              fontSize: '8.5px', color: '#555C66', lineHeight: 1.4,
            }}>
              This is an estimated discharge origin derived from Lagrangian reverse hindcast
              modelling. It is NOT a confirmed source location and does NOT identify a
              responsible vessel. Environmental inputs are demonstration values.
            </div>
          </div>
        </Popup>
      </CircleMarker>
    </>
  );
}
