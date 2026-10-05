# Roadmap and acceptance criteria

[`architecture.md`](architecture.md) §12 holds the one-line phase table — this file
is its detail: what each phase delivers, how a reviewer knows it is finished, and
what it depends on. **The status column lives in both files and must be updated in
both, in the same commit.** Current phase and open questions:
[`STATE.md`](STATE.md).

A phase is finished when every acceptance criterion below it is met, `npm run
verify` exits 0, and the documentation the phase touches has been updated. Anything
that changes the schema or an external contract also needs an ADR in
[`decisions/`](decisions/README.md).

---

## Phase 0 — Monorepo, tooling, containers, docs · **Complete**

| Deliverable               | Acceptance criterion                                                            |
| ------------------------- | ------------------------------------------------------------------------------- |
| npm workspaces            | `apps/*` + `packages/*` build from a clean clone with `npm ci && npm run build` |
| TypeScript strict, shared | `@glampro/shared` exports the Zod schemas both other workspaces consume         |
| Docker dev + prod stacks  | `make up-d` serves `GET /health` and `GET /health/ready`; `make smoke` passes   |
| Prisma + Postgres         | `User` and `RefreshToken` migrated; `npm run db:reset` rebuilds from scratch    |
| Auth plumbing             | `GET /api/auth/me` verifies a token and re-validates the user in the database   |
| CI                        | `.github/workflows/ci.yml` runs format check, lint, type-check and tests        |
| Docs                      | `README.md`, `README.Docker.md`, [`architecture.md`](architecture.md)           |

---

## Phase 1 — Design system · **Complete**

The phase that stops every later screen from inventing its own spacing, colour or
button.

| Deliverable           | Acceptance criterion                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Token pipeline        | `apps/web/src/styles/tokens.css` is the handoff copy and `.prettierignore` keeps it that way (see [`design/HANDOFF.md`](design/HANDOFF.md))   |
| Tailwind mapping      | Every `--sp-*` value a component needs is reachable as a utility or a documented `var()`, with no hand-written hex or px values in components |
| Icon set              | Each handoff icon exists as a React component: SVG geometry unchanged, `currentColor`, decorative (`aria-hidden`) by default                  |
| UI primitives         | Button, IconButton, Input, Select, Checkbox, Card, Badge, Chip, Tabs, Table, Modal, Drawer, Toast, Tooltip, EmptyState, Skeleton, Pagination  |
| Primitive behaviour   | Each primitive has a Vitest + Testing Library test covering its keyboard path, its disabled state and, if icon-only, its accessible name      |
| App shell             | Rail 84px and top bar 76px drawn from `--sp-rail-w` / `--sp-topbar-h` rather than literals; active nav state from the router                  |
| Tap targets           | Every interactive control is at least 44px tall (`--sp-control-h-md`) except the documented small-stepper case                                |
| Screens 01–11 as spec | Primitives reproduce the handoff geometry closely enough that a screen built from them needs no new CSS values                                |

Phase 1 adds no data and no routes. If a screen needs a value the handoff does not
have, the value is added to the handoff tokens and re-copied — never invented inside
a component.

---

## Phase 2 — Full data model · **Complete except the importer**

| Deliverable        | Acceptance criterion                                                                                                            | State                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Tenant plane       | `Tenant`, `Module`, `TenantModule`, `Subscription`, `Payment`, `AuditLog` per [`saas/TENANCY.md`](saas/TENANCY.md)              | **Done** — plus `PlatformAdmin`; migration `20261002042444_tenant_plane`                                 |
| Tenant scoping     | `TENANT_SCOPED_MODELS` extension over `AsyncLocalStorage`; `requireModule` entitlement guard                                    | **Done**                                                                                                 |
| Tenant isolation   | An integration test seeds two tenants and asserts that every read path returns only the caller's rows                           | **Done** — 19 tests, green against a real database                                                       |
| Domain models      | Catalogue, customers, staff, departments, appointments, sales, packages, gift cards, credit, commissions, leaves                | **Done** — 33 models; sales, holdings, commissions, performances and leaves landed with `20261003091356` |
| Tenancy column     | `tenantId` non-null on every domain table; no query resolves a tenant from a body or a query parameter                          | **Done** — every model with a `tenantId` is scoped or a named reference                                  |
| Money and dates    | Money wider than the legacy `decimal(8,2)`; legacy date strings normalised once, in the importer                                | **Partly** — all money is `Decimal(12,2)`; the normalising importer is Phase 9                           |
| Legacy gaps closed | The gaps in [`legacy/LEGACY-MAP.md`](legacy/LEGACY-MAP.md) §5 that change the schema are decided and reflected in the migration | Partly — Q1/Q4/Q7/Q8/Q9 settled; Q2/Q5/Q6 need production MySQL                                          |
| ID strategy        | [`decisions/0002`](decisions/0002-tenant-id-equals-owner-id.md) implemented, with its import test passing                       | **Not started** — this is the only row left, and it is why the phase is not called closed                |
| ID strategy        | [`decisions/0002`](decisions/0002-tenant-id-equals-owner-id.md) implemented, with its import test passing                       | Not started                                                                                              |

