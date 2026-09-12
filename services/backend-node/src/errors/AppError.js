/**
 * AppError — Custom application error class.
 *
 * All intentional errors thrown in controllers/services MUST use this class
 * so the error middleware can produce a consistent API response shape.
 *
 * Usage:
 *   throw new AppError(404, 'NOT_FOUND', 'Spill not found');
 *   throw new AppError(400, 'VALIDATION_ERROR', 'Invalid input', { field: 'sarSceneId' });
 */
class AppError extends Error {
  /**
   * @param {number} statusCode - HTTP status code (e.g. 400, 401, 403, 404, 500)
   * @param {string} code       - Machine-readable error code (e.g. 'NOT_FOUND')
   * @param {string} message    - Human-readable message
   * @param {object} [details]  - Optional structured details (field errors, etc.)
   */
  constructor(statusCode, code, message, details = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  /** Convenience factory methods */
  static badRequest(message, details = {}) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message = 'Unauthorized') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'Forbidden') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(resource = 'Resource') {
    return new AppError(404, 'NOT_FOUND', `${resource} not found`);
  }

  static internal(message = 'Internal server error') {
    return new AppError(500, 'INTERNAL_SERVER_ERROR', message);
  }
}

module.exports = AppError;
