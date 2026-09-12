const prisma = require("../db/database");
const passwordService = require("./password.service");
const jwtService = require("./jwt.service");
const AppError = require("../errors/AppError");

/**
 * AuthService — authentication operations.
 * Owns the login flow: credential validation → JWT issuance.
 */
const authService = {
  /**
   * Authenticate a user with email + password.
   * Returns a signed JWT and the public user object.
   *
   * @param {string} email
   * @param {string} password
   * @returns {{ token: string, user: object }}
   * @throws {AppError} 401 if credentials are invalid
   */
  async login(email, password) {
    // 1. Find user by email
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Return same error for missing email and wrong password (timing-safe message)
      throw AppError.unauthorized("Invalid email or password");
    }

    // 2. Verify password hash
    const valid = await passwordService.compare(password, user.password);
    if (!valid) {
      throw AppError.unauthorized("Invalid email or password");
    }

    // 3. Sign JWT with public claims only
    const token = jwtService.sign({
      sub:   user.id,
      email: user.email,
      role:  user.role,
      name:  user.name,
    });

    // 4. Return token + sanitized user (no password)
    const { password: _pw, ...publicUser } = user;
    return { token, user: publicUser };
  },

  /**
   * Get a user record by ID (for GET /auth/me).
   * @param {string} userId
   * @returns {object} sanitized user
   */
  async getMe(userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound("User");
    const { password: _pw, ...publicUser } = user;
    return publicUser;
  },
};

module.exports = authService;
