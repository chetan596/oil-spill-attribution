class DriftService {
  async calculateHindcast(slickPolygon, windData, currentData) {
    return { origin: { lat: 19.1, lng: 72.5 }, trajectory: [] };
  }
}

module.exports = new DriftService();
