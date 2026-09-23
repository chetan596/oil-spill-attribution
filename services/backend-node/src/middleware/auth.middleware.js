const jwtService = require("../auth/jwt.service");
const AppError = require("../errors/AppError");

/**
 * authenticate — Express middleware that verifies Bearer JWT.
 *
 * Extracts the token from the Authorization header, verifies it,
 * and attaches the decoded payload as req.user.
 *
 * Usage: router.get('/protected', authenticate, handler)
 */
const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw AppError.unauthorized("Missing or malformed Authorization header");
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw AppError.unauthorized("Token is empty");
    }

    const decoded = jwtService.verify(token);
    req.user = {
      id:    decoded.sub,
      email: decoded.email,
      role:  decoded.role,
      name:  decoded.name,
    };

    next();
  } catch (err) {
    // jwt.verify throws JsonWebTokenError / TokenExpiredError
    if (err instanceof AppError) return next(err);

    if (err.name === "TokenExpiredError") {
      return next(AppError.unauthorized("Token has expired"));
    }
    return next(AppError.unauthorized("Invalid token"));
  }
};

/**
 * requireRole — factory middleware that enforces role-based access control.
 *
 * Usage: router.post('/admin', authenticate, requireRole('ADMIN'), handler)
 *
 * @param {...string} roles - Allowed roles (ADMIN | ANALYST | VIEWER)
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return next(AppError.unauthorized());
  }
  if (!roles.includes(req.user.role)) {
    return next(AppError.forbidden(`Required role: ${roles.join(" or ")}`));
  }
  next();
};

/**
 * optionalAuthenticate — extracts user if token is valid, but does not block if missing or invalid.
 */
const optionalAuthenticate = (req, res, next) => {
  try {
    let authHeader = req.headers.authorization;
    if (!authHeader && req.query?.token) {
      authHeader = `Bearer ${req.query.token}`;
    }
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      if (token) {
        const decoded = jwtService.verify(token);
        req.user = {
          id:    decoded.sub,
          email: decoded.email,
          role:  decoded.role,
          name:  decoded.name,
        };
      }
    }
  } catch (_) {
    // Ignore error in optional auth
  }
  next();
};

module.exports = { authenticate, optionalAuthenticate, requireRole };

