const { PrismaClient } = require("@prisma/client");
const env = require("../config/env");

/**
 * Shared PrismaClient singleton.
 *
 * All repositories MUST import from this module.
 * Do NOT instantiate PrismaClient directly in any other file.
 *
 * In development, the singleton is stored on the `global` object to
 * prevent connection pool exhaustion during hot-reloads (nodemon).
 */
let prisma;

if (env.nodeEnv === "production") {
  prisma = new PrismaClient({
    log: ["error", "warn"],
  });
} else {
  // Reuse existing instance across hot-reloads in development
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      log: ["query", "error", "warn"],
    });
  }
  prisma = global.__prisma;
}

module.exports = prisma;
