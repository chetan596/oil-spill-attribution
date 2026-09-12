/**
 * validate — Zod schema validation middleware factory.
 *
 * Validates req.body, req.query, and req.params against a Zod schema.
 * On failure, throws a ZodError that the error middleware catches and
 * formats as a standard 400 VALIDATION_ERROR response.
 *
 * Usage:
 *   router.post('/jobs', validate(createJobSchema), jobController.create);
 */
module.exports = (schema) => (req, res, next) => {
  try {
    if (schema) {
      schema.parse({
        body:   req.body,
        query:  req.query,
        params: req.params,
      });
    }
    next();
  } catch (err) {
    // Pass ZodError to the global error handler
    next(err);
  }
};
