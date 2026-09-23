/**
 * InvestigationGeospatialPanel.jsx
 * Phase 16.4 Part 6 — Geospatial Evidence Panel
 *
 * Displays:
 *   - CRS, geographic availability
 *   - Image footprint (REAL if raster georeferenced)
 *   - Spill footprint polygon (MODEL-DERIVED)
 *   - Centroid coordinates (MODEL-DERIVED)
 *   - Area in km²
 */

import React from 'react';
import { Globe, MapPin, Compass, AlertCircle, Maximize } from 'lucide-react';
import { ProvenanceBadge } from './ProvenanceLegend';

export default function InvestigationGeospatialPanel({ canonical, className = '' }) {
  if (!canonical) return null;

  const geo = canonical.geospatial || {};
  const isGeoAvailable = Boolean(geo.available);
  const crs = geo.crs || 'NOT_AVAILABLE';
  const crsName = geo.crsName || 'Unspecified';
  const areaKm2 = typeof geo.areaKm2 === 'number' ? geo.areaKm2.toFixed(3) : 'N/A';
  const bounds = geo.bounds || null;

  const centroid = geo.centroid;
  const centroidLat = centroid ? (typeof centroid.latitude === 'number' ? centroid.latitude.toFixed(5) : (Array.isArray(centroid) ? centroid[0]?.toFixed(5) : 'N/A')) : 'N/A';
  const centroidLng = centroid ? (typeof centroid.longitude === 'number' ? centroid.longitude.toFixed(5) : (Array.isArray(centroid) ? centroid[1]?.toFixed(5) : 'N/A')) : 'N/A';

  const hasValidGeoref = isGeoAvailable && crs !== 'NOT_AVAILABLE' && canonical.provenance?.inputGeolocation === 'REAL';

  return (
    <div
      data-testid="investigation-geospatial-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '16px',
        background: 'rgba(15, 23, 42, 0.7)',
        border: '1px solid rgba(51, 65, 85, 0.65)',
        borderRadius: '8px',
      }}
      className={className}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Globe size={16} color="#06B6D4" />
          <h3 style={{ margin: 0, fontSize: '0.90rem', fontWeight: 800, color: '#F8FAFC', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Geospatial Analysis
          </h3>
        </div>
        <ProvenanceBadge type={hasValidGeoref ? 'REAL' : 'NOT_AVAILABLE'} size="xs" />
      </div>

      {!isGeoAvailable ? (
        <div
          data-testid="geospatial-unavailable-warning"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 12px',
            borderRadius: '6px',
            background: 'rgba(100, 116, 139, 0.15)',
            border: '1px solid rgba(100, 116, 139, 0.3)',
            color: '#94A3B8',
            fontSize: '0.78rem',
          }}
        >
          <AlertCircle size={14} />
          <span>Raster lacks geographic coordinate referencing. Map layers and spatial bounds are unavailable.</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
          {/* CRS & Bounds */}
          <div style={{ padding: '10px 12px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(51, 65, 85, 0.4)', borderRadius: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.68rem', color: '#64748B', textTransform: 'uppercase' }}>CRS / Projection</span>
              <ProvenanceBadge type={hasValidGeoref ? 'REAL' : 'NOT_AVAILABLE'} size="xs" />
            </div>
            <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#38BDF8', fontFamily: 'monospace', display: 'block' }}>
              {crs}
            </span>
            <span style={{ fontSize: '0.70rem', color: '#94A3B8' }}>{crsName}</span>
          </div>

          {/* Centroid */}
          <div style={{ padding: '10px 12px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(51, 65, 85, 0.4)', borderRadius: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.68rem', color: '#64748B', textTransform: 'uppercase' }}>Spill Centroid</span>
              <ProvenanceBadge type="MODEL_DERIVED" size="xs" />
            </div>
            <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#E2E8F0', fontFamily: 'monospace', display: 'block' }}>
              {centroidLat}°N, {centroidLng}°E
            </span>
            <span style={{ fontSize: '0.70rem', color: '#94A3B8' }}>Model-derived geographic mean</span>
          </div>

          {/* Area & Geometry */}
          <div style={{ padding: '10px 12px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(51, 65, 85, 0.4)', borderRadius: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.68rem', color: '#64748B', textTransform: 'uppercase' }}>Calculated Area</span>
              <ProvenanceBadge type="MODEL_DERIVED" size="xs" />
            </div>
            <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#FBBF24', fontFamily: 'monospace', display: 'block' }}>
              {areaKm2} km²
            </span>
            <span style={{ fontSize: '0.70rem', color: '#94A3B8' }}>Pixel integration via ground resolution</span>
          </div>

          {/* REAL RASTER GEOLOCATION DIAGNOSTICS */}
          {hasValidGeoref && (
            <div
              data-testid="real-raster-geolocation-diagnostic"
              style={{
                gridColumn: '1 / -1',
                marginTop: '4px',
                padding: '12px 14px',
                background: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid rgba(14, 165, 233, 0.35)',
                borderRadius: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(51, 65, 85, 0.5)', paddingBottom: '6px' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#38BDF8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  REAL RASTER GEOLOCATION DIAGNOSTICS
                </span>
                <ProvenanceBadge type="REAL" size="xs" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', fontSize: '0.72rem' }}>
                <div>
                  <span style={{ color: '#64748B' }}>Source CRS: </span>
                  <span style={{ color: '#F1F5F9', fontFamily: 'monospace', fontWeight: 600 }}>{crs}</span>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>EPSG Identifier: </span>
                  <span style={{ color: '#F1F5F9', fontFamily: 'monospace', fontWeight: 600 }}>{geo.epsg || (crs.includes('4326') ? '4326' : 'N/A')}</span>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Dimensions: </span>
                  <span style={{ color: '#F1F5F9', fontFamily: 'monospace', fontWeight: 600 }}>{geo.width ? `${geo.width} × ${geo.height} px` : 'N/A'}</span>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>WGS84 Centroid: </span>
                  <span style={{ color: '#F1F5F9', fontFamily: 'monospace', fontWeight: 600 }}>{centroidLat}°N, {centroidLng}°E</span>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={{ color: '#64748B' }}>Bounding Box (W, S, E, N): </span>
                  <span style={{ color: '#38BDF8', fontFamily: 'monospace', fontWeight: 600 }}>
                    {Array.isArray(bounds) && bounds.length === 4
                      ? `[${Number(bounds[0]).toFixed(5)}, ${Number(bounds[1]).toFixed(5)}, ${Number(bounds[2]).toFixed(5)}, ${Number(bounds[3]).toFixed(5)}]`
                      : 'N/A'}
                  </span>
                </div>
                {geo.affine && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={{ color: '#64748B' }}>Affine Transform: </span>
                    <span style={{ color: '#94A3B8', fontFamily: 'monospace', fontSize: '0.68rem', wordBreak: 'break-all' }}>
                      {Array.isArray(geo.affine) ? `[${geo.affine.map((n) => (typeof n === 'number' ? n.toFixed(6) : n)).join(', ')}]` : JSON.stringify(geo.affine)}
                    </span>
                  </div>
                )}
                <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                  <span style={{ color: '#64748B' }}>Footprint Geometry: </span>
                  <span style={{ color: '#10B981', fontFamily: 'monospace', fontWeight: 600 }}>
                    {geo.imageFootprint ? 'AUTHENTIC GEOTIFF ENVELOPE' : 'NOT_AVAILABLE'}
                  </span>
                  <ProvenanceBadge type={geo.imageFootprint ? 'REAL' : 'NOT_AVAILABLE'} size="xs" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
