const { Queue } = require("bullmq");
const redis = require("../config/redis");

/**
 * BullMQ Queues.
 *
 * All queues share the same Redis connection.
 * The analysis pipeline uses a single queue: "analysis-pipeline".
 * Separate queues are available for targeted retry/priority control.
 */

const queueOptions = {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail:     { count: 50  },
  },
};

/** Main analysis pipeline queue */
const analysisQueue = new Queue("analysis-pipeline", queueOptions);

module.exports = { analysisQueue };
