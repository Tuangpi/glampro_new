/**
 * Catalogue contracts — handoff screen 08, `GET /api/products` and
 * `GET /api/services`.
 *
 * **Services live here, not on a screen of their own.** There is no `/services`
 * route and no Services entry on the rail: services are a tab inside this
 * catalogue and a step in the sale and appointment flows
 * ([ADR 0005](../../decisions/0005-rail-has-no-services-destination.md)). So the
 * two share one file and one module code — to a salon and to the entitlement
 * check they are the same feature.
 *
 * Both models carry an identical price/points/status shape, which is why they
 * share the base fields below rather than each declaring its own object.
 */
import { z } from "zod";

import {
  durationMinutesSchema,
  moneySchema,
  paginationQuerySchema,
  pointsSchema,
  quantitySchema,
} from "./common.js";

/**
 * Shared active flag. Mirrors the `CatalogStatus` database enum, which exists
 * because the legacy `services` and `products` tables each carried their own
 * `status boolean` with the same meaning but a different default.
 */
export const CATALOG_STATUSES = ["ACTIVE", "INACTIVE"] as const;

export const catalogStatusSchema = z.enum(CATALOG_STATUSES);

export type CatalogStatusValue = z.infer<typeof catalogStatusSchema>;

/**
 * `?page=&pageSize=&search=&status=&departmentId=&lowStock=`
 *
 * `lowStock=true` is what the rail's Products badge counts. It is a **server-side
 * filter, not a client-side sort** — the badge is a live count over the tenant's
 * whole catalogue, which a single paginated page cannot compute.
 */
export const catalogueListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
  status: catalogStatusSchema.optional(),
  departmentId: z.string().min(1).max(64).optional(),
  /** Products only. Returns rows whose quantity is at or below `threshold`. */
  lowStock: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((value) => value === true || value === "true")
    .optional(),
  threshold: z.coerce.number().int().min(0).max(10_000).optional(),
});

export type CatalogueListQuery = z.infer<typeof catalogueListQuerySchema>;

/** A branch/section, for the department pickers on every catalogue form. */
export const departmentSchema = z.object({
  id: z.string(),
  name: z.string(),
});

/**
 * A product row for screen 08.
 *
 * Prices are **strings on the wire**, not numbers. The column is `Decimal(12,2)`
 * and PostgreSQL `numeric` has exact decimal semantics a JSON float cannot
 * represent; a salon counting money gets a string it formats, not a float that
 * has already lost a cent. Inputs are coerced by `moneySchema`.
 */
export const productSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: catalogStatusSchema,
  /** Serialised with `.toFixed(2)`. */
  memberPrice: z.string(),
  nonmemberPrice: z.string(),
  quantity: z.number().int(),
  points: z.number().int(),
  description: z.string().nullable(),
  departmentId: z.string().nullable(),
  departmentName: z.string().nullable(),
  /** True when `quantity` is at or below the tenant's low-stock threshold. */
  lowStock: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ProductSummary = z.infer<typeof productSummarySchema>;

export const productDetailSchema = productSummarySchema;

export type ProductDetail = z.infer<typeof productDetailSchema>;

/** Creating a product. `quantity` and `points` default to zero server-side. */
export const createProductSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  memberPrice: moneySchema,
  nonmemberPrice: moneySchema,
  quantity: quantitySchema.optional(),
  points: pointsSchema.optional(),
  description: z.string().trim().max(2000).optional(),
  departmentId: z.string().min(1).max(64).optional(),
  status: catalogStatusSchema.optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

/**
 * Updating a product. Absent means unchanged; `null` clears an optional field.
 * `quantity` is deliberately **not** nullable — stock is corrected by adjustment,
 * not by erasing it.
 */
export const updateProductSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200).optional(),
  memberPrice: moneySchema.optional(),
  nonmemberPrice: moneySchema.optional(),
  quantity: quantitySchema.optional(),
  points: pointsSchema.optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  departmentId: z.string().min(1).max(64).nullable().optional(),
  status: catalogStatusSchema.optional(),
});

export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type DepartmentSummary = z.infer<typeof departmentSchema>;
/**
 * A service row.
 *
 * No `quantity` and no `lowStock`: a service is not stock, and the handoff's own
 * screen 08 shows products and services as two tabs with different columns.
 */
export const serviceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: catalogStatusSchema,
  memberPrice: z.string(),
  nonmemberPrice: z.string(),
  points: z.number().int(),
  description: z.string().nullable(),
  departmentId: z.string().nullable(),
  departmentName: z.string().nullable(),
  durationMinutes: z.number().int().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ServiceSummary = z.infer<typeof serviceSummarySchema>;

export const serviceDetailSchema = serviceSummarySchema;

export type ServiceDetail = z.infer<typeof serviceDetailSchema>;

/**
 * Creating a service.
 *
 * `durationMinutes` is optional here even though booking needs it: the legacy
 * table had no such column, so a migrated salon has services with no duration
 * until someone fills it in. The appointment flow is where a missing duration
 * becomes a blocking question — not this form.
 */
export const createServiceSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  memberPrice: moneySchema,
  nonmemberPrice: moneySchema,
  points: pointsSchema.optional(),
  description: z.string().trim().max(2000).optional(),
  departmentId: z.string().min(1).max(64).optional(),
  durationMinutes: durationMinutesSchema.optional(),
  status: catalogStatusSchema.optional(),
});

export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200).optional(),
  memberPrice: moneySchema.optional(),
  nonmemberPrice: moneySchema.optional(),
  points: pointsSchema.optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  departmentId: z.string().min(1).max(64).nullable().optional(),
  durationMinutes: durationMinutesSchema.nullable().optional(),
  status: catalogStatusSchema.optional(),
});

export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
