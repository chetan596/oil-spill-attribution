/**
 * ManualMapLegend.jsx
 * Phase 16.4 Part 6 — Investigation Map Legend
 *
 * Describes the active geospatial layers on the React-Leaflet workspace map:
 *   1. IMAGE FOOTPRINT — REAL (or NOT_AVAILABLE)
 *   2. SPILL FOOTPRINT — MODEL-DERIVED
 *   3. CENTROID — MODEL-DERIVED
 *   4. ORIGIN — MODEL-DERIVED
 *   5. BACKTRACK — MODEL-DERIVED
 *   6. FORECAST — MODEL-DERIVED
 *   7. AIS TRACK — DEMO / REAL
 *   8. CANDIDATE — POTENTIAL AIS CANDIDATE
 */

import React, { useState } from 'react';
import { Layers, ChevronDown, ChevronUp } from 'lucide-react';
import { ProvenanceBadge } from '../analysis/ProvenanceLegend';

export default function ManualMapLegend({ canonical, className = '', onlyActive = false }) {
  if (!canonical) return null;

  const [isOpen, setIsOpen] = useState(true);

  const geo = canonical.geospatial || {};
  const isGeoAvailable = Boolean(geo.available);
  const crs = geo.crs || null;
  const hasRealFootprint = isGeoAvailable && crs && crs !== 'NOT_AVAILABLE' && canonical.provenance?.inputGeolocation === 'REAL';
  const hasSpillFootprint = Boolean(geo.spillFootprint);
  const hasOrigin = canonical.origin?.status === 'ESTIMATED';
  const hasBacktrack = canonical.drift?.backward?.status === 'ESTIMATED';
  const hasForecast = canonical.drift?.forward?.status === 'ESTIMATED';
  const hasAis = canonical.aisCorrelation?.status === 'CANDIDATES_FOUND';
  const isDemoAis = Boolean(canonical.aisCorrelation?.isDemo || canonical.aisCorrelation?.source === 'DEMO');
  const isVesselPresence = canonical.aisCorrelation?.observationLevel === 'VESSEL_PRESENCE' ||
    canonical.aisCorrelation?.provider === 'GLOBAL_FISHING_WATCH' ||
    canonical.isVesselPresence === true;

  const legendLayers = [
    {
      id: 'image-footprint',
      label: 'Image Footprint',
      color: '#38BDF8',
      type: 'box',
      provenance: hasRealFootprint ? 'REAL' : 'NOT_AVAILABLE',
      active: Boolean(geo.imageFootprint || (isGeoAvailable && geo.bounds)),
    },
    {
      id: 'spill-footprint',
      label: 'Spill Footprint',
      color: '#EF4444',
      type: 'polygon',
      provenance: 'MODEL_DERIVED',
      active: hasSpillFootprint,
    },
    {
      id: 'centroid',
      label: 'Centroid',
      color: '#F59E0B',
      type: 'circle',
      provenance: 'MODEL_DERIVED',
      active: Boolean(geo.centroid),
    },
    {
      id: 'origin',
      label: 'Estimated Origin',
      color: '#EAB308',
      type: 'target',
      provenance: 'MODEL_DERIVED',
      active: hasOrigin,
    },
    {
      id: 'backtrack',
      label: 'Backtrack Trajectory',
      color: '#06B6D4',
      type: 'line-dashed',
      provenance: 'MODEL_DERIVED',
      active: hasBacktrack,
    },
    {
      id: 'forecast',
      label: 'Forecast Trajectory',
      color: '#3B82F6',
      type: 'line-solid',
      provenance: 'MODEL_DERIVED',
      active: hasForecast,
    },
    ...(isVesselPresence
      ? [
          {
            id: 'gfw-presence',
            label: 'GFW AIS Vessel Presence',
            color: '#A855F7',
            type: 'circle',
            provenance: 'REAL',
            active: hasAis,
          },
          {
            id: 'candidate',
            label: 'Potential AIS Candidate',
            color: '#C084FC',
            type: 'circle',
            provenance: 'REAL',
            active: hasAis,
          },
        ]
      : [
          {
            id: 'ais-track',
            label: 'AIS Candidate Track',
            color: '#A855F7',
            type: 'line-dashed',
            provenance: isDemoAis ? 'DEMO' : (hasAis ? 'REAL' : 'NOT_AVAILABLE'),
            active: hasAis,
          },
          {
            id: 'candidate',
            label: 'Potential AIS Candidate',
            color: '#C084FC',
            type: 'circle',
            provenance: isDemoAis ? 'DEMO' : (hasAis ? 'REAL' : 'NOT_AVAILABLE'),
            active: hasAis,
          },
        ]),
  ];

  const layersToRender = (isVesselPresence || onlyActive)
    ? legendLayers.filter((layer) => layer.active)
    : legendLayers;

  return (
    <div
      data-testid="manual-map-legend"
      style={{
        position: 'absolute',
        bottom: '24px',
        left: '20px',
        zIndex: 1000,
        maxWidth: '260px',
        background: 'rgba(15, 23, 42, 0.90)',
        border: '1px solid rgba(51, 65, 85, 0.75)',
        borderRadius: '6px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(8px)',
        overflow: 'hidden',
      }}
      className={className}
    >
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          background: 'rgba(30, 41, 59, 0.85)',
          borderBottom: isOpen ? '1px solid rgba(51, 65, 85, 0.6)' : 'none',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Layers size={13} color="#94A3B8" />
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#E2E8F0', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Map Layers
          </span>
        </div>
        {isOpen ? <ChevronDown size={14} color="#94A3B8" /> : <ChevronUp size={14} color="#94A3B8" />}
      </div>

      {isOpen && (
        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {layersToRender.map((layer) => (
            <div
              key={layer.id}
              data-testid={`map-legend-${layer.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                opacity: layer.active ? 1 : 0.45,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <span
                  style={{
                    width: '12px',
                    height: layer.type.includes('line') ? '3px' : '10px',
                    borderRadius: layer.type === 'circle' ? '50%' : '2px',
                    backgroundColor: layer.color,
                    border: layer.type === 'line-dashed' ? `1px dashed ${layer.color}` : 'none',
                    display: 'inline-block',
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: '0.70rem', color: layer.active ? '#E2E8F0' : '#64748B', fontWeight: 600 }}>
                  {layer.label}
                </span>
              </div>
              <ProvenanceBadge type={layer.provenance} size="xs" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
