const { Queue } = require('bullmq');
const redis = require('../config/redis');

const analysisQueue = new Queue('analysis-pipeline', { connection: redis });

module.exports = { analysisQueue };
