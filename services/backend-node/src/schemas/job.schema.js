const { z } = require('zod');

exports.createJobSchema = z.object({
  body: z.object({
    sarSceneId: z.string().optional(),
    timeWindowHours: z.number().default(24),
  }),
});
