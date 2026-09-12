const fs = require('fs');
const path = require('path');

// Reference Origin of Arabian Sea Demo Scenario: 19.113°N, 72.544°E
// Estimated Spill Time: 2026-03-09T21:30:00.000Z
// Scenario Window: 2026-03-09T00:00:00.000Z to 2026-03-11T00:00:00.000Z (48 hours = 97 points every 30 mins)

const START_TIME_MS = new Date('2026-03-09T00:00:00.000Z').getTime();
const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const NUM_POINTS = 97;

function generateTracks() {
  const tracks = [];

  // 1. Candidate 1: MMSI 999001001 (DEMO MARINER ALPHA - Crude Oil Tanker)
  // Close / pass-through vessel. Starts North (19.85°N, 72.15°E) heading SSE (155°).
  // Passes within ~2.1 km of origin (19.113, 72.544) around 2026-03-09T21:30:00.000Z (point 43).
  // Has a speed drop (12.4 kts -> 5.2 kts) between 20:30 and 22:00, and a 35-min AIS transmission gap at 21:30 -> 22:05.
  for (let i = 0; i < NUM_POINTS; i++) {
    const tMs = START_TIME_MS + i * INTERVAL_MS;
    const progress = i / (NUM_POINTS - 1);
    
    // Linear trajectory with smooth curvature
    let lat = 19.85 - progress * 1.50;
    let lng = 72.15 + progress * 0.85;

    let speed = 12.4;
    let heading = 155.0;
    let navStatus = "Under way using engine";

    // Near origin (index 41 to 46, approx 20:30 to 23:00 on 2026-03-09)
    if (i >= 41 && i <= 45) {
      speed = 5.2 + Math.sin(i) * 0.3; // speed drop
      heading = 158.0;
    }

    // AIS gap anomaly simulation: shift timestamp at point 43 to simulate 35 min gap
    let timestamp = new Date(tMs).toISOString();
    if (i === 43) {
      // 21:30 ping is delayed/missing, received at 22:05 instead (35 min gap from previous 21:00 ping)
      timestamp = new Date(tMs + 5 * 60 * 1000).toISOString();
    }

    tracks.push({
      mmsi: "999001001",
      timestamp,
      latitude: Number(lat.toFixed(5)),
      longitude: Number(lng.toFixed(5)),
      SOG: Number(speed.toFixed(1)),
      speedKnots: Number(speed.toFixed(1)),
      COG: Number(heading.toFixed(1)),
      heading: Number(heading.toFixed(1)),
      headingDeg: Number(heading.toFixed(1)),
      navStatus,
      source: "demo"
    });
  }

  // 2. Candidate 2: MMSI 999002002 (DEMO VOYAGER BETA - Chemical Tanker)
  // Moderately close vessel. Starts South (18.40°N, 72.90°E) heading NW (325°) towards Gujarat.
  // Closest approach to origin is ~10.8 km at index 37 (2026-03-09T18:30:00.000Z, ~3h before spill).
  // Steady speed ~11.6 kts, consistent heading, normal 30-min reporting.
  for (let i = 0; i < NUM_POINTS; i++) {
    const tMs = START_TIME_MS + i * INTERVAL_MS;
    const progress = i / (NUM_POINTS - 1);

    const lat = 18.40 + progress * 1.55;
    const lng = 72.90 - progress * 0.95;
    const speed = 11.6 + (Math.sin(i * 0.2) * 0.2);
    const heading = 325.0;

    tracks.push({
      mmsi: "999002002",
      timestamp: new Date(tMs).toISOString(),
      latitude: Number(lat.toFixed(5)),
      longitude: Number(lng.toFixed(5)),
      SOG: Number(speed.toFixed(1)),
      speedKnots: Number(speed.toFixed(1)),
      COG: Number(heading.toFixed(1)),
      heading: Number(heading.toFixed(1)),
      headingDeg: Number(heading.toFixed(1)),
      navStatus: "Under way using engine",
      source: "demo"
    });
  }

  // 3. Candidate 3: MMSI 999003003 (DEMO CARRIER GAMMA - Product Tanker)
  // Crossing vessel. Heads East-Northeast towards Mumbai harbour approach (075°).
  // Closest approach ~21.5 km to origin at index 54 (2026-03-10T03:00:00.000Z, ~5.5h after spill).
  // Steady speed ~13.2 kts.
  for (let i = 0; i < NUM_POINTS; i++) {
    const tMs = START_TIME_MS + i * INTERVAL_MS;
    const progress = i / (NUM_POINTS - 1);

    const lat = 18.80 + progress * 0.45;
    const lng = 71.80 + progress * 1.35;
    const speed = 13.2 + (Math.cos(i * 0.1) * 0.2);
    const heading = 75.0;

    tracks.push({
      mmsi: "999003003",
      timestamp: new Date(tMs).toISOString(),
      latitude: Number(lat.toFixed(5)),
      longitude: Number(lng.toFixed(5)),
      SOG: Number(speed.toFixed(1)),
      speedKnots: Number(speed.toFixed(1)),
      COG: Number(heading.toFixed(1)),
      heading: Number(heading.toFixed(1)),
      headingDeg: Number(heading.toFixed(1)),
      navStatus: "Under way using engine",
      source: "demo"
    });
  }

  // 4. Candidate 4: MMSI 999004004 (DEMO BULKER DELTA - Bulk Carrier)
  // Distant vessel. Transits far offshore North-South corridor (178°).
  // Closest approach ~43.2 km to origin at index 64 (2026-03-10T08:00:00.000Z, ~10.5h after spill).
  // Steady speed ~13.8 kts.
  for (let i = 0; i < NUM_POINTS; i++) {
    const tMs = START_TIME_MS + i * INTERVAL_MS;
    const progress = i / (NUM_POINTS - 1);

    const lat = 19.90 - progress * 1.60;
    const lng = 72.12 - progress * 0.10;
    const speed = 13.8;
    const heading = 178.0;

    tracks.push({
      mmsi: "999004004",
      timestamp: new Date(tMs).toISOString(),
      latitude: Number(lat.toFixed(5)),
      longitude: Number(lng.toFixed(5)),
      SOG: Number(speed.toFixed(1)),
      speedKnots: Number(speed.toFixed(1)),
      COG: Number(heading.toFixed(1)),
      heading: Number(heading.toFixed(1)),
      headingDeg: Number(heading.toFixed(1)),
      navStatus: "Under way using engine",
      source: "demo"
    });
  }

  // 5. Candidate 5: MMSI 999005005 (DEMO EXPRESS EPSILON - Container Ship)
  // Unrelated vessel. Coastal corridor south of Mumbai, >88 km away from origin at all times.
  // Fast transit ~18.5 kts, heading 160°.
  for (let i = 0; i < NUM_POINTS; i++) {
    const tMs = START_TIME_MS + i * INTERVAL_MS;
    const progress = i / (NUM_POINTS - 1);

    const lat = 18.60 - progress * 1.40;
    const lng = 72.85 + progress * 0.20;
    const speed = 18.5;
    const heading = 160.0;

    tracks.push({
      mmsi: "999005005",
      timestamp: new Date(tMs).toISOString(),
      latitude: Number(lat.toFixed(5)),
      longitude: Number(lng.toFixed(5)),
      SOG: Number(speed.toFixed(1)),
      speedKnots: Number(speed.toFixed(1)),
      COG: Number(heading.toFixed(1)),
      heading: Number(heading.toFixed(1)),
      headingDeg: Number(heading.toFixed(1)),
      navStatus: "Under way using engine",
      source: "demo"
    });
  }

  return tracks;
}

const allTracks = generateTracks();
const outPath = path.join(__dirname, '..', 'services', 'backend-node', 'src', 'data', 'demo-ais-tracks.json');
fs.writeFileSync(outPath, JSON.stringify(allTracks, null, 2), 'utf-8');
console.log(`Generated ${allTracks.length} AIS track records (${NUM_POINTS} per vessel x 5 vessels) at ${outPath}`);
