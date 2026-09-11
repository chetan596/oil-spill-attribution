exports.synthesizeAttributionScore = ({ proximity, trajectory, temporal, anomaly }) => {
  const weights = { proximity: 0.35, trajectory: 0.25, temporal: 0.25, anomaly: 0.15 };
  return (
    proximity * weights.proximity +
    trajectory * weights.trajectory +
    temporal * weights.temporal +
    anomaly * weights.anomaly
  );
};
