import { z } from 'zod';
import { requestMetaSchema } from './api.js';

export const healthResponseSchema = z.object({
  data: z.object({
    service: z.literal('glampro-api'),
    status: z.enum(['ok', 'degraded']),
    database: z.enum(['connected', 'unavailable']).optional(),
    uptimeSeconds: z.number().nonnegative(),
  }),
  meta: requestMetaSchema,
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
