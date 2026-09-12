/**
 * Prisma seed script wrapper — delegates to src/db/seed.js
 * Run: npx prisma db seed
 */

const { runSeed } = require("../src/db/seed");

runSeed()
  .catch((err) => {
    console.error("[PrismaSeed] Error during seeding:", err);
    process.exit(1);
  });
