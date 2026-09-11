class SatelliteClient {
  async downloadProduct(productId) {
    return { productId, status: 'downloaded' };
  }
}
module.exports = new SatelliteClient();
