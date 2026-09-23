/**
 * Copernicus Data Space Ecosystem (CDSE) Sentinel-1 Catalogue Service
 *
 * Performs real STAC catalogue queries for Sentinel-1 GRD IW dual-pol (VV+VH)
 * acquisitions across Indian maritime AOIs (Mumbai, Kutch, Bengal, Malabar).
 */

const axios = require("axios");
const config = require("../../config/env");
const logger = require("../../logger");

const NAMED_AOIS = {
  mumbai: {
    id: "mumbai",
    name: "Mumbai Offshore (Arabian Sea)",
    description: "Mumbai High oil production corridor and shipping approaches",
    bbox: [72.5, 18.5, 73.2, 19.2],
    centroid: [18.85, 72.85],
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [72.5, 18.5],
          [73.2, 18.5],
          [73.2, 19.2],
          [72.5, 19.2],
          [72.5, 18.5],
        ],
      ],
    },
  },
  kutch: {
    id: "kutch",
    name: "Gulf of Kutch Maritime Pass",
    description: "Strait transit corridor with dense tanker traffic and tidal flows",
    bbox: [68.8, 22.2, 69.8, 23.0],
    centroid: [22.6, 69.3],
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [68.8, 22.2],
          [69.8, 22.2],
          [69.8, 23.0],
          [68.8, 23.0],
          [68.8, 22.2],
        ],
      ],
    },
  },
  bengal: {
    id: "bengal",
    name: "Bay of Bengal / Paradip Corridor",
    description: "Deep-water maritime corridor with seasonal monsoon surface drift",
    bbox: [86.0, 19.4, 87.2, 20.4],
    centroid: [19.9, 86.6],
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [86.0, 19.4],
          [87.2, 19.4],
          [87.2, 20.4],
          [86.0, 20.4],
          [86.0, 19.4],
        ],
      ],
    },
  },
  malabar: {
    id: "malabar",
    name: "Goa / Malabar Coastal Channel",
    description: "Coastal traffic lane along western continental shelf",
    bbox: [73.2, 14.5, 74.2, 15.5],
    centroid: [15.0, 73.7],
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [73.2, 14.5],
          [74.2, 14.5],
          [74.2, 15.5],
          [73.2, 15.5],
          [73.2, 14.5],
        ],
      ],
    },
  },
};

/**
 * Return all registered named AOIs.
 */
function getNamedAois() {
  return Object.values(NAMED_AOIS);
}

/**
 * Get bounding box from named AOI or raw bbox parameter.
 */
function resolveBoundingBox(aoiKey, rawBbox) {
  if (aoiKey && NAMED_AOIS[aoiKey.toLowerCase()]) {
    return {
      bbox: NAMED_AOIS[aoiKey.toLowerCase()].bbox,
      aoiMeta: NAMED_AOIS[aoiKey.toLowerCase()],
    };
  }

  if (Array.isArray(rawBbox) && rawBbox.length === 4) {
    return {
      bbox: rawBbox.map(Number),
      aoiMeta: { id: "custom", name: "Custom AOI", bbox: rawBbox.map(Number) },
    };
  }

  // Default to Mumbai Offshore
  return {
    bbox: NAMED_AOIS.mumbai.bbox,
    aoiMeta: NAMED_AOIS.mumbai,
  };
}

/**
 * Format ISO datetime interval for STAC search.
 */
function formatDateTimeInterval(startDate, endDate) {
  let start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  let end = endDate ? new Date(endDate) : new Date();

  if (isNaN(start.getTime())) start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  if (isNaN(end.getTime())) end = new Date();

  return `${start.toISOString()}/${end.toISOString()}`;
}

/**
 * Normalize STAC Feature item into standard Blue Forensic S-1 metadata.
 */
