/**
 * ais.provider.factory.js
 * Phase 16.4 Part 7.2 — AIS Provider Factory
 *
 * Resolves the active AIS telemetry provider based on EXPLICIT environment
 * configuration. There is NO automatic fallback chain.
 *
 * Resolution rules:
 *   - AIS_PROVIDER env var explicitly selects the provider.
 *   - Default provider is "openseafeed" when AIS_PROVIDER is not set.
 *   - If the selected real provider is not configured (missing credentials),
 *     the factory returns it anyway — the correlation service will detect
 *     isConfigured()=false and return AIS_DATA_UNAVAILABLE.
 *   - NEVER silently switches from a failed real provider to DemoAisClient.
 *
 * Demo mode:
 *   - DemoAisClient is ONLY available when AIS_DEMO_MODE=true AND
 *     NODE_ENV is NOT "production".
 *   - Attempting demo mode in production throws AIS_DEMO_DISABLED_IN_PRODUCTION.
 *   - DemoAisClient may be injected explicitly into tests via setProvider().
 */

const OpenSeaFeedClient = require("./openseafeed.client");
const MarineTrafficClient = require("./marinetraffic.client");
const AisStreamClient = require("./aisstream.client");
const DemoAisClient = require("./demo-ais.client");
const GlobalHistoricalAisClient = require("./global-historical-ais.client");
const GfwHistoricalAisClient = require("./gfw-historical-ais.client");
const logger = require("../../logger");

class AisProviderFactory {
  constructor() {
    this._overrideProvider = null;
  }

  /**
   * Set custom provider override (e.g. for unit and integration test fixtures).
   * @param {import("./ais.provider")|null} provider
   */
  setProvider(provider) {
    this._overrideProvider = provider;
  }

  /**
   * Reset provider override.
   */
  reset() {
    this._overrideProvider = null;
  }

  /**
   * Resolve active live/current AIS provider instance.
   *
   * @returns {import("./ais.provider")} Active provider instance
   */
  getAisProvider() {
    if (this._overrideProvider) {
      return this._overrideProvider;
    }

    const providerType = (process.env.AIS_PROVIDER || "openseafeed").trim().toLowerCase();
    const isProduction = (process.env.NODE_ENV || "").trim().toLowerCase() === "production";
    const demoModeRequested = (process.env.AIS_DEMO_MODE || "").trim().toLowerCase() === "true";

    // ── Demo mode gate ──────────────────────────────────────────────────
    if (providerType === "demo" || demoModeRequested) {
      if (isProduction) {
        const err = new Error(
          "AIS_DEMO_DISABLED_IN_PRODUCTION: DemoAisClient cannot execute in a production environment. " +
          "Set AIS_PROVIDER to a real provider (openseafeed, marinetraffic, aisstream) or remove AIS_DEMO_MODE."
        );
        err.code = "AIS_DEMO_DISABLED_IN_PRODUCTION";
        logger.error("[AisProviderFactory] " + err.message);
        throw err;
      }

      logger.info("[AisProviderFactory] Sourcing DEMONSTRATION AIS telemetry (AIS_DEMO_MODE=true or AIS_PROVIDER=demo). Development/test only.");
      return new DemoAisClient();
    }

    // ── Real providers — explicit selection, NO fallback ─────────────────
    switch (providerType) {
      case "openseafeed":
        logger.info("[AisProviderFactory] Sourcing real AIS telemetry via OpenSeaFeed");
        return new OpenSeaFeedClient();

      case "marinetraffic":
        logger.info("[AisProviderFactory] Sourcing real AIS telemetry via MarineTraffic");
        return new MarineTrafficClient();

      case "aisstream":
        logger.info("[AisProviderFactory] Sourcing real AIS telemetry via AISStream");
        return new AisStreamClient();

      default:
        logger.warn(`[AisProviderFactory] Unknown AIS_PROVIDER="${providerType}" — defaulting to OpenSeaFeed`);
        return new OpenSeaFeedClient();
    }
  }

  /**
   * Resolve active HISTORICAL AIS provider instance (Section E & F).
   * Supports global historical AIS queries across international waters.
   *
   * @returns {import("./ais.provider")} Active historical provider instance
   */
  getHistoricalAisProvider(providerOverride = null) {
    if (this._overrideProvider) {
      return this._overrideProvider;
    }

    const historicalType = (
      providerOverride ||
      process.env.AIS_HISTORICAL_PROVIDER ||
      process.env.AIS_PROVIDER ||
      ""
    ).trim().toLowerCase();
    const isProduction = (process.env.NODE_ENV || "").trim().toLowerCase() === "production";
    const demoModeRequested = (process.env.AIS_DEMO_MODE || "").trim().toLowerCase() === "true";

    if (historicalType === "demo" || (demoModeRequested && !historicalType)) {
      if (isProduction) {
        const err = new Error("AIS_DEMO_DISABLED_IN_PRODUCTION: Historical demo AIS is disabled in production.");
        err.code = "AIS_DEMO_DISABLED_IN_PRODUCTION";
        throw err;
      }
      return new DemoAisClient();
    }

    if (historicalType === "openseafeed") {
      return new OpenSeaFeedClient();
    }

    if (historicalType === "marinetraffic") {
      return new MarineTrafficClient();
    }

    if (historicalType === "aisstream") {
      return new AisStreamClient();
    }

    if (
      historicalType === "global_fishing_watch" ||
      historicalType === "globalfishingwatch" ||
      historicalType === "gfw"
    ) {
      return new GfwHistoricalAisClient();
    }

    if (
      historicalType === "exactais_gws" ||
      historicalType === "exactearth" ||
      historicalType === "kpler"
    ) {
      return new GlobalHistoricalAisClient();
    }

    // If GFW token is configured and provider not explicitly set to Kpler, default to GFW
    const hasGfwToken = Boolean(
      (process.env.GFW_API_TOKEN && process.env.GFW_API_TOKEN.trim().length > 0) ||
      (process.env.AIS_HISTORICAL_API_KEY && process.env.AIS_HISTORICAL_API_KEY.trim().length > 0 && !historicalType.includes("exact"))
    );

    if (hasGfwToken && !historicalType.includes("exact")) {
      return new GfwHistoricalAisClient();
    }

    // Default to GlobalHistoricalAisClient (Section F requirement: Global coverage)
    return new GlobalHistoricalAisClient();
  }
}

module.exports = new AisProviderFactory();
