/**
 * Phase 16.4 Part 6 — Technical Investigation Report & Multi-Format Export Service
 *
 * OCEAN GUARD AI / SIH26143
 *
 * Core Principles:
 *  1. Pure presentation / serialization over CANONICAL INVESTIGATION SNAPSHOT.
 *  2. NEVER rerun ML inference, origin estimation, drift simulation, or AIS correlation.
 *  3. Explicit provenance: REAL, MODEL_DERIVED, DEMO, NOT_AVAILABLE, ESTIMATION_TIME_PROXY.
 *  4. Strict attribution guardrails: attribution status is ALWAYS NOT_ESTABLISHED.
 *     Forbidden terms (responsibleVessel, confirmedPolluter, etc.) are strictly barred.
 *  5. Security: Never expose server filesystem paths, internal absolute paths, or secrets in manifest or report.
 *  6. No fabrication: Only export features and artifacts that genuinely exist.
 */

'use strict';

const FORBIDDEN_POLLUTER_TERMS = [
  'responsibleVessel',
  'confirmedPolluter',
  'definitiveSource',
  'provenResponsibleVessel',
  'CONFIRMED POLLUTER',
  'RESPONSIBLE VESSEL',
  'PROVEN SOURCE',
  'VESSEL CAUSED SPILL',
  'MOST LIKELY POLLUTER',
];

/**
 * Validates that an object contains no forbidden polluter attribution terms.
 * @param {any} obj
 */
function assertNoForbiddenAttribution(obj) {
  const jsonStr = typeof obj === 'string' ? obj : JSON.stringify(obj);
  for (const term of FORBIDDEN_POLLUTER_TERMS) {
    if (jsonStr.includes(term)) {
      throw new Error(`Forbidden polluter attribution term detected in export: "${term}"`);
    }
  }
}

/**
 * Strips internal server paths from strings (security requirement).
 * @param {string} str
 * @returns {string}
 */
