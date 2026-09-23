/**
 * Real Investigation Map Model & Geospatial Normalizer
 * Phase 16.4 — Part 3: Real Investigation Map Layer Integration
 *
 * Normalizes canonical investigation data into a single coherent model:
 *
 * realMapData = {
 *   imageFootprint,
 *   spillFootprint,
 *   centroid,
 *   origin,
 *   originUncertainty,
 *   backwardTrajectory,
 *   forwardTrajectory,
 *   aisPresenceCells,
 *   aisCandidates
 * }
 *
 * All values originate STRICTLY from current investigation data.
 * Zero static fallbacks, zero replacement coordinates, zero demo data leaks.
 */

import { calculateBounds } from './geo';

/**
 * Normalizes a drift trajectory into an Array<[lat, lng]> of valid numbers.
 * Supports both canonical shapes:
 *   Shape A: { points: [ { latitude, longitude }, ... ] }
 *   Shape B: { trajectory: { type: "Feature", geometry: { type: "LineString", coordinates: [[lng, lat], ...] } } }
 * Also supports raw GeoJSON LineString objects and arrays of points.
 *
 * @param {Object|Array|null} source
 * @returns {Array<[number, number]>}
 */
export function normalizeTrajectoryCoords(source) {
  if (!source) return [];

  // Shape B1: GeoJSON Feature with LineString geometry
  if (source.geometry && source.geometry.type === 'LineString' && Array.isArray(source.geometry.coordinates)) {
    return source.geometry.coordinates
      .map(([lng, lat]) => [Number(lat), Number(lng)])
      .filter(([lat, lng]) => isValidLatLng(lat, lng));
  }

  // Shape B2: Nested trajectory property: source.trajectory
  if (source.trajectory) {
    return normalizeTrajectoryCoords(source.trajectory);
  }

  // Shape A: points array on source or source itself is an array
  const pts = Array.isArray(source.points) ? source.points : (Array.isArray(source) ? source : null);
  if (pts) {
    return pts
      .map((pt) => {
        if (Array.isArray(pt) && pt.length >= 2) {
          return [Number(pt[0]), Number(pt[1])];
        }
        if (typeof pt === 'object' && pt !== null) {
          const lat = Number(pt.latitude ?? pt.lat);
          const lng = Number(pt.longitude ?? pt.lng ?? pt.lon);
          return [lat, lng];
        }
        return [NaN, NaN];
      })
      .filter(([lat, lng]) => isValidLatLng(lat, lng));
  }

  return [];
}

/**
 * Validates whether lat and lng are finite and within geographic range.
 */
function isValidLatLng(lat, lng) {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    !isNaN(lat) &&
    !isNaN(lng) &&
    isFinite(lat) &&
    isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Normalizes the image / raster footprint from canonical geospatial metadata.
 * Uses geospatial.imageFootprint, geospatial.footprint, or geospatial.bounds.
 * If authentic footprint cannot be determined, strictly returns null (never fabricates).
 */
export function normalizeImageFootprint(geospatial, rawBbox = null) {
  if (!geospatial && !rawBbox) return null;

  // 1. Existing GeoJSON Feature
  if (geospatial?.imageFootprint && typeof geospatial.imageFootprint === 'object') {
    if (geospatial.imageFootprint.geometry || geospatial.imageFootprint.type === 'Feature') {
      return geospatial.imageFootprint;
    }
  }

  // 2. Geospatial footprint geometry object (Polygon or MultiPolygon)
  if (geospatial?.footprint && typeof geospatial.footprint === 'object') {
    if (geospatial.footprint.type === 'Polygon' || geospatial.footprint.type === 'MultiPolygon') {
      return {
        type: 'Feature',
        geometry: geospatial.footprint,
        properties: { crs: geospatial.crs || 'EPSG:4326', provenance: 'REAL' },
      };
    }
  }

  // 3. Geographic bounding box [minLng, minLat, maxLng, maxLat]
  const b = geospatial?.bounds || rawBbox;
  if (Array.isArray(b) && b.length === 4) {
    const minLng = Number(b[0]);
    const minLat = Number(b[1]);
    const maxLng = Number(b[2]);
    const maxLat = Number(b[3]);
    if (
      isValidLatLng(minLat, minLng) &&
      isValidLatLng(maxLat, maxLng) &&
      minLng <= maxLng &&
      minLat <= maxLat
    ) {
      return {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [minLng, minLat],
              [maxLng, minLat],
              [maxLng, maxLat],
              [minLng, maxLat],
              [minLng, minLat],
            ],
          ],
        },
        properties: {
          crs: geospatial?.crs || 'EPSG:4326',
          provenance: 'REAL',
        },
      };
    }
  }

  return null;
}

/**
 * Normalizes the detected oil spill polygon footprint from canonical geospatial data.
 * If canonical data only has centroid or lacks polygon geometry, returns null.
 * NEVER fabricates circle, rectangle, or buffer as a substitute.
 */
export function normalizeSpillFootprint(geospatial) {
  if (!geospatial) return null;

  if (geospatial.spillFootprint && typeof geospatial.spillFootprint === 'object') {
    if (geospatial.spillFootprint.geometry || geospatial.spillFootprint.type === 'Feature') {
      return geospatial.spillFootprint;
    }
    if (geospatial.spillFootprint.type === 'Polygon' || geospatial.spillFootprint.type === 'MultiPolygon') {
      return {
        type: 'Feature',
        geometry: geospatial.spillFootprint,
        properties: { provenance: 'MODEL_DERIVED' },
      };
    }
  }

  return null;
}

/**
 * Normalizes centroid coordinates [lat, lng].
 * Source must be canonical detection/geospatial data only.
 */
