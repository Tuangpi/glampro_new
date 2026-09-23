import { rateLimit } from 'express-rate-limit';

const commonOptions = {
  standardHeaders: 'draft-8' as const,
  legacyHeaders: false,
};

export const globalRateLimit = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  limit: 500,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
});

export const authenticationRateLimit = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: {
    error: {
      code: 'AUTH_RATE_LIMITED',
      message: 'Too many authentication attempts. Please try again later.',
    },
  },
});

/** Invitation emails are outbound side effects, so creation is throttled harder than reads. */
export const invitationRateLimit = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many invitations. Please try again later.',
    },
  },
});
