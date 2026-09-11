exports.formatEvidenceForLLM = (vessel, scoreBreakdown) => {
  return JSON.stringify({ vessel, scoreBreakdown });
};
