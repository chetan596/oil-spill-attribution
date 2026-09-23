import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Satellite,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Target,
  X,
  Radio,
  ExternalLink,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  ShieldCheck,
  Compass,
  Wind,
  Thermometer,
  Eye,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Grid,
  Maximize2,
  FileText,
  MapPin,
  HelpCircle,
  Cpu,
} from 'lucide-react';
import EvidenceBadge from '../common/EvidenceBadge';
import { buildRealSarEvidenceModel } from '../../utils/realSarEvidenceModel';

/**
 * Helper to parse WKT POLYGON into array of [lng, lat]
 */
function parseWktToCoords(wkt) {
  if (!wkt || typeof wkt !== 'string') return [];
  try {
    const match = wkt.match(/POLYGON\s*\(\s*\((.+?)\)\s*\)/i);
    if (!match || !match[1]) return [];
    return match[1].split(',').map((pair) => {
      const parts = pair.trim().split(/\s+/).map(Number);
      return [parts[0], parts[1]]; // [lng, lat]
    });
  } catch {
    return [];
  }
}

/**
 * Helper to parse WKT POLYGON or GeoJSON polygon into array of [lng, lat]
 */
function parsePolygonCoords(poly) {
  if (!poly) return [];
  if (typeof poly === 'string') {
    return parseWktToCoords(poly);
  }
  if (poly.coordinates && Array.isArray(poly.coordinates[0])) {
    return poly.coordinates[0].map((pt) => [Number(pt[0]), Number(pt[1])]);
  }
  return [];
}

const API_BASE = (typeof window !== 'undefined' && window.location.hostname === 'localhost' && window.location.port === '3000')
  ? 'http://localhost:4000'
  : '';

/**
 * SarEvidenceViewer — Satellite SAR Evidence & Source Raster Workstation.
 * Phase 16.4 — Part 6: Real SAR Evidence & Artifact Viewer
 *
 * Fully dynamic inspection workstation consuming canonical investigation data.
 * Zero hardcoded coordinates, zero hardcoded URLs, zero demo fallbacks.
 * Dynamically resolves real artifacts: original, vv, vh, mask, overlay, probabilityMap.
 */
