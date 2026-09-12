const config = require("../config/env");

const formatMessage = (level, message, meta) => {
  const timestamp = new Date().toISOString();

  const metadata =
    meta && Object.keys(meta).length > 0
      ? ` ${JSON.stringify(meta)}`
      : "";

  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metadata}`;
};

const logger = {
  info(message, meta = {}) {
    if (config.logLevel !== "silent") {
      console.log(formatMessage("info", message, meta));
    }
  },

  warn(message, meta = {}) {
    console.warn(formatMessage("warn", message, meta));
  },

  error(message, meta = {}) {
    console.error(formatMessage("error", message, meta));
  },

  debug(message, meta = {}) {
    if (config.nodeEnv === "development") {
      console.debug(formatMessage("debug", message, meta));
    }
  }
};

module.exports = logger;