const env = require("../config/env");
const logger = require("../logger");
const AppError = require("../errors/AppError");

/**
 * notFoundHandler — catches all unmatched routes and returns a 404.
 * Must be registered AFTER all route definitions.
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    data: null,
    error: {
      code:    "NOT_FOUND",
      message: `Route ${req.method} ${req.originalUrl} not found`,
      details: {},
    },
  });
};

/**
 * errorHandler — global Express error handler.
 * Must be registered LAST (4-argument signature).
 *
 * Response shape:
 * {
 *   "success": false,
 *   "data": null,
 *   "error": { "code": "...", "message": "...", "details": {} }
 * }
 *
 * Stack traces are NEVER included in production responses.
 */
const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  // Log full error details server-side
  logger.error("Application error", {
    code:     err.code    || "UNKNOWN",
    status:   err.statusCode || 500,
    message:  err.message,
    path:     req.originalUrl,
    method:   req.method,
    ...(env.nodeEnv !== "production" && { stack: err.stack }),
  });

  const statusCode = err.statusCode || 500;
  const isOperational = err instanceof AppError;

  // Zod validation error: err.errors is the array from Zod
  if (err.name === "ZodError") {
    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code:    "VALIDATION_ERROR",
        message: "Request validation failed",
        details: err.errors,
      },
    });
  }

  // Prisma known request errors (e.g. unique constraint violation)
  if (err.code && err.code.startsWith("P")) {
    return res.status(409).json({
      success: false,
      data: null,
      error: {
        code:    "DATABASE_ERROR",
        message: env.nodeEnv === "production" ? "Database error" : err.message,
        details: {},
      },
    });
  }

  res.status(statusCode).json({
    success: false,
    data: null,
    error: {
      code:    err.code    || "INTERNAL_SERVER_ERROR",
      message: isOperational ? err.message : "Internal server error",
      details: isOperational ? (err.details || {}) : {},
    },
  });
};

module.exports = { notFoundHandler, errorHandler };