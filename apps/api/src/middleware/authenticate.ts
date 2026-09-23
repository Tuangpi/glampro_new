import type { RequestHandler } from 'express';
import type { Request } from 'express';
import { prisma } from '../database/prisma.js';
import { verifyAccessToken } from '../modules/auth/tokens.js';
import { AppError } from '../shared/http/app-error.js';

/**
 * Reads the authentication context for handlers mounted behind `authenticate`,
 * which guarantees it is present.
 */
export const authenticationOf = (request: Request) => {
  if (!request.auth) {
    throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required');
  }

  return request.auth;
};

const bearerTokenOf = (header: string | undefined) => {
  if (!header) {
    return undefined;
  }

  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return undefined;
  }

  return token;
};

/**
 * Verifies the access token and confirms that its session is still live.
 * Populates `request.auth` for downstream middleware and handlers.
 */
export const authenticate: RequestHandler = async (request, _response, next) => {
  const token = bearerTokenOf(request.header('authorization'));

  if (!token) {
    next(new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required'));
    return;
  }

  const result = await verifyAccessToken(token);

  if (!result.ok) {
    next(
      new AppError(
        401,
        result.reason === 'expired' ? 'SESSION_EXPIRED' : 'AUTHENTICATION_REQUIRED',
        result.reason === 'expired'
          ? 'Your session has expired. Please sign in again.'
          : 'Authentication is required',
      ),
    );
    return;
  }

  const session = await prisma.authSession.findUnique({
    where: { id: result.claims.sessionId },
    select: { id: true, userId: true, revokedAt: true, rotatedAt: true, expiresAt: true },
  });

  if (!session || session.userId !== result.claims.userId) {
    next(new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required'));
    return;
  }

  // A session that has been rotated away is superseded by its successor, so its
  // access token stops working as soon as the client refreshes.
  if (session.revokedAt || session.rotatedAt) {
    next(new AppError(401, 'SESSION_REVOKED', 'Your session is no longer valid'));
    return;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    next(new AppError(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.'));
    return;
  }

  request.auth = {
    userId: session.userId,
    platformRole: result.claims.platformRole,
    sessionId: session.id,
  };

  next();
};
