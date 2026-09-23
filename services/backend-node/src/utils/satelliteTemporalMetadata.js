/**
 * satelliteTemporalMetadata.js
 * Phase 16.4 — Part 2: Automatic Satellite & Raster Temporal Metadata Extractor
 *
 * Implements authoritative acquisition timestamp extraction with strict priority:
 *   Priority 1: Authentic satellite product / raster metadata
 *     - 1A: Sentinel-1 SAFE product metadata (manifest.safe, annotation XMLs)
 *     - 1B: Embedded GeoTIFF Tag 306 (TIFFTAG_DATETIME)
 *     - 1C: GDAL metadata tags (ACQUISITION_DATETIME, START_TIME, etc.)
 *     - 1D: Verifiable official Sentinel-1 product naming syntax
 *   Priority 2: Verified analyst-supplied acquisition timestamp
 *   Priority 3: NOT_AVAILABLE (if neither exists)
 *
 * CRITICAL SCIENTIFIC & LEGAL GUARDRAILS:
 * - NEVER uses server execution time (new Date()).
 * - NEVER uses file upload time or filesystem modification time.
 * - NEVER guesses or fabricates timestamps.
 * - Benchmark patch filename (e.g. 00046.tif) is NOT a product identifier.
 * - Detects TEMPORAL_REFERENCE_CONFLICT if analyst supplies a timestamp that contradicts
 *   authentic metadata (authentic metadata takes precedence by default).
 * - Normalizes all timestamps strictly to UTC ISO-8601.
 */

const fs = require("fs");
const path = require("path");
const logger = require("../logger");

/**
 * Strict ISO-8601 validation regex.
 * Matches standard UTC and offset timestamps, e.g.:
 * 2026-03-15T14:32:18Z, 2026-03-15T14:32:18.123Z, 2026-03-15T14:32:18+00:00
 */
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Validates whether a string is a strict, valid ISO-8601 timestamp and normalizes to UTC.
 *
 * @param {string|null|undefined} raw - Raw timestamp string
 * @returns {string|null} Normalized UTC ISO-8601 string or null if invalid
 */
function validateAndNormalizeIsoTimestamp(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || !ISO_8601_REGEX.test(trimmed)) return null;

  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) return null;

  // Sanity check year range (e.g., modern satellite era: 1990 - 2100)
  const year = parsed.getUTCFullYear();
  if (year < 1990 || year > 2100) return null;

  return parsed.toISOString();
}

/**
 * Parses standard TIFF Tag 306 (DateTime) format: "YYYY:MM:DD HH:MM:SS"
 *
 * @param {string} tagValue
 * @returns {string|null} UTC ISO-8601 string or null
 */
