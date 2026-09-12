const { Router } = require("express");
const authService = require("../auth/auth.service");
const { authenticate } = require("../middleware/auth.middleware");
const { z } = require("zod");
const validate = require("../middleware/validation.middleware");

const router = Router();

const loginSchema = z.object({
  body: z.object({
    email:    z.string().email("Invalid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
  }),
});

/**
 * POST /api/v1/auth/login
 * Public — authenticate with email + password, receive JWT.
 */
router.post(
  "/login",
  validate(loginSchema),
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);

      res.json({
        success: true,
        data: {
          token: result.token,
          user:  result.user,
        },
        error: null,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/auth/me
 * Protected — return the currently authenticated user's profile.
 */
router.get(
  "/me",
  authenticate,
  async (req, res, next) => {
    try {
      const user = await authService.getMe(req.user.id);
      res.json({ success: true, data: user, error: null });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
