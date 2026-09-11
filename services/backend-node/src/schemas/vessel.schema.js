const { z } = require('zod');

exports.vesselQuerySchema = z.object({
  params: z.object({
    spillId: z.string().optional(),
  }),
});
