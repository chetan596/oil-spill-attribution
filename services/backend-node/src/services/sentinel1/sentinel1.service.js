/**
 * Sentinel-1 Orchestration Service
 *
 * Coordinates CDSE discovery, staging, and connection to the existing ML pipeline.
 */

const {
  getNamedAois,
  searchSentinel1Catalog,
  getProductById,
} = require("./sentinel1.catalog.service");
const { stageSentinel1Product } = require("./sentinel1.download.service");
const logger = require("../../logger");

/**
 * High-level orchestration for real Sentinel-1 acquisition processing.
 */
class Sentinel1Service {
  /**
   * Get available Named AOIs.
   */
  async getAois() {
    return getNamedAois();
  }

  /**
   * Search CDSE Catalogue.
   */
  async searchAcquisitions(params) {
    return searchSentinel1Catalog(params);
  }

  /**
   * Get Product Details.
   */
  async getProduct(productId) {
    return getProductById(productId);
  }

  /**
   * Download / Stage Product.
   */
  async downloadAndStage(productId, options) {
    return stageSentinel1Product(productId, options);
  }
}

module.exports = new Sentinel1Service();
