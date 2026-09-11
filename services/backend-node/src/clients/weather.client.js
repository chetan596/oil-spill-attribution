class WeatherClient {
  async getOceanicVectors(lat, lng, startTime, endTime) {
    return { windSpeedKnots: 12, surfaceCurrentMps: 0.35 };
  }
}
module.exports = new WeatherClient();
