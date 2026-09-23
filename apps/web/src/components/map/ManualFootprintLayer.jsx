import React, { useMemo } from 'react';
import { GeoJSON, CircleMarker, Popup, Tooltip } from 'react-leaflet';
import { Satellite, Droplet, MapPin } from 'lucide-react';

/**
 * ManualFootprintLayer — Phase 16.4 Part 2
 *
 * Renders two GeoJSON features on the map from the canonical investigation payload:
 *
 *   1. imageFootprint  — The uploaded raster's geographic bounding polygon.
 *                        Provenance: REAL (derived from raster CRS + affine transform).
 *                        Style: dashed sky-blue outline, minimal fill.
 *
 *   2. spillFootprint  — The model-derived oil spill polygon (Polygon or MultiPolygon).
 *                        Provenance: MODEL_DERIVED. NOT ground truth.
 *                        Style: teal (#49C6C8) semi-transparent fill.
 *
 *   3. centroid marker — CircleMarker at the model-derived spill centroid.
 *                        Only rendered when centroid coordinates are valid.
 *
 * This component NEVER fabricates coordinates.
 * It renders nothing when geospatial data is unavailable.
 */

/**
 * Extract [lat, lng] from a centroid value that may be:
 *   - An array [lat, lng]
 *   - An object { latitude, longitude, provenance }
 */
function extractCentroidLatLng(centroid) {
  if (!centroid) return null;
  if (Array.isArray(centroid) && centroid.length >= 2) {
    const lat = Number(centroid[0]);
    const lng = Number(centroid[1]);
    if (!isNaN(lat) && !isNaN(lng)) return [lat, lng];
  }
  if (typeof centroid === 'object') {
    const lat = Number(centroid.latitude ?? centroid.lat ?? NaN);
    const lng = Number(centroid.longitude ?? centroid.lng ?? NaN);
    if (!isNaN(lat) && !isNaN(lng)) return [lat, lng];
  }
  return null;
}

/** Leaflet pathOptions for the image footprint (raster bounding box, provenance=REAL) */
const IMAGE_FOOTPRINT_STYLE = {
  color: '#38bdf8',       // sky-400 — clean REAL provenance indicator
  weight: 1.5,
  dashArray: '8, 5',
  fillColor: '#0ea5e9',
  fillOpacity: 0.04,
  interactive: true,
};

/** Leaflet pathOptions for the spill footprint (model mask, provenance=MODEL_DERIVED) */
const SPILL_FOOTPRINT_STYLE = {
  color: '#49C6C8',       // Existing project teal for oil slicks
  weight: 2,
  fillColor: '#49C6C8',
  fillOpacity: 0.22,
  interactive: true,
};

