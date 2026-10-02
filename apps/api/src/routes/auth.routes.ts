import { Router, type Request } from "express";
import {
  changePasswordSchema,
  loginSchema,
  refreshSchema,
  type ChangePasswordInput,
  type LoginInput,
  type RefreshInput,
} from "@glampro/shared";

import { auth, requireWritableTenant } from "../middleware/auth.js";
import { validate, validated } from "../middleware/validate.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { unauthorized } from "../lib/http-error.js";
import { changePassword, loadProfile, login, logout, refresh } from "../services/auth.service.js";
import type { SessionMeta } from "../services/auth.service.js";

/**
 * Session endpoints for the web portal.
 *
 * `POST /api/mobile/*` is a frozen contract and is **not** served from here; the
 * mobile auth routes land with the phase that owns that surface. Nothing in this
 * router changes their paths or payloads.
 */
export const authRouter = Router();

/** Records where a session was opened, for support and revocation. */
function sessionMeta(req: Request): SessionMeta {
  // nginx terminates TLS and the app trusts one proxy hop, so `req.ip` is the client.
  return {
    userAgent: req.get("user-agent") ?? undefined,
    ipAddress: req.ip ?? undefined,
  };
}

/**
 * The signed-in user, their salon, and the salon's effective entitlements.
 *
 * This is what the browser calls on load to restore a session, so it is the one
 * endpoint that must answer correctly on a cold start with only a stored token.
 */
authRouter.get("/me", auth, async (req, res, next) => {
  try {
    if (!req.user) {
      throw unauthorized();
    }
    res.status(200).json({ data: await loadProfile(req.user) });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", authLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const input = validated<LoginInput>(req, "body");
    res.status(200).json({ data: await login(input, sessionMeta(req)) });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/refresh", authLimiter, validate(refreshSchema), async (req, res, next) => {
  try {
    const { refreshToken } = validated<RefreshInput>(req, "body");
    res.status(200).json({ data: await refresh(refreshToken, sessionMeta(req)) });
  } catch (error) {
    next(error);
  }
});

/**
 * Revokes the presented refresh token. Deliberately unauthenticated: a client whose
 * access token has already expired must still be able to end its session. It revokes
 * that row and nothing else — no other session for the user is touched, and
 * `tokenVersion` is left alone
 * (`docs/decisions/0007-logout-revokes-the-refresh-token-not-the-user.md`).
 */
authRouter.post("/logout", validate(refreshSchema), async (req, res, next) => {
  try {
    const { refreshToken } = validated<RefreshInput>(req, "body");
    await logout(refreshToken);
    res.status(200).json({ data: { success: true } });
  } catch (error) {
    next(error);
  }
});

authRouter.post(
  "/change-password",
  auth,
  requireWritableTenant(),
  authLimiter,
  validate(changePasswordSchema),
  async (req, res, next) => {
    try {
      if (!req.user?.tenantId) {
        throw unauthorized();
      }

      const input = validated<ChangePasswordInput>(req, "body");
      await changePassword(req.user.id, req.user.tenantId, input);

      // Every session for this user is now revoked, including this one, so the
      // client is told to sign in again rather than left holding a dead token.
      res.status(200).json({
        data: { success: true },
        message: "Password changed. Please sign in again.",
      });
    } catch (error) {
      next(error);
    }
  },
);
