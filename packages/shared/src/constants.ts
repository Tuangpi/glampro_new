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

/**
 * Codes for the switchable features in `Module`. Seeded into the `modules`
 * table; `requireModule(code)` resolves the string at the route boundary, so a
 * typo fails as an unknown module rather than silently passing an unauthenticated
 * entitlement check.
 *
 * The legacy system carried these as 18 boolean columns (`users.*_access` plus
 * seven on `user_infos`); rows in `TenantModule` replace them.
 */
export const MODULE_CODES = [
  "dashboard",
  "appointments",
  "customers",
  "catalogue",
  "staff",
  "packages",
  "giftCards",
  "memberships",
  "inventory",
  "reports",
  "employeeCommission",
  "sales",
  "expenses",
  "stock",
] as const;

export type ModuleCode = (typeof MODULE_CODES)[number];

/**
 * Modules every tenant has without buying them, keyed by the same `Module.code`.
 * A core module passes `requireModule` as soon as the tenant exists.
 */
export const CORE_MODULE_CODES = [
  "dashboard",
  "appointments",
  "customers",
  "catalogue",
  "staff",
  "sales",
] as const;

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

/**
 * The isolation boundary's lifecycle. Mirrors the `TenantStatus` database enum.
 * `SUSPENDED` still lets the owner in, read-only, so the person who can pay is the
 * person who sees the message; the other two refuse sign-in outright.
 */
export const TENANT_STATUSES = ["ACTIVE", "SUSPENDED", "EXPIRED", "CANCELLED"] as const;

/** Realms this phase serves. `pos` and `mobile` arrive with their own surfaces. */
export const WEB_REALM = "web" as const;
