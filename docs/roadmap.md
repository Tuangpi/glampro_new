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

## Phase 1 — Design system · **In progress**

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

## Phase 2 — Full data model

| Deliverable        | Acceptance criterion                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Tenant plane       | `Tenant`, `Module`, `TenantModule`, `Subscription`, `Payment`, `AuditLog` per [`saas/TENANCY.md`](saas/TENANCY.md)              |
| Domain models      | Catalogue, customers, staff, departments, appointments, sales, packages, gift cards, credit, commissions, leaves                |
| Tenancy column     | `tenantId` non-null on every domain table; no query resolves a tenant from a body or a query parameter                          |
| Money and dates    | Money wider than the legacy `decimal(8,2)`; legacy date strings normalised once, in the importer                                |
| Tenant isolation   | An integration test seeds two tenants and asserts that every read path returns only the caller's rows                           |
| Legacy gaps closed | The gaps in [`legacy/LEGACY-MAP.md`](legacy/LEGACY-MAP.md) §5 that change the schema are decided and reflected in the migration |
| ID strategy        | [`decisions/0002`](decisions/0002-tenant-id-equals-owner-id.md) implemented, with its import test passing                       |

## Phase 3 — Authentication and authorisation

| Deliverable              | Acceptance criterion                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------ |
| Login / refresh / logout | Web realm only; the refresh token rotates and the previous one is rejected           |
| Revocation               | Logout and password change invalidate outstanding access tokens via `tokenVersion`   |
| Realm enforcement        | A `pos` or `mobile` token is refused by web-only routes and vice versa               |
| Roles                    | Admin screens are gated in the API, not only in the UI                               |
| Web session              | Unauthenticated visitors land on the login screen and return to where they came from |

## Phase 4 — Master data screens

Customers, products and staff — handoff screens 07, 08 and 09. There is no separate
services screen; services are managed from the same list pattern (and appear in the
sale flow and the appointment flow). Criterion: create, edit and archive a record of
each kind against the real API, with list search, pagination and server-side validation
errors surfaced on the field that caused them.

## Phase 5 — POS sale and confirmation

Handoff screens 01–02. Criterion: a sale containing services, products, packages and
a gift card can be taken end to end — item search, cart, per-line staff attribution,
payment — and the confirmation screen _is_ the receipt rather than a second page.
Payment endpoints must be idempotent (see [`STATE.md`](STATE.md), open questions).

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

| Item                                                                           | Why it is not a phase yet                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Platform console** — salons, modules, subscription ledger, suspension, audit | The data model and the `platform` realm are specified in [`saas/TENANCY.md`](saas/TENANCY.md), but there is no phase, no acceptance criteria and no decision on whether it ships inside `apps/web` or as a separate app. `AuthRealm` does not contain `platform` yet either. |
| **Data import tooling**                                                        | The legacy `MigrationController` routes were commented out and are not part of the API surface ([`legacy/API-INVENTORY.md`](legacy/API-INVENTORY.md)), so the importer is written in Phase 9 against the new schema instead of being re-exposed.                             |
| **Mobile client changes**                                                      | The client is shipped and the API surface it consumes is frozen ([`legacy/API-INVENTORY.md`](legacy/API-INVENTORY.md)). Those routes are re-implemented against the new schema in the phases that own their domain; the client itself is not rebuilt.                        |