The phase splits into two commits. The tenant plane is the first, because the scoping
extension is load-bearing and reviews better on its own; the domain models follow, and
every new tenant-scoped model joins `TENANT_SCOPED_MODELS` in the same commit.

## Phase 3 — Authentication and authorisation · **Complete**

| Deliverable              | Acceptance criterion                                                                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login / refresh / logout | Web realm only; the refresh token rotates and the previous one is rejected                                                                                                                                  |
| Revocation               | Password change and a forced sign-out invalidate every session via `tokenVersion`; logout revokes the presented refresh token ([ADR 0007](decisions/0007-logout-revokes-the-refresh-token-not-the-user.md)) |
| Realm enforcement        | A `pos` or `mobile` token is refused by web-only routes and vice versa                                                                                                                                      |
| Roles                    | Admin screens are gated in the API, not only in the UI                                                                                                                                                      |
| Web session              | Unauthenticated visitors land on the login screen and return to where they came from                                                                                                                        |

The last two rows were met in code but only partly _demonstrable_ when the phase
closed, and the phase was called complete with that stated rather than hidden.
`Roles` needed an admin-only route for `requireRole` to be mounted on — it was
implemented and unit-tested but had no caller (**Q26**) — and Phase 4c's staff writes
gave it one, with a 403 for a stylist asserted in the route suite, so that row is now
demonstrable end to end. `Realm enforcement` still needs a `pos`/`mobile` route to
refuse a `web` token and neither exists yet (**Q25**, closes with Phase 5 and the
frozen mobile surface). Everything else is covered by tests, and the web session was
built without inventing a design: see [ADR 0008](decisions/0008-login-screen-shape.md).

## Phase 4 — Master data screens · **Done (Customers, the catalogue and staff)**

Customers, products and staff — handoff screens 07, 08 and 09. There is no separate
services screen; services are managed from the same list pattern (and appear in the
sale flow and the appointment flow), and the rail carries no Services entry
([ADR 0005](decisions/0005-rail-has-no-services-destination.md)). Criterion: create,
edit and archive a record of each kind against the real API, with list search,
pagination and server-side validation errors surfaced on the field that caused them.

| Slice          | Deliverable                                                                                                                                                | State                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Contracts      | Zod schemas for customers, the catalogue and staff in `packages/shared`, exported from the index                                                           | **Done**                                                                                         |
| 4a — Customers | `GET/POST /api/customers`, `GET/PATCH /api/customers/:id`, and the screen 07 list with search, pagination, a create/edit drawer, field-level server errors | **Done** — archive is not; `Customer` has no archived flag ([Q28](STATE.md))                     |
| 4b — Catalogue | Products and services as two tabs on `/products`, plus the rail's low-stock badge                                                                          | **Done** — the cost column and "Inventory value" tile are omitted (see the deferral table below) |
| 4c — Staff     | `/staff` against `User` rows, including the first admin-only write                                                                                         | **Done** — closes **Q26**; the drawn Shifts and Rating columns are omitted (no rota, no reviews) |

### Deferred from Phase 4 — the drawn things the model could not back

Four places where handoff screens 07–09 draw something the model has no column for: three
drawn columns or tabs, and one verb (archive). Each is **omitted on purpose and asserted
absent by a test**, so a later "fix" cannot render a zero or an empty column that a salon
would read as a fact. They are listed here rather than left as prose so the phase that can
build each one is named. (It was five: screen 08's Packages and Gift-card tabs have since
landed — Phase 5a built the catalogue behind them.)

| Deferred                                               | Why it is not here                                                                                                                                                                                            | Returns with                                                                                                                                                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Screen 08's **Cost** column and "Inventory value" tile | Neither the schema nor the legacy database it was derived from ever held a cost, so both figures would be invented. Adding one is a schema change plus a product call, not a screen change                    | **Phase 7** (dashboard and reports), the first place a stock valuation is actually read. **Not decided unilaterally** — a `cost` column on `Product` is the obvious shape, but margin visibility is a salon's business, not ours |
| Screen 09's **Shifts** column                          | There is no shift or rota table. The legacy `employees` table carried shifts and leave, and only the leave half was modelled (`EmployeeLeave`), because that is the half with a business rule to enforce      | **Phase 6** (appointments and calendar), when staff availability has to be read to book someone — a shift is only meaningful once there is a slot to put in it                                                                   |
| Screen 09's **Rating** column                          | No reviews or ratings table exists in the schema or in the legacy database, so there is no number and no "unrated" state to distinguish                                                                       | **Unscheduled** — no phase owns customer feedback yet. It needs a model before it can have a screen                                                                                                                              |
| Screen 07's **archive** (create, edit _and archive_)   | `Service` and `Product` have `CatalogStatus { ACTIVE, INACTIVE }` to archive against; `Customer` has no equivalent column, so screen 07's third verb has nothing to write (staff solved this with `disabled`) | **A decision before a slice** — [Q28](STATE.md): either `Customer.archivedAt`, or a `deletedAt` on all three master-data models at once. A product call, not a unilateral one                                                    |

