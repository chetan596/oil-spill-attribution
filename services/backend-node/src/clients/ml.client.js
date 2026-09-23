const axios = require('axios');
const { mlService } = require('../config/services');

class MLClient {
  constructor() {
    this.http = axios.create({ baseURL: mlService.baseUrl });
  }
  async detectSlicks(sarImageUrl) {
    return (await this.http.post('/api/v1/detection/segment', { image_url: sarImageUrl })).data;
  }
  async runHindcast(params) {
    return (await this.http.post('/api/v1/hindcast/simulate', params)).data;
  }
  async synthesizeDossier(payload) {
    return (await this.http.post('/api/v1/dossier/synthesize', payload)).data;
  }
}

module.exports = new MLClient();

