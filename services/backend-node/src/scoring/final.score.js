/**
 * Final Attribution Score Synthesis Module
 *
 * Combines 4 component correlation scores using demonstration heuristic weights:
 *   - Proximity Score:  0.30 (Spatial proximity to modelled origin)
 *   - Temporal Score:   0.25 (Time difference to estimated spill discharge)
 *   - Trajectory Score: 0.25 (Path kinematics & closest approach alignment)
 *   - Anomaly Score:    0.20 (AIS gaps, speed drops, course changes)
 *
 * Formula:
 *   finalScore = proximity * 0.30 + temporal * 0.25 + trajectory * 0.25 + anomaly * 0.20
 *
 * IMPORTANT SCIENTIFIC NOTICE:
 * These weights are demonstration heuristics for exploratory correlation.
 * They do not constitute a scientifically validated forensic attribution model.
 */

const ATTRIBUTION_WEIGHTS = {
  proximity:  0.30,
  temporal:   0.25,
  trajectory: 0.25,
  anomaly:    0.20,
};

/**
 * Synthesize final attribution score from 4 component scores.
 *
 * @param {{ proximity: number, temporal: number, trajectory: number, anomaly: number }} scores
 * @returns {number} Synthesized attribution score between 0.0 and 1.0
 */
function synthesizeAttributionScore({ proximity = 0, temporal = 0, trajectory = 0, anomaly = 0 }) {
  const p = Number(proximity) || 0;
  const t = Number(temporal) || 0;
  const traj = Number(trajectory) || 0;
  const a = Number(anomaly) || 0;

  const total =
    p * ATTRIBUTION_WEIGHTS.proximity +
    t * ATTRIBUTION_WEIGHTS.temporal +
    traj * ATTRIBUTION_WEIGHTS.trajectory +
    a * ATTRIBUTION_WEIGHTS.anomaly;

  return Number(Math.max(0, Math.min(1, total)).toFixed(4));
}

module.exports = {
  synthesizeAttributionScore,
  ATTRIBUTION_WEIGHTS,
};
