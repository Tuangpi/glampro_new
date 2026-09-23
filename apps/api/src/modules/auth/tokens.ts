import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { errors, SignJWT, jwtVerify } from 'jose';
import type { PlatformRole } from '../../generated/prisma/client.js';
import { env } from '../../config/env.js';

const accessTokenSecret = new TextEncoder().encode(env.ACCESS_TOKEN_SECRET);
const accessTokenTtlMs = env.ACCESS_TOKEN_TTL_MINUTES * 60 * 1000;
const refreshTokenTtlMs = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

export type AccessTokenClaims = {
  userId: string;
  sessionId: string;
  platformRole: PlatformRole;
};

export type AccessTokenResult =
  { ok: true; claims: AccessTokenClaims } | { ok: false; reason: 'expired' | 'invalid' };

export const issueAccessToken = async (
  claims: AccessTokenClaims,
): Promise<{ token: string; expiresAt: Date }> => {
  const expiresAt = new Date(Date.now() + accessTokenTtlMs);

  const token = await new SignJWT({ platformRole: claims.platformRole })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.userId)
    .setJti(claims.sessionId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(accessTokenSecret);

  return { token, expiresAt };
};

export const verifyAccessToken = async (token: string): Promise<AccessTokenResult> => {
  try {
    const { payload } = await jwtVerify(token, accessTokenSecret, { algorithms: ['HS256'] });

    if (typeof payload.sub !== 'string' || typeof payload.jti !== 'string') {
      return { ok: false, reason: 'invalid' };
    }

    const platformRole = payload.platformRole;
    if (platformRole !== 'USER' && platformRole !== 'PLATFORM_ADMIN') {
      return { ok: false, reason: 'invalid' };
    }

    return {
      ok: true,
      claims: { userId: payload.sub, sessionId: payload.jti, platformRole },
    };
  } catch (error) {
    return { ok: false, reason: error instanceof errors.JWTExpired ? 'expired' : 'invalid' };
  }
};

/** Refresh tokens are opaque; only their hash is persisted. */
export const generateRefreshToken = () => randomBytes(48).toString('base64url');

export const hashRefreshToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const createTokenFamilyId = () => randomUUID();

export const refreshTokenExpiresAt = () => new Date(Date.now() + refreshTokenTtlMs);

export const generateCsrfToken = () => randomBytes(32).toString('base64url');

export const accessTokenLifetimeMs = accessTokenTtlMs;
