const { calculateProximityScore, calculateProximityScoreFromDistance } = require("../../src/scoring/proximity.score");
const { calculateTemporalScore } = require("../../src/scoring/temporal.score");
const { calculateTrajectoryMatchScore } = require("../../src/scoring/trajectory.score");
const { calculateAnomalyScore } = require("../../src/scoring/anomaly.score");
const { synthesizeAttributionScore, ATTRIBUTION_WEIGHTS } = require("../../src/scoring/final.score");

describe("Attribution Scoring Modules", () => {
  // ── Proximity Score ─────────────────────────────────────────────────────────
  describe("Proximity Score (Exponential Decay 15km scale)", () => {
    it("should return 1.0 for 0 km distance", () => {
      expect(calculateProximityScoreFromDistance(0)).toBe(1.0);
    });

    it("should return ~0.3679 for 15 km distance (1 decay scale)", () => {
      const score = calculateProximityScoreFromDistance(15.0);
      expect(score).toBeCloseTo(Math.exp(-1), 3);
    });

    it("should return ~0.1353 for 30 km distance (2 decay scales)", () => {
      const score = calculateProximityScoreFromDistance(30.0);
      expect(score).toBeCloseTo(Math.exp(-2), 3);
    });

    it("should handle track points array and find minimum distance point", () => {
      const origin = { latitude: 19.0, longitude: 72.5 };
      const track = [
        { latitude: 19.5, longitude: 72.5, timestamp: "2026-03-10T00:00:00Z" },
        { latitude: 19.01, longitude: 72.5, timestamp: "2026-03-10T01:00:00Z" }, // ~1.1 km
        { latitude: 18.5, longitude: 72.5, timestamp: "2026-03-10T02:00:00Z" },
      ];
      const res = calculateProximityScore(track, origin);
      expect(res.minDistanceKm).toBeLessThan(2.0);
      expect(res.score).toBeGreaterThan(0.9);
      expect(res.closestTimestamp).toBe("2026-03-10T01:00:00.000Z");
    });

    it("should handle empty or invalid inputs gracefully", () => {
      const res = calculateProximityScore([], { latitude: 19.0, longitude: 72.0 });
      expect(res.score).toBe(0.0);
      expect(res.minDistanceKm).toBe(Infinity);
    });
  });

  // ── Temporal Score ──────────────────────────────────────────────────────────
  describe("Temporal Score (Gaussian sigma=3h)", () => {
    const originTime = "2026-03-10T12:00:00.000Z";

    it("should return 1.0 for 0 hours time difference", () => {
      const res = calculateTemporalScore(originTime, originTime);
      expect(res.score).toBe(1.0);
      expect(res.timeDiffHours).toBe(0);
    });

    it("should return ~0.6065 for 3.0 hours time difference (1 sigma)", () => {
      const passTime = "2026-03-10T15:00:00.000Z";
      const res = calculateTemporalScore(passTime, originTime);
      expect(res.timeDiffHours).toBe(3.0);
      expect(res.score).toBeCloseTo(Math.exp(-0.5), 3);
    });

    it("should return ~0.1353 for 6.0 hours time difference (2 sigma)", () => {
      const passTime = "2026-03-10T18:00:00.000Z";
      const res = calculateTemporalScore(passTime, originTime);
      expect(res.timeDiffHours).toBe(6.0);
      expect(res.score).toBeCloseTo(Math.exp(-2.0), 3);
    });

    it("should handle timezone offsets accurately (ISO with +05:30 vs UTC)", () => {
      const utcTime = "2026-03-10T12:00:00.000Z";
      const istTime = "2026-03-10T17:30:00.000+05:30"; // Exactly the same moment in time
      const res = calculateTemporalScore(utcTime, istTime);
      expect(res.timeDiffHours).toBe(0);
      expect(res.score).toBe(1.0);
    });

    it("should return 0.0 and nulls for missing or invalid timestamps", () => {
      const res = calculateTemporalScore(null, originTime);
      expect(res.score).toBe(0.0);
      expect(res.timeDiffHours).toBeNull();
    });
  });

  // ── Trajectory Score ────────────────────────────────────────────────────────
  describe("Trajectory Score (CPA and Kinematics)", () => {
    it("should compute trajectory alignment metrics and CPA distance", () => {
      const origin = { latitude: 19.1, longitude: 72.5, originTimestamp: "2026-03-10T12:00:00Z" };
      const track = [
        { latitude: 19.3, longitude: 72.5, headingDeg: 180, speedKnots: 12.0, timestamp: "2026-03-10T10:00:00Z" },
        { latitude: 19.11, longitude: 72.5, headingDeg: 180, speedKnots: 12.0, timestamp: "2026-03-10T12:00:00Z" },
        { latitude: 18.9, longitude: 72.5, headingDeg: 180, speedKnots: 12.0, timestamp: "2026-03-10T14:00:00Z" },
      ];
      const res = calculateTrajectoryMatchScore(track, origin);
      expect(res.score).toBeGreaterThan(0.8);
      expect(res.cpaDistanceKm).toBeLessThan(2.0);
      expect(res.headingConsistency).toBe(1.0);
      expect(res.speedConsistency).toBe(1.0);
      expect(res.timeToOriginHours).toBe(0.0);
    });

    it("should handle empty track gracefully", () => {
      const res = calculateTrajectoryMatchScore([], { latitude: 19.0, longitude: 72.0 });
      expect(res.score).toBe(0.0);
      expect(res.cpaDistanceKm).toBe(Infinity);
    });
  });

  // ── Anomaly Score ───────────────────────────────────────────────────────────
  describe("AIS Anomaly Score (Gaps, Speed drops, Course changes)", () => {
    it("should detect AIS reporting gap (>30 min)", () => {
      const trackWithGap = [
        { timestamp: "2026-03-10T10:00:00Z", speedKnots: 12.0, headingDeg: 90 },
        { timestamp: "2026-03-10T10:30:00Z", speedKnots: 12.0, headingDeg: 90 },
        { timestamp: "2026-03-10T11:45:00Z", speedKnots: 12.0, headingDeg: 90 }, // 75 min gap
      ];
      const res = calculateAnomalyScore(trackWithGap, 30);
      expect(res.aisGapMinutes).toBe(75);
      expect(res.score).toBeGreaterThan(0.2);
    });

    it("should detect speed drop anomaly (>= 4 knots)", () => {
      const trackWithSpeedDrop = [
        { timestamp: "2026-03-10T10:00:00Z", speedKnots: 14.0, headingDeg: 90 },
        { timestamp: "2026-03-10T10:30:00Z", speedKnots: 5.0, headingDeg: 90 }, // 9 knot drop
      ];
      const res = calculateAnomalyScore(trackWithSpeedDrop);
      expect(res.speedDropDetected).toBe(true);
      expect(res.maxSpeedDropKts).toBe(9.0);
    });

    it("should detect course change (>= 25 degrees)", () => {
      const trackWithTurn = [
        { timestamp: "2026-03-10T10:00:00Z", speedKnots: 12.0, headingDeg: 90 },
        { timestamp: "2026-03-10T10:30:00Z", speedKnots: 12.0, headingDeg: 145 }, // 55 deg change
      ];
      const res = calculateAnomalyScore(trackWithTurn);
      expect(res.courseChangeDetected).toBe(true);
      expect(res.maxCourseChangeDeg).toBe(55.0);
    });
  });

  // ── Final Score Synthesis ───────────────────────────────────────────────────
  describe("Final Attribution Score Synthesis", () => {
    it("should use exact heuristic weights: 0.30 prox, 0.25 temp, 0.25 traj, 0.20 anom", () => {
      expect(ATTRIBUTION_WEIGHTS.proximity).toBe(0.30);
      expect(ATTRIBUTION_WEIGHTS.temporal).toBe(0.25);
      expect(ATTRIBUTION_WEIGHTS.trajectory).toBe(0.25);
      expect(ATTRIBUTION_WEIGHTS.anomaly).toBe(0.20);

      const score = synthesizeAttributionScore({
        proximity: 1.0,
        temporal: 0.8,
        trajectory: 0.6,
        anomaly: 0.5,
      });

      // 1.0 * 0.30 + 0.8 * 0.25 + 0.6 * 0.25 + 0.5 * 0.20
      // = 0.30 + 0.20 + 0.15 + 0.10 = 0.75
      expect(score).toBe(0.75);
    });

    it("should return 1.0 when all scores are 1.0", () => {
      const score = synthesizeAttributionScore({
        proximity: 1.0,
        temporal: 1.0,
        trajectory: 1.0,
        anomaly: 1.0,
      });
      expect(score).toBe(1.0);
    });

    it("should return 0.0 when all scores are 0.0", () => {
      const score = synthesizeAttributionScore({
        proximity: 0,
        temporal: 0,
        trajectory: 0,
        anomaly: 0,
      });
      expect(score).toBe(0.0);
    });
  });
});