function parseTiffDateTimeTag(tagValue) {
  if (!tagValue || typeof tagValue !== "string") return null;
  const match = tagValue.trim().match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;

  const [, yr, mo, dy, hr, mi, se] = match;
  const isoStr = `${yr}-${mo}-${dy}T${hr}:${mi}:${se}Z`;
  const parsed = new Date(isoStr);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Searches for and parses Sentinel-1 SAFE manifest.safe or annotation XML metadata.
 * Can inspect an adjacent manifest.safe, a parent .SAFE directory, or a subfolder.
 *
 * @param {string} filePath - Absolute path to uploaded raster or directory
 * @returns {Object|null} Extracted metadata or null
 */
function extractFromSentinel1ProductFiles(filePath) {
  if (!filePath || typeof filePath !== "string") return null;

  try {
    const dir = fs.statSync(filePath).isDirectory() ? filePath : path.dirname(filePath);
    const candidateFiles = [
      path.join(dir, "manifest.safe"),
      path.join(dir, "MANIFEST.SAFE"),
      path.join(path.dirname(dir), "manifest.safe"),
    ];

    // Check for manifest.safe in current or parent directory
    for (const manifestPath of candidateFiles) {
      if (fs.existsSync(manifestPath)) {
        const content = fs.readFileSync(manifestPath, "utf8");
        // Look for <safe:startTime>2026-03-15T14:32:18.123456Z</safe:startTime>
        const startMatch = content.match(/<safe:startTime>([^<]+)<\/safe:startTime>/i) ||
                           content.match(/<startTime>([^<]+)<\/startTime>/i);
        const stopMatch = content.match(/<safe:stopTime>([^<]+)<\/safe:stopTime>/i) ||
                          content.match(/<stopTime>([^<]+)<\/stopTime>/i);
        const platformMatch = content.match(/<safe:familyName>([^<]+)<\/safe:familyName>/i) ||
                              content.match(/<safe:platform>([^<]+)<\/safe:platform>/i);
        const passMatch = content.match(/<s1:pass>([^<]+)<\/s1:pass>/i);

        if (startMatch && startMatch[1]) {
          const normTime = validateAndNormalizeIsoTimestamp(startMatch[1]);
          if (normTime) {
            return {
              timestamp: normTime,
              source: "SENTINEL1_PRODUCT_METADATA",
              confidence: "AUTHENTIC",
              evidence: path.basename(manifestPath),
              sourceProduct: {
                platform: platformMatch ? platformMatch[1].trim() : "Sentinel-1",
                acquisitionStart: normTime,
                acquisitionEnd: stopMatch ? validateAndNormalizeIsoTimestamp(stopMatch[1]) : null,
                orbitPass: passMatch ? passMatch[1].trim() : null,
                metadataSource: "manifest.safe",
              },
            };
          }
        }
      }
    }

    // Check annotation/*.xml directory if present
    const annotationDir = path.join(dir, "annotation");
    if (fs.existsSync(annotationDir) && fs.statSync(annotationDir).isDirectory()) {
      const xmlFiles = fs.readdirSync(annotationDir).filter((f) => f.toLowerCase().endsWith(".xml"));
      for (const xmlFile of xmlFiles) {
        const xmlPath = path.join(annotationDir, xmlFile);
        const xmlContent = fs.readFileSync(xmlPath, "utf8");
        const startMatch = xmlContent.match(/<startTime>([^<]+)<\/startTime>/i);
        if (startMatch && startMatch[1]) {
          const normTime = validateAndNormalizeIsoTimestamp(startMatch[1]);
          if (normTime) {
            return {
              timestamp: normTime,
              source: "SENTINEL1_PRODUCT_METADATA",
              confidence: "AUTHENTIC",
              evidence: `annotation/${xmlFile}`,
              sourceProduct: {
                platform: "Sentinel-1",
                acquisitionStart: normTime,
                metadataSource: `annotation/${xmlFile}`,
              },
            };
          }
        }
      }
    }
  } catch (err) {
    logger.debug("[SatelliteTemporalMetadata] SAFE file inspection failed", { err: err.message });
  }

  return null;
}

/**
 * Parses official Sentinel-1 standard product filename format.
 * Format: S1A_IW_GRDH_1SDV_20260315T143218_20260315T143243_042456_050F56_ABCD.SAFE or .tif
 *
 * DO NOT use this for benchmark filenames like 00046.tif or custom names.
 *
 * @param {string} filename
 * @returns {Object|null}
 */
function extractFromSentinel1ProductFilename(filename) {
  if (!filename || typeof filename !== "string") return null;
  const base = path.basename(filename);

  // Official ESA Sentinel-1 naming convention
  const s1Regex = /^S1[AB]_[A-Z0-9]{2}_[A-Z0-9]{4}_[A-Z0-9]{4}_(\d{8}T\d{6})_(\d{8}T\d{6})_/;
  const match = base.match(s1Regex);
  if (!match) return null;

  const startRaw = match[1]; // e.g. 20260315T143218
  const yr = startRaw.substring(0, 4);
  const mo = startRaw.substring(4, 6);
  const dy = startRaw.substring(6, 8);
  const hr = startRaw.substring(9, 11);
  const mi = startRaw.substring(11, 13);
  const se = startRaw.substring(13, 15);

  const iso = `${yr}-${mo}-${dy}T${hr}:${mi}:${se}Z`;
  const normTime = validateAndNormalizeIsoTimestamp(iso);
  if (!normTime) return null;

  return {
    timestamp: normTime,
    source: "SENTINEL1_PRODUCT_METADATA",
    confidence: "AUTHENTIC",
    evidence: "SENTINEL1_PRODUCT_NAME_PARSED",
    sourceProduct: {
      platform: base.startsWith("S1A") ? "Sentinel-1A" : "Sentinel-1B",
      productId: base.replace(/\.(SAFE|tif|tiff|zip)$/i, ""),
      acquisitionStart: normTime,
      metadataSource: "official_product_identifier",
    },
  };
}

/**
 * Extracts authentic satellite acquisition timestamp from source raster and metadata.
 *
 * Priority order:
 *   A. Sentinel-1 SAFE product metadata (manifest.safe / annotation XML)
 *   B. Embedded GeoTIFF Tag 306 (TIFFTAG_DATETIME)
 *   C. GDAL / rasterio metadata tags
 *   D. Official Sentinel-1 product naming convention
 *   E. No timestamp -> returns NOT_AVAILABLE
 *
 * @param {Object} params
 * @param {string} [params.filePath] - Local file path on disk
 * @param {string} [params.sourceType] - Declared source type (e.g. SENTINEL1_DUAL_POL)
 * @param {Object} [params.metadata] - Pre-extracted metadata (from Python inspect or TIFF header)
 * @returns {Object} { timestamp, source, confidence, isAuthoritative, evidence, sourceProduct }
 */
function extractSatelliteAcquisitionTime({ filePath = null, sourceType = null, metadata = null } = {}) {
  // ── Priority A: Sentinel-1 SAFE Product Files ─────────────────────────────
  if (filePath) {
    const safeResult = extractFromSentinel1ProductFiles(filePath);
    if (safeResult) {
      return {
        ...safeResult,
        isAuthoritative: true,
      };
    }
  }

  // ── Priority B: Embedded GeoTIFF Tag 306 (TIFFTAG_DATETIME) ───────────────
  const rawDateTimeTag =
    metadata?.dateTimeTag ||
    metadata?.tiffMetadata?.dateTimeTag ||
    metadata?.tags?.TIFFTAG_DATETIME ||
    metadata?.tiffMetadata?.tags?.TIFFTAG_DATETIME;

  if (rawDateTimeTag) {
    const normTag = parseTiffDateTimeTag(rawDateTimeTag) || validateAndNormalizeIsoTimestamp(rawDateTimeTag);
    if (normTag) {
      return {
        timestamp: normTag,
        source: "RASTER_METADATA",
        confidence: "AUTHENTIC",
        isAuthoritative: true,
        evidence: "TIFFTAG_DATETIME",
        sourceProduct: null,
      };
    }
  }

  // ── Priority C: GDAL / Raster Metadata Tags ───────────────────────────────
  const metaTags = {
    ...(metadata?.tags || {}),
    ...(metadata?.tiffMetadata?.tags || {}),
    ...(metadata?.geospatialMetadata?.tags || {}),
  };

  const gdalCandidateKeys = [
    "ACQUISITION_DATETIME",
    "ACQUISITION_TIME",
    "S1_ACQUISITION_START",
    "START_TIME",
    "CENTRAL_TIME",
    "IMAGE_DATE",
    "acquisition_date",
  ];

  for (const key of gdalCandidateKeys) {
    const val = metaTags[key] || metaTags[key.toLowerCase()];
    if (val) {
      const normTime = validateAndNormalizeIsoTimestamp(val) || parseTiffDateTimeTag(val);
      if (normTime) {
        return {
          timestamp: normTime,
          source: "RASTER_METADATA",
          confidence: "AUTHENTIC",
          isAuthoritative: true,
          evidence: `GDAL_METADATA_TAG:${key}`,
          sourceProduct: null,
        };
      }
    }
  }

  // Check direct acquisitionTimestamp in metadata if present
  if (metadata?.acquisitionTimestamp && metadata?.temporalSource !== "ANALYST_SUPPLIED") {
    const normTime = validateAndNormalizeIsoTimestamp(metadata.acquisitionTimestamp);
    if (normTime) {
      return {
        timestamp: normTime,
        source: metadata?.temporalSource || "RASTER_METADATA",
        confidence: "AUTHENTIC",
        isAuthoritative: true,
        evidence: metadata?.evidence || "EMBEDDED_RASTER_METADATA",
        sourceProduct: metadata?.sourceProduct || null,
      };
    }
  }

  // ── Priority D: Official Sentinel-1 Product Naming Convention ─────────────
  if (filePath) {
    const s1FilenameResult = extractFromSentinel1ProductFilename(filePath);
    if (s1FilenameResult) {
      return {
        ...s1FilenameResult,
        isAuthoritative: true,
      };
    }
  }

  // ── Priority E: No Authentic Timestamp Found ──────────────────────────────
  return {
    timestamp: null,
    source: "NOT_AVAILABLE",
    confidence: "NOT_AVAILABLE",
    isAuthoritative: false,
    evidence: null,
    sourceProduct: null,
  };
}

/**
 * Resolves the final authoritative temporal reference for an investigation.
 *
 * Rules:
 *   1. Automatic authentic metadata takes precedence over analyst input.
 *   2. If authentic metadata is found AND analyst provides a conflicting timestamp:
 *      - Flags TEMPORAL_REFERENCE_CONFLICT
 *      - Exposes detectedTimestamp and analystTimestamp
 *      - Authentic metadata WINS by default (isAuthoritative = true)
 *   3. If authentic metadata is found AND analyst provides the same timestamp:
 *      - Returns AUTHENTIC with conflict = false
 *   4. If authentic metadata is NOT_AVAILABLE:
 *      - Checks analystTimestamp. If valid ISO-8601:
 *        source = "ANALYST_SUPPLIED", confidence = "ANALYST_DECLARED", isAuthoritative = true
 *   5. If neither exists:
 *      - source = "NOT_AVAILABLE", confidence = "NOT_AVAILABLE", isAuthoritative = false
 *
 * @param {Object} params
 * @param {Object} params.extractedMetadata - Output of extractSatelliteAcquisitionTime
 * @param {string|null} [params.analystTimestamp] - Raw analyst input string
 * @returns {Object} Normalized temporalReference block
 */
function resolveInvestigationTemporalReference({ extractedMetadata = null, analystTimestamp = null } = {}) {
  const normAnalyst = validateAndNormalizeIsoTimestamp(analystTimestamp);
  const authentic = extractedMetadata?.isAuthoritative ? extractedMetadata : null;

  // Case 1: Authentic metadata exists
  if (authentic && authentic.timestamp) {
    if (normAnalyst) {
      // Check for conflict
      const diffMs = Math.abs(new Date(authentic.timestamp).getTime() - new Date(normAnalyst).getTime());
      if (diffMs > 1000) {
        // Differ by more than 1 second -> Conflict detected. Authentic wins!
        logger.warn(
          "[SatelliteTemporalMetadata] TEMPORAL_REFERENCE_CONFLICT detected: Analyst timestamp contradicts authentic metadata. Authentic metadata retained.",
          { detectedTimestamp: authentic.timestamp, analystTimestamp: normAnalyst }
        );

        return {
          timestamp: authentic.timestamp,
          source: authentic.source,
          confidence: "AUTHENTIC",
          isAuthoritative: true,
          evidence: authentic.evidence,
          sourceProduct: authentic.sourceProduct || null,
          conflict: true,
          conflictType: "TEMPORAL_REFERENCE_CONFLICT",
          analystTimestamp: normAnalyst,
          conflictDetails: {
            detectedTimestamp: authentic.timestamp,
            analystTimestamp: normAnalyst,
            resolution: "AUTHENTIC_METADATA_PREFERRED",
          },
          warning: "TEMPORAL_REFERENCE_CONFLICT: Authentic satellite/raster metadata takes precedence over conflicting analyst input.",
        };
      }

      // Identical timestamps
      return {
        timestamp: authentic.timestamp,
        source: authentic.source,
        confidence: "AUTHENTIC",
        isAuthoritative: true,
        evidence: authentic.evidence,
        sourceProduct: authentic.sourceProduct || null,
        conflict: false,
      };
    }

    // No analyst timestamp, authentic metadata only
    return {
      timestamp: authentic.timestamp,
      source: authentic.source,
      confidence: "AUTHENTIC",
      isAuthoritative: true,
      evidence: authentic.evidence,
      sourceProduct: authentic.sourceProduct || null,
      conflict: false,
    };
  }

  // Case 2: Authentic metadata not available, check analyst-supplied timestamp
  if (normAnalyst) {
    return {
      timestamp: normAnalyst,
      source: "ANALYST_SUPPLIED",
      confidence: "ANALYST_DECLARED",
      isAuthoritative: true,
      evidence: "analyst_input",
      sourceProduct: null,
      conflict: false,
    };
  }

  // Case 3: Neither exists
  return {
    timestamp: null,
    source: "NOT_AVAILABLE",
    confidence: "NOT_AVAILABLE",
    isAuthoritative: false,
    evidence: null,
    sourceProduct: null,
    conflict: false,
  };
}

module.exports = {
  validateAndNormalizeIsoTimestamp,
  parseTiffDateTimeTag,
  extractSatelliteAcquisitionTime,
  resolveInvestigationTemporalReference,
};
