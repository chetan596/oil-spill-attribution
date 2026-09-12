/**
 * AIS Anomaly Score Module — Spatiotemporal Correlation Feature Detection
 *
 * Detects:
 *   - AIS reporting gaps (>30 minutes between expected transmissions)
 *   - Speed drops / decelerations (speed anomaly / movement anomaly)
 *   - Course alterations (course changes)
 *
 * IMPORTANT SCIENTIFIC NOTICE:
 * An AIS transmission gap is NOT proof of deliberate transponder manipulation.
 * A speed drop is NOT proof of illegal oil discharge or bilge dumping.
 * These metrics serve solely as exploratory correlation features.
 */

/**
 * Calculate AIS anomaly score and identify correlation features.
 *
 * @param {Array<Object>} trackPoints - Ordered array of AIS track points
 * @param {number} [expectedIntervalMinutes=30] - Expected transmission interval
 * @returns {{
 *   score: number,
 *   aisGapMinutes: number,
 *   speedDropDetected: boolean,
 *   courseChangeDetected: boolean,
 *   maxSpeedDropKts: number,
 *   maxCourseChangeDeg: number,
 *   note: string
 * }}
 */
function calculateAnomalyScore(trackPoints, expectedIntervalMinutes = 30) {
  if (!Array.isArray(trackPoints) || trackPoints.length < 2) {
    return {
      score: 0.10,
      aisGapMinutes: 0,
      speedDropDetected: false,
      courseChangeDetected: false,
      maxSpeedDropKts: 0,
      maxCourseChangeDeg: 0,
      note: "Insufficient track points to evaluate AIS anomalies.",
    };
  }

  let maxGapMs = 0;
  let maxSpeedDrop = 0;
  let maxCourseChange = 0;

  for (let i = 1; i < trackPoints.length; i++) {
    const prev = trackPoints[i - 1];
    const curr = trackPoints[i];

    // 1. Time gap detection
    const prevTime = new Date(prev.timestamp).getTime();
    const currTime = new Date(curr.timestamp).getTime();
    if (!isNaN(prevTime) && !isNaN(currTime) && currTime > prevTime) {
      const gapMs = currTime - prevTime;
      if (gapMs > maxGapMs) {
        maxGapMs = gapMs;
      }
    }

    // 2. Speed drop detection
    const prevSpeed = prev.speedKnots != null ? Number(prev.speedKnots) : (prev.SOG != null ? Number(prev.SOG) : null);
    const currSpeed = curr.speedKnots != null ? Number(curr.speedKnots) : (curr.SOG != null ? Number(curr.SOG) : null);
    if (prevSpeed != null && currSpeed != null && !isNaN(prevSpeed) && !isNaN(currSpeed)) {
      const speedDiff = prevSpeed - currSpeed; // positive if dropped
      if (speedDiff > maxSpeedDrop) {
        maxSpeedDrop = speedDiff;
      }
    }

    // 3. Course change detection
    const prevH = prev.headingDeg != null ? Number(prev.headingDeg) : (prev.heading != null ? Number(prev.heading) : (prev.COG != null ? Number(prev.COG) : null));
    const currH = curr.headingDeg != null ? Number(curr.headingDeg) : (curr.heading != null ? Number(curr.heading) : (curr.COG != null ? Number(curr.COG) : null));
    if (prevH != null && currH != null && !isNaN(prevH) && !isNaN(currH)) {
      let diffH = Math.abs(currH - prevH);
      if (diffH > 180) diffH = 360 - diffH;
      if (diffH > maxCourseChange) {
        maxCourseChange = diffH;
      }
    }
  }

  const maxGapMinutes = Math.round(maxGapMs / (60 * 1000));
  const isGap = maxGapMinutes > expectedIntervalMinutes;
  const speedDropDetected = maxSpeedDrop >= 4.0; // >= 4 knots reduction
  const courseChangeDetected = maxCourseChange >= 25.0; // >= 25 degrees alteration

  // Heuristic weighting of anomaly features
  let anomalyWeight = 0.10; // Baseline
  if (isGap) {
    // Proportional to gap length beyond expected
    const excessGapMinutes = maxGapMinutes - expectedIntervalMinutes;
    anomalyWeight += Math.min(0.40, (excessGapMinutes / 60.0) * 0.40);
  }
  if (speedDropDetected) {
    anomalyWeight += Math.min(0.30, (maxSpeedDrop / 10.0) * 0.30);
  }
  if (courseChangeDetected) {
    anomalyWeight += Math.min(0.20, (maxCourseChange / 90.0) * 0.20);
  }

  const score = Number(Math.min(1.0, anomalyWeight).toFixed(4));

  return {
    score,
    aisGapMinutes: maxGapMinutes,
    speedDropDetected,
    courseChangeDetected,
    maxSpeedDropKts: Number(maxSpeedDrop.toFixed(1)),
    maxCourseChangeDeg: Number(maxCourseChange.toFixed(1)),
    note: "AIS correlation feature detection (demonstration heuristics).",
  };
}

module.exports = {
  calculateAnomalyScore,
};
