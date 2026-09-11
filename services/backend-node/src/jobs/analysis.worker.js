const { Worker } = require('bullmq');
const redis = require('../config/redis');

const worker = new Worker('analysis-pipeline', async (job) => {
  console.log(`Processing job ${job.id}`);
  return { success: true };
}, { connection: redis });

module.exports = worker;
