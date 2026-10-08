/**
 * Settings contracts — handoff screen 11, `/api/settings`.
 *
 * The MVP's settings page answers three questions and nothing else
 * (`docs/mvp.md` → M4): what this salon **is** (profile), what it has **bought**
 * (modules, read-only), and who **works here** (the staff/roles summary, which
 * is `GET /api/staff` read from the page rather than a second endpoint that
 * could disagree with it).
 *
 * **The profile is two editable columns, and that is the schema's shape rather
 * than a stub.** `Tenant` today carries `name`, `slug`, `status`,
 * `lowStockThreshold` and the receipt counter. `slug` and `status` belong to the
 * platform console (a salon cannot rename its own isolation key or un-suspend
 * itself), the receipt counter is the till's, and ADR 0010 explicitly deferred
 * `lowStockThreshold`'s field to "Settings (Phase 8)" — so this is the screen
 * that finally gives it one. Hours, tax and receipt configuration are full-phase
 * work: each needs columns the schema does not have yet, and inventing them
 * here would make the screen lie about what it persists.
 */
import { z } from "zod";

// The tenant status enum already exists — `auth.ts` declares it for the sign-in
// refusal rules — so settings *uses* it rather than declaring a second list that
// could drift from the database's own.
import { tenantStatusSchema } from "./auth.js";

/** `GET /api/settings/profile` */
export const salonProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Read-only: renaming the slug would break every bookmarked tenant path. */
  slug: z.string(),
  /** Read-only: suspension is the platform console's verdict, not the salon's. */
  status: tenantStatusSchema,
  /** "Low" for the rail badge and the low-stock filter (ADR 0010). */
  lowStockThreshold: z.number().int().min(0).max(10_000),
  owner: z.object({ id: z.string(), name: z.string(), email: z.string() }).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SalonProfile = z.infer<typeof salonProfileSchema>;

/**
 * `PATCH /api/settings/profile` — the salon's own two fields.
 *
 * Every field optional, absent = unchanged, exactly like the other PATCH
 * contracts: a form that only edits the name must not reset the threshold.
 */
export const updateSalonProfileSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200),
    lowStockThreshold: z.number().int().min(0).max(10_000),
  })
  .strict();

export type UpdateSalonProfileInput = z.infer<typeof updateSalonProfileSchema>;

/**
 * One row of the modules panel: what the catalogue offers and whether **this**
 * salon may use it now.
 *
 * `entitled` is computed by the same rule `requireModule` enforces (core passes
 * as soon as the tenant exists, an add-on needs a live `TenantModule` row), so
 * the panel and the routes can never disagree about a lapsed grant — the panel
 * is a read of the boundary, not a second implementation of it.
 */
export const moduleSummarySchema = z.object({
  code: z.string(),
  name: z.string(),
  category: z.string(),
  isCore: z.boolean(),
  entitled: z.boolean(),
  /** When the salon's grant lapses. `null` = core or open-ended. */
  expiresAt: z.string().nullable(),
});

export type ModuleSummary = z.infer<typeof moduleSummarySchema>;
