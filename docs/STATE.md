# State — where the project is right now

This is the handoff between sessions. Any session that moves the project forward ends
by updating this file (see [`../.clinerules/02-workflow.md`](../.clinerules/02-workflow.md)).
Facts below were read out of the tree, not copied from a plan.

- Phase plan and acceptance criteria: [`roadmap.md`](roadmap.md) ·
  [`architecture.md`](architecture.md) §12
- Vocabulary: [`CONTEXT.md`](CONTEXT.md) · tenancy rules:
  [`saas/TENANCY.md`](saas/TENANCY.md) · legacy source:
  [`legacy/`](legacy/LEGACY-MAP.md) · design package:
  [`design/HANDOFF.md`](design/HANDOFF.md)

## 1. Snapshot

|                  |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current phase    | **3 — Auth; the API half has landed and the web session is next.** `/api/auth` serves `GET /me`, `POST /login`, `POST /refresh`, `POST /logout` and `POST /change-password`, with token rotation, replay defence and tenant-status gating, covered by route tests against a real database ([ADR 0007](decisions/0007-logout-revokes-the-refresh-token-not-the-user.md)). Phase 2's core is landed alongside it; sales, the customer holdings ledgers and the ADR 0002 importer remain. Phase 1 closed: all 17 primitives built, tested and reconciled against the handoff ([ADR 0006](decisions/0006-snap-handoff-values-to-tokens.md)); the screen pass measured the app shell and the primitives and corrected them ([`design/HANDOFF.md`](design/HANDOFF.md) §2, §7). Q3, Q14 and Q21 closed alongside it: [ADR 0003](decisions/0003-tenant-scoped-customer-email.md), [0004](decisions/0004-platform-console-is-its-own-app.md) and [0005](decisions/0005-rail-has-no-services-destination.md). **Phase 2A (tenant plane) and 2B (core domain) are both landed**: two migrations, the tenant plane, `User.tenantId`, the catalogue, customers, departments, appointments and commissions, the `AsyncLocalStorage` scoping extension and the `requireModule` guard. **Sales, the customer holdings ledgers and the ADR 0002 importer are still to do** — see §3. |
| Last commit      | Not pinned here on purpose — run `git log -1 --oneline`. Pinning a hash in this file is what made it go stale twice; this file is updated in the same commit as the work it describes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Working tree     | Clean at the Phase 2 commit A close. Phase 1 delivered: the token copy, the 41-icon port, the 17 primitives with tests, the reconciled `AppShell` (item geometry, gaps, 8.5px/700 label, purple active state), a `Staff` nav entry answering Q15 and the removal of the rail's `Services` entry ([ADR 0005](decisions/0005-rail-has-no-services-destination.md)). Phase 2A added migration `20261002042444_tenant_plane`, the seven tenant-plane models, the `AsyncLocalStorage` scoping extension, the `requireModule` guard and the module-catalogue seed. Measurements are in [`design/HANDOFF.md`](design/HANDOFF.md) §2 and §7.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `npm run verify` | Exit 0 at the Phase 2 commit A close: format, lint, type-check, **41 API tests** (8 tenant-isolation, 6 `requireModule`, plus the Phase 0/1 suites), 6 shared, 21 web test files. The isolation and entitlement suites need a database; they **skip with a message** when `DATABASE_URL` is unset, so a run without Postgres still passes but has not proved isolation. They were run green against the compose stack.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Dev stack        | `make up-d` → API `:9100`, web `:5173`, Postgres `:5433` (`compose.yaml`, ports documented in `README.Docker.md`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Runtime          | Node 24, npm workspaces (no pnpm), Postgres 17, Prisma 7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## 2. What actually exists today

