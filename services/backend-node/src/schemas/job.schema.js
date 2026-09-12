const { z } = require("zod");

exports.createJobSchema = z.object({
  body: z.object({
    sarSceneId:      z.string().optional(),
    timeWindowHours: z.number().int().min(1).max(168).default(24).optional(),
  }),
});