function normalizeStacItem(feature) {
  const props = feature.properties || {};
  const priv = props._private || {};
  const assets = feature.assets || {};

  const polarizations = props["sar:polarizations"] || ["VV", "VH"];
  const polString = Array.isArray(polarizations) ? polarizations.join("+") : String(polarizations);

  const productSize = priv.product_size || (assets.Product && assets.Product["file:size"]) || 0;
  const downloadSizeMb = productSize > 0 ? Number((productSize / (1024 * 1024)).toFixed(1)) : null;

  // Extract direct asset URLs
  const vvAsset = assets.vv || {};
  const vhAsset = assets.vh || {};
  const thumbAsset = assets.thumbnail || {};

  const vvUrl = (vvAsset.alternate && vvAsset.alternate.https && vvAsset.alternate.https.href) || vvAsset.href || null;
  const vhUrl = (vhAsset.alternate && vhAsset.alternate.https && vhAsset.alternate.https.href) || vhAsset.href || null;
  const thumbUrl = (thumbAsset.alternate && thumbAsset.alternate.https && thumbAsset.alternate.https.href) || thumbAsset.href || null;

  const productUuid = priv.product_uuid || feature.id;

  return {
    id: feature.id,
    name: priv.product_name || `${feature.id}.SAFE`,
    productUuid,
    platform: (props.platform || "Sentinel-1").toUpperCase(),
    acquisitionStart: props.start_datetime || props.datetime || null,
    acquisitionEnd: props.end_datetime || props.datetime || null,
    productType: props["product:type"] || "GRD",
    acquisitionMode: props["sar:instrument_mode"] || "IW",
    polarization: polString,
    orbitDirection: (props["sat:orbit_state"] || "UNKNOWN").toUpperCase(),
    relativeOrbit: props["sat:relative_orbit"] || null,
    absoluteOrbit: props["sat:absolute_orbit"] || null,
    geometry: feature.geometry || null,
    bbox: feature.bbox || null,
    processingLevel: props["processing:level"] || "L1",
    source: "COPERNICUS_DATA_SPACE",
    collection: "sentinel-1-grd",
    downloadSizeMb,
    thumbnailUrl: thumbUrl,
    vvDownloadUrl: vvUrl,
    vhDownloadUrl: vhUrl,
    status: "ONLINE",
    authScheme: "CDSE_KEYCLOAK_OIDC",
    resolutionMeters: props["sar:pixel_spacing_range"] || 10.0,
    rawProperties: {
      instrument: "C-SAR",
      frequencyGhz: props["sar:center_frequency"] || 5.405,
      incidenceAngle: props["view:incidence_angle"] || null,
    },
  };
}

/**
 * Search CDSE STAC Catalogue for real Sentinel-1 acquisitions.
 *
 * @param {Object} params
 * @param {string} [params.aoi='mumbai'] - Named AOI identifier
 * @param {Array<number>} [params.bbox] - GeoJSON Bounding box [minLng, minLat, maxLng, maxLat]
 * @param {string} [params.startDate] - ISO Start date
 * @param {string} [params.endDate] - ISO End date
 * @param {string} [params.mode='IW'] - Instrument mode
 * @param {string} [params.polarization='VV+VH'] - Polarizations
 * @param {number} [params.limit=15] - Maximum acquisitions to return
 * @returns {Promise<Object>} Search result envelope with normalized items
 */
