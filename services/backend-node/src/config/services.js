const env = require('./env');

module.exports = {
  mlService: {
    baseUrl: env.ML_SERVICE_URL,
    timeoutMs: 60000,
  },
};
