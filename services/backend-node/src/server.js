const app = require("./app");
const config = require("./config/env");
const logger = require("./logger");
const { createAnalysisWorker } = require("./jobs/analysis.worker");

// Server entrypoint - SIH26143 backend
let worker;
try {
  worker = createAnalysisWorker();
} catch (err) {
  logger.warn(`[Worker] Could not start analysis worker: ${err.message}`);
}

const server = app.listen(config.port, config.host, () => {
  logger.info(
    `Oil Spill Attribution API running at http://${config.host}:${config.port}`
  );
});

const shutdown = async (signal) => {
  logger.info(`${signal} received. Shutting down server...`);

  if (worker) {
    try {
      await worker.close();
      logger.info("BullMQ worker closed.");
    } catch (err) {
      logger.error("Error closing BullMQ worker:", err);
    }
  }

  server.close(() => {
    logger.info("HTTP server closed.");
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));