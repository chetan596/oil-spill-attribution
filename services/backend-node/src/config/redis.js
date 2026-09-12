const Redis = require("ioredis");
const env = require("./env");

/**
 * Shared ioredis client.
 *
 * Connection source priority:
 *   1. env.redisUrl (if provided via REDIS_URL in Docker or cloud environments)
 *   2. env.redisHost + env.redisPort fallback (for local development)
 *
 * maxRetriesPerRequest: null is REQUIRED by BullMQ.
 */
const redisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: false,
  retryStrategy(times) {
    // If Redis is not available, stop retrying after 2 attempts to keep console clean
    if (times > 2) {
      return null;
    }
    return 1000;
  },
};

let redis;

if (env.redisUrl) {
  redis = new Redis(env.redisUrl, redisOptions);
} else {
  redis = new Redis({
    host: env.redisHost || "localhost",
    port: env.redisPort || 6379,
    password: env.redisPassword || undefined,
    ...redisOptions,
  });
}

const connectionTarget = env.redisUrl || `${env.redisHost}:${env.redisPort}`;

redis.on("connect", () => {
  console.log(`[Redis] Connected successfully to ${connectionTarget}`);
});

let hasLoggedWarning = false;
redis.on("error", (err) => {
  // Only log the warning once to avoid repeated spam in development terminal
  if (!hasLoggedWarning) {
    hasLoggedWarning = true;

    let reason = err.message;
    if (!reason || reason.trim() === "") {
      if (err.code) {
        reason = `code: ${err.code}`;
      } else if (Array.isArray(err.errors) && err.errors.length > 0) {
        reason = err.errors.map((e) => e.message || e.code).join(", ");
      } else {
        reason = "Connection refused";
      }
    }

    console.warn(
      `[Redis] Notice: Redis server is not running at ${connectionTarget} (${reason}). Background queues will be inactive until Redis is started.`
    );
  }
});

module.exports = redis;


