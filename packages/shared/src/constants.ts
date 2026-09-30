/**
 * Domain constants shared by the API and the web app.
 *
 * Keep this file free of runtime dependencies so it can be imported from any
 * workspace (Node API, Vite browser bundle, or a future mobile client).
 */

export const APP_NAME = "Glampro Salon";

/** Every API route lives under this prefix (nginx proxies it verbatim). */
export const API_PREFIX = "/api";

/** Mobile clients are served from this prefix and must stay byte-compatible. */
export const MOBILE_API_PREFIX = "/api/mobile";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 200;

/** Access tokens are short-lived; refresh tokens are rotated on every use. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export const PASSWORD_MIN_LENGTH = 8;

/** Salon-scoped roles. Order is intentional: highest privilege first. */
export const GLOBAL_ROLES = ["SUPER_ADMIN", "MANAGER", "STAFF", "CASHIER"] as const;

/** Client surfaces that authenticate against the API. */
export const AUTH_REALMS = ["web", "pos", "mobile"] as const;
