/**
 * Temporal Score Module — Gaussian Temporal Correlation Heuristic
 *
 * Evaluates the temporal difference between a vessel's closest point of approach
 * (or passing time) and the estimated discharge / spill time.
 *
 * Formula:
 *   score = exp(-(timeDiffHours^2) / (2 * sigma^2))
 *   where sigma = 3.0 hours
 *
 * Note: 3 hours is a DEMONSTRATION HEURISTIC.
 */

const TEMPORAL_SIGMA_HOURS = 3.0;

/**
 * Calculate temporal correlation score.
 *
 * @param {string|Date} vesselPassingTime - Timestamp when vessel was closest to origin
 * @param {string|Date} estimatedSpillTime - Estimated timestamp of spill discharge
 * @param {number} [sigma=3.0] - Gaussian standard deviation in hours
 * @returns {{ score: number, timeDiffHours: number|null, vesselPassingTime: string|null, estimatedSpillTime: string|null }}
 */
function calculateTemporalScore(vesselPassingTime, estimatedSpillTime, sigma = TEMPORAL_SIGMA_HOURS) {
  if (!vesselPassingTime || !estimatedSpillTime) {
    return {
      score: 0.0,
      timeDiffHours: null,
      vesselPassingTime: vesselPassingTime ? new Date(vesselPassingTime).toISOString() : null,
      estimatedSpillTime: estimatedSpillTime ? new Date(estimatedSpillTime).toISOString() : null,
    };
  }

  const passingMs = new Date(vesselPassingTime).getTime();
  const spillMs = new Date(estimatedSpillTime).getTime();

  if (isNaN(passingMs) || isNaN(spillMs)) {
    return {
      score: 0.0,
      timeDiffHours: null,
      vesselPassingTime: null,
      estimatedSpillTime: null,
    };
  }

  const timeDiffMs = Math.abs(passingMs - spillMs);
  const timeDiffHours = timeDiffMs / (3600 * 1000);

  const effectiveSigma = sigma > 0 ? sigma : TEMPORAL_SIGMA_HOURS;
  const exponent = -(timeDiffHours * timeDiffHours) / (2 * effectiveSigma * effectiveSigma);
  const score = Math.exp(exponent);

  return {
    score: Number(score.toFixed(4)),
    timeDiffHours: Number(timeDiffHours.toFixed(4)),
    vesselPassingTime: new Date(passingMs).toISOString(),
    estimatedSpillTime: new Date(spillMs).toISOString(),
  };
}

module.exports = {
  calculateTemporalScore,
  TEMPORAL_SIGMA_HOURS,
};
