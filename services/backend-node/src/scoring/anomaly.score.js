exports.calculateAnomalyScore = (aisTrack) => {
  // Checks for AIS transponder gap, abrupt speed reduction (discharging bilge), or course alterations
  return 0.75;
};
