const { z } = require('zod');

exports.spillQuerySchema = z.object({
  query: z.object({
    limit: z.string().optional(),
  }),
});
