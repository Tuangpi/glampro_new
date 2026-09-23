import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  emailVerificationRequestSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  registrationRequestSchema,
  resetPasswordRequestSchema,
} from '@glampro/contracts';
import type {
  EmailVerificationRequest,
  ForgotPasswordRequest,
  LoginRequest,
  RegistrationRequest,
  ResetPasswordRequest,
} from '@glampro/contracts';
import { authenticate, authenticationOf } from '../../middleware/authenticate.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { authenticationRateLimit } from '../../middleware/rate-limits.js';
import { organizationHeader } from '../../middleware/tenant.js';
import { validate, validatedBody, validatedParams } from '../../middleware/validate.js';
import { auditContextFromRequest } from '../../shared/audit.js';
import { AppError } from '../../shared/http/app-error.js';
import { respondSuccess } from '../../shared/http/response.js';
import {
  clearCsrfCookie,
  clearRefreshCookie,
  refreshCookieName,
  setCsrfCookie,
  setRefreshCookie,
} from './cookies.js';
import {
  currentUser,
  forgotPassword,
  listSessions,
  login,
  logout,
  refresh,
  register,
  resetPassword,
  revokeSession,
  verifyEmail,
} from './auth.service.js';

export const authRouter = Router();

const sessionParamsSchema = z.object({ id: z.string().trim().min(1).max(64) });

const cookieValue = (request: Request, name: string) => {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const applySessionCookies = (
  response: Response,
  refreshToken: string,
  refreshTokenExpiresAt: Date,
  csrfToken: string,
) => {
  setRefreshCookie(response, refreshToken, refreshTokenExpiresAt);
  setCsrfCookie(response, csrfToken);
};

const clearSessionCookies = (response: Response) => {
  clearRefreshCookie(response);
  clearCsrfCookie(response);
};

authRouter.post(
  '/register',
  authenticationRateLimit,
  validate({ body: registrationRequestSchema }),
  async (request, response) => {
    const session = await register(
      validatedBody<RegistrationRequest>(request),
      auditContextFromRequest(request),
    );

    applySessionCookies(
      response,
      session.refreshToken,
      session.refreshTokenExpiresAt,
      session.payload.csrfToken,
    );

    respondSuccess(request, response, session.payload, 201);
  },
);

authRouter.post(
  '/login',
  authenticationRateLimit,
  validate({ body: loginRequestSchema }),
  async (request, response) => {
    const session = await login(
      validatedBody<LoginRequest>(request),
      auditContextFromRequest(request),
    );

    applySessionCookies(
      response,
      session.refreshToken,
      session.refreshTokenExpiresAt,
      session.payload.csrfToken,
    );

    respondSuccess(request, response, session.payload);
  },
);

authRouter.post('/refresh', requireCsrf, async (request, response) => {
  const refreshToken = cookieValue(request, refreshCookieName);

  if (!refreshToken) {
    throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'Your session has expired');
  }

  const refreshed = await refresh(refreshToken, auditContextFromRequest(request));

  applySessionCookies(
    response,
    refreshed.refreshToken,
    refreshed.refreshTokenExpiresAt,
    refreshed.csrfToken,
  );

  respondSuccess(request, response, {
    accessToken: refreshed.accessToken,
    accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
    csrfToken: refreshed.csrfToken,
  });
});

authRouter.post('/logout', requireCsrf, async (request, response) => {
  const revoked = await logout(
    cookieValue(request, refreshCookieName),
    auditContextFromRequest(request),
  );

  clearSessionCookies(response);

  respondSuccess(request, response, revoked);
});

authRouter.get('/me', authenticate, async (request, response) => {
  const user = await currentUser(
    authenticationOf(request).userId,
    request.header(organizationHeader) ?? undefined,
  );

  respondSuccess(request, response, user);
});

authRouter.get('/sessions', authenticate, async (request, response) => {
  const auth = authenticationOf(request);

  respondSuccess(request, response, { sessions: await listSessions(auth.userId, auth.sessionId) });
});

authRouter.delete(
  '/sessions/:id',
  authenticate,
  requireCsrf,
  validate({ params: sessionParamsSchema }),
  async (request, response) => {
    const revoked = await revokeSession(
      authenticationOf(request).userId,
      validatedParams<{ id: string }>(request).id,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, revoked);
  },
);

authRouter.post(
  '/password/forgot',
  authenticationRateLimit,
  validate({ body: forgotPasswordRequestSchema }),
  async (request, response) => {
    await forgotPassword(
      validatedBody<ForgotPasswordRequest>(request).email,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { requested: true } as const, 202);
  },
);

authRouter.post(
  '/password/reset',
  authenticationRateLimit,
  validate({ body: resetPasswordRequestSchema }),
  async (request, response) => {
    const input = validatedBody<ResetPasswordRequest>(request);
    await resetPassword(input.token, input.password, auditContextFromRequest(request));

    // The password change revoked every session, so the cookies are cleared too.
    clearSessionCookies(response);

    respondSuccess(request, response, { completed: true } as const);
  },
);

authRouter.post(
  '/email/verify',
  authenticationRateLimit,
  validate({ body: emailVerificationRequestSchema }),
  async (request, response) => {
    await verifyEmail(
      validatedBody<EmailVerificationRequest>(request).token,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { verified: true } as const);
  },
);
