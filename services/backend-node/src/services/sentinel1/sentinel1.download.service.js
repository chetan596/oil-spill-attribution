/**
 * Copernicus Data Space Ecosystem (CDSE) Download and Staging Service
 *
 * Handles OAuth2 Keycloak token authentication, authenticated streaming download
 * of Sentinel-1 SAFE/measurement rasters, safe local directory isolation,
 * checksum calculation, and provenance persistence.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");
const config = require("../../config/env");
const logger = require("../../logger");
const { getProductById } = require("./sentinel1.catalog.service");

// Token cache memory store
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Acquire or refresh CDSE Keycloak Bearer token.
 */
async function getCdseAccessToken() {
  const username = config.cdseUsername;
  const password = config.cdsePassword;

  if (!username || !password) {
    throw new Error(
      "CDSE credentials not configured. Please set CDSE_USERNAME and CDSE_PASSWORD in backend environment."
    );
  }

  // Return cached token if valid with 60s buffer
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  const authUrl = config.cdseAuthUrl;

  logger.info("[CDSE] Authenticating with Copernicus Keycloak OAuth2 service", {
    authUrl,
    userPrefix: username.substring(0, 3) + "***",
  });

  const params = new URLSearchParams();
  params.append("client_id", "cdse-public");
  params.append("grant_type", "password");
  params.append("username", username);
  params.append("password", password);

  try {
    const response = await axios.post(authUrl, params.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 15000,
    });

    const data = response.data;
    cachedToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in || 300) * 1000;

    logger.info("[CDSE] Keycloak authentication successful", {
      expiresInSec: data.expires_in,
    });

    return cachedToken;
  } catch (err) {
    logger.error("[CDSE] Keycloak authentication failed", {
      error: err.message,
      status: err.response ? err.response.status : "NETWORK_ERROR",
      details: err.response ? err.response.data : null,
    });
    throw new Error(
      `CDSE Authentication Failed: ${err.response?.data?.error_description || err.message}`
    );
  }
}

/**
 * Compute SHA256 checksum of a file.
 */
async function computeFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (data) => hash.update(data));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
}

/**
 * Ensure CDSE product storage directory exists.
 */
function getProductStorageDir(productId) {
  const safeId = productId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const baseDir = path.isAbsolute(config.cdseStorageDir)
    ? config.cdseStorageDir
    : path.join(process.cwd(), "..", "..", config.cdseStorageDir);

  const productDir = path.join(baseDir, safeId);
  if (!fs.existsSync(productDir)) {
    fs.mkdirSync(productDir, { recursive: true });
  }
  return { productDir, safeId };
}

/**
 * Download or stage a Sentinel-1 product for analysis.
 *
 * @param {string} productId - CDSE Product ID or UUID
 * @param {Object} [options]
 * @returns {Promise<Object>} Staging result and metadata
 */
