import type { AuthRealm, AuthUser } from "@glampro/shared";

/**
 * The authenticated principal attached to every request by
 * `middleware/auth.ts`. Claims are refreshed from the database on each request
 * so a role change or account lock applies immediately.
 */
export interface AuthenticatedUser extends AuthUser {
  realm: AuthRealm;
  tokenVersion: number;
}

/** Request properties populated by `middleware/validate.ts`. */
export type ValidatedData = Partial<Record<"body" | "query" | "params", unknown>>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      validated?: ValidatedData;
    }
  }
}
