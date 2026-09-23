/**
 * Database Seed Script — AIS Correlation & Vessel Attribution
 *
 * Seeds:
 *   - Demo user (Lead Marine Analyst)
 *   - Demo satellite scene (Sentinel-1 SAR Mumbai offshore)
 *   - 5 Demo vessels (Crude Oil Tanker, Chemical Tanker, Product Tanker, Bulk Carrier, Container Ship)
 *   - 485 Demo AIS track points (48-hour tracks, 30-min reporting)
 *
 * Requirements:
 *   - Idempotent: safe to run multiple times without duplicating data
 *   - Prints inserted/upserted counts
 */

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

const { DEMO_SCENARIOS } = require("../data/demo-scenarios");

const DEMO_USER = {
  email: "analyst@oil-spill.dev",
  name: "Lead Marine Analyst",
  role: "ANALYST",
  password: "Password@123",
};

async function runSeed() {
  console.log("==================================================");
  console.log("STARTING DATABASE SEED (DEMO AIS & SCENARIO)");
  console.log("==================================================");

  // 1. Seed demo user
  const hashedPassword = await bcrypt.hash(DEMO_USER.password, 10);
  const user = await prisma.user.upsert({
    where: { email: DEMO_USER.email },
    update: {},
    create: {
      email: DEMO_USER.email,
      name: DEMO_USER.name,
      role: DEMO_USER.role,
      password: hashedPassword,
    },
  });
  console.log(`[Seed] User ready: ${user.email} (${user.role})`);

  // 2. Seed demo satellite scenes (4 distinct demonstration scenarios)
  for (const [sceneKey, sc] of Object.entries(DEMO_SCENARIOS)) {
    const scene = await prisma.satelliteScene.upsert({
      where: { id: sc.id },
      update: {
        sceneId: sc.sceneId,
        satellite: sc.satellite,
        acquisitionAt: sc.acquisitionAt,
        fileUrl: sc.fileUrl,
        geomWkt: sc.sceneGeomWkt,
        bandInfo: sc.bandInfo,
      },
      create: {
        id: sc.id,
        sceneId: sc.sceneId,
        satellite: sc.satellite,
        acquisitionAt: sc.acquisitionAt,
        fileUrl: sc.fileUrl,
        geomWkt: sc.sceneGeomWkt,
        bandInfo: sc.bandInfo,
      },
    });
    console.log(`[Seed] Scene ready: ${scene.sceneId} (${sc.id})`);
  }

  // 3. Load demo vessels from JSON
  const vesselsPath = path.join(__dirname, "..", "data", "demo-vessels.json");
  const tracksPath = path.join(__dirname, "..", "data", "demo-ais-tracks.json");

  const demoVessels = JSON.parse(fs.readFileSync(vesselsPath, "utf-8"));
  const demoTracks = JSON.parse(fs.readFileSync(tracksPath, "utf-8"));

  let upsertedVessels = 0;
  const vesselIdMap = new Map();

  for (const v of demoVessels) {
    const record = await prisma.vessel.upsert({
      where: { mmsi: String(v.mmsi) },
      update: {
        name: v.name,
        flag: v.flag,
        vesselType: v.vesselType || v.type,
        lengthM: v.lengthM || v.length,
      },
      create: {
        mmsi: String(v.mmsi),
        imo: v.imo || null,
        name: v.name,
        flag: v.flag,
        vesselType: v.vesselType || v.type,
        lengthM: v.lengthM || v.length,
      },
    });
    vesselIdMap.set(String(v.mmsi), record.id);
    upsertedVessels++;
    console.log(`[Seed] Vessel upserted: ${record.name} (MMSI: ${record.mmsi}, Type: ${record.vesselType})`);
  }

  // 4. Seed demo AIS points
  const pointsToInsert = demoTracks.map((pt) => {
    const vesselId = vesselIdMap.get(String(pt.mmsi));
    return {
      vesselId,
      mmsi: String(pt.mmsi),
      latitude: Number(pt.latitude),
      longitude: Number(pt.longitude),
      geomWkt: pt.geomWkt || null,
      timestamp: new Date(pt.timestamp),
      speedKnots: pt.speedKnots != null ? Number(pt.speedKnots) : (pt.SOG != null ? Number(pt.SOG) : null),
      headingDeg: pt.headingDeg != null ? Number(pt.headingDeg) : (pt.heading != null ? Number(pt.heading) : (pt.COG != null ? Number(pt.COG) : null)),
      navStatus: pt.navStatus || "Under way using engine",
    };
  }).filter((pt) => pt.vesselId != null);

  const insertResult = await prisma.aisTrack.createMany({
    data: pointsToInsert,
    skipDuplicates: true,
  });

  const totalPointsInDb = await prisma.aisTrack.count();

  console.log("==================================================");
  console.log(`[Seed] Summary:`);
  console.log(`  - Demo Vessels Upserted: ${upsertedVessels}`);
  console.log(`  - AIS Track Points Added in this run: ${insertResult.count}`);
  console.log(`  - Total AIS Track Points in Database: ${totalPointsInDb}`);
  console.log("  - Source Label: demo");
  console.log("==================================================");

  return {
    upsertedVessels,
    newPointsInserted: insertResult.count,
    totalPointsInDb,
  };
}

if (require.main === module) {
  runSeed()
    .catch((err) => {
      console.error("[Seed] Error during seeding:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = { runSeed };
