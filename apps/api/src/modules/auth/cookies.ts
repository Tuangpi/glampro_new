import type { CookieOptions, Response } from 'express';
import { env } from '../../config/env.js';

export const refreshCookieName = 'glampro_refresh';
export const csrfCookieName = 'glampro_csrf';

/** The refresh cookie is only sent to the auth routes, which limits exposure. */
const refreshCookiePath = '/api/v1/auth';

const secureCookieOptions = (): CookieOptions => ({
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
});

export const setRefreshCookie = (response: Response, token: string, expiresAt: Date) => {
  response.cookie(refreshCookieName, token, {
    ...secureCookieOptions(),
    httpOnly: true,
    path: refreshCookiePath,
    expires: expiresAt,
  });
};

export const clearRefreshCookie = (response: Response) => {
  response.clearCookie(refreshCookieName, {
    ...secureCookieOptions(),
    httpOnly: true,
    path: refreshCookiePath,
  });
};

/**
 * Double-submit CSRF token: readable by the browser so the client can echo it
 * in the `x-csrf-token` header, which a cross-site form post cannot set.
 */
export const setCsrfCookie = (response: Response, token: string) => {
  response.cookie(csrfCookieName, token, {
    ...secureCookieOptions(),
    httpOnly: false,
    path: '/',
  });
};

export const clearCsrfCookie = (response: Response) => {
  response.clearCookie(csrfCookieName, {
    ...secureCookieOptions(),
    httpOnly: false,
    path: '/',
  });
};
