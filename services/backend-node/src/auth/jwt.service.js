const jwt = require("jsonwebtoken");
const env = require("../config/env");

/**
 * JWT service — signs and verifies tokens.
 * Reads from env.jwtSecret (camelCase) — consistent with env.js convention.
 */
exports.sign = (payload) =>
  jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

exports.verify = (token) =>
  jwt.verify(token, env.jwtSecret);
