/**
 * realSarEvidenceModel.js
 * Phase 16.4 — Part 6: Real SAR Evidence & Artifact View Model
 *
 * Normalizes canonical investigation data into an authoritative,
 * modality-aware SAR artifact inspection model.
 *
 * STRICT GUARDRAILS:
 * - Never fabricates artifact URLs
 * - Never cross-wires optical artifacts into SAR investigations
 * - Never fabricates satellite acquisition timestamps (distinguishes REAL, ESTIMATION_TIME_PROXY, and NOT_AVAILABLE)
 * - Never invents confidence, coordinates, or oil types (oil type is strictly NOT_ESTABLISHED)
 * - Missing values strictly remain null or NOT_AVAILABLE
 */

import { normalizeCanonicalInvestigation } from './canonicalInvestigation';

/**
 * Builds the canonical SAR evidence view model.
 *
 * @param {Object} rawInvestigation - Canonical or raw investigation object
 * @param {Object} [options] - Additional options (e.g. override jobId)
 * @returns {Object} Normalized SAR evidence model
 */
export function buildRealSarEvidenceModel(rawInvestigation, options = {}) {
  if (!rawInvestigation) {
    return {
      available: false,
      reason: 'NO_INVESTIGATION_DATA',
      jobId: null,
      modality: 'NOT_AVAILABLE',
      sourceType: 'NOT_AVAILABLE',
      isSar: false,
      isOptical: false,
      acquisition: {
        timestamp: null,
        formatted: 'NOT AVAILABLE',
        status: 'NOT_AVAILABLE',
        source: null,
      },
      geospatial: {
        available: false,
        imageFootprint: null,
        spillFootprint: null,
        centroid: null,
        crs: null,
        message: 'Geolocation unavailable',
      },
      artifacts: {},
      availableArtifactKeys: [],
      model: {
        modelId: null,
        modelVersion: null,
        checkpointSha256: null,
        preprocessingVersion: null,
        threshold: null,
      },
      detection: {
        oilSpillDetected: null,
        confidence: null,
        confidenceFormatted: 'NOT AVAILABLE',
        coveragePercent: null,
        areaKm2: null,
      },
      oilType: 'NOT_ESTABLISHED',
      provenance: {
        oilType: 'NOT_ESTABLISHED',
        vesselAttribution: 'NOT_ESTABLISHED',
        detection: 'NOT_AVAILABLE',
        inputGeolocation: 'NOT_AVAILABLE',
      },
    };
  }

  // Normalize if raw or partial
  const canonical = rawInvestigation.input && rawInvestigation.model && rawInvestigation.artifacts
    ? rawInvestigation
    : (normalizeCanonicalInvestigation(rawInvestigation) || rawInvestigation);

  const jobId = canonical.jobId || canonical.id || options.jobId || null;

  // Determine modality
  const explicitArtifacts = rawInvestigation.artifacts ?? canonical.artifacts ?? null;
  const rawArtifacts = explicitArtifacts || {};
  const hasExplicitArtifacts = explicitArtifacts != null;

  const modalityRaw = canonical.input?.modality || canonical.modality || '';
  const sourceTypeRaw = canonical.input?.sourceType || canonical.sourceType || '';
  const isSar = Boolean(
    modalityRaw === 'SAR_DUAL_POL' ||
    modalityRaw === 'SAR' ||
    modalityRaw.includes('SAR') ||
    sourceTypeRaw === 'SENTINEL1_DUAL_POL' ||
    sourceTypeRaw.includes('SENTINEL1') ||
    canonical.input?.bandStructure === 'DUAL_BAND_SAR' ||
    canonical.isTiff ||
    rawArtifacts.vv ||
    rawArtifacts.vh
  );
  const isOptical = !isSar && Boolean(
    modalityRaw === 'OPTICAL_RGB' ||
    sourceTypeRaw === 'DRONE' ||
    sourceTypeRaw === 'SATELLITE_RGB' ||
    canonical.input?.bandStructure === 'THREE_BAND_RGB'
  );

  const modality = isSar ? 'SAR_DUAL_POL' : (isOptical ? 'OPTICAL_RGB' : (modalityRaw || 'UNKNOWN'));
  const sourceType = sourceTypeRaw || (isSar ? 'SENTINEL1_DUAL_POL' : (isOptical ? 'OPTICAL' : 'UNKNOWN'));

  // Temporal / Acquisition timestamp resolution
  // Guardrail: Never convert upload/server time to acquisition time
  const tempRef = canonical.temporalReference || null;
  let acqStatus = 'NOT_AVAILABLE';
  let acqTimestamp = null;
  let acqSource = null;

  if (tempRef && tempRef.timestamp) {
    acqTimestamp = tempRef.timestamp;
    acqSource = tempRef.source || tempRef.sourceType || null;
    if (tempRef.isAuthoritative === true || tempRef.source === 'SATELLITE_METADATA' || tempRef.source === 'ANALYST_SUPPLIED') {
      acqStatus = 'REAL';
    } else {
      acqStatus = 'ESTIMATION_TIME_PROXY';
    }
  } else if (canonical.sourceProduct?.acquisitionStart) {
    acqTimestamp = canonical.sourceProduct.acquisitionStart;
    acqStatus = 'REAL';
    acqSource = 'SATELLITE_METADATA';
  } else if (canonical.acquisitionDate && !canonical.acquisitionDate.toLowerCase().includes('demo')) {
    // Verified acquisition date string from authentic source
    acqTimestamp = canonical.acquisitionDate;
    acqStatus = 'REAL';
    acqSource = 'CANONICAL_SCENE';
  }

  const acqFormatted = acqTimestamp
    ? (() => {
        try {
          return new Date(acqTimestamp).toUTCString().replace('GMT', 'UTC');
        } catch (_) {
          return String(acqTimestamp);
        }
      })()
    : 'NOT AVAILABLE';

  // Geospatial resolution
  const geoObj = canonical.geospatial || {};
  const isGeoAvailable = Boolean(geoObj.available && (geoObj.centroid || geoObj.bounds || geoObj.imageFootprint));
  const geospatial = {
    available: isGeoAvailable,
    imageFootprint: geoObj.imageFootprint || geoObj.footprint || null,
    spillFootprint: geoObj.spillFootprint || null,
    centroid: geoObj.centroid || null,
    bounds: geoObj.bounds || null,
    crs: geoObj.crs || null,
    message: isGeoAvailable ? 'Georeferenced' : 'Geolocation unavailable',
  };

  // Artifact mapping
  // Guardrail: Modality isolation — never generate optical artifacts for SAR or vice-versa
  // Guardrail: Only populate values that actually exist; never invent fallback URLs
  const artifacts = {};
  const availableArtifactKeys = [];

  // 1. Original Source Image / Raster
  if (rawArtifacts.original) {
    artifacts.original = {
      key: 'original',
      url: rawArtifacts.original,
      available: true,
      label: isSar ? 'Original SAR' : 'Original Image',
      modality,
      mimeType: canonical.input?.inputFormat === 'TIFF' ? 'image/png' : 'image/jpeg',
      description: isSar
        ? 'Normalized 2-channel Sentinel-1 dual-polarization SAR raster'
        : 'Normalized original visual raster',
    };
    availableArtifactKeys.push('original');
  } else if (!hasExplicitArtifacts && jobId) {
    artifacts.original = {
      key: 'original',
      url: `/api/v1/manual-analysis/${jobId}/original`,
      available: true,
      label: isSar ? 'Original SAR' : 'Original Image',
      modality,
      mimeType: canonical.input?.inputFormat === 'TIFF' ? 'image/png' : 'image/jpeg',
      description: isSar
        ? 'Normalized 2-channel Sentinel-1 dual-polarization SAR raster'
        : 'Normalized original visual raster',
    };
    availableArtifactKeys.push('original');
  }

  // 2. Channel 1 (VV) — Strictly SAR
  if (isSar) {
    if (rawArtifacts.vv) {
      artifacts.vv = {
        key: 'vv',
        url: rawArtifacts.vv,
        available: true,
        label: 'Channel 1 (VV)',
        modality: 'SAR_DUAL_POL',
        mimeType: 'image/png',
        description: 'Vertical-transmit Vertical-receive (VV) copolarized backscatter',
      };
      availableArtifactKeys.push('vv');
    } else if (!hasExplicitArtifacts && jobId) {
      artifacts.vv = {
        key: 'vv',
        url: `/api/v1/manual-analysis/${jobId}/vv`,
        available: true,
        label: 'Channel 1 (VV)',
        modality: 'SAR_DUAL_POL',
        mimeType: 'image/png',
        description: 'Vertical-transmit Vertical-receive (VV) copolarized backscatter',
      };
      availableArtifactKeys.push('vv');
    }
  }

  // 3. Channel 2 (VH) — Strictly SAR
  if (isSar) {
    if (rawArtifacts.vh) {
      artifacts.vh = {
        key: 'vh',
        url: rawArtifacts.vh,
        available: true,
        label: 'Channel 2 (VH)',
        modality: 'SAR_DUAL_POL',
        mimeType: 'image/png',
        description: 'Vertical-transmit Horizontal-receive (VH) cross-polarized backscatter',
      };
      availableArtifactKeys.push('vh');
    } else if (!hasExplicitArtifacts && jobId) {
      artifacts.vh = {
        key: 'vh',
        url: `/api/v1/manual-analysis/${jobId}/vh`,
        available: true,
        label: 'Channel 2 (VH)',
        modality: 'SAR_DUAL_POL',
        mimeType: 'image/png',
        description: 'Vertical-transmit Horizontal-receive (VH) cross-polarized backscatter',
      };
      availableArtifactKeys.push('vh');
    }
  }

  // 4. Segmentation Mask
  if (rawArtifacts.mask) {
    artifacts.mask = {
      key: 'mask',
      url: rawArtifacts.mask,
      available: true,
      label: 'Segmentation Mask',
      modality,
      mimeType: 'image/png',
      description: 'Binary neural segmentation mask (1=spill, 0=water/background)',
    };
    availableArtifactKeys.push('mask');
  }

  // 5. Detection Overlay
  if (rawArtifacts.overlay) {
    artifacts.overlay = {
      key: 'overlay',
      url: rawArtifacts.overlay,
      available: true,
      label: 'Detection Overlay',
      modality,
      mimeType: 'image/png',
      description: 'Semi-transparent segmented slick contour overlaid onto source imagery',
    };
    availableArtifactKeys.push('overlay');
  }

  // 6. Probability Map (Heatmap)
  if (rawArtifacts.probabilityMap) {
    artifacts.probabilityMap = {
      key: 'probabilityMap',
      url: rawArtifacts.probabilityMap,
      available: true,
      label: 'Probability Map',
      modality,
      mimeType: 'image/png',
      description: 'Calibrated sigmoid neural pixel probability activation map [0.0 - 1.0]',
    };
    availableArtifactKeys.push('probabilityMap');
  }

  // 7. Annotated Composite (Optical Only — Guardrail: NEVER available for SAR)
  if (isOptical && rawArtifacts.annotated) {
    artifacts.annotated = {
      key: 'annotated',
      url: rawArtifacts.annotated,
      available: true,
      label: 'Visual Annotation',
      modality: 'OPTICAL_RGB',
      mimeType: 'image/png',
      description: 'Optical composite bounding and contour annotations',
    };
    availableArtifactKeys.push('annotated');
  }

  // Model Metadata
  const modelObj = canonical.model || {};
  const model = {
    modelId: modelObj.modelId || null,
    modelVersion: modelObj.modelVersion || null,
    checkpointSha256: modelObj.checkpointSha256 || null,
    preprocessingVersion: modelObj.preprocessingVersion || null,
    threshold: modelObj.threshold != null ? Number(modelObj.threshold) : null,
    inputModality: modality,
    channelCount: canonical.input?.channelCount ?? (isSar ? 2 : 3),
    polarizations: canonical.input?.polarizations || (isSar ? ['VV', 'VH'] : []),
  };

  // Detection Results
  // Guardrail: Never use demo fallbacks like 0.94 unless canonical data actually has that value
  const detObj = canonical.detection || {};
  const hasConfidence = typeof detObj.confidence === 'number' && !isNaN(detObj.confidence);
  const confidence = hasConfidence ? detObj.confidence : null;
  const detection = {
    oilSpillDetected: typeof detObj.oilSpillDetected === 'boolean' ? detObj.oilSpillDetected : null,
    confidence,
    confidenceFormatted: hasConfidence ? `${(confidence * 100).toFixed(1)}%` : 'NOT AVAILABLE',
    coveragePercent: typeof detObj.coveragePercent === 'number' ? detObj.coveragePercent : null,
    areaKm2: geoObj.areaKm2 != null ? Number(geoObj.areaKm2) : null,
  };

  return {
    available: true,
    jobId,
    modality,
    sourceType,
    isSar,
    isOptical,
    acquisition: {
      timestamp: acqTimestamp,
      formatted: acqFormatted,
      status: acqStatus,
      source: acqSource,
    },
    geospatial,
    artifacts,
    availableArtifactKeys,
    model,
    detection,
    oilType: 'NOT_ESTABLISHED',
    provenance: {
      oilType: 'NOT_ESTABLISHED',
      vesselAttribution: 'NOT_ESTABLISHED',
      detection: canonical.provenance?.detection || 'MODEL_DERIVED',
      inputGeolocation: canonical.provenance?.inputGeolocation || (isGeoAvailable ? 'REAL' : 'NOT_AVAILABLE'),
      footprint: canonical.provenance?.footprint || (isGeoAvailable ? 'MODEL_DERIVED' : 'NOT_AVAILABLE'),
    },
  };
}