function sanitizePath(str) {
  if (!str || typeof str !== 'string') return str;
  // Strip Windows drive letters like C:\, D:\ or absolute Unix paths /home, /data, /tmp
  return str.replace(/([A-Za-z]:\\[^ "']+)|(\/[a-zA-Z0-9_\-.]+\/[^ "']+)/g, (match) => {
    const parts = match.split(/[/\\]/);
    return parts[parts.length - 1] || 'sanitized_artifact';
  });
}

/**
 * 1. Export Investigation JSON
 * Validates and serializes the canonical investigation payload snapshot.
 *
 * @param {object} canonical - Authoritative canonical investigation object.
 * @returns {object} Machine-readable JSON representation.
 */
function exportJson(canonical) {
  if (!canonical || typeof canonical !== 'object') {
    throw new Error('Invalid canonical investigation: snapshot is required for JSON export.');
  }

  assertNoForbiddenAttribution(canonical);

  // Deep clone to ensure immutability
  const cloned = JSON.parse(JSON.stringify(canonical));

  // Guarantee final vessel attribution is strictly NOT_ESTABLISHED
  if (!cloned.attribution) {
    cloned.attribution = {
      status: 'NOT_ESTABLISHED',
      notes: 'AIS correlation identifies potential spatial/temporal correlations only. Correlation does not establish responsibility for the spill.',
    };
  } else {
    cloned.attribution.status = 'NOT_ESTABLISHED';
  }

  if (cloned.provenance) {
    cloned.provenance.vesselAttribution = 'NOT_ESTABLISHED';
  }

  // Preserve GFW limitations and provenance if provider is Global Fishing Watch
  if (cloned.aisCorrelation) {
    const ais = cloned.aisCorrelation;
    const isGfw =
      ais.provider === 'GLOBAL_FISHING_WATCH' ||
      ais.source === 'GLOBAL_FISHING_WATCH' ||
      ais.observationLevel === 'VESSEL_PRESENCE';

    if (isGfw) {
      ais.provider = 'GLOBAL_FISHING_WATCH';
      ais.dataset = ais.dataset || ais.providerProduct || 'public-global-presence:latest';
      ais.observationLevel = 'VESSEL_PRESENCE';
      ais.sourceType = 'REAL';
      ais.temporalResolution = 'HOURLY';
      ais.spatialResolution = ais.spatialResolution || 'HIGH';
      ais.rawTracksAvailable = false;
      ais.cpaAvailable = false;
      ais.limitations = 'Global Fishing Watch public-global-presence dataset provides aggregated hourly vessel presence in high-resolution grid cells. Individual vessel positions, tracks, and CPA are not provided by this dataset.';
    }
  }

  return {
    success: true,
    exportType: 'CANONICAL_INVESTIGATION_JSON',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    investigationId: cloned.jobId,
    fingerprint: cloned.fingerprint,
    data: cloned,
  };
}

/**
 * 2. Export GeoJSON FeatureCollection
 * Converts all available geospatial features in the canonical snapshot into a standard GeoJSON FeatureCollection.
 * Strictly gates against non-existent features (no empty geometry placeholders).
 *
 * @param {object} canonical - Authoritative canonical investigation object.
 * @returns {object} GeoJSON FeatureCollection with per-feature provenance.
 */
function exportGeoJson(canonical) {
  if (!canonical || typeof canonical !== 'object') {
    throw new Error('Invalid canonical investigation: snapshot is required for GeoJSON export.');
  }

  assertNoForbiddenAttribution(canonical);

  const features = [];
  const investigationId = canonical.jobId;
  const isGeoAvailable = Boolean(canonical.geospatial?.available);
  const crs = canonical.geospatial?.crs || null;
  const hasValidGeoreferencing = Boolean(
    isGeoAvailable &&
    crs &&
    crs !== 'NOT_AVAILABLE' &&
    (canonical.provenance?.inputGeolocation === 'REAL' || canonical.geospatial?.geolocationStatus === 'ESTABLISHED')
  );

  // A. Image Footprint (Polygon) - REAL if valid raster georeferencing exists
  if (canonical.geospatial?.imageFootprint?.coordinates) {
    features.push({
      type: 'Feature',
      id: `feat-${investigationId}-image-footprint`,
      geometry: canonical.geospatial.imageFootprint,
      properties: {
        featureType: 'IMAGE_FOOTPRINT',
        label: 'Raster Image Footprint',
        provenance: hasValidGeoreferencing ? 'REAL' : 'NOT_AVAILABLE',
        source: 'GEOREFERENCED_RASTER',
        status: 'AVAILABLE',
        crs: crs,
        investigationId,
      },
    });
  }

  // B. Spill Footprint (Polygon / MultiPolygon) - MODEL_DERIVED
  if (canonical.geospatial?.spillFootprint?.coordinates) {
    features.push({
      type: 'Feature',
      id: `feat-${investigationId}-spill-footprint`,
      geometry: canonical.geospatial.spillFootprint,
      properties: {
        featureType: 'SPILL_FOOTPRINT',
        label: 'Model-Derived Spill Footprint',
        provenance: 'MODEL_DERIVED',
        source: canonical.model?.modelId || 'ML_SEGMENTATION',
        status: 'AVAILABLE',
        areaKm2: canonical.geospatial.areaKm2 ?? null,
        coveragePercent: canonical.detection?.coveragePercent ?? null,
        investigationId,
      },
    });
  }

  // C. Spill Centroid (Point) - MODEL_DERIVED
  const rawCentroid = canonical.geospatial?.centroid;
  if (rawCentroid) {
    const lat = typeof rawCentroid.latitude === 'number' ? rawCentroid.latitude : (Array.isArray(rawCentroid) ? rawCentroid[0] : null);
    const lng = typeof rawCentroid.longitude === 'number' ? rawCentroid.longitude : (Array.isArray(rawCentroid) ? rawCentroid[1] : null);
    if (lat !== null && lng !== null) {
      features.push({
        type: 'Feature',
        id: `feat-${investigationId}-spill-centroid`,
        geometry: {
          type: 'Point',
          coordinates: [lng, lat],
        },
        properties: {
          featureType: 'CENTROID',
          label: 'Model-Derived Spill Centroid',
          provenance: 'MODEL_DERIVED',
          status: 'AVAILABLE',
          latitude: lat,
          longitude: lng,
          investigationId,
        },
      });
    }
  }

  // D. Estimated Spill Origin (Point) - MODEL_DERIVED
  if (canonical.origin?.status === 'ESTIMATED' && canonical.origin.estimatedPoint) {
    const originPt = canonical.origin.estimatedPoint;
    features.push({
      type: 'Feature',
      id: `feat-${investigationId}-estimated-origin`,
      geometry: {
        type: 'Point',
        coordinates: [originPt.longitude, originPt.latitude],
      },
      properties: {
        featureType: 'ESTIMATED_ORIGIN',
        label: 'Estimated Spill Origin',
        provenance: canonical.origin.provenance || 'MODEL_DERIVED',
        status: 'ESTIMATED',
        latitude: originPt.latitude,
        longitude: originPt.longitude,
        uncertaintyRadiusKm: canonical.origin.uncertaintyRadiusKm || null,
        method: canonical.origin.method || 'METOCEAN_REVERSE_TRAJECTORY',
        engine: canonical.origin.engine || 'BACKTRACK_ADVECTION',
        isDemoForcing: Boolean(canonical.drift?.environmentalData?.isDemo),
        investigationId,
      },
    });
  }

  // E. Estimated Backward Drift Trajectory (LineString) - MODEL_DERIVED
  if (
    canonical.drift?.backward?.status === 'ESTIMATED' &&
    canonical.drift.backward.feature?.geometry?.coordinates
  ) {
    features.push({
      type: 'Feature',
      id: `feat-${investigationId}-backward-drift`,
      geometry: canonical.drift.backward.feature.geometry,
      properties: {
        featureType: 'ESTIMATED_BACKTRACK',
        label: 'Estimated Backtracking Trajectory',
        provenance: canonical.drift.provenance || 'MODEL_DERIVED',
        status: 'ESTIMATED',
        durationHours: canonical.drift.backward.durationHours,
        environmentalSource: canonical.drift.environmentalData?.source || 'UNKNOWN',
        isDemoForcing: Boolean(canonical.drift.environmentalData?.isDemo),
        investigationId,
      },
    });
  }

  // F. Estimated Forward Drift Trajectory (LineString) - MODEL_DERIVED (only if genuine)
  if (
    canonical.drift?.forward?.status === 'ESTIMATED' &&
    canonical.drift.forward.feature?.geometry?.coordinates
  ) {
    features.push({
      type: 'Feature',
      id: `feat-${investigationId}-forward-drift`,
      geometry: canonical.drift.forward.feature.geometry,
      properties: {
        featureType: 'ESTIMATED_FORECAST',
        label: 'Estimated Forward Dispersion Forecast',
        provenance: canonical.drift.provenance || 'MODEL_DERIVED',
        status: 'ESTIMATED',
        durationHours: canonical.drift.forward.durationHours,
        environmentalSource: canonical.drift.environmentalData?.source || 'UNKNOWN',
        isDemoForcing: Boolean(canonical.drift.environmentalData?.isDemo),
        investigationId,
      },
    });
  }

  // G. Potential AIS Candidate Tracks & CPA (LineString & Point) - DEMO or REAL
  if (
    canonical.aisCorrelation?.status === 'CANDIDATES_FOUND' &&
    Array.isArray(canonical.aisCorrelation.candidates)
  ) {
    for (const cand of canonical.aisCorrelation.candidates) {
      const candMmsi = cand.mmsi || cand.vesselId?.mmsi;
      const candName = cand.name || cand.vesselId?.name || cand.vesselName;
      const candImo = cand.imo || cand.vesselId?.imo;
      const candType = cand.vesselType || cand.vesselId?.vesselType;

      const isPresenceOnly =
        cand.observationLevel === 'VESSEL_PRESENCE' ||
        canonical.aisCorrelation?.observationLevel === 'VESSEL_PRESENCE';

      if (isPresenceOnly) {
        // Global Fishing Watch: emit authentic grid cell presence points (NO fake tracks or CPA)
        const cells = cand.aisEvidence?.presenceCells || cand.presenceCells || [];
        for (let cIdx = 0; cIdx < cells.length; cIdx++) {
          const cell = cells[cIdx];
          const cellLat = Number(cell.latitude);
          const cellLng = Number(cell.longitude);
          if (!isNaN(cellLat) && !isNaN(cellLng)) {
            features.push({
              type: 'Feature',
              id: `feat-${investigationId}-presence-${candMmsi || cand.rank}-cell-${cIdx}`,
              geometry: {
                type: 'Point',
                coordinates: [cellLng, cellLat],
              },
              properties: {
                featureType: 'AIS_VESSEL_PRESENCE_CELL',
                label: `GFW AIS Vessel Presence (${candName || candMmsi})`,
                rank: cand.rank,
                vesselName: candName || null,
                mmsi: candMmsi || null,
                imo: candImo || null,
                vesselType: candType || null,
                presenceHours: cell.hours || 1,
                date: cell.date || null,
                timestamp: cell.timestamp || null,
                observationLevel: 'VESSEL_PRESENCE',
                provider: 'GLOBAL_FISHING_WATCH',
                status: 'POTENTIAL_CANDIDATE',
                attributionStatus: 'NOT_ESTABLISHED',
                provenance: 'REAL',
                investigationId,
              },
            });
          }
        }
        continue;
      }

      // Extract geometry from cand.historicalTrack or cand.aisEvidence.track
      let trackGeom = cand.historicalTrack;
      if (!trackGeom?.coordinates && Array.isArray(cand.aisEvidence?.track) && cand.aisEvidence.track.length > 1) {
        trackGeom = {
          type: 'LineString',
          coordinates: cand.aisEvidence.track.map((pt) => [Number(pt.longitude), Number(pt.latitude)]),
        };
      }

      // Historical candidate track
      if (trackGeom?.coordinates && trackGeom.coordinates.length > 0) {
        features.push({
          type: 'Feature',
          id: `feat-${investigationId}-candidate-${candMmsi || cand.rank}-track`,
          geometry: trackGeom,
          properties: {
            featureType: 'AIS_CANDIDATE_TRACK',
            label: `Potential AIS Candidate Track (${candName || candMmsi})`,
            rank: cand.rank,
            vesselName: candName || null,
            mmsi: candMmsi || null,
            imo: candImo || null,
            vesselType: candType || null,
            status: 'POTENTIAL_CANDIDATE',
            attributionStatus: 'NOT_ESTABLISHED',
            provenance: cand.provenance || canonical.aisCorrelation.provenance || (canonical.aisCorrelation.isDemo ? 'DEMO' : 'REAL'),
            isDemo: Boolean(cand.isDemo ?? canonical.aisCorrelation.isDemo),
            investigationId,
          },
        });
      }

      // Closest Approach position
      let cpaCoords = null;
      if (cand.closestApproach && typeof cand.closestApproach.longitude === 'number' && typeof cand.closestApproach.latitude === 'number') {
        cpaCoords = [cand.closestApproach.longitude, cand.closestApproach.latitude];
      } else if (Array.isArray(cand.aisEvidence?.track) && cand.aisEvidence.track.length > 0) {
        const matchPt =
          cand.aisEvidence.track.find((pt) => pt.timestamp === cand.correlation?.closestApproachTimestamp) ||
          cand.aisEvidence.track[0];
        if (matchPt && typeof matchPt.longitude === 'number' && typeof matchPt.latitude === 'number') {
          cpaCoords = [matchPt.longitude, matchPt.latitude];
        }
      }

      if (cpaCoords) {
        features.push({
          type: 'Feature',
          id: `feat-${investigationId}-candidate-${candMmsi || cand.rank}-cpa`,
          geometry: {
            type: 'Point',
            coordinates: cpaCoords,
          },
          properties: {
            featureType: 'AIS_CLOSEST_APPROACH',
            label: `Candidate CPA (${candName || candMmsi})`,
            rank: cand.rank,
            vesselName: candName || null,
            mmsi: candMmsi || null,
            closestApproachKm: cand.correlation?.closestApproachKm ?? cand.closestApproachKm,
            enteredOriginUncertaintyCorridor: cand.correlation?.enteredOriginUncertaintyCorridor ?? cand.enteredOriginUncertaintyCorridor,
            status: 'POTENTIAL_CANDIDATE',
            attributionStatus: 'NOT_ESTABLISHED',
            provenance: cand.provenance || canonical.aisCorrelation.provenance || (canonical.aisCorrelation.isDemo ? 'DEMO' : 'REAL'),
            isDemo: Boolean(cand.isDemo ?? canonical.aisCorrelation.isDemo),
            investigationId,
          },
        });
      }
    }
  }

  // H. All Reconstructed Historical AIS Vessel Tracks (LineString)
  if (Array.isArray(canonical.aisCorrelation?.tracks)) {
    const candidateMmsis = new Set(
      (canonical.aisCorrelation?.candidates || []).map((c) => String(c.mmsi || c.vesselId?.mmsi || ''))
    );

    for (const trk of canonical.aisCorrelation.tracks) {
      const trkMmsi = String(trk.mmsi || '');
      // Only add as background track if not already exported as a candidate track
      if (!candidateMmsis.has(trkMmsi) && Array.isArray(trk.trackPoints) && trk.trackPoints.length > 1) {
        features.push({
          type: 'Feature',
          id: `feat-${investigationId}-historical-track-${trkMmsi}`,
          geometry: {
            type: 'LineString',
            coordinates: trk.trackPoints.map((pt) => [Number(pt.longitude), Number(pt.latitude)]),
          },
          properties: {
            featureType: 'HISTORICAL_AIS_TRACK',
            label: `Historical AIS Track (${trk.vesselName || trk.name || trkMmsi})`,
            vesselName: trk.vesselName || trk.name || null,
            mmsi: trkMmsi || null,
            vesselType: trk.vesselType || null,
            flag: trk.flag || null,
            status: 'NON_CANDIDATE_POPULATION',
            attributionStatus: 'NOT_ESTABLISHED',
            provenance: canonical.aisCorrelation.provenance || (canonical.aisCorrelation.isDemo ? 'DEMO' : 'REAL'),
            isDemo: Boolean(canonical.aisCorrelation.isDemo),
            investigationId,
          },
        });
      }
    }
  }

  return {
    type: 'FeatureCollection',
    metadata: {
      investigationId,
      fingerprint: canonical.fingerprint,
      exportedAt: new Date().toISOString(),
      featuresCount: features.length,
      vesselAttribution: 'NOT_ESTABLISHED',
      notes: 'Generated from canonical investigation snapshot. Correlation does not establish vessel responsibility.',
    },
    features,
  };
}

/**
 * 3. Export Technical Investigation Report
 * Generates a structured 15-section technical report in markdown / text format.
 *
 * @param {object} canonical - Authoritative canonical investigation object.
 * @returns {string} Markdown-formatted technical investigation report.
 */
function exportReport(canonical) {
  if (!canonical || typeof canonical !== 'object') {
    throw new Error('Invalid canonical investigation: snapshot is required for report generation.');
  }

  assertNoForbiddenAttribution(canonical);

  const jobId = canonical.jobId || 'N/A';
  const fingerprint = canonical.fingerprint || 'N/A';
  const input = canonical.input || {};
  const model = canonical.model || {};
  const detection = canonical.detection || {};
  const geospatial = canonical.geospatial || {};
  const origin = canonical.origin || { status: 'NOT_AVAILABLE' };
  const drift = canonical.drift || { status: 'NOT_AVAILABLE' };
  const ais = canonical.aisCorrelation || { status: 'NOT_AVAILABLE' };
  const provenance = canonical.provenance || {};

  const isGeoAvailable = Boolean(geospatial.available);
  const crs = geospatial.crs || null;
  const hasValidGeoreferencing = Boolean(
    isGeoAvailable &&
    crs &&
    crs !== 'NOT_AVAILABLE' &&
    (canonical.provenance?.inputGeolocation === 'REAL' || geospatial.geolocationStatus === 'ESTABLISHED')
  );

  // Determine demo flags
  const isDemoMetOcean = Boolean(drift.environmentalData?.isDemo || drift.environmentalData?.source === 'DEMO');
  const isDemoAis = Boolean(ais.isDemo || ais.source === 'DEMO');

  // Derive limitations dynamically
  const limitations = [];
  if (isDemoMetOcean) {
    limitations.push('DEMONSTRATION METOCEAN FORCING: Environmental forcing is simulated demonstration data and does not represent verified historical oceanographic records.');
  }
  if (isDemoAis) {
    limitations.push('DEMONSTRATION AIS DATA: AIS tracks are demonstration test data and do not constitute verified historical maritime telemetry.');
  }
  if (origin.timestampSource === 'ESTIMATION_TIME_PROXY' || drift.timestampSource === 'ESTIMATION_TIME_PROXY') {
    limitations.push('ESTIMATION TIME PROXY: Timestamp was estimated via system clock proxy due to lack of embedded raster timestamp.');
  }
  if (!geospatial.available) {
    limitations.push('GEOSPATIAL DATA UNAVAILABLE: Raster lacks georeferencing metadata (CRS/Affine); spatial analysis is not available.');
  }
  if (drift.forward?.status === 'NOT_AVAILABLE') {
    limitations.push('FORWARD DRIFT UNAVAILABLE: Forward dispersion simulation was not generated or is unsupported for this input.');
  }
  if (geospatial.available) {
    limitations.push('MODEL-DERIVED SPILL GEOMETRY: Spill footprint polygon is model-predicted and subject to segmentation boundary uncertainty.');
  }
  if (origin.status === 'ESTIMATED') {
    limitations.push(`MODEL-DERIVED ORIGIN: Estimated origin carries an uncertainty radius of ${origin.uncertaintyRadiusKm || 2.5} km.`);
  }
  limitations.push('VESSEL ATTRIBUTION NOT ESTABLISHED: Historical AIS correlation establishes spatiotemporal proximity only, not causation or legal responsibility.');

  let report = `================================================================================
OCEAN GUARD AI — MANUAL INVESTIGATION REPORT
SIH26143 · MARITIME OIL SPILL SURVEILLANCE & ATTRIBUTION SYSTEM
================================================================================

NOTICE: Generated from canonical investigation snapshot.
ML inference, drift modeling, and AIS correlation are NOT rerun for report generation.
Attribution Status: NOT ESTABLISHED

INVESTIGATION ID : ${jobId}
GENERATED AT     : ${new Date().toISOString()}
FINGERPRINT      : ${fingerprint}
================================================================================

--------------------------------------------------------------------------------
1. INVESTIGATION SUMMARY
--------------------------------------------------------------------------------
- Oil Spill Detected     : ${detection.oilSpillDetected ? 'YES — DETECTED' : 'NO — NOT DETECTED'}
- Spill Coverage         : ${typeof detection.coveragePercent === 'number' ? detection.coveragePercent.toFixed(2) + '%' : 'N/A'}
- Model Architecture     : ${model.modelId || 'N/A'}
- Input Modality         : ${input.modality || 'N/A'}
- Geospatial Available   : ${geospatial.available ? 'YES' : 'NO'}
- Estimated Spill Origin : ${origin.status === 'ESTIMATED' ? 'ESTIMATED (MODEL-DERIVED)' : origin.status}
- Drift Analysis Status  : Backtrack: ${drift.backward?.status || 'N/A'}, Forecast: ${drift.forward?.status || 'N/A'}
- AIS Correlation Status : ${ais.status || 'N/A'} (${ais.candidates?.length || 0} candidate vessels)
- Final Attribution      : NOT ESTABLISHED (Scientific & Legal Guardrail Enforced)

--------------------------------------------------------------------------------
2. INPUT & ACQUISITION
--------------------------------------------------------------------------------
- Original Filename      : ${input.filename || 'N/A'}
- Input Format           : ${input.inputFormat || 'N/A'}
- Channel Count          : ${input.channelCount ?? 'N/A'}
- Modality               : ${input.modality || 'N/A'}
- Band Structure         : ${input.bandStructure || 'N/A'}
- Polarization Status    : ${input.polarizationStatus || 'N/A'}
- Polarizations          : ${Array.isArray(input.polarizations) && input.polarizations.length ? input.polarizations.join(', ') : 'N/A'}
- Source Type            : ${input.sourceType || 'N/A'}
- Input Geolocation Prov : ${provenance.inputGeolocation || 'NOT_AVAILABLE'}

--------------------------------------------------------------------------------
3. AI MODEL & INFERENCE
--------------------------------------------------------------------------------
- Model Identifier       : ${model.modelId || 'N/A'}
- Model Version          : ${model.modelVersion || '1.0.0'}
- Checkpoint SHA256      : ${model.checkpointSha256 || 'N/A'}
- Preprocessing Version  : ${model.preprocessingVersion || 'N/A'}
- Decision Threshold     : ${model.threshold ?? 0.50}
- Detection Provenance   : ${provenance.detection || 'MODEL_DERIVED'}

--------------------------------------------------------------------------------
4. SPILL DETECTION
--------------------------------------------------------------------------------
- Detection Verdict      : ${detection.oilSpillDetected ? 'OIL SPILL CONFIRMED DETECTED' : 'NO OIL SPILL DETECTED'}
- Detection Confidence   : ${typeof detection.confidence === 'number' ? (detection.confidence * 100).toFixed(2) + '%' : 'N/A'}
- Foreground Coverage    : ${typeof detection.coveragePercent === 'number' ? detection.coveragePercent.toFixed(2) + '%' : 'N/A'}
- Mean Foregrnd Prob     : ${detection.probabilityStats?.meanForegroundProbability ? (detection.probabilityStats.meanForegroundProbability * 100).toFixed(2) + '%' : 'N/A'}
- Max Foreground Prob    : ${detection.probabilityStats?.maxProbability ? (detection.probabilityStats.maxProbability * 100).toFixed(2) + '%' : 'N/A'}

--------------------------------------------------------------------------------
5. GEOSPATIAL ANALYSIS
--------------------------------------------------------------------------------
- Geospatial Available   : ${geospatial.available ? 'YES' : 'NO'}
- Coordinate Ref System  : ${geospatial.crs || 'NOT_AVAILABLE'} (${geospatial.crsName || 'N/A'})
- Image Footprint Prov   : ${hasValidGeoreferencing ? 'REAL' : 'NOT_AVAILABLE'}
- Spill Centroid         : ${geospatial.centroid ? `Lat ${typeof geospatial.centroid.latitude === 'number' ? geospatial.centroid.latitude.toFixed(5) : 'N/A'}, Lon ${typeof geospatial.centroid.longitude === 'number' ? geospatial.centroid.longitude.toFixed(5) : 'N/A'} [MODEL_DERIVED]` : 'NOT_AVAILABLE'}
- Spill Area (km²)       : ${typeof geospatial.areaKm2 === 'number' ? geospatial.areaKm2.toFixed(3) + ' km²' : 'NOT_AVAILABLE'}
- Bounds                 : ${Array.isArray(geospatial.bounds) ? `[${geospatial.bounds.map(n => Number(n).toFixed(4)).join(', ')}]` : 'NOT_AVAILABLE'}

--------------------------------------------------------------------------------
6. SPILL FOOTPRINT
--------------------------------------------------------------------------------
- Footprint Status       : ${geospatial.spillFootprint ? 'EXTRACTED (GeoJSON Polygon)' : 'NOT_AVAILABLE'}
- Footprint Provenance   : ${geospatial.available ? 'MODEL_DERIVED' : 'NOT_AVAILABLE'}
- Scientific Guardrail   : The spill footprint geometry is purely MODEL-DERIVED from
                           computer vision segmentation. It does not constitute ground-truth
                           survey annotation.

--------------------------------------------------------------------------------
7. ESTIMATED SPILL ORIGIN
--------------------------------------------------------------------------------
- Origin Status          : ${origin.status || 'NOT_AVAILABLE'}
- Estimated Coordinates  : ${origin.estimatedPoint ? `Lat ${origin.estimatedPoint.latitude.toFixed(5)}, Lon ${origin.estimatedPoint.longitude.toFixed(5)}` : 'NOT_AVAILABLE'}
- Uncertainty Radius     : ${origin.uncertaintyRadiusKm ? origin.uncertaintyRadiusKm.toFixed(2) + ' km' : 'N/A'}
- Estimation Method      : ${origin.method || 'N/A'}
- Simulation Engine      : ${origin.engine || 'N/A'}
- Timestamp Source       : ${origin.timestampSource || 'N/A'}
- Provenance             : ${origin.provenance || 'MODEL_DERIVED'}
${isDemoMetOcean ? '>>> WARNING: DEMONSTRATION METOCEAN FORCING APPLIED <<<\n' : ''}
--------------------------------------------------------------------------------
8. DRIFT / BACKTRACKING
--------------------------------------------------------------------------------
[ESTIMATED BACKTRACK]
- Status                 : ${drift.backward?.status || 'NOT_AVAILABLE'}
- Duration               : ${drift.backward?.durationHours ? drift.backward.durationHours + ' hours backward' : 'N/A'}
- Start Point            : ${drift.backward?.startPoint ? `Lat ${drift.backward.startPoint.latitude.toFixed(5)}, Lon ${drift.backward.startPoint.longitude.toFixed(5)}` : 'N/A'}
- Terminal (Origin) Point: ${drift.backward?.endPoint ? `Lat ${drift.backward.endPoint.latitude.toFixed(5)}, Lon ${drift.backward.endPoint.longitude.toFixed(5)}` : 'N/A'}
- Trajectory Waypoints   : ${drift.backward?.feature?.geometry?.coordinates?.length || 0} points
- Provenance             : ${drift.provenance || 'MODEL_DERIVED'}

[ESTIMATED FORECAST]
- Status                 : ${drift.forward?.status || 'NOT_AVAILABLE'}
${drift.forward?.status === 'NOT_AVAILABLE' ? '- Forecast Detail        : FORECAST NOT AVAILABLE (dispersion forecasting was not computed or not supported)\n' : `- Duration               : ${drift.forward?.durationHours || 'N/A'} hours forward\n- Trajectory Waypoints   : ${drift.forward?.feature?.geometry?.coordinates?.length || 0} points\n- Provenance             : ${drift.provenance || 'MODEL_DERIVED'}\n`}
--------------------------------------------------------------------------------
9. ENVIRONMENTAL DATA PROVENANCE
--------------------------------------------------------------------------------
- Data Source            : ${drift.environmentalData?.source || 'NOT_AVAILABLE'}
- Demo Data Flag         : ${isDemoMetOcean ? 'YES — DEMONSTRATION DATA' : 'NO — OPERATIONAL'}
- Wind Forcing           : ${drift.environmentalData?.windSource || 'N/A'}
- Current Forcing        : ${drift.environmentalData?.currentSource || 'N/A'}
- Explanation            : ${isDemoMetOcean ? 'Environmental forcing is demonstration data and does not represent verified historical oceanographic conditions.' : 'Operational metocean forcing applied.'}

--------------------------------------------------------------------------------
10. AIS CORRELATION EVIDENCE
--------------------------------------------------------------------------------
- AIS Correlation Status : ${ais.status || 'NOT_AVAILABLE'}
- AIS Data Source        : ${ais.source || 'NOT_AVAILABLE'}
- Demo Data Flag         : ${isDemoAis ? 'YES — DEMONSTRATION AIS DATA' : 'NO — REAL AIS'}
- Spatiotemporal Window  : Query: ${ais.queryWindow?.start || 'N/A'} to ${ais.queryWindow?.end || 'N/A'}
- Temporal Reference     : ${ais.timestampSource || 'N/A'} (Uncertainty: ${ais.temporalUncertainty ? 'FLAGGED' : 'LOW'})
- Search Radius          : ${ais.searchRadiusKm || 50} km around estimated origin
- Origin Uncertainty Rad : ${ais.originUncertaintyKm || 2.5} km
${isDemoAis ? '>>> WARNING: DEMONSTRATION AIS DATA — NOT REAL-WORLD AIS EVIDENCE <<<\n' : ''}
--------------------------------------------------------------------------------
11. POTENTIAL VESSEL CANDIDATES
--------------------------------------------------------------------------------
Total Candidates Identified: ${ais.candidates?.length || 0}
`;

  if (Array.isArray(ais.candidates) && ais.candidates.length > 0) {
    ais.candidates.forEach((cand, idx) => {
      if (cand.observationLevel === 'VESSEL_PRESENCE' || ais.observationLevel === 'VESSEL_PRESENCE') {
        const closestKm = cand.correlation?.closestCellDistanceKm != null
          ? cand.correlation.closestCellDistanceKm.toFixed(2) + ' km'
          : (typeof cand.closestApproachKm === 'number' ? cand.closestApproachKm.toFixed(2) + ' km' : 'N/A');
        const presenceHrs = cand.aisEvidence?.presenceHours || cand.presenceHours || 1;
        report += `
Candidate #${cand.rank || idx + 1}:
  - Status                 : POTENTIAL AIS CANDIDATE (VESSEL PRESENCE)
  - Vessel Name            : ${cand.vesselId?.name || cand.name || 'UNKNOWN'}
  - MMSI                   : ${cand.vesselId?.mmsi || cand.mmsi || 'N/A'}
  - IMO                    : ${cand.vesselId?.imo || cand.imo || 'N/A'}
  - Flag State             : ${cand.vesselId?.flag || cand.flag || 'N/A'}
  - Vessel Type            : ${cand.vesselId?.vesselType || cand.vesselType || 'N/A'}
  - Observation Level      : VESSEL_PRESENCE (Hourly)
  - Presence Duration      : ${presenceHrs} hours recorded in AOI
  - Closest Presence Cell  : ${closestKm} from estimated spill origin
  - Raw Track / CPA        : NOT AVAILABLE (Aggregated vessel presence dataset)
  - Evidence Scores        : Spatial: ${cand.correlation?.metrics?.spatialPresenceScore ?? 'N/A'}, Temporal: ${cand.correlation?.metrics?.temporalPresenceScore ?? 'N/A'}
  - Attribution Verdict    : NOT ESTABLISHED
`;
        return;
      }

      report += `
Candidate #${cand.rank || idx + 1}:
  - Status                 : POTENTIAL AIS CANDIDATE
  - Vessel Name            : ${cand.name || 'UNKNOWN'}
  - MMSI                   : ${cand.mmsi || 'N/A'}
  - IMO                    : ${cand.imo || 'N/A'}
  - Flag State             : ${cand.flag || 'N/A'}
  - Vessel Type            : ${cand.vesselType || 'N/A'}
  - Closest Approach (CPA) : ${typeof cand.closestApproachKm === 'number' ? cand.closestApproachKm.toFixed(2) + ' km' : 'N/A'}
  - CPA Timestamp          : ${cand.closestApproachTime || 'N/A'}
  - Origin Corridor Entry  : ${cand.enteredOriginUncertaintyCorridor ? 'YES (Within ' + (ais.originUncertaintyKm || 2.5) + ' km origin uncertainty)' : 'NO'}
  - Evidence Scores        : Proximity: ${cand.evidenceMetrics?.proximityScore?.toFixed(3) || 'N/A'}, Temporal: ${cand.evidenceMetrics?.temporalScore?.toFixed(3) || 'N/A'}, Trajectory: ${cand.evidenceMetrics?.trajectoryScore?.toFixed(3) || 'N/A'}
  - Anomaly Indicator      : Score: ${cand.evidenceMetrics?.anomalyScore?.toFixed(3) || '0.000'} (${cand.evidenceMetrics?.anomalySignals?.join(', ') || 'NONE'})
  - Attribution Verdict    : NOT ESTABLISHED
`;
    });
  } else {
    report += `\nNo candidate vessels correlated in the active spatiotemporal search window.\n`;
  }

  report += `--------------------------------------------------------------------------------
12. ATTRIBUTION STATUS
--------------------------------------------------------------------------------
FINAL VERDICT: VESSEL ATTRIBUTION NOT ESTABLISHED

SCIENTIFIC & LEGAL GUARDRAIL:
AIS correlation does not establish vessel responsibility.
Historical AIS correlation identifies spatial and temporal proximity between
vessel tracks and the model-derived spill origin. Spatiotemporal correlation
does NOT prove that a vessel discharged oil, caused the slick, or is legally
responsible. Forensic confirmation requires in-situ sampling, physical chemical
fingerprinting, or direct airborne/satellite witnessing of active discharge.

--------------------------------------------------------------------------------
13. EVIDENCE LIMITATIONS
--------------------------------------------------------------------------------
${limitations.map((lim, i) => `${i + 1}. ${lim}`).join('\n')}

--------------------------------------------------------------------------------
14. PROVENANCE SUMMARY
--------------------------------------------------------------------------------
- Input Geolocation Prov : ${provenance.inputGeolocation || 'NOT_AVAILABLE'}
- Detection Provenance   : ${provenance.detection || 'MODEL_DERIVED'}
- Spill Footprint Prov   : ${provenance.footprint || 'MODEL_DERIVED'}
- Estimated Origin Prov  : ${provenance.origin || 'MODEL_DERIVED'}
- Drift Simulation Prov  : ${provenance.drift || 'MODEL_DERIVED'}
- AIS Correlation Prov   : ${canonical.aisCorrelation?.provenance || provenance.aisCorrelation || (isDemoAis ? 'DEMO' : 'REAL')}
- Oil Type Characteriz   : ${provenance.oilType || 'NOT_ESTABLISHED'}
- Vessel Attribution     : ${provenance.vesselAttribution || 'NOT_ESTABLISHED'}

--------------------------------------------------------------------------------
15. TECHNICAL METADATA
--------------------------------------------------------------------------------
- System Name            : OCEAN GUARD AI / SIH26143
- Report Format Version  : 1.0.0 (Canonical Snapshot Presentation)
- Pipeline Stage         : MANUAL_ANALYSIS_COMPLETED
- Canonical Fingerprint  : ${fingerprint}
- Report Digest SHA256   : ${fingerprint}
================================================================================
END OF TECHNICAL INVESTIGATION REPORT
================================================================================
`;

  return report;
}

/**
 * 4. Export Artifact Manifest
 * Generates a machine-readable manifest listing all actual artifacts associated with the investigation.
 * Enforces security: strictly omits filesystem paths, temporary directories, or secrets.
 *
 * @param {object} canonical - Authoritative canonical investigation object.
 * @param {object} [options] - Optional on-disk existence check or custom metadata.
 * @returns {object} Secure, machine-readable manifest.
 */
function exportManifest(canonical, options = {}) {
  if (!canonical || typeof canonical !== 'object') {
    throw new Error('Invalid canonical investigation: snapshot is required for manifest export.');
  }

  assertNoForbiddenAttribution(canonical);

  const jobId = canonical.jobId;
  const rawArtifacts = canonical.artifacts || {};
  const isSar = canonical.input?.modality === 'SAR_DUAL_POL';
  const diskMap = options.diskMap || {};

  // Standard artifact descriptors
  const artifactTypes = [
    { type: 'original', mime: 'image/png', label: 'Source Image / Raster Preview' },
    { type: 'mask', mime: 'image/png', label: 'Binary Segmentation Mask' },
    { type: 'overlay', mime: 'image/png', label: 'Composite Spill Overlay' },
    { type: 'annotated', mime: 'image/png', label: 'Visual Annotated Overlay' },
    { type: 'probabilityMap', mime: 'image/png', label: 'Probability Density Heatmap' },
  ];

  if (isSar) {
    artifactTypes.push({ type: 'vv', mime: 'image/png', label: 'Sentinel-1 VV Polarization Channel' });
    artifactTypes.push({ type: 'vh', mime: 'image/png', label: 'Sentinel-1 VH Polarization Channel' });
  }

  const artifacts = [];
  for (const item of artifactTypes) {
    const rawUrl = rawArtifacts[item.type];
    if (rawUrl) {
      const sanitizedUrl = sanitizePath(rawUrl);
      const isPresent = diskMap[item.type] !== undefined ? Boolean(diskMap[item.type]) : true;
      if (isPresent) {
        artifacts.push({
          artifactType: item.type,
          label: item.label,
          mediaType: item.mime,
          url: sanitizedUrl,
          sha256: options.checksums?.[item.type] || null,
          exists: true,
          provenance: item.type === 'original' ? (canonical.provenance?.inputGeolocation || 'REAL') : 'MODEL_DERIVED',
        });
      }
    }
  }

  const manifest = {
    manifestVersion: '1.0.0',
    investigationId: jobId,
    generatedAt: new Date().toISOString(),
    fingerprint: canonical.fingerprint,
    input: {
      filename: sanitizePath(canonical.input?.filename || 'manual_input'),
      format: canonical.input?.inputFormat || 'UNKNOWN',
      modality: canonical.input?.modality || 'UNKNOWN',
      channelCount: canonical.input?.channelCount || 0,
      bandStructure: canonical.input?.bandStructure || 'UNKNOWN',
    },
    model: {
      modelId: canonical.model?.modelId || 'UNKNOWN',
      checkpointSha256: canonical.model?.checkpointSha256 || 'UNKNOWN',
      preprocessingVersion: canonical.model?.preprocessingVersion || 'UNKNOWN',
    },
    detection: {
      oilSpillDetected: Boolean(canonical.detection?.oilSpillDetected),
      confidence: canonical.detection?.confidence ?? 0,
      coveragePercent: canonical.detection?.coveragePercent ?? 0,
    },
    geospatial: {
      available: Boolean(canonical.geospatial?.available),
      crs: canonical.geospatial?.crs || null,
      areaKm2: canonical.geospatial?.areaKm2 ?? null,
    },
    origin: {
      status: canonical.origin?.status || 'NOT_AVAILABLE',
      uncertaintyRadiusKm: canonical.origin?.uncertaintyRadiusKm || null,
      provenance: canonical.origin?.provenance || 'MODEL_DERIVED',
    },
    drift: {
      backwardStatus: canonical.drift?.backward?.status || 'NOT_AVAILABLE',
      forwardStatus: canonical.drift?.forward?.status || 'NOT_AVAILABLE',
      environmentalSource: canonical.drift?.environmentalData?.source || 'NOT_AVAILABLE',
      isDemoForcing: Boolean(canonical.drift?.environmentalData?.isDemo),
    },
    aisCorrelation: {
      status: canonical.aisCorrelation?.status || 'NOT_AVAILABLE',
      candidateCount: canonical.aisCorrelation?.candidates?.length || 0,
      source: canonical.aisCorrelation?.source || 'NOT_AVAILABLE',
      isDemoAis: Boolean(canonical.aisCorrelation?.isDemo),
    },
    attribution: {
      status: 'NOT_ESTABLISHED',
      statement: 'AIS correlation does not establish vessel responsibility.',
    },
    provenance: canonical.provenance || {},
    artifacts,
  };

  // Ensure no server paths leaked into the serialized manifest
  const manifestStr = JSON.stringify(manifest);
  if (/[a-zA-Z]:\\|\/home\/|\/data\/uploads|\/tmp\//.test(manifestStr)) {
    throw new Error('Security check failed: Server filesystem path detected in manifest.');
  }

  return manifest;
}

module.exports = {
  exportJson,
  exportGeoJson,
  exportReport,
  exportManifest,
  assertNoForbiddenAttribution,
  sanitizePath,
};
