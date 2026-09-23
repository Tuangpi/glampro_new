import { z } from 'zod';
import { apiEnvelopeSchema } from './api.js';

export const healthDataSchema = z.object({
  service: z.literal('glampro-api'),
  status: z.enum(['ok', 'degraded']),
  database: z.enum(['connected', 'unavailable']).optional(),
  uptimeSeconds: z.number().nonnegative(),
});

export const healthResponseSchema = apiEnvelopeSchema(healthDataSchema);

export type HealthData = z.infer<typeof healthDataSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