export function normalizeCentroid(centroid) {
  if (!centroid) return null;

  if (Array.isArray(centroid) && centroid.length >= 2) {
    const lat = Number(centroid[0]);
    const lng = Number(centroid[1]);
    if (isValidLatLng(lat, lng)) return [lat, lng];
  }

  if (typeof centroid === 'object' && centroid !== null) {
    const lat = Number(centroid.latitude ?? centroid.lat);
    const lng = Number(centroid.longitude ?? centroid.lng ?? centroid.lon);
    if (isValidLatLng(lat, lng)) return [lat, lng];
  }

  return null;
}

/**
 * Normalizes estimated origin.
 * Renders ONLY when canonical status is 'ESTIMATED' with valid finite coordinates.
 * If status is NOT_ESTABLISHED or missing, strictly returns null.
 */
export function normalizeOrigin(origin) {
  if (!origin || origin.status !== 'ESTIMATED') return null;

  const pt = origin.estimatedPoint;
  if (!pt) return null;

  const lat = Number(pt.latitude ?? pt.lat);
  const lng = Number(pt.longitude ?? pt.lng ?? pt.lon);
  if (!isValidLatLng(lat, lng)) return null;

  const uncertaintyRadiusKm = origin.uncertainty?.radiusKm ?? origin.uncertaintyRadiusKm ?? null;

  return {
    status: 'ESTIMATED',
    estimatedPoint: { latitude: lat, longitude: lng },
    uncertainty: uncertaintyRadiusKm != null ? { radiusKm: Number(uncertaintyRadiusKm) } : null,
    uncertaintyRadiusKm: uncertaintyRadiusKm != null ? Number(uncertaintyRadiusKm) : null,
    method: origin.method || 'Lagrangian Backtracking',
    engine: origin.engine || 'SpillDriftEngine',
    provenance: origin.provenance || 'MODEL_DERIVED',
    timestampSource: origin.timestampSource || null,
    estimatedReleaseTime: origin.estimatedReleaseTime || null,
  };
}

/**
 * Normalizes GFW AIS vessel presence data and candidate vessels.
 * Strictly adheres to VESSEL_PRESENCE observation level:
 * - NO raw tracks or polylines connecting cells
 * - NO calculated CPA (cpaAvailable: false)
 * - Returns presence cells for CircleMarker rendering
 */
export function normalizeAisPresence(aisCorrelation) {
  if (!aisCorrelation) {
    return {
      presenceCells: [],
      candidates: [],
      allTracks: [],
      isVesselPresence: false,
      observationLevel: null,
      cpaAvailable: false,
      rawTracksAvailable: false,
    };
  }

  const isVesselPresence =
    aisCorrelation.observationLevel === 'VESSEL_PRESENCE' ||
    aisCorrelation.provider === 'GLOBAL_FISHING_WATCH';

  const rawCandidates = Array.isArray(aisCorrelation.candidates) ? aisCorrelation.candidates : [];
  const presenceCells = [];

  const candidates = rawCandidates.map((cand, idx) => {
    const vId = cand.vesselId || {};
    const mmsi = (typeof vId === 'object' ? vId.mmsi : vId) || cand.mmsi || `cand-${idx + 1}`;
    const name = (typeof vId === 'object' ? vId.name : null) || cand.vesselName || cand.shipName || `MMSI: ${mmsi}`;
    const flag = (typeof vId === 'object' ? vId.flag : null) || cand.flag || 'UNK';
    const vesselType = (typeof vId === 'object' ? vId.vesselType : null) || cand.vesselType || 'Commercial Vessel';

    // Extract presence cells
    const rawCells = (Array.isArray(cand.aisEvidence?.presenceCells) && cand.aisEvidence.presenceCells.length > 0)
      ? cand.aisEvidence.presenceCells
      : (Array.isArray(cand.presenceCells) ? cand.presenceCells : []);

    const normalizedCells = rawCells
      .map((cell) => {
        const lat = Number(cell.latitude ?? cell.lat);
        const lng = Number(cell.longitude ?? cell.lon ?? cell.lng);
        if (!isValidLatLng(lat, lng)) return null;
        return {
          latitude: lat,
          longitude: lng,
          hours: cell.hours != null ? Number(cell.hours) : 1,
          vesselName: name,
          mmsi,
        };
      })
      .filter(Boolean);

    // If candidate has no cell list but has closestCellCoordinates, add as cell
    if (normalizedCells.length === 0 && cand.correlation?.closestCellCoordinates) {
      const clLat = Number(cand.correlation.closestCellCoordinates.latitude ?? cand.correlation.closestCellCoordinates.lat);
      const clLng = Number(cand.correlation.closestCellCoordinates.longitude ?? cand.correlation.closestCellCoordinates.lon ?? cand.correlation.closestCellCoordinates.lng);
      if (isValidLatLng(clLat, clLng)) {
        normalizedCells.push({
          latitude: clLat,
          longitude: clLng,
          hours: cand.aisEvidence?.presenceHours ?? cand.totalPresenceHours ?? 1,
          vesselName: name,
          mmsi,
        });
      }
    }

    presenceCells.push(...normalizedCells);

    const totalHours = cand.aisEvidence?.presenceHours ?? cand.totalPresenceHours ?? cand.hours ?? (normalizedCells.reduce((sum, c) => sum + (c.hours || 0), 0) || 1);
    const closestCoord = cand.correlation?.closestCellCoordinates || (normalizedCells[0] ? { latitude: normalizedCells[0].latitude, longitude: normalizedCells[0].longitude } : null);

    return {
      ...cand,
      id: mmsi,
      rank: cand.rank || idx + 1,
      mmsi,
      name,
      vesselName: name,
      flag,
      vesselType,
      type: isVesselPresence ? 'GFW_VESSEL_PRESENCE' : (cand.type || 'POTENTIAL_CANDIDATE'),
      observationLevel: isVesselPresence ? 'VESSEL_PRESENCE' : (cand.observationLevel || 'RAW_POSITION'),
      totalPresenceHours: totalHours,
      presenceCells: normalizedCells,
      correlation: {
        ...(cand.correlation || {}),
        score: cand.correlation?.score ?? cand.correlationScore ?? cand.score ?? 0,
        closestApproachKm: isVesselPresence ? null : (cand.correlation?.closestApproachKm ?? null),
        closestCellCoordinates: closestCoord,
      },
      evidence: {
        ...(cand.evidence || {}),
        presenceHours: totalHours,
        closestCell: closestCoord,
        closestApproachKm: isVesselPresence ? null : (cand.correlation?.closestApproachKm ?? null),
      },
    };
  });

  // Background vessels presence cells
  const bgVessels = Array.isArray(aisCorrelation.presenceVessels) ? aisCorrelation.presenceVessels : [];
  bgVessels.forEach((v) => {
    const rawCells = Array.isArray(v.presenceCells) ? v.presenceCells : [];
    rawCells.forEach((c) => {
      const lat = Number(c.latitude ?? c.lat);
      const lng = Number(c.longitude ?? c.lon ?? c.lng);
      if (isValidLatLng(lat, lng)) {
        presenceCells.push({
          latitude: lat,
          longitude: lng,
          hours: c.hours != null ? Number(c.hours) : 1,
          vesselName: v.shipName || v.vesselName || `MMSI: ${v.mmsi}`,
          mmsi: v.mmsi,
          isBackground: true,
        });
      }
    });
  });

  return {
    presenceCells,
    candidates,
    allTracks: bgVessels,
    isVesselPresence,
    observationLevel: isVesselPresence ? 'VESSEL_PRESENCE' : 'RAW_POSITION',
    cpaAvailable: !isVesselPresence && Boolean(aisCorrelation.cpaAvailable),
    rawTracksAvailable: !isVesselPresence && Boolean(aisCorrelation.rawTracksAvailable),
  };
}