| Area                | State of the tree                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API routes          | Eight: `GET /health`, `GET /health/ready`, `GET /api/health`, and the five `/api/auth` session endpoints — `GET /me`, `POST /login`, `POST /refresh`, `POST /logout`, `POST /change-password`. Everything else in the product is still to be built.                                                                                                                                                                                                                                                  |
| API structure       | `createApp()` factory (no port binding, so tests run over real HTTP), Zod validation middleware, error handler, rate limiting, JWT helpers                                                                                                                                                                                                                                                                                                                                                           |
| Schema              | 22 models: the session pair (`User`, `RefreshToken`), the tenant plane (`PlatformAdmin`, `Tenant`, `Module`, `TenantModule`, `Subscription`, `Payment`, `AuditLog`) and the core domain (`Department`, `StaffDepartment`, `Service`, `Product`, `Package`, `PackageService`, `ValuePackage`, `ValuePackageService`, `GiftCard`, `Customer`, `CustomerDepartment`, `Appointment`, `EmployeeCommission`). `GlobalRole` = `SUPER_ADMIN · MANAGER · STAFF · CASHIER`; `AuthRealm` = `web · pos · mobile` |
| Tenancy in the code | **Landed.** `tenantId` on `User` and every domain model, the `TENANT_SCOPED_MODELS` extension over `AsyncLocalStorage`, `runAsTenant` / `runAsPlatform`, and the `requireModule` / `requireWritableTenant` guards. The access token carries the `tenantId` claim and `auth` enters `runAsTenant` for the rest of the request.                                                                                                                                                                        |
| Web pages           | `Dashboard` and `NotFound`. **No login screen yet** — the web half of Phase 3 (login page, auth context, cold-start `GET /me` bootstrap) is the next commit, and no data screens exist either.                                                                                                                                                                                                                                                                                                       |
| Web shell           | `AppShell` (rail and top bar drawn from `--sp-rail-w` / `--sp-topbar-h` via the `w-rail` / `pl-rail` / `h-topbar` utilities; rail items measured against the handoff — see [`design/HANDOFF.md`](design/HANDOFF.md) §2), `RouteWrapper`, `ErrorBoundary`, `PageLoading`, `Toast`                                                                                                                                                                                                                     |
| Web nav             | 8 entries from `constants/navigation.ts`: Dashboard, Sale, Appointments, Customers, Products, Staff, Reports\*, Settings\* (\* admin roles only; the first six are unrestricted, so a signed-out user sees six). No `Services` entry — services are a tab on the products screen and a step in the sale and appointment flows ([ADR 0005](decisions/0005-rail-has-no-services-destination.md))                                                                                                       |
| Web primitives      | All 17: `Button`, `IconButton`, `Input`, `Select`, `Checkbox`, `Card`, `Badge`, `Chip`, `EmptyState`, `Skeleton`, `Tabs`, `Pagination`, `Tooltip`, `Modal`, `Drawer`, `Table`, `Toast`. Shared, non-roadmap helpers: `Field` (label/hint/error shell) and `Dialog` (focus-trapped shell behind `Modal`/`Drawer`). Heights come from `--sp-control-h-sm/md/lg`; every interactive primitive has a keyboard, disabled and accessible-name test. `PageLoading` and `ErrorBoundary` also predate the set |
| Web styling         | `index.css` maps the handoff tokens onto Tailwind namespaces in one `@theme` block (colours, type scale, weights, radii, control heights, shadows); `styles/tokens.css` is a byte-identical copy of the handoff file; app-only values live in `styles/app-chrome.css`; icons are 41 ported SVG components in `components/icons/` — `react-icons` is gone                                                                                                                                             |
| Shared package      | `@glampro/shared` — Zod schemas, constants and types consumed by both the API and the web app                                                                                                                                                                                                                                                                                                                                                                                                        |
| Design package      | `design/handoff/` — 11 screens (+ PNGs for 01–04), `tokens.css` / `tokens.json`, 41 SVG icons                                                                                                                                                                                                                                                                                                                                                                                                        |
| Legacy application  | **Not in this repository.** `docs/legacy/` is the transcription of it: the API surface (154 registrations, 151 live routes) and the schema, plus the gaps worth knowing before migrating                                                                                                                                                                                                                                                                                                             |
| Docs                | `architecture.md`, `CONTEXT.md`, `roadmap.md`, `STATE.md`, `decisions/` (0002–0007 + index), `legacy/` (LEGACY-MAP, API-INVENTORY, reference/legacy-schema), `saas/TENANCY.md`, `design/HANDOFF.md`                                                                                                                                                                                                                                                                                                  |

## 3. Next up — Phase 3's web half, and the rest of Phase 2

### Closed with Phase 3 (API half)

The server half of Phase 3 landed in `feat(api): Phase 3 (part 1)`. `/api/auth` serves
`GET /me`, `POST /login`, `POST /refresh`, `POST /logout` and `POST /change-password` on
top of `services/auth.service.ts`; `middleware/auth.ts` re-reads the user, compares
`tokenVersion` and resolves the salon's **effective** status on every request, then hands
the rest of the request to `runAsTenant` so the Prisma extension scopes it. Access tokens
live 15 minutes, refresh tokens rotate on every use with reuse revoking the whole family,
and `SESSION_INVALIDATED` is the one code for a token that no longer works. Every route has
an integration test that runs over real HTTP against a real database.

