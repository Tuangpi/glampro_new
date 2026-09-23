import { z } from 'zod';

export const requestMetaSchema = z.object({
  requestId: z.string().min(1),
  timestamp: z.iso.datetime(),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
  }),
  meta: requestMetaSchema,
});

export type ApiError = z.infer<typeof apiErrorSchema>;
