const env = require("./env");

/**
 * External service configurations.
 * All consumers should import from here, not read env directly.
 */
module.exports = {
  mlService: {
    baseUrl:   env.mlServiceUrl,
    timeoutMs: env.mlServiceTimeoutMs,
  },
};