Four things were decided here rather than guessed:

- **Logout revokes the presented refresh token and nothing else**
  ([ADR 0007](decisions/0007-logout-revokes-the-refresh-token-not-the-user.md)). A password
  change or a forced sign-out bumps `User.tokenVersion` and ends every session; signing out
  of one browser does not sign the same user out of the POS till.
- **A suspended salon signs in read-only.** `SUSPENDED` passes `canSignIn`, and
  `requireWritableTenant()` refuses every write with `TENANT_SUSPENDED`
  ([`saas/TENANCY.md`](saas/TENANCY.md) §6). `EXPIRED` and `CANCELLED` cannot sign in at all.
- **Only the web realm signs in through `/api/auth/login`.** A `pos` or `mobile` request is
  refused with `REALM_NOT_SUPPORTED`, because those surfaces own their own routes and the 36
  `/api/mobile/*` paths are frozen.
- **`GET /me` returns the tenant's effective entitlements**, which is the field
  `navigation.ts` was promised ([`saas/TENANCY.md`](saas/TENANCY.md) §5). The nav field
  itself is not added yet — nothing consumes it until the login screen lands.

**Still to do in Phase 3, and it is the whole web half:** the login screen, the auth
context, the cold-start `GET /api/auth/me` bootstrap, single-flight refresh-on-401 with
replay of the original request, logout on the top bar, the `?next=` guard, and the
suspended-read-only / expired-lockout messaging. There is no handoff screen for signing in,
so its visual shape is an open question (Q24) rather than something to invent in a commit.

The rest of this section is the reasoning carried forward from Phase 1 and the gates Phase 2
had to clear.

**Carried forward from the Phase 1 screen pass.** All 11 handoff screens were rendered at
their true frames with headless Chrome, and the app shell was measured against them and
reconciled. Two things worth carrying forward:

- The frames are **not** all 1280×900. Screens 01–04 use a `.root` container: 01 is 1280×832,
  02 is 900×832, 03 is 1280×900 and 04 is 1280×620 (a reference sheet, not a screen). Only 03
  and 05–11 are 1280×900.
- The rail in screens 05–11 is one shared shell block. Measuring it (rather than reading the
  markup) is what caught four bugs: the two gaps applied the wrong way round, the active item
  painted as a navy tint instead of `--sp-purple`, a 10px label that clipped "Appointments"
  against its own item, and off-by-a-few-px logo margin and rail padding. All four are fixed.
  The numbers, and the one deliberate deviation (item width), are in
  [`design/HANDOFF.md`](design/HANDOFF.md) §2.

### Closed with Phase 1

For the record, since it is the reasoning behind the token utilities the screens depend on:
all 17 primitives were measured against the rendered handoff and corrected per
[ADR 0006](decisions/0006-snap-handoff-values-to-tokens.md) — snap to the nearest real
token, ties round up, record the delta. Nothing was added to either token file, so the
`cmp` in [`design/HANDOFF.md`](design/HANDOFF.md) §3 still passes. The full table is in
[`design/HANDOFF.md`](design/HANDOFF.md) §7.

One of those was a **conflict, not a bug**, and must not be "fixed" towards the screen: the
handoff draws `.btn` at 37px in screens 06–11 but ~43px in screens 01–02 — it contradicts
itself — while its own token file defines `--sp-control-h-md: 44px` as the "standard
buttons" height and [`design/HANDOFF.md`](design/HANDOFF.md) §6 requires every control to
clear 44px. The app follows the token.

The four stand-in icon mappings in [`design/HANDOFF.md`](design/HANDOFF.md) §4 were
confirmed to hold: the ported set is the complete handoff directory (41 SVGs) and it ships
no info, spinner, refresh or arrow-left glyph, so `Bell`, `Settings`, `Eye` and
`ChevronLeft` remain the nearest delivered shapes. Screen 04 confirms the badge work is
still outstanding for the sale phase.

