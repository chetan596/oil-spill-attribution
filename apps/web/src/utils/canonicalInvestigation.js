/**
 * Canonical Investigation Utilities & Scientific Guardrails
 * Phase 16.4 — Part 1: Data Contract & State Scoping
 */

export const MANUAL_STATES = {
  IDLE: 'IDLE',
  LOADING: 'LOADING',
  READY: 'READY',
  ANALYZING: 'ANALYZING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  NO_GEOSPATIAL_DATA: 'NO_GEOSPATIAL_DATA',
  UNSUPPORTED_INVESTIGATION: 'UNSUPPORTED_INVESTIGATION',
};

/**
 * Validates whether an object strictly adheres to the canonical investigation schema.
 * @param {object} data
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCanonicalInvestigation(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Payload must be a non-null object'] };
  }

  if (!data.jobId) errors.push('Missing jobId');
  if (!data.status) errors.push('Missing status');

  if (!data.input || typeof data.input !== 'object') {
    errors.push('Missing or invalid input section');
  } else {
    if (!data.input.inputFormat) errors.push('Missing input.inputFormat');
    if (typeof data.input.channelCount !== 'number') errors.push('Missing or non-numeric input.channelCount');
    if (!data.input.modality) errors.push('Missing input.modality');
    if (!data.input.sourceType) errors.push('Missing input.sourceType');
    if (!data.input.bandStructure) errors.push('Missing input.bandStructure');
    if (!data.input.polarizationStatus) errors.push('Missing input.polarizationStatus');
  }

  if (!data.model || typeof data.model !== 'object') {
    errors.push('Missing or invalid model section');
  } else {
    if (!data.model.modelId) errors.push('Missing model.modelId');
    if (!data.model.checkpointSha256) errors.push('Missing model.checkpointSha256');
    if (!data.model.preprocessingVersion) errors.push('Missing model.preprocessingVersion');
  }

  if (!data.detection || typeof data.detection !== 'object') {
    errors.push('Missing or invalid detection section');
  } else {
    if (typeof data.detection.oilSpillDetected !== 'boolean') errors.push('Missing boolean detection.oilSpillDetected');
    if (typeof data.detection.confidence !== 'number') errors.push('Missing numeric detection.confidence');
  }

  if (!data.artifacts || typeof data.artifacts !== 'object') {
    errors.push('Missing or invalid artifacts section');
  } else {
    if (!data.artifacts.original) errors.push('Missing artifacts.original');
    if (!data.artifacts.mask) errors.push('Missing artifacts.mask');
    if (!data.artifacts.annotated) errors.push('Missing artifacts.annotated');
  }

  if (!data.geospatial || typeof data.geospatial !== 'object') {
    errors.push('Missing or invalid geospatial section');
  } else {
    if (typeof data.geospatial.available !== 'boolean') errors.push('Missing boolean geospatial.available');
    if (data.geospatial.available) {
      if (!data.geospatial.crs) errors.push('Available geospatial must provide crs');
      if (!data.geospatial.bounds) errors.push('Available geospatial must provide bounds');
      if (!data.geospatial.centroid) errors.push('Available geospatial must provide centroid');
    }
  }

  if (!data.provenance || typeof data.provenance !== 'object') {
    errors.push('Missing or invalid provenance section');
  } else {
    if (!data.provenance.inputGeolocation) errors.push('Missing provenance.inputGeolocation');
    if (!data.provenance.detection) errors.push('Missing provenance.detection');
    if (data.provenance.oilType !== 'NOT_ESTABLISHED') errors.push('provenance.oilType must be NOT_ESTABLISHED');
    if (data.provenance.vesselAttribution !== 'NOT_ESTABLISHED') errors.push('provenance.vesselAttribution must be NOT_ESTABLISHED');
  }

  // Phase 16.4 Part 5: AIS Correlation & Attribution Guardrails
  const FORBIDDEN_VESSEL_KEYS = ['responsibleVessel', 'confirmedPolluter', 'definitiveSource', 'provenResponsibleVessel'];
  for (const fKey of FORBIDDEN_VESSEL_KEYS) {
    if (data[fKey] !== undefined) {
      errors.push(`Forbidden polluter attribution field detected: ${fKey}`);
    }
  }

  if (data.aisCorrelation && typeof data.aisCorrelation === 'object') {
    const candidates = data.aisCorrelation.candidates;
    if (Array.isArray(candidates)) {
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        if (c.status !== 'POTENTIAL_CANDIDATE') {
          errors.push(`Candidate #${i + 1} status must be POTENTIAL_CANDIDATE, got: ${c.status}`);
        }
        if (c.attribution?.status !== 'NOT_ESTABLISHED') {
          errors.push(`Candidate #${i + 1} attribution.status must be NOT_ESTABLISHED, got: ${c.attribution?.status}`);
        }
        for (const fKey of FORBIDDEN_VESSEL_KEYS) {
          if (c[fKey] !== undefined) {
            errors.push(`Candidate #${i + 1} contains forbidden polluter attribution field: ${fKey}`);
          }
        }
      }
    }
  }

  if (!data.fingerprint || typeof data.fingerprint !== 'string') {
    errors.push('Missing string result fingerprint');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Normalizes any backend response (full canonical or partial result) into a canonical shape.
 * @param {object} res
 * @returns {object} Normalized canonical payload
 */
