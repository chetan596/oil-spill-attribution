const fs = require("fs");
const path = require("path");

const tracksPath = path.join(__dirname, "demo-ais-tracks.json");
const existingTracks = JSON.parse(fs.readFileSync(tracksPath, "utf-8"));

// Keep all existing tracks (Mumbai baseline)
console.log(`Existing tracks count: ${existingTracks.length}`);

const newTracks = [];

// Helper to generate a smooth realistic track segment
function generateSegment(mmsi, startLat, startLng, endLat, endLng, startTimeStr, hours, speedKnots, headingDeg) {
  const startMs = new Date(startTimeStr).getTime();
  const stepMinutes = 30;
  const totalSteps = Math.floor((hours * 60) / stepMinutes);

  for (let i = 0; i <= totalSteps; i++) {
    const fraction = i / totalSteps;
    const lat = Number((startLat + fraction * (endLat - startLat)).toFixed(5));
    const lng = Number((startLng + fraction * (endLng - startLng)).toFixed(5));
    const tMs = startMs + i * stepMinutes * 60 * 1000;

    newTracks.push({
      mmsi: String(mmsi),
      timestamp: new Date(tMs).toISOString(),
      latitude: lat,
      longitude: lng,
      SOG: speedKnots,
      speedKnots: speedKnots,
      COG: headingDeg,
      heading: headingDeg,
      headingDeg: headingDeg,
      navStatus: "Under way using engine",
      source: "demo",
    });
  }
}

// ── SCENARIO B: Gulf of Kutch (Origin: 22.610°N, 69.010°E at 2026-03-10T18:00:00.000Z) ──
// Top Candidate: DEMO VOYAGER BETA (999002002) passes directly through origin at ~18:15Z (CPA ~1.1 km)
generateSegment("999002002", 22.820, 68.750, 22.400, 69.280, "2026-03-10T12:00:00.000Z", 12, 13.5, 130);
// Candidate 2: DEMO CARRIER GAMMA (999003003) passes ~12 km south
generateSegment("999003003", 22.750, 68.800, 22.350, 69.350, "2026-03-10T14:00:00.000Z", 10, 12.0, 128);
// Candidate 3: DEMO BULKER DELTA (999004004) passes ~28 km north
generateSegment("999004004", 22.950, 68.700, 22.550, 69.250, "2026-03-10T15:00:00.000Z", 10, 11.0, 132);

// ── SCENARIO C: Bay of Bengal (Origin: 20.310°N, 86.720°E at 2026-03-11T12:30:00.000Z) ──
// Top Candidate: DEMO CARRIER GAMMA (999003003) passes directly through origin at ~12:45Z (CPA ~1.3 km)
generateSegment("999003003", 20.650, 86.400, 19.980, 87.050, "2026-03-11T06:00:00.000Z", 14, 12.8, 142);
// Candidate 2: DEMO BULKER DELTA (999004004) passes ~15 km east
generateSegment("999004004", 20.550, 86.600, 19.900, 87.200, "2026-03-11T08:00:00.000Z", 12, 11.5, 140);
// Candidate 3: DEMO EXPRESS EPSILON (999005005) passes ~32 km west
generateSegment("999005005", 20.700, 86.250, 20.050, 86.850, "2026-03-11T09:00:00.000Z", 10, 15.0, 145);

// ── SCENARIO D: Goa / Malabar (Origin: 15.440°N, 73.320°E at 2026-03-12T23:45:00.000Z) ──
// Top Candidate: DEMO EXPRESS EPSILON (999005005) passes directly through origin at ~23:55Z (CPA ~0.9 km)
generateSegment("999005005", 15.850, 73.100, 15.050, 73.550, "2026-03-12T18:00:00.000Z", 12, 15.5, 155);
// Candidate 2: DEMO MARINER ALPHA (999001001) passes ~14 km offshore
generateSegment("999001001", 15.900, 72.980, 15.100, 73.450, "2026-03-12T19:00:00.000Z", 12, 13.0, 152);
// Candidate 3: DEMO VOYAGER BETA (999002002) passes ~26 km inshore
generateSegment("999002002", 15.750, 73.250, 14.950, 73.700, "2026-03-12T20:00:00.000Z", 10, 12.5, 156);

console.log(`Generated new scenario track points: ${newTracks.length}`);

// Combine and write back
const combined = [...existingTracks, ...newTracks];
fs.writeFileSync(tracksPath, JSON.stringify(combined, null, 2), "utf-8");
console.log(`Total combined AIS tracks written to demo-ais-tracks.json: ${combined.length}`);
