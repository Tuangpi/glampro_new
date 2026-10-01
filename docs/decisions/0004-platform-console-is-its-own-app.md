# 0004 — The platform console is its own app

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** Product (placement) · Engineering (shape, port, realm sequencing)
- **Related:** [`saas/TENANCY.md`](../saas/TENANCY.md) §2, §3, §7,
  [`legacy/API-INVENTORY.md`](../legacy/API-INVENTORY.md) §5,
  [`legacy/reference/legacy-schema.md`](../legacy/reference/legacy-schema.md) §system_admins,
  [`roadmap.md`](../roadmap.md) "Not scheduled yet", [`STATE.md`](../STATE.md) §4.2 Q14

## Context

The legacy product ships a second, privileged surface: **13 endpoints** under
`/api/v1/system-admin/*`, guarded by `auth:sanctum` + `system-admin` over a `system_admins`
table ([`API-INVENTORY.md`](../legacy/API-INVENTORY.md) §5). It is the whole platform
console — nothing else in the legacy app is unscoped.

The rebuild models that layer as the **platform plane**
([`TENANCY.md`](../saas/TENANCY.md) §2): `PlatformAdmin` (never has a `tenantId`), `Tenant`,
`TenantModule`, `Subscription`, `Payment`, `AuditLog`. §3 gives it the `platform` realm and
§7 makes it the one surface that runs through `runAsPlatform()` and therefore bypasses
tenant scoping — which is exactly why every console query is restricted to platform-plane
models.

Where the console _lives_ was undecided, and it gates Phase 3: `TENANCY.md` §3 lists the
`platform` realm, but the shipped enum is `web · pos · mobile`
([`../../packages/shared/src/constants.ts`](../../packages/shared/src/constants.ts)), and
`AuthRealm` is a **database enum** on `RefreshToken.realm`, so adding a member is a
migration rather than a constant edit.

## Decision

1. The platform console is a **separate workspace app**, `apps/platform` — not a surface
   inside `apps/web`, and not a second build of it.
2. It consumes `@glampro/shared` and calls the **same API** on the same origin policy as
   the salon app. It gets no API and no database of its own.
3. Dev port **5174** is reserved for it. `apps/web` keeps 5173; 9000 and 8080 belong to
   other stacks on this host ([`.clinerules/02-workflow.md`](../../.clinerules/02-workflow.md),
   Docker).
4. The `platform` realm is added to `AUTH_REALMS`, to the Prisma `AuthRealm` enum and to a
   login surface **by the phase that builds the console — not by Phase 3**. Phase 3 stays
   `web`-only and its acceptance criterion is unchanged: a `pos` or `mobile` token is
   refused by web-only routes.
5. **This ADR creates no phase.** The console stays in
   [`roadmap.md`](../roadmap.md) "Not scheduled yet"; scheduling it with acceptance
   criteria is a separate product decision. What is decided here is where it goes when
   that happens.
6. The menu of platform-plane models the console may touch is already fixed by
   [`TENANCY.md`](../saas/TENANCY.md) §7 and is not reopened here.

## Why not the alternatives

| Alternative                              | Why it was rejected                                                                                                                                                                                                     |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A surface inside `apps/web`              | Ships the most privileged UI in the bundle every salon user loads: same origin, same session storage, same deploy. One XSS in the salon app becomes an XSS in the console, and the two cannot be released independently |
| A second Vite build/target of `apps/web` | The same coupling with an added hazard: two build outputs that must never be confused, and no separate dependency surface, even though the console's UI is not the salon UI                                             |
| Its own API and database                 | Doubles the auth, session and audit surface that `runAsPlatform()` exists to keep in one place, and the console legitimately needs the same session and `AuditLog` machinery as everything else                         |
| Decide it when a phase is scheduled      | Phase 3 (auth) cannot finish without knowing whether it must also mint a `platform` realm, and the realm lives in a database enum — deciding late means a second migration on a table that is already in production use |

## Consequences

- **Positive.** The console cannot be imported by the salon app — npm workspaces do not
  link sibling apps — so the realm boundary is physical as well as logical. The frozen
  mobile contract and `apps/web` are untouched. The console's dependency surface can grow
  without growing the salon bundle.
- **Negative / accepted.** A third workspace to configure, build, containerise, test and
  deploy. Concretely: a `tsconfig`, an ESLint entry, a Vite config, a Dockerfile, a
  `compose.yaml` service and a **new explicit step in the CI `docker` job**, which builds
  api and web by name ([`../../.github/workflows/ci.yml`](../../.github/workflows/ci.yml)).
  Today's UI primitives live in
  [`../../apps/web/src/components/ui`](../../apps/web/src/components/ui), so the console
  either duplicates the handful it needs or those primitives later move into a shared
  package — **that move is not decided here** and is its own ADR if it happens.
- **Neutral.** The root `package.json` already declares `apps/*` as a workspace and its
  scripts fan out with `--workspaces --if-present`, so a new app joins format, lint,
  typecheck and test without any root change. The `platform` realm stays absent from
  `AUTH_REALMS` until the console phase, and this ADR does not make `apps/web` behave any
  differently.
- **Neutral.** Setting up the console in a later phase means the "no `platform` realm" gap
  in [`TENANCY.md`](../saas/TENANCY.md) §3 is closed by that phase, not by this one.

## Enforcement

- The npm workspace boundary does the enforcing: because `apps/web` and `apps/platform` are
  not dependencies of each other, an import between them cannot resolve. There is no lint
  rule to write.
- Rule 4's sequencing is enforced by the **absence** of `platform` in
  [`../../packages/shared/src/constants.ts`](../../packages/shared/src/constants.ts): the
  console phase must add it to the constant _and_ ship a committed migration for the
  Prisma enum ([`../../AGENTS.md`](../../AGENTS.md), rule 5), and it must update
  [`TENANCY.md`](../saas/TENANCY.md) §3 in the same commit (ADR rule: the ADR wins, the
  document is fixed).
- Nothing enforces the _placement_ itself — no code exists yet. This file is the record
  until the console phase exists.