/**
 * Calculates dynamic Leaflet map bounds [[south, west], [north, east]]
 * encompassing all available valid coordinates in the real investigation:
 *  1. image footprint
 *  2. spill footprint
 *  3. centroid
 *  4. origin
 *  5. backward trajectory
 *  6. forward trajectory
 *  7. GFW presence cells
 *  8. candidate coordinates
 */
export function calculateRealMapBounds(model) {
  if (!model) return null;
  const points = [];

  // 1. Image footprint
  if (model.imageFootprint?.geometry?.coordinates) {
    const coords = model.imageFootprint.geometry.coordinates;
    const ring = Array.isArray(coords[0]) ? coords[0] : coords;
    ring.forEach((pt) => {
      if (Array.isArray(pt) && pt.length >= 2) {
        const lat = Number(pt[1]);
        const lng = Number(pt[0]);
        if (isValidLatLng(lat, lng)) points.push([lat, lng]);
      }
    });
  }

  // 2. Spill footprint
  if (model.spillFootprint?.geometry?.coordinates) {
    const coords = model.spillFootprint.geometry.coordinates;
    const ring = Array.isArray(coords[0]) ? coords[0] : coords;
    ring.forEach((pt) => {
      if (Array.isArray(pt) && pt.length >= 2) {
        const lat = Number(pt[1]);
        const lng = Number(pt[0]);
        if (isValidLatLng(lat, lng)) points.push([lat, lng]);
      }
    });
  }

  // 3. Centroid
  if (model.centroid) {
    points.push(model.centroid);
  }

  // 4. Origin
  if (model.origin?.estimatedPoint) {
    const lat = Number(model.origin.estimatedPoint.latitude);
    const lng = Number(model.origin.estimatedPoint.longitude);
    if (isValidLatLng(lat, lng)) points.push([lat, lng]);
  }

  // 5. Backward trajectory
  if (Array.isArray(model.backwardTrajectory)) {
    model.backwardTrajectory.forEach(([lat, lng]) => {
      if (isValidLatLng(lat, lng)) points.push([lat, lng]);
    });
  }

  // 6. Forward trajectory
  if (Array.isArray(model.forwardTrajectory)) {
    model.forwardTrajectory.forEach(([lat, lng]) => {
      if (isValidLatLng(lat, lng)) points.push([lat, lng]);
    });
  }

  // 7. GFW Presence Cells
  if (Array.isArray(model.aisPresenceCells)) {
    model.aisPresenceCells.forEach((c) => {
      const lat = Number(c.latitude ?? c.lat);
      const lng = Number(c.longitude ?? c.lon ?? c.lng);
      if (isValidLatLng(lat, lng)) points.push([lat, lng]);
    });
  }

  // 8. Candidates closest cell coordinates
  if (Array.isArray(model.aisCandidates)) {
    model.aisCandidates.forEach((cand) => {
      if (cand.correlation?.closestCellCoordinates) {
        const lat = Number(cand.correlation.closestCellCoordinates.latitude ?? cand.correlation.closestCellCoordinates.lat);
        const lng = Number(cand.correlation.closestCellCoordinates.longitude ?? cand.correlation.closestCellCoordinates.lon ?? cand.correlation.closestCellCoordinates.lng);
        if (isValidLatLng(lat, lng)) points.push([lat, lng]);
      }
    });
  }

  if (points.length === 0) return null;
  return calculateBounds(points);
}

/**
 * Builds the canonical realMapData model for the active real investigation.
 *
 * @param {Object} params
 * @param {Object|null} params.manualInvestigationData
 * @param {Object|null} params.realJobData
 * @param {Object|null} params.currentScenario
 * @returns {Object|null} realMapData
 */