## Phase 5 — POS sale and confirmation

Handoff screens 01–02. Criterion: a sale containing services, products, packages and
a gift card can be taken end to end — item search, cart, per-line staff attribution,
payment — and the confirmation screen _is_ the receipt rather than a second page.
Payment endpoints must be idempotent (see [`STATE.md`](STATE.md), open questions).

| Slice                     | Scope                                                                                                                                                                                        | Status                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 5a — the add-on catalogue | `/api/packages` and `/api/gift-cards` (list, one, create, update) and screen 08's last two tabs, which the deferral table above promised to this phase                                       | **Done** — the first mounts whose `requireModule` can refuse, since both modules are add-ons |
| 5b — the sale             | Item search across all five kinds, `POST /api/sales` (lines, per-line `staffId`, `payments[]`), `GET /api/sales/:id` as the receipt, and **Q16**'s idempotency key — which needs a migration | Not started                                                                                  |
| 5c — screen 01            | `/sale`: category tabs, the item grid with the cart visible at all times                                                                                                                     | Not started                                                                                  |
| 5d — screen 02            | The confirmation step inside `/sale`, which is the receipt                                                                                                                                   | Not started                                                                                  |

Two things 5b has to settle rather than assume: **the receipt number** (screen 02 draws
`Receipt #24418` and legacy had a human-readable `sales.sale_id`, but the rebuilt `Sale`
carries only a cuid — a schema decision, not a screen one) and **per-line pricing**, where
[Q27](STATE.md) leaves `paid_price` ambiguous for the importer but not for the schema.

## Phase 6 — Appointments and calendar

Handoff screens 03 and 06. Criterion: an appointment can be created through the
guided flow or dragged in the calendar, rescheduled and completed, and duration and
staff assignment come from the service rather than from free text.

## Phase 7 — Dashboard and reports

Handoff screens 05 and 10, backed by the report and export routes catalogued in
[`legacy/API-INVENTORY.md`](legacy/API-INVENTORY.md). Criterion: every tile and
report has a tenant-scoped query behind it and an entry in `queryKeys.ts`.

## Phase 8 — Settings and integrations

Handoff screen 11: salon profile, staff and roles, the modules the tenant has bought,
and the integrations that exist today. Criterion: a tenant can see what it owns and
change what it is allowed to change, and nothing that belongs to the platform console
is editable here.

## Phase 9 — Hardening and the live cutover

Load and error-path work, then the MySQL → PostgreSQL migration of the production
data per [`decisions/0002`](decisions/0002-tenant-id-equals-owner-id.md). Criterion:
a rehearsal migration from a production copy runs twice with identical results, the
per-table row counts reconcile, and the rollback plan has been executed at least once
on a copy.

---

## Not scheduled yet

| Item                                                                           | Why it is not a phase yet                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Platform console** — salons, modules, subscription ledger, suspension, audit | The data model and the `platform` realm are specified in [`saas/TENANCY.md`](saas/TENANCY.md), and where it lives is settled: a separate `apps/platform` on port 5174, sharing `@glampro/shared` and the same API ([ADR 0004](decisions/0004-platform-console-is-its-own-app.md)). What is still missing is a phase and its acceptance criteria, so it is unscheduled rather than undecided. The `platform` realm lands with the console phase, not Phase 3. |
| **Data import tooling**                                                        | The legacy `MigrationController` routes were commented out and are not part of the API surface ([`legacy/API-INVENTORY.md`](legacy/API-INVENTORY.md)), so the importer is written in Phase 9 against the new schema instead of being re-exposed.                                                                                                                                                                                                             |
| **Customer feedback** — ratings and reviews                                    | Handoff screen 09 draws a Rating column and the legacy database has no reviews table, so there is nothing to migrate and nothing to read. It needs a model (who may rate, what a rating attaches to — the sale, the service or the member of staff) before it can have a screen or a phase. Listed under _Deferred from Phase 4_ as unscheduled.                                                                                                             |
| **Mobile client changes**                                                      | The client is shipped and the API surface it consumes is frozen ([`legacy/API-INVENTORY.md`](legacy/API-INVENTORY.md)). Those routes are re-implemented against the new schema in the phases that own their domain; the client itself is not rebuilt.                                                                                                                                                                                                        |
