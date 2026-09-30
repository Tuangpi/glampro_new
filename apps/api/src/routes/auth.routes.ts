import { Router } from "express";

import { auth } from "../middleware/auth.js";

/**
 * Session endpoints.
 *
 * Phase 0 ships `GET /me` so the session plumbing (token verification, database
 * re-validation) is exercised end to end. `POST /login`, `POST /refresh` and
 * `POST /logout` arrive with the auth phase, where they are covered by the
 * shared `loginSchema` / `refreshSchema` contracts.
 */
export const authRouter = Router();

authRouter.get("/me", auth, (req, res) => {
  res.status(200).json({ data: req.user });
});