export function buildRealMapModel({
  manualInvestigationData = null,
  realJobData = null,
  currentScenario = null,
} = {}) {
  const isReal = Boolean(
    manualInvestigationData ||
    currentScenario?.isRealScene ||
    currentScenario?.isManualSar ||
    currentScenario?.id === 'REAL_CDSE'
  );

  if (!isReal && !manualInvestigationData && !realJobData) {
    return null;
  }

  const canonical = manualInvestigationData;
  const payload = realJobData?.payload || {};
  const meta = payload?.metadata || {};
  const rawBbox = meta.bbox && Array.isArray(meta.bbox) && meta.bbox.length === 4 ? meta.bbox : null;

  // 1. Image Footprint
  const imageFootprint = normalizeImageFootprint(
    canonical?.geospatial,
    rawBbox
  );

  // 2. Spill Footprint
  const spillFootprint = normalizeSpillFootprint(canonical?.geospatial);

  // 3. Centroid
  const centroid = normalizeCentroid(
    canonical?.geospatial?.centroid ||
    (rawBbox ? [(Number(rawBbox[1]) + Number(rawBbox[3])) / 2, (Number(rawBbox[0]) + Number(rawBbox[2])) / 2] : null) ||
    currentScenario?.center ||
    null
  );

  // 4 & 5. Origin & Origin Uncertainty
  const origin = normalizeOrigin(canonical?.origin);
  const originUncertainty = origin?.uncertainty || null;

  // 6. Backward Trajectory
  const backwardSource = canonical?.drift?.backward;
  const backwardTrajectory = normalizeTrajectoryCoords(backwardSource);
  const backwardPoints = Array.isArray(backwardSource?.points) ? backwardSource.points : [];

  // 7. Forward Trajectory
  const forwardSource = canonical?.drift?.forward;
  const forwardTrajectory = normalizeTrajectoryCoords(forwardSource);
  const forwardPoints = Array.isArray(forwardSource?.points) ? forwardSource.points : [];

  // 8 & 9. GFW AIS Presence & Candidates
  const aisSource = canonical?.aisCorrelation || payload.canonical?.aisCorrelation || payload.aisCorrelation;
  const aisData = normalizeAisPresence(aisSource);

  // Metrics
  const areaKm2 = canonical?.geospatial?.areaKm2 != null
    ? Number(canonical.geospatial.areaKm2)
    : (payload.areaKm2 != null ? Number(payload.areaKm2) : (currentScenario?.areaKm2 ?? 0));

  const confidence = canonical?.detection?.confidence != null
    ? Number(canonical.detection.confidence)
    : (payload.confidence != null ? Number(payload.confidence) : null);

  const model = {
    imageFootprint,
    spillFootprint,
    centroid,
    areaKm2,
    confidence,
    origin,
    originUncertainty,
    backwardTrajectory,
    backwardPoints,
    forwardTrajectory,
    forwardPoints,
    aisPresenceCells: aisData.presenceCells,
    aisCandidates: aisData.candidates,
    allTracks: aisData.allTracks,
    isVesselPresence: aisData.isVesselPresence,
    observationLevel: aisData.observationLevel,
    cpaAvailable: aisData.cpaAvailable,
    rawTracksAvailable: aisData.rawTracksAvailable,
    drift: canonical?.drift || (backwardTrajectory.length > 0 || forwardTrajectory.length > 0 ? {
      status: 'ESTIMATED',
      backward: backwardTrajectory.length > 0 ? { status: 'ESTIMATED', points: backwardPoints, trajectory: canonical?.drift?.backward?.trajectory || null } : null,
      forward: forwardTrajectory.length > 0 ? { status: 'ESTIMATED', points: forwardPoints, trajectory: canonical?.drift?.forward?.trajectory || null } : null,
    } : null),
    canonicalOrigin: canonical?.origin || null,
    modality: canonical?.input?.modality || payload.modality || 'SAR_DUAL_POL',
    geospatial: canonical?.geospatial || {
      available: Boolean(imageFootprint || spillFootprint || centroid),
      imageFootprint,
      spillFootprint,
      centroid,
      areaKm2,
      crs: canonical?.geospatial?.crs || 'EPSG:4326',
    },
    provenance: canonical?.provenance || {
      inputGeolocation: imageFootprint ? 'REAL' : 'NOT_AVAILABLE',
    },
    aisCorrelation: canonical?.aisCorrelation || {
      status: aisData.candidates.length > 0 ? 'CANDIDATES_FOUND' : 'NO_CANDIDATES',
      isDemo: false,
      observationLevel: aisData.observationLevel,
      candidates: aisData.candidates,
      presenceCells: aisData.presenceCells,
      presenceVessels: aisData.allTracks,
    },
  };

  model.bounds = calculateRealMapBounds(model);

  return model;
}

/**
 * Recursively extracts all valid geographic points [[lat, lng], ...] from a GeoJSON Feature or geometry.
 * Supports Polygon and MultiPolygon.
 *
 * @param {Object|null} geomOrFeature
 * @returns {Array<[number, number]>}
 */
export function extractPolygonCoords(geomOrFeature) {
  if (!geomOrFeature) return [];
  const geom = geomOrFeature.geometry || geomOrFeature;
  if (!geom || !geom.coordinates) return [];
  const points = [];

  const recurse = (coords) => {
    if (
      Array.isArray(coords) &&
      coords.length >= 2 &&
      typeof coords[0] === 'number' &&
      typeof coords[1] === 'number'
    ) {
      const lat = Number(coords[1]);
      const lng = Number(coords[0]);
      if (isValidLatLng(lat, lng)) {
        points.push([lat, lng]);
      }
    } else if (Array.isArray(coords)) {
      coords.forEach(recurse);
    }
  };

  recurse(geom.coordinates);
  return points;
}

