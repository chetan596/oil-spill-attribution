const Redis = require('ioredis');
const env = require('./env');

const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  maxRetriesPerRequest: null,
});

module.exports = redis;