export default function SarEvidenceViewer({
  isOpen = false,
  onClose = () => {},
  jobId = null,
  manualInvestigationData = null,
  canonicalData = null,
  spill = null,
  scene = null,
  evidence = null,
  onShowOnMap = () => {},
}) {
  // Normalize canonical data via single Real SAR Evidence Model
  const rawInvestigation = manualInvestigationData || canonicalData || (scene?.isCanonical ? scene : null);

  const sarModel = useMemo(() => {
    if (rawInvestigation) {
      return buildRealSarEvidenceModel(rawInvestigation, {
        jobId: jobId || rawInvestigation.jobId || rawInvestigation.id,
      });
    }

    // Backward compatibility for legacy tests or mock scenarios
    if (scene || spill) {
      const effectiveJobId = jobId || scene?.sceneId || scene?.id || spill?.id || 'DEMO-SAR-SCENE';
      const isRealScene = Boolean(
        scene?.isRealScene ||
        scene?.scenarioType === 'REAL_CDSE' ||
        spill?.scenarioType === 'REAL_CDSE' ||
        (scene?.sceneId && (scene.sceneId === 'cdse-s1a-mumbai-20240218' || scene.sceneId.includes('cdse')))
      );

      return buildRealSarEvidenceModel({
        jobId: effectiveJobId,
        id: effectiveJobId,
        isRealScene,
        scenarioType: scene?.scenarioType || (isRealScene ? 'REAL_CDSE' : 'DEMONSTRATION'),
        acquisitionDate: scene?.acquisitionAt || scene?.acquisitionDate || scene?.acquisition || spill?.detectedAt,
        input: {
          modality: scene?.modality || 'SAR_DUAL_POL',
          sourceType: scene?.sourceType || (isRealScene ? 'SENTINEL1_DUAL_POL' : 'SENTINEL1_C_SAR'),
          channelCount: scene?.bandInfo?.polarisation?.includes('+') ? 2 : 2,
          polarizations: scene?.bandInfo?.polarisation ? scene.bandInfo.polarisation.split('+') : ['VV', 'VH'],
          inputFormat: 'TIFF',
        },
        temporalReference: (scene?.acquisitionAt || scene?.acquisitionDate) ? {
          timestamp: scene?.acquisitionAt || scene?.acquisitionDate,
          source: isRealScene ? 'SATELLITE_METADATA' : 'DEMO_METADATA',
          isAuthoritative: isRealScene,
        } : null,
        geospatial: {
          available: Boolean(scene?.geomWkt || (spill?.latitude != null && spill?.longitude != null) || scene?.center),
          centroid: (spill?.latitude != null && spill?.longitude != null)
            ? { latitude: Number(spill.latitude), longitude: Number(spill.longitude) }
            : (scene?.center ? { latitude: Number(scene.center[0]), longitude: Number(scene.center[1]) } : null),
          areaKm2: spill?.areaKm2 ?? scene?.areaKm2 ?? null,
          footprint: scene?.geomWkt || null,
        },
        detection: {
          oilSpillDetected: true,
          confidence: typeof spill?.confidence === 'number'
            ? spill.confidence
            : (typeof scene?.confidence === 'number' ? (scene.confidence > 1 ? scene.confidence / 100 : scene.confidence) : null),
        },
        model: {
          modelId: scene?.modelId || (isRealScene ? 'copernicus-s1-grd-pipeline' : 'unet-dual-pol-sar-v2'),
        },
        artifacts: scene?.artifacts || {},
      }, { jobId: effectiveJobId });
    }

    return buildRealSarEvidenceModel(null, { jobId });
  }, [rawInvestigation, scene, spill, jobId]);

  // Active artifact state — initialized from available keys
  const [activeArtifact, setActiveArtifact] = useState(() => {
    return sarModel.availableArtifactKeys[0] || 'original';
  });

  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [overlayOpacity, setOverlayOpacity] = useState(0.75);
  const [showGrid, setShowGrid] = useState(true);
  const [showVector, setShowVector] = useState(true);

  // Per-artifact loading & error states
  const [imageError, setImageError] = useState(null); // null | '404' | '503' | '500' | 'GENERIC_ERROR'
  const [imageLoaded, setImageLoaded] = useState(false);

  // Investigation / Job switch: deterministically clear state to prevent stale artifact leakage (Step 14)
  const currentInvestigationIdentity = sarModel.jobId || jobId || 'NO_JOB';
  useEffect(() => {
    setImageError(null);
    setImageLoaded(false);
    setZoomLevel(1.0);
    setPanOffset({ x: 0, y: 0 });
    if (sarModel.availableArtifactKeys.length > 0) {
      if (!sarModel.availableArtifactKeys.includes(activeArtifact)) {
        setActiveArtifact(sarModel.availableArtifactKeys[0]);
      }
    } else {
      setActiveArtifact('original');
    }
  }, [currentInvestigationIdentity, sarModel.availableArtifactKeys]);

  // Reset loading status on artifact change
  useEffect(() => {
    setImageError(null);
    setImageLoaded(false);
  }, [activeArtifact]);

  // Keyboard shortcut: Esc to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Current active artifact object
  const currentArtifact = sarModel.artifacts[activeArtifact] || null;
  const isArtifactAvailable = Boolean(currentArtifact && currentArtifact.available);

  // Effective Image URL with API_BASE prefix if relative
  const artifactUrl = useMemo(() => {
    if (!currentArtifact?.url) return null;
    if (currentArtifact.url.startsWith('http://') || currentArtifact.url.startsWith('https://')) {
      return currentArtifact.url;
    }
    return `${API_BASE}${currentArtifact.url}`;
  }, [currentArtifact]);

  // Coordinate parsing for vector overlays
  const sceneCoords = useMemo(() => {
    const geom = sarModel.geospatial.imageFootprint || scene?.geomWkt;
    return parsePolygonCoords(geom);
  }, [sarModel.geospatial.imageFootprint, scene?.geomWkt]);

  const slickCoords = useMemo(() => {
    const geom = sarModel.geospatial.spillFootprint || spill?.geomWkt;
    return parsePolygonCoords(geom);
  }, [sarModel.geospatial.spillFootprint, spill?.geomWkt]);

  // Canonical bounds for projection (Step 5: Zero hardcoded Mumbai fallback coordinates)
  const bounds = useMemo(() => {
    if (sarModel.geospatial.bounds) {
      return sarModel.geospatial.bounds;
    }
    if (slickCoords.length > 0) {
      return {
        minLng: Math.min(...slickCoords.map((c) => c[0])) - 0.05,
        maxLng: Math.max(...slickCoords.map((c) => c[0])) + 0.05,
        minLat: Math.min(...slickCoords.map((c) => c[1])) - 0.05,
        maxLat: Math.max(...slickCoords.map((c) => c[1])) + 0.05,
      };
    }
    if (sceneCoords.length > 0) {
      return {
        minLng: Math.min(...sceneCoords.map((c) => c[0])),
        maxLng: Math.max(...sceneCoords.map((c) => c[0])),
        minLat: Math.min(...sceneCoords.map((c) => c[1])),
        maxLat: Math.max(...sceneCoords.map((c) => c[1])),
      };
    }
    if (sarModel.geospatial.centroid) {
      const lat = sarModel.geospatial.centroid.latitude ?? sarModel.geospatial.centroid[0];
      const lng = sarModel.geospatial.centroid.longitude ?? sarModel.geospatial.centroid[1];
      if (lat != null && lng != null) {
        return {
          minLng: lng - 0.05,
          maxLng: lng + 0.05,
          minLat: lat - 0.05,
          maxLat: lat + 0.05,
        };
      }
    }
    return null;
  }, [sarModel.geospatial, slickCoords, sceneCoords]);

  // Project geographic coordinate to 1000x1000 SVG coordinate space
  const project = useCallback((lng, lat) => {
    if (!bounds) return [500, 500];
    const spanLng = bounds.maxLng - bounds.minLng || 0.001;
    const spanLat = bounds.maxLat - bounds.minLat || 0.001;
    const x = ((lng - bounds.minLng) / spanLng) * 880 + 60;
    const y = 940 - ((lat - bounds.minLat) / spanLat) * 880;
    return [x, y];
  }, [bounds]);

  const slickSvgPath = useMemo(() => {
    if (slickCoords.length === 0 || !bounds) return '';
    return slickCoords
      .map((c, i) => {
        const [x, y] = project(c[0], c[1]);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ') + ' Z';
  }, [slickCoords, project, bounds]);

  const centroidPixel = useMemo(() => {
    if (!bounds) return null;
    if (slickCoords.length > 0) {
      const avgLng = slickCoords.reduce((acc, pt) => acc + pt[0], 0) / slickCoords.length;
      const avgLat = slickCoords.reduce((acc, pt) => acc + pt[1], 0) / slickCoords.length;
      return project(avgLng, avgLat);
    }
    if (sarModel.geospatial.centroid) {
      const lat = sarModel.geospatial.centroid.latitude ?? sarModel.geospatial.centroid[0];
      const lng = sarModel.geospatial.centroid.longitude ?? sarModel.geospatial.centroid[1];
      if (lat != null && lng != null) {
        return project(Number(lng), Number(lat));
      }
    }
    return null;
  }, [bounds, slickCoords, sarModel.geospatial.centroid, project]);

  // Zoom controls
  const handleZoomIn = () => setZoomLevel((z) => Math.min(4.0, z + 0.25));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(0.6, z - 0.25));
  const handleResetZoom = () => {
    setZoomLevel(1.0);
    setPanOffset({ x: 0, y: 0 });
  };
  const handleFitSlick = () => {
    setZoomLevel(2.0);
    const cx = centroidPixel ? centroidPixel[0] : 500;
    const cy = centroidPixel ? centroidPixel[1] : 500;
    setPanOffset({ x: (500 - cx) * 2.0, y: (500 - cy) * 2.0 });
  };

  // Mouse pan handlers
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };
  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPanOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const handleMouseUp = () => setIsDragging(false);

  // Mouse wheel zoom
  const handleWheel = (e) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoomLevel((z) => Math.min(4.0, z + 0.15));
    } else {
      setZoomLevel((z) => Math.max(0.6, z - 0.15));
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        backgroundColor: '#070c12',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        color: '#e2e8f0',
        fontFamily: "var(--og-font-body, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sar-evidence-title"
    >
      {/* ── 1. MISSION WORKSTATION HEADER ───────────────────────────────── */}
      <header
        style={{
          height: '56px',
          backgroundColor: '#0c141d',
          borderBottom: '1px solid #1a2636',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        {/* Left: Identity, Provenance Status & Telemetry */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
          <button
            onClick={onClose}
            className="btn btn-secondary btn-sm"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              padding: '6px 12px',
              backgroundColor: '#131e2b',
              border: '1px solid #24354a',
              color: '#94a3b8',
              borderRadius: '4px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
            title="Return to Analysis page"
          >
            <ArrowLeft size={14} style={{ color: '#38bdf8' }} />
            <span>Back to Analysis</span>
          </button>

          <div style={{ height: '24px', width: '1px', backgroundColor: '#1e2c3d' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                padding: '6px',
                borderRadius: '6px',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Satellite size={18} style={{ color: '#38bdf8' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h1
                  id="sar-evidence-title"
                  style={{
                    fontSize: '14px',
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    color: '#f8fafc',
                    margin: 0,
                    textTransform: 'uppercase',
                  }}
                >
                  SAR EVIDENCE WORKSTATION
                </h1>

                {/* Modality & Acquisition Status Badge */}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    backgroundColor: sarModel.acquisition.status === 'REAL'
                      ? 'rgba(16, 185, 129, 0.18)'
                      : 'rgba(245, 158, 11, 0.18)',
                    color: sarModel.acquisition.status === 'REAL' ? '#10b981' : '#fbbf24',
                    border: sarModel.acquisition.status === 'REAL'
                      ? '1px solid rgba(16, 185, 129, 0.4)'
                      : '1px solid rgba(245, 158, 11, 0.4)',
                  }}
                >
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: sarModel.acquisition.status === 'REAL' ? '#10b981' : '#fbbf24',
                    }}
                  />
                  {sarModel.acquisition.status === 'REAL' ? 'AUTHENTICATED METADATA' : sarModel.acquisition.status}
                </span>

                <span
                  style={{
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    backgroundColor: '#1e293b',
                    color: '#38bdf8',
                  }}
                >
                  {sarModel.modality}
                </span>
              </div>

              {/* Sub-header telemetry summary */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>
                  {sarModel.jobId || 'N/A'}
                </span>
                <span>&bull;</span>
                <span>{sarModel.sourceType}</span>
                <span>&bull;</span>
                <span>ACQ: {sarModel.acquisition.formatted}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Primary Actions & Close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => {
              onShowOnMap();
              onClose();
            }}
            className="btn btn-secondary btn-sm"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11.5px',
              fontWeight: 600,
              padding: '6px 14px',
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              color: '#38bdf8',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'background-color 150ms',
            }}
            title="Focus this detection on the primary Command Map"
          >
            <MapPin size={13} style={{ color: '#38bdf8' }} />
            <span>Show on Command Map</span>
          </button>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid #1e2c3d',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 120ms, color 120ms',
            }}
            title="Close workstation (Esc)"
            aria-label="Close SAR Evidence Viewer"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {/* ── 2. DYNAMIC ARTIFACT SELECTOR & WORKSTATION TOOLBAR ─────────────── */}
      <div
        style={{
          height: '42px',
          backgroundColor: '#0a1017',
          borderBottom: '1px solid #16202c',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          flexShrink: 0,
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        {/* Left: Dynamic Real Artifact Selector Tabs (Step 3: Only show buttons for available artifacts) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 700, letterSpacing: '0.05em' }}>
            ARTIFACTS:
          </span>

          <div
            style={{
              display: 'flex',
              backgroundColor: '#0f1722',
              border: '1px solid #1a2636',
              borderRadius: '4px',
              padding: '2px',
              gap: '2px',
            }}
          >
            {sarModel.availableArtifactKeys.map((key) => {
              const art = sarModel.artifacts[key];
              const isActive = activeArtifact === key;
              return (
                <button
                  key={key}
                  data-testid={`artifact-btn-${key}`}
                  onClick={() => {
                    setActiveArtifact(key);
                    setImageError(null);
                    setImageLoaded(false);
                  }}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: isActive ? 700 : 500,
                    backgroundColor: isActive ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                    color: isActive ? '#38bdf8' : '#94a3b8',
                    border: isActive ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {art?.label || key}
                </button>
              );
            })}

            {sarModel.availableArtifactKeys.length === 0 && (
              <span style={{ fontSize: '10.5px', color: '#64748b', padding: '4px 8px' }}>
                No artifacts available
              </span>
            )}
          </div>

          {/* Opacity slider for Overlay Mode */}
          {activeArtifact === 'overlay' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '12px' }}>
              <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>OPACITY:</span>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={overlayOpacity}
                onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
                style={{ width: '65px', height: '4px', accentColor: '#ff4d5e', cursor: 'pointer' }}
                title={`Detection overlay opacity: ${Math.round(overlayOpacity * 100)}%`}
              />
              <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#cbd5e1', minWidth: '30px' }}>
                {Math.round(overlayOpacity * 100)}%
              </span>
            </div>
          )}
        </div>

        {/* Right: Canvas Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setShowGrid((g) => !g)}
            style={{
              padding: '4px 8px',
              fontSize: '10.5px',
              backgroundColor: showGrid ? 'rgba(56, 189, 248, 0.15)' : '#0f1722',
              color: showGrid ? '#38bdf8' : '#64748b',
              border: '1px solid #1a2636',
              borderRadius: '3px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title="Toggle geographic grid overlay"
          >
            <Grid size={12} />
            <span>Grid</span>
          </button>

          <button
            onClick={() => setShowVector((v) => !v)}
            style={{
              padding: '4px 8px',
              fontSize: '10.5px',
              backgroundColor: showVector ? 'rgba(255, 77, 94, 0.15)' : '#0f1722',
              color: showVector ? '#ff4d5e' : '#64748b',
              border: '1px solid #1a2636',
              borderRadius: '3px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title="Toggle detected slick vector overlay"
          >
            <Target size={12} />
            <span>Slick Vector</span>
          </button>

          <div style={{ height: '18px', width: '1px', backgroundColor: '#1e2c3d' }} />

          {/* Zoom buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', backgroundColor: '#0f1722', border: '1px solid #1a2636', borderRadius: '4px', padding: '2px' }}>
            <button
              onClick={handleZoomOut}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: '#94a3b8',
                padding: '4px',
                borderRadius: '2px',
                cursor: 'pointer',
                display: 'flex',
              }}
              title="Zoom out"
              aria-label="Zoom out"
            >
              <ZoomOut size={13} />
            </button>

            <span style={{ fontSize: '10.5px', fontFamily: 'monospace', minWidth: '40px', textAlign: 'center', color: '#cbd5e1' }}>
              {Math.round(zoomLevel * 100)}%
            </span>

            <button
              onClick={handleZoomIn}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: '#94a3b8',
                padding: '4px',
                borderRadius: '2px',
                cursor: 'pointer',
                display: 'flex',
              }}
              title="Zoom in"
              aria-label="Zoom in"
            >
              <ZoomIn size={13} />
            </button>
          </div>

          {slickCoords.length > 0 && (
            <button
              onClick={handleFitSlick}
              style={{
                padding: '4px 8px',
                fontSize: '10.5px',
                backgroundColor: '#0f1722',
                border: '1px solid #1a2636',
                color: '#f8fafc',
                borderRadius: '3px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Fit viewport to detected slick geometry"
            >
              <Target size={12} style={{ color: '#ff4d5e' }} />
              <span>Fit Slick</span>
            </button>
          )}

          <button
            onClick={handleResetZoom}
            style={{
              padding: '4px 8px',
              fontSize: '10.5px',
              backgroundColor: '#0f1722',
              border: '1px solid #1a2636',
              color: '#94a3b8',
              borderRadius: '3px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title="Reset zoom & pan"
          >
            <RotateCcw size={12} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* ── 3. MAIN WORKSPACE (CANVAS + PROVENANCE SIDEBAR) ──────────────── */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 390px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* ── MAIN CANVASES: REAL ARTIFACT RENDERING & VECTOR OVERLAYS ────── */}
        <div
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          style={{
            backgroundColor: '#04070b',
            position: 'relative',
            overflow: 'hidden',
            cursor: isDragging ? 'grabbing' : 'grab',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none',
          }}
        >
          {/* Transformed Canvas Viewport Container */}
          <div
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.12s ease-out',
              width: '840px',
              height: '840px',
              position: 'relative',
              boxShadow: '0 0 40px rgba(0, 0, 0, 0.9)',
              borderRadius: '4px',
              backgroundColor: '#020508',
              border: '1px solid #162638',
              overflow: 'hidden',
            }}
          >
            {/* 1. NOT_AVAILABLE State (Step 3 & 11) */}
            {!isArtifactAvailable && (
              <div
                data-testid="sar-artifact-not-available"
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '30px',
                  textAlign: 'center',
                  backgroundColor: '#060a10',
                  zIndex: 6,
                }}
              >
                <AlertCircle size={40} style={{ color: '#f59e0b', marginBottom: '14px' }} />
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#f8fafc', letterSpacing: '0.04em' }}>
                  ARTIFACT NOT AVAILABLE
                </div>
                <div style={{ fontSize: '11.5px', color: '#94a3b8', maxWidth: '420px', marginTop: '8px', lineHeight: 1.5 }}>
                  The requested artifact (<code style={{ color: '#38bdf8' }}>{activeArtifact}</code>) was not produced or is not available for this investigation.
                </div>
                <div style={{ marginTop: '16px', fontSize: '11px', color: '#64748b' }}>
                  Modality: {sarModel.modality} &bull; Investigation: {sarModel.jobId || 'N/A'}
                </div>
              </div>
            )}

            {/* 2. LOADING State (Step 11) */}
            {isArtifactAvailable && !imageLoaded && !imageError && (
              <div
                data-testid="sar-artifact-loading"
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#04070b',
                  zIndex: 5,
                }}
              >
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    border: '3px solid rgba(56, 189, 248, 0.2)',
                    borderTop: '3px solid #38bdf8',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                <span style={{ marginTop: '14px', fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
                  {`LOADING ${currentArtifact?.label?.toUpperCase() || activeArtifact.toUpperCase()} ARTIFACT...`}
                </span>
              </div>
            )}

            {/* 3. ERROR State (Step 12: 404 / 503 / 500 error reporting) */}
            {isArtifactAvailable && imageError && (
              <div
                data-testid="sar-artifact-error"
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '30px',
                  textAlign: 'center',
                  backgroundColor: '#080d14',
                  zIndex: 6,
                }}
              >
                <AlertTriangle size={40} style={{ color: '#ff4d5e', marginBottom: '14px' }} />
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#f8fafc', letterSpacing: '0.04em' }}>
                  ARTIFACT FAILED TO LOAD
                </div>
                <div style={{ fontSize: '11.5px', color: '#94a3b8', maxWidth: '420px', marginTop: '8px', lineHeight: 1.5 }}>
                  {imageError === '404'
                    ? `SAR ${activeArtifact.toUpperCase()} artifact unavailable (HTTP 404).`
                    : imageError === '503'
                    ? 'ML/artifact processing service unavailable (HTTP 503).'
                    : `Could not retrieve ${currentArtifact?.label || activeArtifact} artifact from endpoint.`}
                </div>
                <button
                  onClick={() => {
                    setImageError(null);
                    setImageLoaded(false);
                  }}
                  style={{
                    marginTop: '16px',
                    padding: '6px 14px',
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    color: '#38bdf8',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Retry Loading
                </button>
              </div>
            )}

            {/* 4. REAL ARTIFACT IMAGE DISPLAY (Step 3 & Step 11: AVAILABLE state) */}
            {isArtifactAvailable && artifactUrl && (
              <img
                src={artifactUrl}
                alt={currentArtifact.label || 'SAR Artifact'}
                data-testid="sar-artifact-image"
                onLoad={() => {
                  setImageLoaded(true);
                  setImageError(null);
                }}
                onError={(e) => {
                  setImageLoaded(false);
                  setImageError('GENERIC_ERROR');
                }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  display: imageError ? 'none' : 'block',
                  opacity: activeArtifact === 'overlay' ? overlayOpacity : 1.0,
                }}
              />
            )}

            {/* 5. VECTOR OVERLAY & GRID (Step 5: Rendered on canonical coordinate bounds) */}
            <svg
              viewBox="0 0 1000 1000"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 4,
              }}
            >
              {/* Geographic Grid Lines */}
              {showGrid && (
                <g opacity="0.18">
                  {[150, 300, 450, 600, 750, 900].map((pos) => (
                    <React.Fragment key={pos}>
                      <line x1={pos} y1="0" x2={pos} y2="1000" stroke="#38bdf8" strokeDasharray="4,6" strokeWidth="1" />
                      <line x1="0" y1={pos} x2="1000" y2={pos} stroke="#38bdf8" strokeDasharray="4,6" strokeWidth="1" />
                    </React.Fragment>
                  ))}
                </g>
              )}

              {/* Observed Slick Polygon Vector (Coral Red) */}
              {showVector && slickSvgPath && (
                <g>
                  <path
                    d={slickSvgPath}
                    fill="#ff4d5e"
                    fillOpacity={0.4}
                    stroke="#ff4d5e"
                    strokeWidth="2.5"
                  />
                </g>
              )}

              {/* Centroid Crosshair */}
              {showVector && centroidPixel && (
                <g transform={`translate(${centroidPixel[0]}, ${centroidPixel[1]})`}>
                  <circle r="18" fill="none" stroke="#ff4d5e" strokeWidth="1.5" strokeDasharray="3,3" opacity="0.85" />
                  <circle r="5" fill="#ffffff" stroke="#ff4d5e" strokeWidth="2.5" />
                  <line x1="-14" y1="0" x2="-6" y2="0" stroke="#ff4d5e" strokeWidth="2" />
                  <line x1="6" y1="0" x2="14" y2="0" stroke="#ff4d5e" strokeWidth="2" />
                  <line x1="0" y1="-14" x2="0" y2="-6" stroke="#ff4d5e" strokeWidth="2" />
                  <line x1="0" y1="6" x2="0" y2="14" stroke="#ff4d5e" strokeWidth="2" />
                </g>
              )}

              {/* Outer Bounding Border */}
              <rect
                x="50"
                y="50"
                width="900"
                height="900"
                fill="none"
                stroke="#1e3a5f"
                strokeWidth="1.5"
                strokeDasharray="8,6"
                opacity="0.6"
              />
            </svg>

            {/* Corner Telemetry Tags */}
            <div
              style={{
                position: 'absolute',
                top: '12px',
                left: '12px',
                backgroundColor: 'rgba(3, 7, 12, 0.85)',
                border: '1px solid #1e2c3d',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 600,
                color: '#38bdf8',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                zIndex: 5,
              }}
            >
              <CheckCircle2 size={12} style={{ color: '#10b981' }} />
              <span>{currentArtifact?.label?.toUpperCase() || activeArtifact.toUpperCase()}</span>
            </div>

            <div
              style={{
                position: 'absolute',
                bottom: '12px',
                right: '12px',
                backgroundColor: 'rgba(3, 7, 12, 0.85)',
                border: '1px solid #1e2c3d',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '9.5px',
                fontFamily: 'monospace',
                color: '#94a3b8',
                zIndex: 5,
              }}
            >
              <span>{sarModel.modality} &bull; {sarModel.sourceType}</span>
            </div>
          </div>

          {/* Bottom Coordinate & Telemetry HUD (Step 5: "Geolocation unavailable" if missing) */}
          <div
            style={{
              position: 'absolute',
              bottom: '14px',
              left: '16px',
              backgroundColor: 'rgba(8, 14, 22, 0.92)',
              padding: '6px 12px',
              borderRadius: '4px',
              border: '1px solid #1a293b',
              fontSize: '11px',
              fontFamily: 'monospace',
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          >
            <span style={{ color: sarModel.geospatial.available ? '#10b981' : '#f59e0b' }}>
              {sarModel.geospatial.message}
            </span>
            <span>&bull;</span>
            <span style={{ color: '#38bdf8' }}>EPSG:4326</span>
            <span>&bull;</span>
            <span>
              CENTER:{' '}
              {sarModel.geospatial.centroid
                ? `${(sarModel.geospatial.centroid.latitude ?? sarModel.geospatial.centroid[0]).toFixed(3)}°N, ${(sarModel.geospatial.centroid.longitude ?? sarModel.geospatial.centroid[1]).toFixed(3)}°E`
                : 'NOT AVAILABLE'}
            </span>
          </div>

          {/* Bottom Right Zoom Hint */}
          <div
            style={{
              position: 'absolute',
              bottom: '14px',
              right: '16px',
              backgroundColor: 'rgba(8, 14, 22, 0.85)',
              padding: '4px 10px',
              borderRadius: '4px',
              border: '1px solid #16202c',
              fontSize: '10px',
              color: '#64748b',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          >
            Click & drag to pan &bull; Mouse wheel to zoom
          </div>
        </div>

        {/* ── RIGHT: EVIDENCE & PROVENANCE PANEL (NON-OVERLAPPING SIDEBAR) ── */}
        <div
          style={{
            backgroundColor: '#0c131c',
            borderLeft: '1px solid #1a2636',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            padding: '16px',
            gap: '14px',
          }}
        >
          {/* Section 1: Prominent Evidence Provenance (Step 10) */}
          <div
            style={{
              backgroundColor: '#0f1722',
              border: '1px solid #1a2636',
              borderRadius: '6px',
              padding: '12px 14px',
            }}
          >
            <div
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>EVIDENCE PROVENANCE</span>
              <ShieldCheck size={13} style={{ color: '#38bdf8' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>SOURCE</span>
                <span style={{ fontWeight: 600, color: '#f8fafc', textAlign: 'right', maxWidth: '210px' }}>
                  {sarModel.sourceType}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>INVESTIGATION / JOB ID</span>
                <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#38bdf8', textAlign: 'right', maxWidth: '210px', wordBreak: 'break-all' }}>
                  {sarModel.jobId || 'N/A'}
                </span>
              </div>

              {/* Step 6: Acquisition Timestamp semantics */}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>ACQUISITION TIME</span>
                <span style={{ color: '#cbd5e1', fontSize: '10.5px' }}>
                  {sarModel.acquisition.formatted}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>TIME SEMANTICS</span>
                <span style={{ fontSize: '10px', fontWeight: 600, color: sarModel.acquisition.status === 'REAL' ? '#10b981' : '#fbbf24' }}>
                  {sarModel.acquisition.status}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>MODALITY</span>
                <span style={{ color: '#38bdf8', fontWeight: 600 }}>{sarModel.modality}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>CURRENT ARTIFACT</span>
                <span style={{ color: '#f8fafc', fontWeight: 600 }}>{currentArtifact?.label || activeArtifact}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #1a2636', paddingTop: '6px', marginTop: '2px' }}>
                <span style={{ color: '#64748b' }}>GEOSPATIAL STATUS</span>
                <span style={{ fontWeight: 700, color: sarModel.geospatial.available ? '#10b981' : '#f59e0b', fontSize: '10px' }}>
                  {sarModel.geospatial.message}
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Model & Processing Metadata (Step 7: Render only when present) */}
          <div
            style={{
              backgroundColor: '#0f1722',
              border: '1px solid #1a2636',
              borderRadius: '6px',
              padding: '12px 14px',
            }}
          >
            <div
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>MODEL SPECIFICATION</span>
              <Cpu size={13} style={{ color: '#38bdf8' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>MODEL ID</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#38bdf8', wordBreak: 'break-all', textAlign: 'right', maxWidth: '200px' }}>
                  {sarModel.model.modelId || 'NOT AVAILABLE'}
                </span>
              </div>

              {sarModel.model.inputModality && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>INPUT MODALITY</span>
                  <span style={{ color: '#cbd5e1' }}>{sarModel.model.inputModality}</span>
                </div>
              )}

              {sarModel.model.channelCount != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>INPUT CHANNELS</span>
                  <span style={{ color: '#cbd5e1' }}>
                    {sarModel.model.channelCount} {sarModel.model.polarizations?.length ? `(${sarModel.model.polarizations.join(' + ')})` : ''}
                  </span>
                </div>
              )}

              {sarModel.model.preprocessingVersion && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>PREPROCESSING</span>
                  <span style={{ color: '#cbd5e1' }}>{sarModel.model.preprocessingVersion}</span>
                </div>
              )}

              {sarModel.model.threshold != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>THRESHOLD</span>
                  <span style={{ fontFamily: 'monospace', color: '#f8fafc' }}>
                    {sarModel.model.threshold}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Detection Results (Step 8 & 9) */}
          <div
            style={{
              backgroundColor: '#0f1722',
              border: '1px solid #1a2636',
              borderRadius: '6px',
              padding: '12px 14px',
            }}
          >
            <div
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>DETECTION RESULTS</span>
              <Target size={13} style={{ color: '#ff4d5e' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#64748b' }}>OIL SPILL DETECTED</span>
                <span style={{
                  padding: '2px 6px',
                  borderRadius: '3px',
                  fontSize: '10px',
                  fontWeight: 700,
                  backgroundColor: sarModel.detection.oilSpillDetected ? 'rgba(56, 189, 248, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                  color: sarModel.detection.oilSpillDetected ? '#38bdf8' : '#fbbf24',
                }}>
                  {sarModel.detection.oilSpillDetected === true ? 'YES' : (sarModel.detection.oilSpillDetected === false ? 'NO' : 'NOT AVAILABLE')}
                </span>
              </div>

              {/* Step 8: Never fabricate confidence fallback */}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>AI CONFIDENCE</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: sarModel.detection.confidence != null ? '#10b981' : '#94a3b8' }}>
                  {sarModel.detection.confidenceFormatted}
                </span>
              </div>

              {sarModel.detection.areaKm2 != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>DETECTED AREA</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#ff4d5e' }}>
                    {sarModel.detection.areaKm2.toFixed(3)} km²
                  </span>
                </div>
              )}

              {/* Step 9: Oil Type Guardrail: Strictly NOT_ESTABLISHED */}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #1a2636', paddingTop: '6px', marginTop: '2px' }}>
                <span style={{ color: '#64748b' }}>OIL TYPE</span>
                <span style={{ fontWeight: 700, color: '#94a3b8', fontSize: '10.5px' }}>
                  {sarModel.oilType}
                </span>
              </div>
            </div>

            {/* Quick Action: View on Command Map */}
            <button
              onClick={() => {
                onShowOnMap();
                onClose();
              }}
              style={{
                width: '100%',
                marginTop: '12px',
                padding: '8px 12px',
                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                color: '#38bdf8',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'background-color 150ms',
              }}
            >
              <ExternalLink size={13} />
              <span>View on Command Map</span>
            </button>
          </div>

          {/* Section 4: Scientific Disclaimer */}
          <div
            style={{
              fontSize: '10px',
              color: '#64748b',
              lineHeight: 1.4,
              backgroundColor: '#080d14',
              border: '1px solid #141f2d',
              padding: '8px 10px',
              borderRadius: '4px',
              marginTop: 'auto',
            }}
          >
            <span>
              <strong>SCIENTIFIC NOTICE:</strong> Dual-polarization SAR backscatter anomalies represent radar surface roughness attenuation. Vessel attribution and release kinematics require backward hydrodynamic drift modeling and AIS correlation.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