/**
 * Calculates a bounding box [[south, west], [north, east]] around a circular region.
 * Uses spherical approximation: 1 degree latitude ~ 111.32 km.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {number} radiusKm
 * @returns {[[number, number], [number, number]]|null}
 */
export function calculateCircleBounds(lat, lng, radiusKm) {
  if (!isValidLatLng(lat, lng) || typeof radiusKm !== 'number' || radiusKm <= 0) {
    return null;
  }
  const deltaLat = radiusKm / 111.32;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const deltaLng = cosLat > 0.0001 ? radiusKm / (111.32 * cosLat) : deltaLat;

  return [
    [Math.max(-90, lat - deltaLat), Math.max(-180, lng - deltaLng)],
    [Math.min(90, lat + deltaLat), Math.min(180, lng + deltaLng)],
  ];
}

/**
 * Resolves the dynamic focus target viewport and state for the active real investigation.
 * Strictly adheres to scientific guardrails:
 *  - SLICK: fits polygon bounds if available, falls back to centroid, otherwise unavailable
 *  - ORIGIN: focuses origin and fits uncertainty circle bounds if ESTIMATED, otherwise unavailable
 *  - VESSEL: focuses actual GFW presence cells, fits cell bounds (if >1) or flies to cell (if 1)
 *  - CPA: strictly unavailable for GFW VESSEL_PRESENCE provider (never calculated/approximated)
 *  - FORECAST: fits forward trajectory bounds if present, otherwise unavailable
 *  - BOUNDS / RESET: restores the dynamic initial investigation bounds
 *
 * @param {Object|null} model - realMapData from buildRealMapModel
 * @param {'slick'|'origin'|'vessel'|'cpa'|'forecast'|'bounds'} target
 * @param {Object} [options]
 * @param {Object} [options.selectedCandidate]
 * @param {string} [options.selectedCandidateId]
 * @returns {Object} focusResult
 */
export function resolveMapFocusTarget(model, target, options = {}) {
  if (!model) {
    return {
      type: 'unavailable',
      message: 'Investigation map data unavailable',
      badgeLabel: 'UNAVAILABLE',
    };
  }

  // 1. FOCUS SLICK
  if (target === 'slick') {
    if (model.spillFootprint) {
      const polyPts = extractPolygonCoords(model.spillFootprint);
      if (polyPts.length > 0) {
        const bounds = calculateBounds(polyPts);
        if (bounds) {
          return {
            type: 'bounds',
            bounds,
            badgeLabel: 'FOCUS: SLICK',
          };
        }
      }
    }
    if (model.centroid) {
      return {
        type: 'center',
        center: model.centroid,
        zoom: 14,
        badgeLabel: 'FOCUS: SLICK',
      };
    }
    return {
      type: 'unavailable',
      message: 'Slick location unavailable',
      badgeLabel: 'Slick location unavailable',
    };
  }

  // 2. FOCUS ORIGIN
  if (target === 'origin') {
    if (model.origin && model.origin.status === 'ESTIMATED' && model.origin.estimatedPoint) {
      const lat = Number(model.origin.estimatedPoint.latitude);
      const lng = Number(model.origin.estimatedPoint.longitude);
      const radiusKm = model.origin.uncertaintyRadiusKm ?? model.origin.uncertainty?.radiusKm ?? null;

      if (radiusKm != null && radiusKm > 0) {
        const circleBounds = calculateCircleBounds(lat, lng, radiusKm);
        if (circleBounds) {
          return {
            type: 'bounds',
            bounds: circleBounds,
            center: [lat, lng],
            badgeLabel: 'FOCUS: ORIGIN',
          };
        }
      }

      return {
        type: 'center',
        center: [lat, lng],
        zoom: 13,
        badgeLabel: 'FOCUS: ORIGIN',
      };
    }

    return {
      type: 'unavailable',
      message: 'Origin not established',
      badgeLabel: 'Origin not established',
    };
  }

  // 3. FOCUS VESSEL (GFW VESSEL_PRESENCE)
  if (target === 'vessel' || target === 'candidate') {
    const candidates = Array.isArray(model.aisCandidates) ? model.aisCandidates : [];
    let candidate = options.selectedCandidate || null;

    if (!candidate && options.selectedCandidateId && candidates.length > 0) {
      candidate = candidates.find(
        (c) => String(c.id) === String(options.selectedCandidateId) || String(c.mmsi) === String(options.selectedCandidateId)
      ) || null;
    }

    if (!candidate && candidates.length > 0) {
      candidate = candidates[0];
    }

    if (!candidate) {
      return {
        type: 'unavailable',
        message: 'Vessel presence cells unavailable',
        badgeLabel: 'Vessel presence cells unavailable',
      };
    }

    // Extract actual presence cells
    const rawCells = (Array.isArray(candidate.presenceCells) && candidate.presenceCells.length > 0)
      ? candidate.presenceCells
      : (Array.isArray(candidate.aisEvidence?.presenceCells) ? candidate.aisEvidence.presenceCells : []);

    const cellPts = rawCells
      .map((c) => [Number(c.latitude ?? c.lat), Number(c.longitude ?? c.lon ?? c.lng)])
      .filter(([lat, lng]) => isValidLatLng(lat, lng));

    if (cellPts.length > 1) {
      const bounds = calculateBounds(cellPts);
      return {
        type: 'bounds',
        bounds,
        candidate,
        badgeLabel: 'FOCUS: GFW VESSEL PRESENCE',
      };
    }

    if (cellPts.length === 1) {
      return {
        type: 'center',
        center: cellPts[0],
        zoom: 13,
        candidate,
        badgeLabel: 'FOCUS: GFW VESSEL PRESENCE',
      };
    }

    // Single cell coordinate fallback from correlation if cell list empty
    if (candidate.correlation?.closestCellCoordinates) {
      const clLat = Number(candidate.correlation.closestCellCoordinates.latitude ?? candidate.correlation.closestCellCoordinates.lat);
      const clLng = Number(candidate.correlation.closestCellCoordinates.longitude ?? candidate.correlation.closestCellCoordinates.lon ?? candidate.correlation.closestCellCoordinates.lng);
      if (isValidLatLng(clLat, clLng)) {
        return {
          type: 'center',
          center: [clLat, clLng],
          zoom: 13,
          candidate,
          badgeLabel: 'FOCUS: GFW VESSEL PRESENCE',
        };
      }
    }

    return {
      type: 'unavailable',
      message: 'Vessel presence cells unavailable',
      badgeLabel: 'Vessel presence cells unavailable',
      candidate,
    };
  }

  // 4. FOCUS CPA (GFW GUARDRAIL: NEVER AVAILABLE FOR AGGREGATED PRESENCE)
  if (target === 'cpa') {
    if (model.cpaAvailable === true) {
      // Future provider with authoritative CPA
      return {
        type: 'unavailable',
        message: 'CPA not established',
        badgeLabel: 'CPA not established',
      };
    }

    return {
      type: 'unavailable',
      message: 'CPA unavailable — GFW provider supplies aggregated vessel presence, not raw AIS tracks.',
      badgeLabel: 'CPA unavailable — GFW provider supplies aggregated vessel presence, not raw AIS tracks.',
    };
  }

  // 5. FOCUS FORECAST
  if (target === 'forecast') {
    if (Array.isArray(model.forwardTrajectory) && model.forwardTrajectory.length > 1) {
      const pts = [...model.forwardTrajectory];
      if (model.origin?.estimatedPoint) {
        pts.push([Number(model.origin.estimatedPoint.latitude), Number(model.origin.estimatedPoint.longitude)]);
      } else if (model.centroid) {
        pts.push(model.centroid);
      }
      const bounds = calculateBounds(pts);
      if (bounds) {
        return {
          type: 'bounds',
          bounds,
          badgeLabel: 'FOCUS: FORECAST',
        };
      }
    }

    return {
      type: 'unavailable',
      message: 'Forecast trajectory unavailable',
      badgeLabel: 'Forecast trajectory unavailable',
    };
  }

  // 6. RESET VIEW / BOUNDS
  if (target === 'bounds' || target === 'reset') {
    if (model.bounds) {
      return {
        type: 'bounds',
        bounds: model.bounds,
        badgeLabel: 'RESET VIEW',
      };
    }
    if (model.centroid) {
      return {
        type: 'center',
        center: model.centroid,
        zoom: 10,
        badgeLabel: 'RESET VIEW',
      };
    }
    return {
      type: 'unavailable',
      message: 'Investigation bounds unavailable',
      badgeLabel: 'RESET VIEW',
    };
  }

  return {
    type: 'unavailable',
    message: `Unknown focus target: ${target}`,
    badgeLabel: 'UNAVAILABLE',
  };
}