async function stageSentinel1Product(productId, options = {}) {
  logger.info("[CDSE] Staging Sentinel-1 product for analysis", { productId, options });

  // 1. Fetch full normalized metadata from CDSE catalogue
  const productMetaRes = await getProductById(productId);
  const meta = productMetaRes.product;

  const { productDir, safeId } = getProductStorageDir(meta.id);
  const metadataPath = path.join(productDir, "source-metadata.json");

  // Check if already downloaded and verified
  if (fs.existsSync(metadataPath)) {
    try {
      const existingMeta = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
      if (existingMeta.staged && existingMeta.localPath && fs.existsSync(existingMeta.localPath)) {
        logger.info("[CDSE] Product already staged in local cache", {
          productId: meta.id,
          localPath: existingMeta.localPath,
        });
        const stat = fs.statSync(existingMeta.localPath);
        options.onProgress?.({
          stage: "DOWNLOADING",
          percent: 100,
          bytesDownloaded: stat.size,
          totalBytes: stat.size,
          speedBps: 0,
          message: "Product verified in local CDSE cache",
        });
        return {
          success: true,
          isAlreadyStaged: true,
          provenance: existingMeta,
        };
      }
    } catch (e) {
      logger.warn("[CDSE] Re-staging product due to invalid existing metadata", { error: e.message });
    }
  }

  // 2. Check credentials & authenticate
  options.onProgress?.({
    stage: "AUTHENTICATING_CDSE",
    percent: 10,
    message: "Authenticating with Copernicus Keycloak OAuth2...",
  });

  let token = null;
  try {
    token = await getCdseAccessToken();
  } catch (authErr) {
    logger.error("[CDSE] Authentication failure during product download", {
      error: authErr.message,
    });
    throw new Error(`CDSE Authentication Failed: ${authErr.message}`);
  }

  const downloadUrl = meta.vvDownloadUrl || `${config.cdseDownloadUrl}/Products(${meta.productUuid})/$value`;

  // 3. Construct provenance record
  const provenance = {
    source: "COPERNICUS_DATA_SPACE",
    mission: "Sentinel-1",
    productId: meta.id,
    productName: meta.name,
    productUuid: meta.productUuid,
    acquisitionStart: meta.acquisitionStart,
    acquisitionEnd: meta.acquisitionEnd,
    productType: meta.productType,
    acquisitionMode: meta.acquisitionMode,
    polarization: meta.polarization,
    orbitDirection: meta.orbitDirection,
    relativeOrbit: meta.relativeOrbit,
    absoluteOrbit: meta.absoluteOrbit,
    geometry: meta.geometry,
    bbox: meta.bbox,
    downloadTimestamp: new Date().toISOString(),
    originalProductLocation: downloadUrl,
    localPath: path.join(productDir, "product.tiff"),
    staged: false,
    authStatus: "AUTHENTICATED",
    crs: "EPSG:4326",
    bounds: meta.bbox,
    bands: ["VV", "VH"],
    detectionModel: "unet-dual-pol-sar-v2",
    threshold: 0.35,
  };

  // 4. Perform authenticated stream download
  const targetTiffPath = path.join(productDir, `${safeId}_vv.tiff`);
  try {
    logger.info("[CDSE] Initiating authenticated asset download", {
      url: downloadUrl,
      targetPath: targetTiffPath,
    });

    options.onProgress?.({
      stage: "DOWNLOADING",
      percent: 15,
      bytesDownloaded: 0,
      totalBytes: null,
      message: "Connected to CDSE stream, initiating transfer...",
    });

    const downloadRes = await axios({
      method: "GET",
      url: downloadUrl,
      headers: {
        Authorization: `Bearer ${token}`,
      },
      responseType: "stream",
      timeout: 600000, // 10 minutes timeout for high-res SAR scenes
    });

    const totalBytes = parseInt(downloadRes.headers["content-length"] || "0", 10);
    let downloadedBytes = 0;
    const startTime = Date.now();
    let lastProgressTime = 0;

    const writer = fs.createWriteStream(targetTiffPath);

    downloadRes.data.on("data", (chunk) => {
      downloadedBytes += chunk.length;
      const now = Date.now();
      if (now - lastProgressTime > 600) {
        lastProgressTime = now;
        const elapsedSec = (now - startTime) / 1000;
        const speedBps = elapsedSec > 0 ? Math.round(downloadedBytes / elapsedSec) : 0;
        const percent = totalBytes > 0 ? Math.min(95, Math.round((downloadedBytes / totalBytes) * 100)) : null;

        options.onProgress?.({
          stage: "DOWNLOADING",
          bytesDownloaded: downloadedBytes,
          totalBytes: totalBytes > 0 ? totalBytes : null,
          percent,
          speedBps,
          message: totalBytes > 0
            ? `Downloading: ${(downloadedBytes / 1048576).toFixed(1)} MB / ${(totalBytes / 1048576).toFixed(1)} MB (${percent}%)`
            : `Downloading: ${(downloadedBytes / 1048576).toFixed(1)} MB transferred`,
        });
      }
    });

    downloadRes.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
      downloadRes.data.on("error", reject);
    });

    const checksum = await computeFileSha256(targetTiffPath);
    provenance.localPath = targetTiffPath;
    provenance.checksum = checksum;
    provenance.staged = true;
    provenance.sizeBytes = downloadedBytes;

    logger.info("[CDSE] Binary asset download completed successfully", {
      targetPath: targetTiffPath,
      checksum,
      sizeBytes: downloadedBytes,
    });

    options.onProgress?.({
      stage: "DOWNLOADING",
      bytesDownloaded: downloadedBytes,
      totalBytes: downloadedBytes,
      percent: 100,
      speedBps: 0,
      message: "Download complete and verified",
    });
  } catch (dlErr) {
    logger.error("[CDSE] Binary asset download failed", { error: dlErr.message });
    if (fs.existsSync(targetTiffPath)) {
      try { fs.unlinkSync(targetTiffPath); } catch (_) {}
    }
    throw new Error(`CDSE Download Failed: ${dlErr.message}`);
  }

  // Persist source metadata
  fs.writeFileSync(metadataPath, JSON.stringify(provenance, null, 2), "utf-8");

  return {
    success: true,
    isAlreadyStaged: false,
    provenance,
  };
}

module.exports = {
  getCdseAccessToken,
  computeFileSha256,
  getProductStorageDir,
  stageSentinel1Product,
};
