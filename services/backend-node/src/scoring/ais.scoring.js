exports.calculateAisCoverageScore = (aisPings, expectedIntervalSeconds = 180) => {
  if (!aisPings || aisPings.length === 0) return 0;
  return Math.min(1.0, aisPings.length / 50);
};