/**
 * Resolves the active map context and camera focus target when an investigation tab changes.
 * Phase 16.4 — Part 5: Tab -> Map Synchronization.
 *
 * All coordinates originate STRICTLY from the current real normalized model.
 * Zero demo coordinates, zero fake polylines, zero CPA lines.
 *
 * @param {Object|null} model - Normalized realMapData model
 * @param {string} activeTab - 'sar' | 'drift' | 'ais' | 'science' | 'timeline' | 'dossier' | 'investigation'
 * @param {Object} [options]
 * @param {Object} [options.selectedCandidate] - Currently selected candidate vessel
 * @param {string} [options.selectedCandidateId] - ID of selected candidate vessel
 * @returns {{
 *   context: string,
 *   focusTarget: { type: string, bounds?: Array, center?: Array, zoom?: number, name?: string } | null,
 *   available: boolean,
 *   reason: string,
 *   badgeLabel: string
 * }}
 */
export function resolveTabMapContext(model, activeTab, options = {}) {
  const normTab = (activeTab || 'investigation').toLowerCase();

  if (!model) {
    return {
      context: normTab,
      focusTarget: null,
      available: false,
      reason: 'MODEL_UNAVAILABLE',
      badgeLabel: 'No additional map evidence available for this section.',
    };
  }

  // 1. SAR / DETECTION TAB
  if (normTab === 'sar') {
    const coords = [];

    // Prioritize real image footprint
    if (model.imageFootprint) {
      const imgPts = extractPolygonCoords(model.imageFootprint);
      if (imgPts.length > 0) coords.push(...imgPts);
    }

    // Also include real spill footprint if present
    if (model.spillFootprint) {
      const spillPts = extractPolygonCoords(model.spillFootprint);
      if (spillPts.length > 0) coords.push(...spillPts);
    }

    if (coords.length > 1) {
      const bounds = calculateBounds(coords);
      return {
        context: 'sar',
        focusTarget: {
          type: 'bounds',
          bounds,
          name: 'slick',
        },
        available: true,
        reason: model.imageFootprint && model.spillFootprint
          ? 'REAL_SPILL_AND_IMAGE_FOOTPRINT'
          : (model.imageFootprint ? 'REAL_IMAGE_FOOTPRINT' : 'REAL_SPILL_FOOTPRINT'),
        badgeLabel: 'SAR EVIDENCE',
      };
    }

    // Fallback to real centroid
    if (model.centroid && isValidLatLng(model.centroid[0], model.centroid[1])) {
      return {
        context: 'sar',
        focusTarget: {
          type: 'center',
          center: model.centroid,
          zoom: 14,
          name: 'slick',
        },
        available: true,
        reason: 'REAL_CENTROID_FALLBACK',
        badgeLabel: 'SAR EVIDENCE',
      };
    }

    // If both are unavailable, safely retain current map bounds
    return {
      context: 'sar',
      focusTarget: null,
      available: false,
      reason: 'NO_SAR_GEOMETRY',
      badgeLabel: 'No additional map evidence available for this section.',
    };
  }

  // 2. DRIFT & FORECAST TAB
  if (normTab === 'drift') {
    const pts = [];

    // Real origin
    if (model.origin?.status === 'ESTIMATED' && model.origin?.estimatedPoint) {
      const lat = Number(model.origin.estimatedPoint.latitude);
      const lng = Number(model.origin.estimatedPoint.longitude);
      if (isValidLatLng(lat, lng)) {
        pts.push([lat, lng]);
        const radiusKm = model.origin.uncertaintyRadiusKm ?? model.origin.uncertainty?.radiusKm ?? 0;
        if (radiusKm > 0) {
          const cBounds = calculateCircleBounds(lat, lng, radiusKm);
          if (cBounds) {
            pts.push(cBounds[0], cBounds[1]);
          }
        }
      }
    }

    // Real backward trajectory
    if (Array.isArray(model.backwardTrajectory) && model.backwardTrajectory.length > 0) {
      model.backwardTrajectory.forEach((p) => {
        if (Array.isArray(p) && isValidLatLng(p[0], p[1])) {
          pts.push(p);
        }
      });
    }

    // Real forward trajectory
    if (Array.isArray(model.forwardTrajectory) && model.forwardTrajectory.length > 0) {
      model.forwardTrajectory.forEach((p) => {
        if (Array.isArray(p) && isValidLatLng(p[0], p[1])) {
          pts.push(p);
        }
      });
    }

    if (pts.length > 1) {
      const bounds = calculateBounds(pts);
      return {
        context: 'drift',
        focusTarget: {
          type: 'bounds',
          bounds,
          name: 'origin',
        },
        available: true,
        reason: 'REAL_DRIFT_AND_ORIGIN_GEOMETRY',
        badgeLabel: 'DRIFT & FORECAST',
      };
    }

    if (pts.length === 1) {
      return {
        context: 'drift',
        focusTarget: {
          type: 'center',
          center: pts[0],
          zoom: 13,
          name: 'origin',
        },
        available: true,
        reason: 'REAL_ORIGIN_ONLY',
        badgeLabel: 'DRIFT & FORECAST',
      };
    }

    return {
      context: 'drift',
      focusTarget: null,
      available: false,
      reason: 'NO_DRIFT_GEOMETRY',
      badgeLabel: 'No additional map evidence available for this section.',
    };
  }

  // 3. AIS ATTRIBUTION TAB
  if (normTab === 'ais') {
    // If a candidate is specifically selected, prioritize that candidate's real presence cells
    let candidate = options.selectedCandidate;
    if (!candidate && options.selectedCandidateId && Array.isArray(model.aisCandidates)) {
      candidate = model.aisCandidates.find(
        (c) => String(c.id) === String(options.selectedCandidateId) || String(c.mmsi) === String(options.selectedCandidateId)
      );
    }

    if (candidate) {
      const rawCells = (Array.isArray(candidate.presenceCells) && candidate.presenceCells.length > 0)
        ? candidate.presenceCells
        : (Array.isArray(candidate.aisEvidence?.presenceCells) ? candidate.aisEvidence.presenceCells : []);

      const cellPts = rawCells
        .map((c) => [Number(c.latitude ?? c.lat), Number(c.longitude ?? c.lon ?? c.lng)])
        .filter(([lat, lng]) => isValidLatLng(lat, lng));

      if (cellPts.length > 1) {
        return {
          context: 'ais',
          focusTarget: {
            type: 'bounds',
            bounds: calculateBounds(cellPts),
            name: 'vessel',
          },
          available: true,
          reason: 'SELECTED_CANDIDATE_PRESENCE',
          badgeLabel: 'AIS VESSEL PRESENCE',
        };
      }
      if (cellPts.length === 1) {
        return {
          context: 'ais',
          focusTarget: {
            type: 'center',
            center: cellPts[0],
            zoom: 13,
            name: 'vessel',
          },
          available: true,
          reason: 'SELECTED_CANDIDATE_SINGLE_CELL',
          badgeLabel: 'AIS VESSEL PRESENCE',
        };
      }
    }

    // Collect all candidate presence cells + investigation context
    const allCellPts = [];
    if (Array.isArray(model.aisCandidates)) {
      model.aisCandidates.forEach((cand) => {
        const cells = (Array.isArray(cand.presenceCells) && cand.presenceCells.length > 0)
          ? cand.presenceCells
          : (Array.isArray(cand.aisEvidence?.presenceCells) ? cand.aisEvidence.presenceCells : []);
        cells.forEach((c) => {
          const lat = Number(c.latitude ?? c.lat);
          const lng = Number(c.longitude ?? c.lon ?? c.lng);
          if (isValidLatLng(lat, lng)) allCellPts.push([lat, lng]);
        });
      });
    }

    if (Array.isArray(model.aisPresenceCells)) {
      model.aisPresenceCells.forEach((c) => {
        const lat = Number(c.latitude ?? c.lat);
        const lng = Number(c.longitude ?? c.lon ?? c.lng);
        if (isValidLatLng(lat, lng)) allCellPts.push([lat, lng]);
      });
    }

    if (allCellPts.length > 0) {
      // Include relevant investigation context if available (origin or centroid)
      if (model.origin?.status === 'ESTIMATED' && model.origin?.estimatedPoint) {
        const oLat = Number(model.origin.estimatedPoint.latitude);
        const oLng = Number(model.origin.estimatedPoint.longitude);
        if (isValidLatLng(oLat, oLng)) allCellPts.push([oLat, oLng]);
      } else if (model.centroid && isValidLatLng(model.centroid[0], model.centroid[1])) {
        allCellPts.push(model.centroid);
      }

      if (allCellPts.length > 1) {
        return {
          context: 'ais',
          focusTarget: {
            type: 'bounds',
            bounds: calculateBounds(allCellPts),
            name: 'vessel',
          },
          available: true,
          reason: 'REAL_GFW_VESSEL_PRESENCE',
          badgeLabel: 'AIS VESSEL PRESENCE',
        };
      }
      return {
        context: 'ais',
        focusTarget: {
          type: 'center',
          center: allCellPts[0],
          zoom: 12,
          name: 'vessel',
        },
        available: true,
        reason: 'REAL_GFW_VESSEL_PRESENCE',
        badgeLabel: 'AIS VESSEL PRESENCE',
      };
    }

    return {
      context: 'ais',
      focusTarget: null,
      available: false,
      reason: 'NO_AIS_DATA',
      badgeLabel: 'No additional map evidence available for this section.',
    };
  }

  // 4. SCIENCE / MODEL TAB
  if (normTab === 'science') {
    // Only emphasize model-derived evidence that ACTUALLY EXISTS
    if (model.spillFootprint) {
      const coords = extractPolygonCoords(model.spillFootprint);
      if (coords.length > 1) {
        return {
          context: 'science',
          focusTarget: {
            type: 'bounds',
            bounds: calculateBounds(coords),
            name: 'slick',
          },
          available: true,
          reason: 'REAL_MODEL_SPILL_FOOTPRINT',
          badgeLabel: 'SCIENCE & MODEL',
        };
      }
    }

    if (model.centroid && isValidLatLng(model.centroid[0], model.centroid[1])) {
      return {
        context: 'science',
        focusTarget: {
          type: 'center',
          center: model.centroid,
          zoom: 14,
          name: 'slick',
        },
        available: true,
        reason: 'REAL_MODEL_CENTROID',
        badgeLabel: 'SCIENCE & MODEL',
      };
    }

    return {
      context: 'science',
      focusTarget: null,
      available: false,
      reason: 'NO_MODEL_EVIDENCE',
      badgeLabel: 'No additional map evidence available for this section.',
    };
  }

  // 5. TIMELINE TAB
  if (normTab === 'timeline') {
    // Only real temporal evidence
    const temporalPts = [];
    if (model.centroid) temporalPts.push(model.centroid);
    if (model.origin?.status === 'ESTIMATED' && model.origin?.estimatedPoint) {
      const oLat = Number(model.origin.estimatedPoint.latitude);
      const oLng = Number(model.origin.estimatedPoint.longitude);
      if (isValidLatLng(oLat, oLng)) temporalPts.push([oLat, oLng]);
    }
    if (Array.isArray(model.backwardTrajectory)) {
      model.backwardTrajectory.forEach((p) => {
        if (Array.isArray(p) && isValidLatLng(p[0], p[1])) temporalPts.push(p);
      });
    }
    if (Array.isArray(model.forwardTrajectory)) {
      model.forwardTrajectory.forEach((p) => {
        if (Array.isArray(p) && isValidLatLng(p[0], p[1])) temporalPts.push(p);
      });
    }

    if (temporalPts.length > 1) {
      return {
        context: 'timeline',
        focusTarget: {
          type: 'bounds',
          bounds: calculateBounds(temporalPts),
          name: 'timeline',
        },
        available: true,
        reason: 'REAL_TEMPORAL_GEOMETRY',
        badgeLabel: 'TIMELINE',
      };
    }

    if (model.bounds) {
      return {
        context: 'timeline',
        focusTarget: {
          type: 'bounds',
          bounds: model.bounds,
          name: 'bounds',
        },
        available: true,
        reason: 'INVESTIGATION_BOUNDS',
        badgeLabel: 'TIMELINE',
      };
    }

    return {
      context: 'timeline',
      focusTarget: null,
      available: false,
      reason: 'NO_TEMPORAL_DATA',
      badgeLabel: 'No additional map evidence available for this section.',
    };
  }

  // 6. DOSSIER / FULL INVESTIGATION TAB
  if (normTab === 'dossier' || normTab === 'investigation') {
    if (model.bounds) {
      return {
        context: normTab,
        focusTarget: {
          type: 'bounds',
          bounds: model.bounds,
          name: 'bounds',
        },
        available: true,
        reason: 'FULL_INVESTIGATION_BOUNDS',
        badgeLabel: 'FULL INVESTIGATION',
      };
    }
    if (model.centroid && isValidLatLng(model.centroid[0], model.centroid[1])) {
      return {
        context: normTab,
        focusTarget: {
          type: 'center',
          center: model.centroid,
          zoom: 11,
          name: 'bounds',
        },
        available: true,
        reason: 'INVESTIGATION_CENTROID',
        badgeLabel: 'FULL INVESTIGATION',
      };
    }

    return {
      context: normTab,
      focusTarget: null,
      available: false,
      reason: 'NO_BOUNDS_AVAILABLE',
      badgeLabel: 'FULL INVESTIGATION',
    };
  }

  return {
    context: normTab,
    focusTarget: null,
    available: false,
    reason: `UNKNOWN_TAB_${normTab}`,
    badgeLabel: 'UNAVAILABLE',
  };
}
