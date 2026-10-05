# 0010 — The low-stock threshold is a per-tenant column, not a constant

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** Phase 4b (catalogue) implementation
- **Related:** [`../design/HANDOFF.md`](../design/HANDOFF.md) §6,
  [`../saas/TENANCY.md`](../saas/TENANCY.md),
  [`../../packages/shared/src/schemas/catalogue.ts`](../../packages/shared/src/schemas/catalogue.ts),
  [0002](0002-tenant-id-equals-owner-id.md)

## Context

Handoff screen 08 draws a **Low stock** stat tile and a rail badge on the Products
entry, and the catalogue contract already promised both:
`productSummarySchema.lowStock` ("true when `quantity` is at or below the tenant's
low-stock threshold") and `catalogueListQuerySchema.lowStock`/`threshold`
(`"Returns rows whose quantity is at or below `threshold`"`).

Nothing in the schema defined _the_ threshold. The legacy application had no
equivalent column — legacy `products` carried `quantity` and no notion of "low" —
so there is no behaviour to preserve and the number had to be decided rather than
migrated. That makes it a decision, not a discovery.

The two candidates were a compile-time constant in the service and a column on
`Tenant`.

## Decision

1. **The threshold is `Tenant.lowStockThreshold`, an `Int @default(5)`.** It is
   read per request from the caller's own tenant row.
2. **`?lowStock=true` filters against `query.threshold ?? tenant.lowStockThreshold`.**
   The `threshold` query parameter is an explicit per-request override, the stored
   column is the default. This is what reconciles the contract's two sentences: the
   row-level `lowStock` flag is always computed against the tenant's stored value,
   while the filter may be asked a hypothetical question.
3. **Every row's `lowStock` boolean is computed server-side** from the tenant's
   stored threshold. The browser never computes it, because the badge counts across
   the whole catalogue while the browser only ever holds one page.
4. **There is no API or screen that edits the threshold in Phase 4.** It is set by
   the default and changed by SQL until Settings (Phase 8) gives it a field.

## Why not the alternatives

| Alternative                               | Why it was rejected                                                                                                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A module constant (`const LOW_STOCK = 5`) | Makes "low" a product-wide opinion. The contract already says _the tenant's_ threshold, so a constant cannot satisfy the shape that was agreed — and changing it later needs a deploy instead of an update.   |
| A per-product `reorderLevel` column       | More correct for a real warehouse, and far more than screen 08 asks for: the tile is one count, and a per-row column would make the stat tile a `SUM` over every product to answer "how many need attention". |
| A `TenantSetting` key/value row           | No settings table exists yet, and inventing one for a single integer would pre-empt the Phase 8 settings model with an under-designed shape.                                                                  |
| Defaulting to `0` (only warn at zero)     | Reads as "out of stock", not "low stock". The screen draws the two as different tiles, so collapsing them loses a distinction the design relies on.                                                           |

## Consequences

- **Positive.** The tile and the badge are one scoped `count`/`sum` over
  `Product`, and a franchise with different storerooms can be configured
  differently without a code change.
- **Positive.** The threshold lives on the row the tenant scope already
  identifies, so reading it takes no extra argument and cannot be forged from the
  request — `Tenant` is not in `TENANT_SCOPED_MODELS`, so the read names
  `currentScope().tenantId` explicitly (see Enforcement).
- **Negative, accepted.** The number is unreachable from the product until Phase 8.
  A salon that disagrees with five has no way to say so, and the ADR is the record
  of that rather than a claim that the screen is finished.
- **Negative, accepted.** It is one more column on the hot tenancy row, read on
  every catalogue list request.
- **Neutral.** A `NOT NULL … DEFAULT 5` add, so existing tenants backfill and no
  data migration is required.

## Enforcement

- The migration is committed SQL; `Tenant.lowStockThreshold` is not nullable and
  has a database default, so no row can be without one.
- `apps/api/src/services/catalogue.service.ts` computes `lowStock` and both
  filters from `currentScope()`, never from the request body or query.
  `packages/shared/src/schemas/catalogue.ts` carries no `threshold` on the write
  schemas, so a client cannot set it.
- **Nothing enforces item 4.** There is no test asserting the threshold is
  uneditable, because there is no endpoint to assert against.
