const express = require("express");
const aisProviderFactory = require("../clients/ais/ais.provider.factory");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    success: true,
    status: "healthy",
    service: "oil-spill-attribution-api",
    timestamp: new Date().toISOString(),
  });
});

router.get("/historical-ais", async (req, res) => {
  try {
    const provider = aisProviderFactory.getHistoricalAisProvider();
    if (typeof provider.checkHealth === "function") {
      const health = await provider.checkHealth();
      return res.json({
        success: health.historicalQueryReady,
        provider: provider.name,
        configured: health.configured ?? provider.isConfigured(),
        authenticated: health.authenticated ?? provider.isConfigured(),
        dataset: health.dataset || (provider.providerProduct || "exactAIS:HVP"),
        observationLevel: health.observationLevel || "RAW_POSITION",
        rawTracks: health.rawTracks ?? (health.observationLevel !== "VESSEL_PRESENCE"),
        historicalCoverage: health.historicalCoverage || "SUPPORTED",
        health,
        timestamp: new Date().toISOString(),
      });
    }

    return res.json({
      success: provider.isConfigured(),
      provider: provider.name,
      health: {
        providerConfigured: true,
        endpointConfigured: provider.isConfigured(),
        authenticationConfigured: provider.isConfigured(),
        capabilitiesReachable: provider.isConfigured(),
        wfsVersionSupported: false,
        hvpLayerAvailable: false,
        historicalQueryReady: provider.isConfigured(),
        status: provider.isConfigured() ? "READY" : "HISTORICAL_PROVIDER_CONFIGURATION_REQUIRED",
        reason: provider.isConfigured() ? "Provider ready" : "Credentials missing",
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
      code: err.code || "INTERNAL_ERROR",
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;