import type { AUTH_REALMS, GLOBAL_ROLES } from "./constants.js";

export type GlobalRole = (typeof GLOBAL_ROLES)[number];

export type AuthRealm = (typeof AUTH_REALMS)[number];

/**
 * API response envelope.
 *
 * Legacy `dompdf`-era endpoints answered either bare (`T`) or wrapped
 * (`{ data: T }`). The new API always answers with the wrapped shape; the web
 * client keeps unwrapping both so the mobile app stays compatible.
 */
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string;
  /** Stable machine-readable code, e.g. `SESSION_EXPIRED`. */
  code?: string;
  /** Field-level validation problems, keyed by request path. */
  details?: unknown;
}

/** Query-string values accepted by the list endpoints. */
export type QueryParams = Record<string, string | number | boolean | undefined | null>;

/** Claims carried by the access token. */
export interface AccessTokenClaims {
  sub: string;
  email: string;
  globalRole: GlobalRole;
  realm: AuthRealm;
  /** Bumped on logout / password change to invalidate outstanding tokens. */
  tokenVersion: number;
}