Settled: the token copy is byte-identical to the handoff file with the app-only values in
`styles/app-chrome.css`, all 41 handoff icons are ported with `react-icons` deleted, all 17
primitives are built and tested, and Q15 is answered (staff is its own `/staff` route,
because the handoff's own rail draws a Staff entry on every main-nav screen). Q21 is
answered too: the rail has eight entries and no `Services` destination
([ADR 0005](decisions/0005-rail-has-no-services-destination.md)). The screen pass adds no
routes and no data — the `Staff` entry points at a route Phase 4 fills, exactly as
`Customers` and `Products` already do.

### Gates before any Phase 2 code

1. **The `OWNER` role — settled.** `docs/CONTEXT.md` and `docs/saas/TENANCY.md` both said
   `User.role` includes `OWNER`, but the code's `GLOBAL_ROLES` is `SUPER_ADMIN · MANAGER ·
STAFF · CASHIER` — there was no `OWNER`. Ownership is a **relation, not a role**, carried
   by `Tenant.ownerUserId` (already in the `TENANCY.md` §2 model, unique, and used by
   [ADR 0002](decisions/0002-tenant-id-equals-owner-id.md)), so `GLOBAL_ROLES` is unchanged
   and no enum is added. The four doc statements that contradicted the code are corrected.
   Anyone implementing Phase 2 must treat `ownerUserId` as the only definition of ownership,
   and must not add an `OWNER` role.
2. **The four legacy-source questions are answered.** Q4, Q7, Q8 and Q9 were
   resolved by reading the Laravel code, not guessed, and are written up with their
   evidence in [`legacy/LEGACY-MAP.md`](legacy/LEGACY-MAP.md) §6. What they settled:
   employee **is** user (one model); `appointments.start_time` is authoritative over
   the `date`/`time` copies; `status` is a two-state flag where `finish_time` means
   finished; and leave approval _was_ persisted, lossily, in
   `employee_leaves.granted_by`. The rows are closed in §4.1. **The schema may now be
   written against these answers.**
3. ~~**Build the tenant plane, then the domain.**~~ — **Both halves are landed.**
   Migration `20261002042444_tenant_plane` adds `PlatformAdmin`, `Tenant`, `Module`,
   `TenantModule`, `Subscription`, `Payment` and `AuditLog` per
   [`saas/TENANCY.md`](saas/TENANCY.md) §2; migration `20261002060110_domain_models` adds
   `User.tenantId` plus `Department`, `StaffDepartment`, `Customer`,
   `CustomerDepartment`, `Service`, `Product`, `Package`, `PackageService`,
   `ValuePackage`, `ValuePackageService`, `GiftCard`, `Appointment` and
   `EmployeeCommission`. `lib/tenant-context.ts` provides `runAsTenant` / `runAsPlatform`
   over `AsyncLocalStorage`; `lib/prisma.ts` exports the extended client and the
   auditable `TENANT_SCOPED_MODELS`; `middleware/requireModule.ts` is the entitlement
   guard. Twelve isolation tests and six entitlement tests are green against a real
   database.
   **Still to do:** sales and its line items, the customer holdings ledgers
   (`customer_packages`, `customer_points`, `customer_outstandings`, the three
   `*_used_*` redemption tables), `employee_performances` and `employee_leaves`; plus
   ADR 0002's importer and its idempotence test. Those belong to Phases 5–7 and Phase 9,
   and are deliberately not modelled speculatively before their phase owns them.
4. ~~**Wire the scope into `middleware/auth.ts`.**~~ — **Done as far as it can be now.**
   `User` is tenant-scoped, so the auth middleware's session lookup is wrapped in
   `runAsPlatform`: it is keyed on the verified token's `sub` and runs before any tenant
   is known, so it reads exactly one row by primary key and cannot cross tenants. Phase 3
   replaces that with the token's `tenantId` claim and wraps the rest of the request in
   `runAsTenant`.

One schema consequence worth knowing before the next commit, because it forces an
ordering on every code path that creates a tenant: **`users.tenantId` and
`tenants.ownerUserId` are mutually referential**, so the tenant row must be inserted
first and ownership claimed immediately afterwards. `Tenant.ownerUserId` is therefore
nullable — it is still `unique`, and the tenancy spec only ever required uniqueness.
The seed does this, and so must anything else that bootstraps a tenant.

Four further questions (**Q1**, **Q2**, **Q5**, **Q6**) need production MySQL and are listed
in §4.1 with the exact query for each. Nothing that depends on them can proceed without DB
access.

Also settled, and needed by Phase 3: [`saas/TENANCY.md`](saas/TENANCY.md) §5 said
`navigation.ts` "carries a `module` field" for entitlement-based nav hiding, but `NavItem` is
`label` / `path` / `icon` / `roles` / `badge` and no such field exists. The field **arrives
with Phase 3**, when `GET /api/auth/me` starts returning the entitlement list; adding it
now would be a field nothing populates, and `navigation.test.ts` asserts the rail's shape.
The doc now says so rather than describing a field that is not there.

Conventions the built primitives established: a primitive's own `variant`/`size` props change its
appearance and `className` is for layout only, because `cn` joins strings without resolving
conflicts; an icon-only control takes a required `label` prop that becomes both its accessible
name and its tooltip; a primitive that cannot be operated has no keyboard path to test, so its
test asserts presence, naming and that it does _not_ expose a control role; and `Modal`/`Drawer`
share one `Dialog` shell, so a change to focus, Escape or scroll-lock lands in both.

## 4. Open questions

### 4.1 Source-data questions

These change the **schema or the importer**, so each one must be answered before the
phase that owns it is built. Numbers in brackets are the finding numbers in
[`legacy/LEGACY-MAP.md`](legacy/LEGACY-MAP.md) §5.

| #   | Question                                                                                                | Why it blocks                                                                       | What unblocks it                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | `sales.paymenttype_id` points at a `paymenttypes` table **no migration creates** `[1]`                  | The `Sale` model cannot be finalised while it is unknown whether the column is live | Inspect the production MySQL schema (`information_schema.tables`): if the table exists there it becomes a real model, otherwise the column is dropped                                                                                                                                                                                                 |
| Q2  | `users.email` is not unique in the database `[3]`                                                       | The importer has to do _something_ with duplicates — merge, suffix, or fail         | Duplicate report from production (`GROUP BY email HAVING COUNT(*) > 1`), then a written rule per case                                                                                                                                                                                                                                                 |
| Q4  | — **Resolved.** "Employee" and "user" are the same row `[5]`                                            | —                                                                                   | **Answered from the legacy code.** `EmployeeController::create()` creates a `User`, and `employee_leaves.employee_id` is a FK onto `users.id`. **One** `User` model; staff is a role plus a staff profile, not a second table. [`legacy/LEGACY-MAP.md`](legacy/LEGACY-MAP.md) §6 Q4                                                                   |
| Q5  | `users.gender` is an integer, `customers.gender` a string `[6]`                                         | Importer normalisation — one representation or two                                  | List the distinct values in production, choose one enum, write the mapping                                                                                                                                                                                                                                                                            |
| Q6  | `customers.dob` and `giftcards.expired_date` are strings `[7]`                                          | A malformed date must not abort a whole salon's import                              | Query for the values that do not parse (`''`, `0000-00-00`, `DD/MM/YYYY`) and decide: null, or fail loudly                                                                                                                                                                                                                                            |
| Q7  | — **Resolved.** `appointments.date` + `time` duplicate `start_time` `[8]`                               | —                                                                                   | **Answered from the legacy code.** `start_time` is written from `date`+`time` on create and update, and every read path uses it. The importer trusts `start_time`, falling back to `date`+`time` only where it is null. [`legacy/LEGACY-MAP.md`](legacy/LEGACY-MAP.md) §6 Q7                                                                          |
| Q8  | — **Resolved.** `appointments.status` is a boolean for a five-state lifecycle `[9]`                     | —                                                                                   | **Answered from the legacy code.** Only `appointmentStart()` writes it, setting `1`; `appointmentFinish()` sets `finish_time`+`signature` and leaves `status` alone. Map `0→SCHEDULED`, `1→IN_PROGRESS`, `finish_time→COMPLETED`. [`legacy/LEGACY-MAP.md`](legacy/LEGACY-MAP.md) §6 Q8                                                                |
| Q9  | — **Resolved.** `employee_leaves` has no approval column although approve/reject endpoints exist `[10]` | —                                                                                   | **Answered from the legacy code.** Approval _was_ stored, as free text: `granted_by` holds the approver's name, or the literal `"rejected"`. The new `Leave` gets a status enum plus `approvedById`; the importer maps the string and leaves `approvedById` null when the name does not resolve. [`legacy/LEGACY-MAP.md`](legacy/LEGACY-MAP.md) §6 Q9 |
| Q10 | `employee_comissions.sale_amount` is an integer `[11]` and every money column is `decimal(8,2)` `[12]`  | Truncated amounts cannot be recovered by widening the target column                 | Widening is already agreed. Still open: does the cutover need a one-off correction query for commissions? Product call                                                                                                                                                                                                                                |
| Q11 | `migration_access` may gate nothing — the `MigrationController` routes are commented out `[13]`         | Decides whether Phase 9 imports through a CLI job or an in-app screen               | Decide the shape of the importer; [`roadmap.md`](roadmap.md) currently plans a CLI job in Phase 9                                                                                                                                                                                                                                                     |

### 4.2 Build questions

These are ours to decide; none of them needs production data.

| #   | Question                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Why it matters now                                                                                                                                                                                                                             | Owner / when                                                                                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q16 | The legacy sale/payment endpoints have **no idempotency key**.                                                                                                                                                                                                                                                                                                                                                                                                   | Phase 5 acceptance requires that a double-tap cannot double-charge                                                                                                                                                                             | Engineering, in Phase 5 (client-generated key stored on the sale/payment row; small enough not to need an ADR)                                                                                                                                              |
| Q17 | `POST /webhook` is public, unauthenticated, and its provider is not recorded anywhere.                                                                                                                                                                                                                                                                                                                                                                           | Phase 8 integrations. Rebuilding it as-is would open an unauthenticated write path                                                                                                                                                             | Keep the route out until the sender and its signature scheme are identified (engineering, Phase 8)                                                                                                                                                          |
| Q18 | In the legacy app `POST /api/mobile/value-packages` resolves to the **same handler** as `/api/mobile/services`.                                                                                                                                                                                                                                                                                                                                                  | The mobile contract is frozen, so the question is whether this is a bug to fix or behaviour to preserve                                                                                                                                        | Engineering: check what the shipped client expects. If the shapes can be kept, fix it behind the same URL; otherwise preserve the bug deliberately and say so in the inventory                                                                              |
| Q19 | The legacy surface mixes `PUT` and `POST` for equivalent writes.                                                                                                                                                                                                                                                                                                                                                                                                 | The new web surface should use one convention; the frozen mobile routes cannot change                                                                                                                                                          | Engineering, when each phase adds its routes. Rule for the rebuild: new routes are REST (`POST` create, `PATCH` update, `PUT` only for full replacement); frozen routes keep their verb and are documented as frozen                                        |
| Q20 | 36 mobile routes are frozen and must come back **one phase at a time**, with identical response shapes.                                                                                                                                                                                                                                                                                                                                                          | It is easy for a phase to be called complete while a mobile route it owns is still missing                                                                                                                                                     | Nothing blocks it — the contract is written down in [`legacy/API-INVENTORY.md`](legacy/API-INVENTORY.md). Each phase's acceptance must check the frozen routes it owns                                                                                      |
| Q22 | The rail's **foot** is not modelled. The handoff puts `Settings` in `.side-foot` beside `Log out`; the app declares `Settings` as an ordinary `navItems` entry — rendered only once a role is supplied, and then in the main nav — and `AppShell` hard-codes its own `Log out` button below the `<nav>`. The labels differ too: `Dashboard`/`Appointments` here, `Home`/`Calendar` in the proposal.                                                              | Both are user-visible, and role-gating is currently the only thing keeping `Settings` out of the rail, so the foot's shape has to be settled before the settings screen and the top bar's account menu land                                    | Product/scope: keep the app's labels and nav shape, or adopt the handoff's (`CONTEXT.md` §5 permits labels to differ). Decide before the first role-aware render arrives with Phase 3 auth                                                                  |
| Q23 | The handoff's **amber badge tone has no token**. `.status.progress` (screen 05) uses `#FFF4DE` on `#B9740A`, and `.tier.gold` (screen 07) uses the same pair. The token file exposes amber only as a gradient stop (`--sp-amber-grad-a/b`) for the dashboard income tile, so there is nothing to snap to — [ADR 0006](decisions/0006-snap-handoff-values-to-tokens.md) sends values further than 1px from every token to a question rather than an invented one. | `Badge` deliberately offers no amber variant, and **both the dashboard and customers screens need one** (an in-progress appointment status and the Gold/Silver/New tier column), so neither screen can be built as drawn until this is settled | Design, before those screens. Either the designer adds an amber surface/text token to `design/handoff/tokens/tokens.css` and it is re-copied, or we accept the nearest existing tones and record it as a visual deviation the way ADR 0006 records the rest |
| Q24 | **The sign-in screen has no handoff design.** `design/handoff/` draws 11 screens and none of them is login, yet Phase 3's acceptance criterion is that unauthenticated visitors land on one.                                                                                                                                                                                                                                                                     | The web half of Phase 3 cannot be committed without deciding what the screen looks like, and it is the one screen the rebuild has no drawing for                                                                                               | Design/product: either a screen arrives for the vendored package, or the existing primitives are used to build one and the shape is recorded as a deliberate invention                                                                                      |
| Q25 | **The realm criterion is only half demonstrable.** `login` refuses a `pos`/`mobile` realm with `REALM_NOT_SUPPORTED` and `auth` refuses a token with no tenant realm, but no `pos` or `mobile` route exists yet, so the "and vice versa" half of the criterion cannot be shown.                                                                                                                                                                                  | The Phase 3 `Realm enforcement` row cannot be closed as written                                                                                                                                                                                | Nothing blocks it — it closes when Phase 5 (POS) and the frozen `/api/mobile/*` surface add routes that must refuse a `web` token                                                                                                                           |
| Q26 | **`requireRole` has no caller.** It is implemented and unit-tested, but no route mounts it, so "admin screens are gated in the API, not only in the UI" is an assertion with nothing exercising it end to end.                                                                                                                                                                                                                                                   | The Phase 3 `Roles` criterion is unproven, and the first admin-only route is where it would be caught                                                                                                                                          | The first admin-only route — a Phase 4 master-data write or a Phase 8 settings endpoint — is where it gets its integration test                                                                                                                             |

## 5. Verify status

`npm run verify` is `format:check` → `lint` → `typecheck` → `test`. Last full run:
**exit 0**, 2026-10-02, with the Phase 3 API half in the tree. The three steps before the
tests passed with no warnings, and the suites reported **187 tests passed, 0 failed**:

| Step           | Result                                                            |
| -------------- | ----------------------------------------------------------------- |
| `format:check` | Pass — every matched file already Prettier-formatted              |
| `lint`         | Pass — no errors or warnings in any workspace                     |
| `typecheck`    | Pass — `@glampro/shared`, `@glampro/api`, `@glampro/web`          |
| API tests      | **44 passed, 0 failed** (18 suites) — three suites skipped, below |
| Shared tests   | **6 passed, 0 failed** (3 suites)                                 |
| Web tests      | **21 files, 137 tests passed** (Vitest)                           |

**`npm run verify` does not exercise the database-backed suites**, and that is easy to
mistake for coverage. Three of them — `tenant isolation`, `requireModule` and `web session
endpoints` — are gated on `DATABASE_URL` and report

```
﹣ web session endpoints # DATABASE_URL is not set
```

when it is absent, which is why the API figure above is 44 rather than 81. They were run
separately, and this is the observed result:

```
DATABASE_URL='postgresql://glampro:…@127.0.0.1:5433/glampro_test' \
JWT_SECRET='<the value in .env.docker>' npm test --workspace @glampro/api
→ 81 tests, 24 suites, 81 pass, 0 fail, 0 skipped, 16.4s, exit 0
```

The 37 tests that appear only in that run are tenant isolation (12), `requireModule` (6) and
the five `/api/auth` routes (19: login 6, `GET /me` 3, a suspended salon 2, refresh 2,
logout 3, change-password 3). They need a migrated database: `glampro_test` was created on
the Docker Postgres (host port **5433**) and `prisma migrate deploy` applied all three
migrations to it first. **The dev `glampro` database is not migrated to
`20261002060110_domain_models`**, so these suites fail against it — use `glampro_test`, or
migrate `glampro` first.

**What the Phase 1 close did not re-verify.** The run recorded above covers the unit suites,
lint, type-check and formatting only. The Docker stack was **not** started at the close, so
`GET /health`, `GET /health/ready` and `make smoke` carry the earlier session's result and
were not re-confirmed here. If the stack matters to your change, run `make up-d && make
smoke` before trusting those endpoints.

### Two Prisma 7 behaviours that cost real time, and will cost it again

Both were found by the Phase 2 commit A work and are recorded here because neither fails
loudly — the first scoped nothing while every test still passed.

**`$allModels` handlers receive the model name, not the delegate name.** An extension
written as `$allModels: { findMany({ model }) { … } }` is handed `"Subscription"`, while
the delegate is `prisma.subscription`. A `TENANT_SCOPED_MODELS` list written in
camelCase therefore matches nothing, every handler falls through to `query(args)`, and
**no tenant is ever filtered**. `isTenantScoped()` returning `false` for every query is
the symptom. The list now holds the names as written in `schema.prisma`.

**Prisma defers a query until the returned promise is subscribed to.** It does not
dispatch on the call, so `runAsTenant(id, () => prisma.x.findMany())` builds the promise
inside the scope, returns it, and the scope has already exited by the time the caller
awaits — the extension then throws _"No tenant scope"_ for a correctly scoped call.
`runAsTenant` / `runAsPlatform` now subscribe to a returned promise before leaving the
scope (`startInsideScope` in [`saas/TENANCY.md`](saas/TENANCY.md) §4 territory). Any new
helper that opens a scope must do the same.

A third, smaller one: the `prisma-client` generator used here **exports no DMMF**, so
`Prisma.dmmf` is `undefined`. The "every `tenantId` model is scoped" test reads
`prisma/schema.prisma` directly instead.

The screen pass has **partly** run. The app shell was rendered and measured against screens
05–11 and now matches the handoff — the rail's item geometry, both gaps, the 8.5px/700 label and
the purple active state are verified by reading computed styles back out of the browser, not by
eye, and the app now renders "Customers" at 46.4px, the same width the handoff produces. The
`Staff` entry answers Q15. The **standalone primitives are now reconciled too**: the
measured values are in [`design/HANDOFF.md`](design/HANDOFF.md) §7.

One limit worth stating plainly. The new assertions check **class names, not pixels** —
jsdom performs no Tailwind layout, so they prove the reconciliation was not silently
reverted but they do not prove a rendered pixel. The rendered numbers come from the browser
measurement pass and from `build:web`; a unit test cannot substitute for either. Anything
claiming to have "verified the geometry" from the Vitest run alone is overstating it.

The **standalone primitives are now reconciled**: each was measured against the rendered
screens and corrected, per [ADR 0006](decisions/0006-snap-handoff-values-to-tokens.md).
The values are tabled in §3, item 1 and in [`design/HANDOFF.md`](design/HANDOFF.md) §7.
The token utilities they use (`h-control`, `rounded-md`, `rounded-card`, `font-heavy`,
`border-line-soft`) all resolve through the `@theme` block; note that `font-medium` is the
handoff's 600 rather than Tailwind's default 500, so `font-bold` is 700 and `font-heavy`
is 800.

Reconciling turned up something the earlier measurement pass could not have seen on its
own: **the handoff's screens draw type sizes and colours its own token file does not
define.** Nothing was added to either token file to compensate — the values were snapped
to the nearest real token and the delta recorded — but it means the app now differs from
the static handoff HTML by up to 0.5px of type size in three places, deliberately. The
amber badge tone is the exception: it is too far from any token to snap, so it is Q23.

How the shell reconciliation was validated, since unit tests cannot see geometry: every screen
and the running dev server were screenshotted with headless Chrome at the handoff's own frame
size, and a throwaway same-origin page read `getComputedStyle` for the rail's items, labels and
nav out of the live DOM. Those numbers are what §2 of [`design/HANDOFF.md`](design/HANDOFF.md)
records. The throwaway page was deleted; nothing in the tree depends on it. Outbound network to
`fonts.googleapis.com` was confirmed reachable first, so the screenshots and measurements used
the real Plus Jakarta Sans rather than the fallback stack.

Two things to know when you run it yourself:

- The API suite logs a large `DEBUG Rejected request during authentication` stack trace.
  That is the error-contract test asserting a `401`, not a failure.
- `format:check` covers new files too, so a doc edited but not formatted is the most
  common way to fail it. Fix with `npx prettier --write <file>`.

`design/handoff/` is now listed in [`.prettierignore`](../.prettierignore): the redesign
package is vendored reference material and is kept exactly as delivered, so Prettier no
longer reports it. `apps/web/src/styles/tokens.css` was already ignored, for the same
reason.

## 6. How to pick this up

1. Read [`../AGENTS.md`](../AGENTS.md) and [`../.clinerules/`](../.clinerules) — they
   carry the rules this project is held to.
2. Read [`architecture.md`](architecture.md) for the shape of the system and this file
   for where it actually stands.
3. `make up-d`, then visit <http://localhost:5173> and <http://localhost:9100/health>.
4. Take the next item from §3, or answer an open question from §4 and delete the row.
5. Before finishing: `npm run verify`, then update §1, §2 and §5 here.
