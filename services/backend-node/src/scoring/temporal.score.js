exports.calculateTemporalScore = (vesselPassingTime, estimatedSpillTime, uncertaintyHours = 2) => {
  const diffHours = Math.abs(new Date(vesselPassingTime) - new Date(estimatedSpillTime)) / 36e5;
  return Math.max(0, 1.0 - (diffHours / (uncertaintyHours * 3)));
};
