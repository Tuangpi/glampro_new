import bcrypt from "bcrypt";
import { PASSWORD_MIN_LENGTH } from "@glampro/shared";

import { badRequest } from "./http-error.js";

/**
 * bcrypt cost. 10 keeps local development fast; raise it for production
 * deployments by setting `BCRYPT_ROUNDS` (12 is a common production value).
 */
const ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 10);

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Mirrors the rule enforced by `changePasswordSchema` in `@glampro/shared`. */
export function assertPasswordStrength(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw badRequest(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
}
