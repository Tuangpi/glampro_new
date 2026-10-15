# 0010 — The low-stock threshold is a per-tenant column, not a constant

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** Phase 4b (catalogue) implementation
- **Related:** [`../design/HANDOFF.md`](../design/HANDOFF.md) §6,
  [`../saas/TENANCY.md`](../saas/TENANCY.md),
  [`../../packages/shared/src/schemas/catalogue.ts`](../../packages/shared/src/schemas/catalogue.ts),
  [0002](0002-tenant-id-equals-owner-id.md)

## Evidence review — 2026-10-15

The decision below preserves its original phase context. Current code confirms
the per-tenant storage, but the Settings deferral is fulfilled and the query
override has an unresolved implementation conflict:

- [`schema.prisma`](../../apps/api/prisma/schema.prisma) and the
  [threshold migration](../../apps/api/prisma/migrations/20261005030037_tenant_low_stock_threshold/migration.sql)
  define the non-null integer with default `5`. This review inspected the files;
  it did not verify migration application against a database.
- [`catalogue.service.ts`](../../apps/api/src/services/catalogue.service.ts)
  resolves the stored threshold using `currentScope().tenantId` when no override
  is supplied, with a fallback of `5` if the tenant row is absent. An explicit
  `query.threshold` bypasses that read. `listProducts` uses the resolved value
  for both the quantity filter and each returned row's `lowStock` flag. This
  conflicts with decision items 2–3, which reserve the override for filtering
  and require row flags to use the stored threshold. Neither behavior nor the
  accepted decision is changed by this review; resolve the conflict explicitly
  before implementation and add an override-versus-row-flag regression assertion.
- [`settings.ts`](../../packages/shared/src/schemas/settings.ts) now accepts an
  integer threshold from `0` to `10_000` in the profile update contract.
  [`settings.routes.ts`](../../apps/api/src/routes/settings.routes.ts) restricts
  writes to `SUPER_ADMIN` or `MANAGER` in a writable tenant, and
  [`settings.service.ts`](../../apps/api/src/services/settings.service.ts) updates
  the tenant identified by the ambient scope. The
  [`Settings` screen](../../apps/web/src/pages/Settings.tsx) exposes the field.
  Thus item 4's historical deferral and the unreachable-setting consequence no
  longer describe the current product; there is no need for manual SQL to edit it.
- [`catalogue.service.test.ts`](../../apps/api/src/services/catalogue.service.test.ts)
  contains tenant-specific flag, low-stock count and override-filter assertions,
  but the override case checks the count, not the returned flags.
  [`settings.routes.test.ts`](../../apps/api/src/routes/settings.routes.test.ts)
  covers profile reads, editable fields and refused staff/suspended-tenant writes.
  These database-backed suites were inspected, not run, pending confirmation of a
  disposable test database. The mocked browser
  [`Settings.test.tsx`](../../apps/web/src/pages/__tests__/Settings.test.tsx)
  covers saving the threshold and hiding the save action for staff; it does not
  establish database persistence or API authorization.

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
