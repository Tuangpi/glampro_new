import type { NextFunction, Request, RequestHandler, Response } from "express";

import type { GlobalRole } from "@glampro/shared";

import { forbidden, unauthorized } from "../lib/http-error.js";
import { verifyAccessToken } from "../lib/tokens.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import type { AuthenticatedUser } from "../types/index.js";

/**
 * Verifies the bearer access token and re-validates the session against the
 * database on every request, so disabled accounts, revoked sessions (password
 * change, forced logout) and role changes apply immediately instead of waiting
 * for the token to expire.
 */
export async function auth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next(unauthorized("Missing bearer token"));
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    next(unauthorized("Missing bearer token"));
    return;
  }

  try {
    const claims = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: {
        id: true,
        email: true,
        name: true,
        globalRole: true,
        tokenVersion: true,
        disabled: true,
      },
    });

    if (!user || user.disabled) {
      res.status(401).json({
        statusCode: 401,
        message: "Your session is no longer valid. Please log in again.",
        code: "SESSION_INVALIDATED",
      });
      return;
    }

    if (claims.tokenVersion !== user.tokenVersion) {
      res.status(401).json({
        statusCode: 401,
        message: "Your session has been revoked. Please log in again.",
        code: "SESSION_INVALIDATED",
      });
      return;
    }

    const principal: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      globalRole: user.globalRole,
      realm: claims.realm,
      tokenVersion: user.tokenVersion,
    };

    req.user = principal;
    next();
  } catch (error) {
    logger.debug("Rejected request during authentication", { error });
    next(error);
  }
}

/** Restricts a route to the listed roles. Must run after `auth`. */
export function requireRole(...roles: GlobalRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(unauthorized());
      return;
    }
    if (!roles.includes(req.user.globalRole)) {
      next(forbidden("Your role does not permit this action."));
      return;
    }
    next();
  };
}