export function normalizeCanonicalInvestigation(res) {
  if (!res) return null;
  const raw = res.data || res;

  // If already matches canonical root
  if (raw.input && raw.model && raw.detection && raw.geospatial && raw.fingerprint) {
    // Canonical shape — return as-is; origin block is included if present
    return raw;
  }

  // Handle explicit non-completed structured job states
  if (raw.status === 'READY_FOR_ANALYSIS' || raw.status === 'PROCESSING' || raw.status === 'FAILED') {
    return {
      jobId: raw.jobId || raw.id || 'unknown-job',
      analysisId: raw.analysisId || raw.jobId || raw.id,
      status: raw.status,
      progress: raw.progress || 0,
      stage: raw.stage || raw.status,
      errorMessage: raw.errorMessage || raw.error || null,
      isReady: raw.isReady || false,
    };
  }

  const payload = raw.payload || raw;
  const isSar = Boolean(
    payload.sourceType === 'SENTINEL1_DUAL_POL' ||
    payload.source_type === 'SENTINEL1_DUAL_POL' ||
    payload.modality === 'SAR_DUAL_POL' ||
    payload.isTiff
  );

  const jobId = raw.jobId || raw.id || 'unknown-job';
  const status = raw.status || 'COMPLETED';
  const channelCount = Number(raw.channels || payload.channelCount || payload.channels || (isSar ? 2 : 3));
  const inputFormat = payload.isTiff ? 'TIFF' : (raw.mimeType?.includes('png') || payload.mimeType?.includes('png') ? 'PNG' : 'JPEG');
  const modality = isSar ? 'SAR_DUAL_POL' : 'OPTICAL_RGB';
  const sourceType = payload.sourceType || payload.source_type || (isSar ? 'SENTINEL1_DUAL_POL' : 'DRONE');

  const modelId = isSar
    ? 'unet-dual-pol-sar-v09d-residual-loss'
    : (sourceType === 'SATELLITE_RGB' ? 'mados-resnet34-rgb-v1' : 'kerf-resnet34-focaldice-v1');

  const checkpointSha256 = isSar
    ? '1e25e1dfcbe109268f6a394c8e718b5b3fecfc62507663dece55452d377b21e8'
    : (sourceType === 'SATELLITE_RGB'
      ? 'd249fbeea1211e4bfbe1102927e36ca93f5540a7cfdc8ea6e987c6b5bcf418ce'
      : 'd1ae45d3eaf995a221da3d273c177eb13c850b193cd6690a1b6bc47b0baf5264');

  const preprocessingVersion = isSar
    ? 'sentinel1_sigma0_db_v1'
    : (sourceType === 'SATELLITE_RGB' ? 'mados-rgb-v1' : 'kerf-rgb-v1');

  const oilSpillDetected = Boolean(raw.oilSpillDetected ?? payload.oilSpillDetected ?? false);
  const confidence = Number(raw.detectionConfidence ?? raw.confidence ?? payload.confidence ?? (oilSpillDetected ? 0.94 : 0.0));
  const coveragePercent = Number(raw.coveragePercent ?? payload.coveragePercent ?? 0.0);

  const geoObj = raw.geospatial || payload.geospatial || {};
  const rawBounds = geoObj.bounds || null;
  const rawCentroid = geoObj.centroid || null;
  const isGeoAvailable = Boolean(
    (geoObj.available && rawBounds && rawCentroid) ||
    (geoObj.crs && geoObj.crs !== 'NOT_AVAILABLE' && geoObj.geolocationStatus === 'ESTABLISHED' && rawBounds && rawCentroid)
  );

  const geospatial = isGeoAvailable
    ? {
        available: true,
        crs: geoObj.crs || 'EPSG:4326',
        crsName: geoObj.crsName || 'WGS 84',
        bounds: geoObj.bounds || null,
        footprint: geoObj.footprint || null,
        imageFootprint: geoObj.imageFootprint || null,
        spillFootprint: geoObj.spillFootprint || null,
        centroid: geoObj.centroid || null,
        pixelSize: geoObj.pixelSize || null,
        areaM2: geoObj.areaM2 || null,
        areaKm2: geoObj.areaKm2 || null,
      }
    : {
        available: false,
        crs: null,
        crsName: null,
        bounds: null,
        footprint: null,
        imageFootprint: null,
        spillFootprint: null,
        centroid: null,
        pixelSize: null,
        areaM2: null,
        areaKm2: null,
      };

  const artifacts = {
    original: raw.artifacts?.original || `/api/v1/manual-analysis/${jobId}/original`,
    vv: isSar ? (raw.artifacts?.vv || `/api/v1/manual-analysis/${jobId}/vv`) : null,
    vh: isSar ? (raw.artifacts?.vh || `/api/v1/manual-analysis/${jobId}/vh`) : null,
    probabilityMap: raw.artifacts?.probabilityMap || null,
    mask: raw.artifacts?.mask || `/api/v1/manual-analysis/${jobId}/mask`,
    overlay: raw.artifacts?.overlay || (isSar ? null : raw.artifacts?.annotated) || null,
    annotated: raw.artifacts?.annotated || null,
  };

  const fingerprint = raw.fingerprint || `${jobId}:${modelId}:${checkpointSha256}:${inputFormat}:${channelCount}:${geospatial.crs || 'no_geo'}:${oilSpillDetected}:${confidence.toFixed(4)}`;

  return {
    jobId,
    analysisId: raw.analysisId || jobId,
    status,
    input: {
      filename: raw.originalFilename || payload.originalFilename || 'manual_upload',
      inputFormat,
      channelCount,
      modality,
      sourceType,
      bandStructure: isSar ? 'DUAL_BAND_SAR' : 'THREE_BAND_RGB',
      polarizationStatus: isSar ? 'ESTABLISHED' : 'NOT_APPLICABLE',
      polarizations: isSar ? ['VV', 'VH'] : [],
    },
    model: {
      modelId,
      modelVersion: '1.0.0',
      checkpointSha256,
      preprocessingVersion,
      threshold: 0.50,
    },
    detection: {
      oilSpillDetected,
      confidence,
      coveragePercent,
      probabilityStats: raw.probabilityStats || { meanForegroundProbability: confidence, maxProbability: confidence },
    },
    artifacts,
    geospatial,
    provenance: {
      inputGeolocation: geospatial.available ? 'REAL' : 'NOT_AVAILABLE',
      detection: 'MODEL_DERIVED',
      footprint: geospatial.available ? 'MODEL_DERIVED' : 'NOT_AVAILABLE',
      oilType: 'NOT_ESTABLISHED',
      vesselAttribution: 'NOT_ESTABLISHED',
      ...(raw.provenance || {}),
      origin: raw.provenance?.origin || (raw.origin ? (raw.origin.provenance || 'MODEL_DERIVED') : 'NOT_AVAILABLE'),
      drift: raw.provenance?.drift || (raw.drift ? (raw.drift.provenance || 'MODEL_DERIVED') : 'NOT_AVAILABLE'),
      aisCorrelation: raw.provenance?.aisCorrelation || (raw.aisCorrelation ? (raw.aisCorrelation.provenance || 'DEMO') : 'NOT_AVAILABLE'),
    },
    fingerprint,
    // Carry origin, drift, aisCorrelation, temporalReference, and sourceProduct blocks from backend when present; null otherwise
    origin: raw.origin || null,
    drift: raw.drift || null,
    aisCorrelation: raw.aisCorrelation || null,
    temporalReference: raw.temporalReference || null,
    sourceProduct: raw.sourceProduct || null,
  };
}