export default function ManualFootprintLayer({
  imageFootprint = null,
  spillFootprint = null,
  centroid = null,
  areaKm2 = null,
  confidence = null,
  modality = 'SAR_DUAL_POL',
  visible = true,
  isFocused = false,
  activeMapContext = null,
}) {
  if (!visible) return null;

  const centroidLatLng = useMemo(() => extractCentroidLatLng(centroid), [centroid]);
  const isSar = modality === 'SAR_DUAL_POL';
  const confidencePct = confidence != null ? Math.round(Number(confidence) * 100) : null;

  const isEmphasized = isFocused || activeMapContext === 'sar' || activeMapContext === 'science';
  const isDeemphasized = !isFocused && (activeMapContext === 'drift' || activeMapContext === 'ais');

  const spillStyle = useMemo(() => {
    if (isEmphasized) {
      return {
        color: '#38bdf8',
        weight: 3.5,
        fillColor: '#38bdf8',
        fillOpacity: 0.38,
        interactive: true,
      };
    }
    if (isDeemphasized) {
      return {
        color: '#49C6C8',
        weight: 1.5,
        fillColor: '#49C6C8',
        fillOpacity: 0.12,
        interactive: true,
      };
    }
    return {
      color: '#49C6C8',
      weight: 2,
      fillColor: '#49C6C8',
      fillOpacity: 0.22,
      interactive: true,
    };
  }, [isEmphasized, isDeemphasized]);

  const imageStyle = useMemo(() => {
    if (activeMapContext === 'sar') {
      return {
        ...IMAGE_FOOTPRINT_STYLE,
        weight: 2.5,
        dashArray: '8, 4',
        fillOpacity: 0.08,
      };
    }
    if (isDeemphasized) {
      return {
        ...IMAGE_FOOTPRINT_STYLE,
        weight: 1.0,
        dashArray: '4, 4',
        fillOpacity: 0.02,
      };
    }
    return IMAGE_FOOTPRINT_STYLE;
  }, [activeMapContext, isDeemphasized]);

  // GeoJSON key is derived from geometry to force remount when job changes
  const imageKey = useMemo(
    () => imageFootprint ? `img-${JSON.stringify(imageFootprint.geometry?.coordinates?.[0]?.[0])}-${activeMapContext || 'normal'}` : null,
    [imageFootprint, activeMapContext]
  );
  const spillKey = useMemo(
    () => spillFootprint ? `spill-${JSON.stringify(spillFootprint.geometry?.coordinates?.[0]?.[0])}-${isEmphasized ? 'focused' : (isDeemphasized ? 'dim' : 'normal')}` : null,
    [spillFootprint, isEmphasized, isDeemphasized]
  );

  return (
    <>
      {/* ── Image Footprint — REAL provenance ───────────────────────────── */}
      {imageFootprint && imageFootprint.geometry && (
        <GeoJSON
          key={imageKey}
          data={imageFootprint}
          style={imageStyle}
        >
          <Tooltip sticky>
            <div style={{ padding: '2px 4px', fontSize: '0.72rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, color: '#38bdf8' }}>
                <Satellite size={12} />
                <span>Image Footprint</span>
              </div>
              <div style={{ color: '#94a3b8', fontSize: '0.68rem', marginTop: '2px' }}>
                Provenance: <strong style={{ color: '#38bdf8' }}>REAL INPUT GEOLOCATION</strong>
              </div>
            </div>
          </Tooltip>
          <Popup>
            <div style={{ padding: '6px', minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: "'Schibsted Grotesk', -apple-system, sans-serif" }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#38bdf8', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>
                  <Satellite size={13} />
                  <span>Image Footprint</span>
                </div>
                <span style={{ fontSize: '9px', fontWeight: 700, color: '#38bdf8', background: 'rgba(56, 189, 248, 0.12)', padding: '1px 5px', borderRadius: '3px', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                  REAL
                </span>
              </div>
              <div style={{ fontSize: '10px', color: '#9ca3af', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#6b7280' }}>Source:</span>
                  <span style={{ color: '#d1d5db' }}>Uploaded Raster</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#6b7280' }}>CRS:</span>
                  <span style={{ color: '#d1d5db', fontFamily: 'monospace' }}>
                    {imageFootprint.properties?.crs || 'EPSG:4326'}
                  </span>
                </div>
                <div style={{ marginTop: '4px', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.08)', color: '#38bdf8', fontSize: '9px', fontWeight: 600 }}>
                  REAL INPUT GEOLOCATION — Derived from raster affine transform
                </div>
              </div>
            </div>
          </Popup>
        </GeoJSON>
      )}

      {/* ── Spill Footprint — MODEL_DERIVED provenance ──────────────────── */}
      {spillFootprint && spillFootprint.geometry && (
        <GeoJSON
          key={spillKey}
          data={spillFootprint}
          style={spillStyle}
        >
          <Tooltip sticky>
            <div style={{ padding: '2px 4px', fontSize: '0.72rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, color: '#49C6C8' }}>
                <Droplet size={12} />
                <span>Model-Derived Spill Footprint</span>
              </div>
              <div style={{ color: '#94a3b8', fontSize: '0.68rem', marginTop: '2px' }}>
                Provenance: <strong style={{ color: '#f59e0b' }}>MODEL_DERIVED</strong> — Not ground truth
              </div>
            </div>
          </Tooltip>
          <Popup autoPan={true} autoPanPadding={[24, 24]} maxWidth={240} minWidth={180}>
            <div style={{ padding: '6px', minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: "'Schibsted Grotesk', -apple-system, sans-serif" }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '5px', marginBottom: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#49C6C8', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>
                  <Droplet size={13} />
                  <span>Oil Spill Footprint</span>
                </div>
                <span style={{ fontSize: '9px', fontWeight: 700, color: '#f59e0b', background: 'rgba(245, 158, 11, 0.12)', padding: '1px 5px', borderRadius: '3px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                  MODEL_DERIVED
                </span>
              </div>
              <div style={{ fontSize: '10px', color: '#9ca3af', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {areaKm2 != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Area:</span>
                    <strong style={{ color: '#fff' }}>{Number(areaKm2).toFixed(4)} km²</strong>
                  </div>
                )}
                {confidencePct != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Model Confidence:</span>
                    <strong style={{ color: '#49C6C8' }}>{confidencePct}%</strong>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#6b7280' }}>Modality:</span>
                  <span style={{ color: '#d1d5db' }}>{isSar ? 'SAR Dual-Pol' : 'Optical RGB'}</span>
                </div>
                {spillFootprint.properties?.componentCount > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Components:</span>
                    <span style={{ color: '#d1d5db' }}>{spillFootprint.properties.componentCount}</span>
                  </div>
                )}
                <div style={{ marginTop: '4px', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.08)', color: '#f59e0b', fontSize: '9px', fontWeight: 600 }}>
                  MODEL-DERIVED SPILL FOOTPRINT — Not ground truth
                </div>
              </div>
            </div>
          </Popup>
        </GeoJSON>
      )}

      {/* ── Spill Centroid Marker — MODEL_DERIVED ───────────────────────── */}
      {centroidLatLng && (
        <CircleMarker
          key={`centroid-${centroidLatLng[0]}-${centroidLatLng[1]}-${isEmphasized ? 'focused' : (isDeemphasized ? 'dim' : 'normal')}`}
          center={centroidLatLng}
          radius={isEmphasized ? 8 : (isDeemphasized ? 4 : 6)}
          pathOptions={{
            color: '#ffffff',
            weight: isEmphasized ? 3 : (isDeemphasized ? 1.5 : 2),
            fillColor: isEmphasized ? '#38bdf8' : '#49C6C8',
            fillOpacity: isDeemphasized ? 0.6 : 1,
          }}
        >
          <Tooltip>
            <div style={{ padding: '2px 4px', fontSize: '0.72rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, color: '#49C6C8' }}>
                <MapPin size={12} />
                <span>Spill Centroid</span>
              </div>
              <div style={{ color: '#94a3b8', fontSize: '0.67rem' }}>
                {centroidLatLng[0].toFixed(5)}°N, {centroidLatLng[1].toFixed(5)}°E
              </div>
            </div>
          </Tooltip>
          <Popup autoPan={true} autoPanPadding={[24, 24]} maxWidth={220} minWidth={160}>
            <div style={{ padding: '6px', minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '6px', fontFamily: "'Schibsted Grotesk', -apple-system, sans-serif" }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#49C6C8', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>
                  <MapPin size={13} />
                  <span>Spill Centroid</span>
                </div>
                <span style={{ fontSize: '9px', fontWeight: 700, color: '#f59e0b', background: 'rgba(245, 158, 11, 0.12)', padding: '1px 5px', borderRadius: '3px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                  MODEL_DERIVED
                </span>
              </div>
              <div style={{ fontSize: '10px', color: '#9ca3af', fontFamily: 'monospace' }}>
                {centroidLatLng[0].toFixed(5)}°N, {centroidLatLng[1].toFixed(5)}°E
              </div>
              {confidencePct != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                  <span style={{ color: '#6b7280' }}>Confidence:</span>
                  <strong style={{ color: '#49C6C8' }}>{confidencePct}%</strong>
                </div>
              )}
              <div style={{ marginTop: '2px', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.08)', color: '#f59e0b', fontSize: '9px', fontWeight: 600 }}>
                MODEL-DERIVED — Not ground truth
              </div>
            </div>
          </Popup>
        </CircleMarker>
      )}
    </>
  );
}
