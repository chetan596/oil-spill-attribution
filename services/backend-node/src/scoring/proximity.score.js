exports.calculateProximityScore = (distanceKm) => {
  // Score drops off with distance from hindcast origin
  return Math.max(0, 1.0 - (distanceKm / 20.0));
};
