class SatelliteService {
  async fetchSarScene(sceneId) {
    return { sceneId, format: 'GeoTIFF' };
  }
}

module.exports = new SatelliteService();