async function searchSentinel1Catalog({
  aoi = "mumbai",
  bbox = null,
  startDate = null,
  endDate = null,
  mode = "IW",
  polarization = "VV+VH",
  limit = 15,
}) {
  const { bbox: resolvedBbox, aoiMeta } = resolveBoundingBox(aoi, bbox);
  const datetime = formatDateTimeInterval(startDate, endDate);

  const stacUrl = `${config.cdseStacUrl}/search`;

  logger.info("[CDSE] Executing real Sentinel-1 STAC catalogue search", {
    stacUrl,
    aoi: aoiMeta.id,
    bbox: resolvedBbox,
    datetime,
    mode,
    polarization,
  });

  const payload = {
    collections: ["sentinel-1-grd"],
    bbox: resolvedBbox,
    datetime,
    limit: Math.min(Number(limit) || 15, 50),
    query: {},
  };

  try {
    const response = await axios.post(stacUrl, payload, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: 25000,
    });

    const data = response.data || {};
    const rawFeatures = data.features || [];

    // Filter and normalize
    const normalizedResults = rawFeatures
      .map(normalizeStacItem)
      .filter((item) => {
        // Mode filter
        if (mode && !item.acquisitionMode.toUpperCase().includes(mode.toUpperCase())) {
          return false;
        }
        // Dual-pol check if requested
        if (polarization && polarization.includes("VH") && !item.polarization.includes("VH")) {
          return false;
        }
        return true;
      });

    logger.info("[CDSE] STAC search completed successfully", {
      totalFound: rawFeatures.length,
      filteredResults: normalizedResults.length,
      aoi: aoiMeta.id,
    });

    return {
      success: true,
      source: "COPERNICUS_DATA_SPACE",
      sourceClassification: "REAL_SENTINEL1_CATALOGUE",
      isLiveVerified: true,
      query: {
        aoi: aoiMeta.id,
        aoiName: aoiMeta.name,
        bbox: resolvedBbox,
        datetime,
        startDate: datetime.split("/")[0],
        endDate: datetime.split("/")[1],
        mode,
        polarization,
        limit,
      },
      total: normalizedResults.length,
      results: normalizedResults,
    };
  } catch (err) {
    logger.error("[CDSE] STAC catalogue search failed or unreachable", {
      error: err.message,
      status: err.response ? err.response.status : "NETWORK_ERROR",
      stacUrl,
    });

    return {
      success: false,
      source: "COPERNICUS_DATA_SPACE",
      sourceClassification: "LIVE_SENTINEL1_DATA_NOT_VERIFIED",
      isLiveVerified: false,
      query: {
        aoi: aoiMeta.id,
        aoiName: aoiMeta.name,
        bbox: resolvedBbox,
        datetime,
        mode,
        polarization,
      },
      total: 0,
      results: [],
      error: {
        code: "CDSE_SEARCH_ERROR",
        message: `Copernicus Data Space catalogue error: ${err.message}`,
        details: err.response ? err.response.data : null,
      },
    };
  }
}

/**
 * Retrieve detailed metadata for a specific Sentinel-1 product ID from CDSE.
 */
async function getProductById(productId) {
  if (!productId) {
    throw new Error("Missing productId parameter");
  }

  const cleanId = String(productId).trim().replace(/\.SAFE$/i, "");
  const stacUrl = `${config.cdseStacUrl}/collections/sentinel-1-grd/items/${encodeURIComponent(cleanId)}`;

  try {
    const response = await axios.get(stacUrl, {
      headers: { Accept: "application/json" },
      timeout: 15000,
    });

    const item = normalizeStacItem(response.data);
    return {
      success: true,
      source: "COPERNICUS_DATA_SPACE",
      isLiveVerified: true,
      product: item,
    };
  } catch (err) {
    logger.warn("[CDSE] Direct item lookup failed, trying STAC search query by ID", {
      productId,
      error: err.message,
    });

    // Fallback search with query filter
    const searchRes = await searchSentinel1Catalog({
      aoi: "mumbai",
      limit: 1,
    });

    const match = (searchRes.results || []).find((r) => r.id === productId || r.productUuid === productId);
    if (match) {
      return {
        success: true,
        source: "COPERNICUS_DATA_SPACE",
        isLiveVerified: true,
        product: match,
      };
    }

    throw new Error(`Product not found in Copernicus Data Space: ${productId}`);
  }
}

module.exports = {
  NAMED_AOIS,
  getNamedAois,
  resolveBoundingBox,
  searchSentinel1Catalog,
  getProductById,
  normalizeStacItem,
};
