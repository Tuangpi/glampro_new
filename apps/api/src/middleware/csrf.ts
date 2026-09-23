import type { RequestHandler } from 'express';
import { csrfCookieName, refreshCookieName } from '../modules/auth/cookies.js';
import { AppError } from '../shared/http/app-error.js';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit CSRF protection for cookie-authenticated requests. Requests
 * that carry no session cookie are left to the handler so that they fail with
 * an authentication error rather than a CSRF error.
 */
export const requireCsrf: RequestHandler = (request, _response, next) => {
  if (safeMethods.has(request.method)) {
    next();
    return;
  }

  const cookies = request.cookies as Record<string, unknown> | undefined;
  const cookieToken = cookies?.[csrfCookieName];
  const refreshToken = cookies?.[refreshCookieName];

  if (typeof cookieToken !== 'string' || cookieToken.length === 0) {
    if (typeof refreshToken === 'string' && refreshToken.length > 0) {
      next(new AppError(403, 'CSRF_INVALID', 'A valid CSRF token is required'));
      return;
    }

    next();
    return;
  }

  if (request.header('x-csrf-token') !== cookieToken) {
    next(new AppError(403, 'CSRF_INVALID', 'A valid CSRF token is required'));
    return;
  }

  next();
};
