import { z } from 'zod';

export const requestMetaSchema = z.object({
  requestId: z.string().min(1),
  timestamp: z.iso.datetime(),
});

/**
 * Stable identifiers that clients branch on instead of parsing error messages.
 * New codes are appended; existing codes keep their meaning.
 */
export const apiErrorCodes = [
  'VALIDATION_ERROR',
  'ROUTE_NOT_FOUND',
  'NOT_FOUND',
  'INTERNAL_SERVER_ERROR',
  'RATE_LIMITED',
  'AUTH_RATE_LIMITED',
  'AUTHENTICATION_REQUIRED',
  'INVALID_CREDENTIALS',
  'EMAIL_ALREADY_REGISTERED',
  'SESSION_EXPIRED',
  'SESSION_REVOKED',
  'INVALID_TOKEN',
  'CSRF_INVALID',
  'TENANT_REQUIRED',
  'MEMBERSHIP_INACTIVE',
  'ORGANIZATION_INACTIVE',
  'PERMISSION_DENIED',
] as const;

export type ApiErrorCode = (typeof apiErrorCodes)[number];

export const apiErrorCodeSchema = z.enum(apiErrorCodes);

export const isApiErrorCode = (value: string): value is ApiErrorCode =>
  (apiErrorCodes as readonly string[]).includes(value);

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
  }),
  meta: requestMetaSchema,
});

/**
 * Wraps a payload schema in the standard success envelope so that the API and
 * the web client agree on the wire format for every endpoint.
 */
export const apiEnvelopeSchema = <TSchema extends z.ZodType>(data: TSchema) =>
  z.object({ data, meta: requestMetaSchema });

export type ApiError = z.infer<typeof apiErrorSchema>;
export type RequestMeta = z.infer<typeof requestMetaSchema>;
