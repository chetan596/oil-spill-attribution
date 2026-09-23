require("dotenv").config();

/**
 * Application configuration — single source of truth.
 *
 * Convention: camelCase throughout. All consumers MUST reference these keys.
 * Do NOT read process.env directly elsewhere in the application.
 */
const config = {
  // ── Runtime ──────────────────────────────────────────────────────────────
  nodeEnv: process.env.NODE_ENV || "development",
  appName: process.env.APP_NAME || "oil-spill-attribution",

  // ── HTTP Server ───────────────────────────────────────────────────────────
  host:      process.env.API_HOST   || "0.0.0.0",
  port:      Number(process.env.API_PORT || process.env.PORT) || 4000,
  apiPrefix: process.env.API_PREFIX || "/api/v1",

  // ── Database ──────────────────────────────────────────────────────────────
  databaseUrl: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/oil_spill_db?schema=public",

  // ── Redis ─────────────────────────────────────────────────────────────────
  // Prioritizes REDIS_URL; falls back to REDIS_HOST and REDIS_PORT.
  redisHost:     process.env.REDIS_HOST || "localhost",
  redisPort:     Number(process.env.REDIS_PORT) || 6379,
  redisPassword: process.env.REDIS_PASSWORD || undefined,
  redisUrl:      process.env.REDIS_URL ||
    `redis://${process.env.REDIS_HOST || "localhost"}:${Number(process.env.REDIS_PORT) || 6379}`,

  // ── ML Python Service ─────────────────────────────────────────────────────
  mlServiceUrl:       process.env.ML_SERVICE_URL        || "http://127.0.0.1:8000",
  mlApiKey:           process.env.ML_API_KEY            || "",
  mlServiceTimeoutMs: Number(process.env.ML_SERVICE_TIMEOUT_MS) || 120000,

  // ── Authentication ────────────────────────────────────────────────────────
  jwtSecret:    process.env.JWT_SECRET    || "dev-secret-CHANGE-IN-PRODUCTION",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",

  // ── Logging ───────────────────────────────────────────────────────────────
  logLevel: process.env.LOG_LEVEL || "info",

  // ── Copernicus Data Space Ecosystem (CDSE) ─────────────────────────────────
  cdseUsername: process.env.CDSE_USERNAME || process.env.COPERNICUS_API_USER || "",
  cdsePassword: process.env.CDSE_PASSWORD || process.env.COPERNICUS_API_PASSWORD || "",
  cdseAuthUrl:  process.env.CDSE_AUTH_URL || "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token",
  cdseStacUrl:  process.env.CDSE_STAC_URL || "https://stac.dataspace.copernicus.eu/v1",
  cdseOdataUrl: process.env.CDSE_ODATA_URL || "https://catalogue.dataspace.copernicus.eu/odata/v1",
  cdseDownloadUrl: process.env.CDSE_DOWNLOAD_URL || "https://download.dataspace.copernicus.eu/odata/v1",
  cdseStorageDir: process.env.CDSE_STORAGE_DIR || "data/raw/satellite/cdse",

  // ── Historical AIS Telemetry Provider ─────────────────────────────────────
  aisHistoricalProvider:    process.env.AIS_HISTORICAL_PROVIDER || "",
  aisHistoricalApiUrl:      process.env.AIS_HISTORICAL_API_URL || "",
  aisHistoricalApiKey:      process.env.AIS_HISTORICAL_API_KEY || "",
  aisHistoricalBearerToken: process.env.AIS_HISTORICAL_BEARER_TOKEN || "",
  aisHistoricalUsername:    process.env.AIS_HISTORICAL_USERNAME || "",
  aisHistoricalPassword:    process.env.AIS_HISTORICAL_PASSWORD || "",
  aisHistoricalTimeoutMs:   Number(process.env.AIS_HISTORICAL_TIMEOUT_MS) || 30000,

  // ── Global Fishing Watch (GFW) Historical AIS ─────────────────────────
  gfwApiUrl:   process.env.GFW_API_URL   || "https://gateway.api.globalfishingwatch.org",
  gfwApiToken: process.env.GFW_API_TOKEN || process.env.AIS_HISTORICAL_API_KEY || "",
};

// Warn loudly when using the default secret in non-development environments
if (
  config.nodeEnv !== "development" &&
  config.jwtSecret === "dev-secret-CHANGE-IN-PRODUCTION"
) {
  console.error(
    "[SECURITY] JWT_SECRET env var is not set! Using insecure default. " +
    "Set JWT_SECRET in your environment immediately."
  );
}

module.exports = config;