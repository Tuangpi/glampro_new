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

|                  |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current phase    | **4, complete (4a, 4b, 4c).** Phase 4a (Customers, screen 07) and 4b (the catalogue — products and services, screen 08, plus the rail's low-stock badge) are landed and verified: shared contracts, `GET`/`POST`/`PATCH` for `/api/customers` and for `/api/products` + `/api/services`, a read-only `/api/departments`, and both screens with list, search, pagination, create and edit. Phase 4c (staff, screen 09) is landed too: `/api/staff` (list, one person, create, update), with `requireRole("SUPER_ADMIN", "MANAGER")` on the two writes — the guard's first caller, which closes **Q26** — and the screen's tiles, three-way status filter, list and create/edit drawer. Phase 5 (the POS) is next. Phase 2's one open acceptance row is still [ADR 0002](decisions/0002-tenant-id-equals-owner-id.md)'s importer and it can proceed alongside them.                                       |
| Last commit      | Not pinned here on purpose — run `git log -1 --oneline`. Pinning a hash in this file is what made it go stale twice; this file is updated in the same commit as the work it describes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Working tree     | Clean at the Phase 2 commit B close. Phase 1 delivered: the token copy, the 41-icon port, the 17 primitives with tests, the reconciled `AppShell` (item geometry, gaps, 8.5px/700 label, purple active state), a `Staff` nav entry answering Q15 and the removal of the rail's `Services` entry ([ADR 0005](decisions/0005-rail-has-no-services-destination.md)). Phase 2A added migration `20261002042444_tenant_plane`, the seven tenant-plane models, the `AsyncLocalStorage` scoping extension, the `requireModule` guard and the module-catalogue seed; Phase 2B added migration `20261002060110_domain_models` (department, customer, service, product, package, value package, gift card, appointment, commission) and Phase 2C migration `20261003091356_sale_and_customer_ledgers` (the POS and the customer ledgers). Measurements are in [`design/HANDOFF.md`](design/HANDOFF.md) §2 and §7. |
| `npm run verify` | Exit 0 at the Phase 2 commit C close: format, lint, type-check, **88 API tests** (19 suites — 12 tenant-isolation, 6 `requireModule`, the sale-and-ledger suite, the web-session suite, plus the Phase 0/1 suites), 6 shared, **24 web test files / 169 tests**. The isolation, entitlement, ledger and session suites need a database; they **skip with a message** when `DATABASE_URL` is unset, so a bare `npm run verify` on the host passes but has not proved isolation. Run with `DATABASE_URL` pointed at the compose Postgres to get the 88. They were run green against the compose stack at this commit.                                                                                                                                                                                                                                                                                     |
| Dev stack        | `make up-d` → API `:9100`, web `:5173`, Postgres `:5433` (`compose.yaml`, ports documented in `README.Docker.md`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Runtime          | Node 24, npm workspaces (no pnpm), Postgres 17, Prisma 7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## 2. What actually exists today

| Area                | State of the tree                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API routes          | Eight: `GET /health`, `GET /health/ready`, `GET /api/health`, and the five `/api/auth` session endpoints — `GET /me`, `POST /login`, `POST /refresh`, `POST /logout`, `POST /change-password`. Everything else in the product is still to be built.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| API structure       | `createApp()` factory (no port binding, so tests run over real HTTP), Zod validation middleware, error handler, rate limiting, JWT helpers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Schema              | **33 models.** The session pair (`User`, `RefreshToken`), the tenant plane (`PlatformAdmin`, `Tenant`, `Module`, `TenantModule`, `Subscription`, `Payment`, `AuditLog`), the core domain (`Department`, `StaffDepartment`, `Service`, `Product`, `Package`, `PackageService`, `ValuePackage`, `ValuePackageService`, `GiftCard`, `Customer`, `CustomerDepartment`, `Appointment`), and the POS and ledgers landed in migration `20261003091356`: `Sale`, `SaleLine`, `CustomerPackageHolding`, `CustomerValuePackageHolding`, `CustomerGiftCardHolding`, `CustomerPoint`, `CustomerOutstanding`, `CustomerOutstandingPayment`, `CustomerRedemption`, `EmployeeCommission`, `EmployeePerformance`, `EmployeeLeave`. Enums add `SaleStatus`, `SaleLineItemType`, `PaymentStatus` and `LeaveStatus` |
| Tenancy in the code | **Landed.** `tenantId` on `User` and every domain model, the `TENANT_SCOPED_MODELS` extension over `AsyncLocalStorage`, `runAsTenant` / `runAsPlatform`, and the `requireModule` / `requireWritableTenant` guards. The access token carries the `tenantId` claim and `auth` enters `runAsTenant` for the rest of the request.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Web pages           | `Login`, `Dashboard`, `Customers`, `Products` (with its Services tab), `Staff` and `NotFound`. The web half of Phase 3 is **landed**: `/login` is a real screen, the shell is behind `ProtectedRoute`, and the cold-start `GET /me` bootstrap, single-flight refresh-on-401, logout and the entitlement-filtered rail are all in. Every Phase 4 screen is a list with search, server pagination and a create/edit drawer.                                                                                                                                                                                                                                                                                                                                                                        |
| Web shell           | `AppShell` (rail and top bar drawn from `--sp-rail-w` / `--sp-topbar-h` via the `w-rail` / `pl-rail` / `h-topbar` utilities; rail items measured against the handoff — see [`design/HANDOFF.md`](design/HANDOFF.md) §2), `RouteWrapper`, `ErrorBoundary`, `PageLoading`, `Toast`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Web nav             | 8 entries from `constants/navigation.ts`: Dashboard, Sale, Appointments, Customers, Products, Staff, Reports\*, Settings\* (\* admin roles only; the first six are unrestricted, so a signed-out user sees six). Each entry now carries the `Module.code` it needs, so the rail also filters on the entitlement list `GET /auth/me` returns — the field `saas/TENANCY.md` §5 promised. Settings has no module and is never hidden on entitlement. No `Services` entry — services are a tab on the products screen and a step in the sale and appointment flows ([ADR 0005](decisions/0005-rail-has-no-services-destination.md))                                                                                                                                                                  |
| Web primitives      | All 17: `Button`, `IconButton`, `Input`, `Select`, `Checkbox`, `Card`, `Badge`, `Chip`, `EmptyState`, `Skeleton`, `Tabs`, `Pagination`, `Tooltip`, `Modal`, `Drawer`, `Table`, `Toast`. Shared, non-roadmap helpers: `Field` (label/hint/error shell) and `Dialog` (focus-trapped shell behind `Modal`/`Drawer`). Heights come from `--sp-control-h-sm/md/lg`; every interactive primitive has a keyboard, disabled and accessible-name test. `PageLoading` and `ErrorBoundary` also predate the set                                                                                                                                                                                                                                                                                             |
| Web styling         | `index.css` maps the handoff tokens onto Tailwind namespaces in one `@theme` block (colours, type scale, weights, radii, control heights, shadows); `styles/tokens.css` is a byte-identical copy of the handoff file; app-only values live in `styles/app-chrome.css`; icons are 41 ported SVG components in `components/icons/` — `react-icons` is gone                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Shared package      | `@glampro/shared` — Zod schemas, constants and types consumed by both the API and the web app                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Design package      | `design/handoff/` — 11 screens (+ PNGs for 01–04), `tokens.css` / `tokens.json`, 41 SVG icons                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Legacy application  | **Not in this repository.** `docs/legacy/` is the transcription of it: the API surface (154 registrations, 151 live routes) and the schema, plus the gaps worth knowing before migrating                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Docs                | `architecture.md`, `CONTEXT.md`, `roadmap.md`, `STATE.md`, `decisions/` (0002–0007 + index), `legacy/` (LEGACY-MAP, API-INVENTORY, reference/legacy-schema), `saas/TENANCY.md`, `design/HANDOFF.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## 3. Next up — Phase 5 (the POS), and ADR 0002's importer

### Closed with Phase 4c — Staff (screen 09)

The last Phase 4 screen, and the first place a **role** rather than a tenant decided
whether a request may write. A staff member is a `User` row, not a second table, so this
slice reads the session model directly and creating a person creates a login.

| Piece     | Where                                                | What it does                                                                                                                                                                                                                        |
| --------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts | `packages/shared/src/schemas/staff.ts`               | `?search=&role=&status=` list query, summary/detail, create (email + password) and update inputs. `status` is a three-way enum because a boolean cannot say "all"                                                                   |
| Service   | `apps/api/src/services/staff.service.ts`             | List with server-side search over name **or** email, read, create, partial update, and the `StaffDepartment` links. `STAFF_SELECT` omits `passwordHash`, `tokenVersion` and the `googleCalendar*` columns                           |
| Routes    | `apps/api/src/routes/staff.routes.ts`                | `GET`/`POST /api/staff`, `GET`/`PATCH /api/staff/:id` behind `auth` + `requireModule("staff")`; the writes add `requireWritableTenant()` **and** `requireRole("SUPER_ADMIN", "MANAGER")` — the first caller of that guard (**Q26**) |
| Shared    | `apps/api/src/lib/http-error.ts`                     | `conflict(message, code, details)` now carries `details`, so a 409 lands on the same control a 422 does                                                                                                                             |
| Web data  | `apps/web/src/hooks/useStaff.ts`                     | List query keyed by filters, `useStaffCount` for the three tiles, create/update mutations that invalidate list + count together                                                                                                     |
| Web UI    | `apps/web/src/pages/Staff.tsx`, `components/staff/*` | Handoff 09: three stat tiles, a three-way status filter, debounced search, server pagination, and a create/edit drawer. `components/ui/StatTile.tsx` was lifted out of `Products.tsx` so both screens draw the same tile            |

Decisions worth keeping:

- **Writes are gated in the API, and the screen agrees with it.** `POST`/`PATCH` mount
  `requireRole`, so the screen shows the write affordances only to the two roles the API
  accepts — a stylist gets the list and nothing else. Hiding is a convenience; the 403 is
  the boundary, and `routes/staff.routes.test.ts` proves it.
- **`disabled` is the archive.** There is no delete route and no remove action on the
  screen, because a disabled user keeps their appointments and their commission history.
  Disabling also invalidates their sessions on the next request, so it is not a polite flag.
- **`users.email` is globally unique, so a duplicate is a 409 — and it lands on the field.**
  `conflict()` carries `[{ path: "body.email", message }]`, and the drawer's `fieldError`
  strips the `body.` prefix, so a taken address lands on the Email control exactly as a
  422 would. ADR 0003's per-tenant rule is a **customer** rule, not a user one.
- **A password is not a profile field.** `updateStaffSchema` has no `password` (and no
  `email`): changing one goes through `POST /api/auth/change-password`, which ends every
  session ([ADR 0007](decisions/0007-logout-revokes-the-refresh-token-not-the-user.md)).
  The edit drawer shows the address as text and offers no box for either.
- **Absent means unchanged, `null` means clear** carries over from 4a: the phone, job
  title and both dates clear with a `null` and are left alone when the key is missing.

**Not built:** the **Shifts** and **Rating** columns screen 09 draws. There is no rota
table (scheduling arrives with the appointment phase) and no reviews table in the schema
or in the legacy database. Asserted absent by a test, so a later "fix" cannot render an
empty column that reads as "nobody is rostered".

### Closed with Phase 4b — the catalogue (screen 08)

Products and services as two tabs on one screen, with the rail's low-stock badge. The
first slice where a screen's **drawing** and its **model** disagreed in a way that had
to be answered with a decision rather than a workaround.

| Piece     | Where                                                            | What it does                                                                                                                                                                                                                      |
| --------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts | `packages/shared/src/schemas/catalogue.ts`                       | List query (`?search=&status=&departmentId=&lowStock=&threshold=`), product/service summary + detail, create and update inputs. Prices are **strings on the wire**                                                                |
| Service   | `apps/api/src/services/catalogue.service.ts`                     | List/read/create/update for both kinds; `lowStock` is a server-side filter (`quantity <= threshold`) so a count never depends on which page the browser happens to hold                                                           |
| Service   | `apps/api/src/services/department.service.ts`                    | `listDepartments` + `assertDepartmentExists`, so a form cannot save a branch that does not exist                                                                                                                                  |
| Routes    | `apps/api/src/routes/{products,services,departments}.routes.ts`  | `GET`/`POST /api/products`, `GET`/`PATCH /api/products/:id`, the same for `/api/services`, and a read-only `GET /api/departments` — all behind `auth` + `requireModule("catalogue")`; writes also carry `requireWritableTenant()` |
| Schema    | `apps/api/prisma/schema.prisma`                                  | `Tenant.lowStockThreshold Int @default(5)` — [ADR 0010](decisions/0010-low-stock-threshold-is-per-tenant.md)                                                                                                                      |
| Web data  | `apps/web/src/hooks/{useProducts,useServices,useDepartments}.ts` | List queries keyed by filters, `useProductCount` for the tiles and the badge, and create/update mutations that invalidate list + count together                                                                                   |
| Web UI    | `apps/web/src/pages/Products.tsx`, `components/catalogue/*`      | Handoff 08: three stat tiles, a two-tab catalogue, debounced search, server pagination, and a create/edit drawer per tab                                                                                                          |

Decisions worth keeping:

- **The low-stock threshold is a per-tenant column, not a constant** ([ADR 0010](decisions/0010-low-stock-threshold-is-per-tenant.md)).
  `?threshold=` overrides it for one query, which is how the "Out of stock" tile asks
  the same question pinned to zero. Without an override the service reads
  `currentScope().tenantId` — no argument, so there is nothing to forge.
- **The tiles are server-side counts, not sums over the rows on screen.** The rail
  badge and the Low-stock tile are the _same_ query, so they cannot disagree and the
  API is asked once. A test asserts the filters each tile sends.
- **Screens 08's Cost column and "Inventory value" tile are omitted**, and so are the
  Packages and Gift-card tabs: the schema has no cost and no package/gift-card
  catalogue to list. `design/HANDOFF.md` §6 item 5 — the screen changes where it
  disagrees with the model. Tests assert all four stay absent, so a later "fix"
  cannot quietly render a zero or an empty tab.
- **`formatPrice` is a separate function from `formatMoney`.** A `Decimal(12,2)`
  arrives as a major-unit string (`"12.50"`) while `formatMoney` takes minor units
  (cents); the difference is a factor of a hundred and the wrong one renders
  `$0.13` — silently and plausibly.
- **A service is not stock.** `serviceSummarySchema` has no `quantity` and the API
  ignores `?lowStock` rather than rejecting it, so both tabs can share one toolbar.

**Not built:** Package and Gift-card tabs, and the Products cost/valuation figures.
Noted here rather than invented (`design/HANDOFF.md` §6).

### Closed with Phase 4a — Customers (screen 07)

The first end-to-end data screen, built so that 4b and 4c are a repeat of the same
shape rather than a new idea.

| Piece     | Where                                                        | What it does                                                                                                                                                                       |
| --------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts | `packages/shared/src/schemas/customer.ts`                    | List query, summary, detail, create and update inputs. Money/date rules live here, not in a handler                                                                                |
| Service   | `apps/api/src/services/customer.service.ts`                  | List with server-side search, read, create, partial update. Serialises through the Zod schemas, so the two sides cannot drift                                                      |
| Routes    | `apps/api/src/routes/customers.routes.ts`                    | `GET`/`POST /api/customers`, `GET`/`PATCH /api/customers/:id`, behind `auth` + `requireModule("customers")`; writes also carry `requireWritableTenant()`                           |
| Web data  | `apps/web/src/hooks/useCustomers.ts`                         | `useCustomerList` with the filters in the query key, plus create/update mutations that invalidate the list prefix                                                                  |
| Web UI    | `apps/web/src/pages/Customers.tsx`, `components/customers/*` | Handoff 07's list: debounced search, server pagination, `Table`, `EmptyState`, `Skeleton`, and a `Drawer` form whose server-side field errors land on the control that caused them |

Decisions worth keeping:

- **The service takes no tenant id.** Every function runs inside the scope
  `auth` opened, so there is no argument a caller could misuse. Creates pass a
  `tenantId: ""` placeholder that the Prisma extension overwrites — the row lands
  in the caller's salon even if a handler tried otherwise.
- **Absent means unchanged, `null` means clear.** The contract distinguishes them and
  the service preserves that by spreading the parsed body.
- **`CustomerDepartment` links are written with `createMany`,** not a nested
  `create`, because the extension injects `tenantId` into the payload it is given
  and cannot reach inside a nested create.
- **Three handoff columns are missing on purpose.** `Last visit`, `Total spend` and
  `Tier` have no column behind them (`design/HANDOFF.md` §6 item 5). They are
  asserted absent by a test so nobody "fixes" the screen by rendering a zero.

**Not built:** archive. See Q28 — the `Customer` model has no archived flag, so
"create, edit and archive" from the Phase 4 criterion is only two-thirds met.

### Closed with Phase 2 (the remaining models)

Migration `20261003091356_sale_and_customer_ledgers` adds eleven tables, and
three of them are deliberate **collapses** of legacy duplication:

- **Five sale-line tables became one `SaleLine`.** `sale_products`,
  `sale_services`, `sale_packages`, `sale_valuepackages` and `sale_gift_cards`
  had identical columns apart from which foreign key they carried. The handoff
  cart searches, adds and prices all five kinds identically, so `itemType` says
  which catalogue `itemId` refers to. **`itemId` has no foreign key** — a
  polymorphic reference cannot have one — which is a real loss of referential
  integrity, so `itemName` snapshots the name at sale time and
  `sale-ledgers.test.ts` asserts the consequence: a receipt still reads after
  the catalogue row is archived.
- **Three redemption tables became one `CustomerRedemption`.** They differed only
  in the catalogue the id pointed at and one extra column, so `quantity` (for a
  package session) and `amount` (for the two money kinds) cover all three. It
  points at the **catalogue item**, not at the holding row, because reporting
  asks "how many of this package were spent", not "which of the four rows a
  customer bought it through".
- **Three holding tables stayed three.** `CustomerPackageHolding` counts
  sessions, `CustomerValuePackageHolding` counts money, and
  `CustomerGiftCardHolding` is money plus the code that identifies it at the
  till. One table would be nullable in every column.

Four legacy columns are gone rather than translated: `paymenttype_id` (Q1, dead),
`sold_by_one..four` (four fixed slots cannot express the redesign's per-line
attribution, so credit is `SaleLine.staffId`), the `sale_id` string pivot key,
and `sale_date` + `sale_time` collapsed into one `soldAt`.

`CustomerOutstanding.saleId` is now `@unique`. Legacy left it nullable and
unconstrained, so one sale could accumulate several balances; the test asserts
the second one is refused.

**`EmployeeLeave.status` is new and Q9 is why.** Approval was inferable only by
reading `granted_by`, which holds either an approver's name or the literal
string `"rejected"`. `grantedBy` is preserved verbatim — it is not a foreign key
and must not be treated as one — and the outcome is a column, so no query has to
string-match a person's name.

**Still open, and honestly so.** Q1's answer is now load-bearing: the `Sale`
model assumes `paymenttype_id` was dead. That rests on the legacy code, not on
production data, so a production `information_schema` check is still worth doing
before cutover even though nothing in the application reads the column. **Q27** is
new and is the importer's problem, not the schema's: legacy's per-line
`paid_price` is ambiguous between per-unit and per-line, so `SaleLine` stores both
`unitPrice` and `lineTotal` and the schema is correct either way.

**Not done:** [ADR 0002](decisions/0002-tenant-id-equals-owner-id.md)'s importer
and its idempotence test. It is the one acceptance row Phase 2 still carries, and
it needs the Q27 answer to fill a line's two money columns honestly.

### Closed with Phase 3 (web half)

The browser half landed alongside the API half. `contexts/AuthContext.tsx` owns
the session as three states — `loading`, `authenticated`, `anonymous` — and the
middle distinction is load-bearing: a cold start reads the stored refresh token
and calls `GET /api/auth/me`, and collapsing `loading` into `anonymous` would
bounce a signed-in user off the login screen on every reload.
`ProtectedRoute` / `PublicOnlyRoute` in `RouteWrapper.tsx` are the two gates;
the first carries the current path as `?next=`, which is what makes
`roadmap.md`'s "return to where they came from" true rather than aspirational.

**The 401 path was rewritten, not extended.** `lib/api.ts` previously answered an
unauthorised response with `window.location.assign("/login")`, which dropped the
request on the floor — a dashboard firing five queries at once dumped the user
out the moment its access token aged out, every 15 minutes. It now renews once
and replays. The single-flight shape is not an optimisation: the server rotates
the refresh token on every use and revokes the family on a replay, so N parallel
refreshes would kill the user's own session. `api.test.ts` drives the real axios
instance through a scripted adapter and holds the renewal open until two 401s are
in flight, so it distinguishes one shared refresh from two lucky ones.

Three things were decided rather than assumed:

- **The sign-in screen is a composition, not a copy.** The handoff draws no login
  screen, but it _does_ ship `lock`, `mail`, `user` and `log-out`, all already
  ported, and `Input`/`Button`/`Card` are built and reconciled. So the screen is
  assembled from those on token values only — no new tokens, no hand-written
  hex, and the `cmp` against the handoff token file still passes. The layout is
  recorded as a deliberate invention in [ADR 0008](decisions/0008-login-screen-shape.md)
  (closes Q24).
- **The read-only tone is purple, not amber.** A suspended salon needs a third
  notice tone, and amber had no token when this screen was written — that was Q23.
  Rather than pre-empt the question for one screen, the notice used the brand
  surface, which is distinguishable from both neutral and red. **Q23 has since
  closed** ([ADR 0009](decisions/0009-amber-joins-the-handoff-token-file.md) adds
  `--sp-amber-bg` / `--sp-amber-text` from the handoff's own CSS and `Badge` gains
  a `warning` variant), so this banner **can** move to amber. It has deliberately
  **not** been changed: purple is a recorded choice, not an oversight.
- **`?next=` is validated on read.** It is attacker-controlled, so it is accepted
  only as a same-origin absolute path; `//evil.example` and `https://evil.example`
  both fall back to the dashboard. Without this the login screen is an open
  redirect.

The rail now filters on entitlement as well as role: `NavItem` carries the
`Module.code` a destination needs, which is the field `saas/TENANCY.md` §5
promised. Omitting the entitlements does **not** filter — a half-loaded rail that
flickers entries in and out is worse than briefly showing one the API refuses
anyway — but an explicit empty list is a real answer and does filter.
`navigation.test.ts` asserts every `module` value is a real `ModuleCode`, so the
field cannot be a typo `requireModule` would later reject.

**Still open on Phase 3, and honestly so.** Two of its five acceptance rows are
_implemented_ but not _demonstrable_ yet: **Q25** (a `web` token refused by a
`pos`/`mobile` route — neither exists) and **Q26** (`requireRole` is implemented
and unit-tested but no route mounts it, so "admin screens are gated in the API"
has nothing exercising it end to end). Q26 gets its integration test with the
first admin-only route in Phase 4 or 8; Q25 closes with Phase 5 and the frozen
mobile surface.

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

| #   | Question                                                                                                | Why it blocks                                                               | What unblocks it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | — **Resolved.** `sales.paymenttype_id` points at a `paymenttypes` table **no migration creates** `[1]`  | —                                                                           | **Answered from the legacy code**, once `LEGACY-MAP.md` §1's path was corrected: `grep -rn 'paymenttypes' database/` is empty, the column is declared `foreignUuid(...)->nullable()` with **no** `->foreign()` block (unlike its neighbours on lines 15–22), and it appears in `app/` exactly once — in `Sale::$fillable`, never assigned. **The column is dead**; the live path is `payment_type` text, set by `payByCash()`. The rebuild's `Sale` has `paymentMethod` typed against the existing `PaymentMethod` enum and no id. [`legacy/LEGACY-MAP.md`](legacy/LEGACY-MAP.md) §6 Q1 |
| Q2  | `users.email` is not unique in the database `[3]`                                                       | The importer has to do _something_ with duplicates — merge, suffix, or fail | Duplicate report from production (`GROUP BY email HAVING COUNT(*) > 1`), then a written rule per case                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Q4  | — **Resolved.** "Employee" and "user" are the same row `[5]`                                            | —                                                                           | **Answered from the legacy code.** `EmployeeController::create()` creates a `User`, and `employee_leaves.employee_id` is a FK onto `users.id`. **One** `User` model; staff is a role plus a staff profile, not a second table. [`legacy/LEGACY-MAP.md`](legacy/LEGACY-MAP.md) §6 Q4                                                                                                                                                                                                                                                                                                     |
| Q5  | `users.gender` is an integer, `customers.gender` a string `[6]`                                         | Importer normalisation — one representation or two                          | List the distinct values in production, choose one enum, write the mapping                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Q6  | `customers.dob` and `giftcards.expired_date` are strings `[7]`                                          | A malformed date must not abort a whole salon's import                      | Query for the values that do not parse (`''`, `0000-00-00`, `DD/MM/YYYY`) and decide: null, or fail loudly                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Q7  | — **Resolved.** `appointments.date` + `time` duplicate `start_time` `[8]`                               | —                                                                           | **Answered from the legacy code.** `start_time` is written from `date`+`time` on create and update, and every read path uses it. The importer trusts `start_time`, falling back to `date`+`time` only where it is null. [`legacy/LEGACY-MAP.md`](legacy/LEGACY-MAP.md) §6 Q7                                                                                                                                                                                                                                                                                                            |
| Q8  | — **Resolved.** `appointments.status` is a boolean for a five-state lifecycle `[9]`                     | —                                                                           | **Answered from the legacy code.** Only `appointmentStart()` writes it, setting `1`; `appointmentFinish()` sets `finish_time`+`signature` and leaves `status` alone. Map `0→SCHEDULED`, `1→IN_PROGRESS`, `finish_time→COMPLETED`. [`legacy/LEGACY-MAP.md`](legacy/LEGACY-MAP.md) §6 Q8                                                                                                                                                                                                                                                                                                  |
| Q9  | — **Resolved.** `employee_leaves` has no approval column although approve/reject endpoints exist `[10]` | —                                                                           | **Answered from the legacy code.** Approval _was_ stored, as free text: `granted_by` holds the approver's name, or the literal `"rejected"`. The new `Leave` gets a status enum plus `approvedById`; the importer maps the string and leaves `approvedById` null when the name does not resolve. [`legacy/LEGACY-MAP.md`](legacy/LEGACY-MAP.md) §6 Q9                                                                                                                                                                                                                                   |
| Q10 | `employee_comissions.sale_amount` is an integer `[11]` and every money column is `decimal(8,2)` `[12]`  | Truncated amounts cannot be recovered by widening the target column         | Widening is already agreed. Still open: does the cutover need a one-off correction query for commissions? Product call                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Q11 | `migration_access` may gate nothing — the `MigrationController` routes are commented out `[13]`         | Decides whether Phase 9 imports through a CLI job or an in-app screen       | Decide the shape of the importer; [`roadmap.md`](roadmap.md) currently plans a CLI job in Phase 9                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

### 4.2 Build questions

These are ours to decide; none of them needs production data.

| #   | Question                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Why it matters now                                                                                                                                                                                                           | Owner / when                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q16 | The legacy sale/payment endpoints have **no idempotency key**.                                                                                                                                                                                                                                                                                                                                                                                                                    | Phase 5 acceptance requires that a double-tap cannot double-charge                                                                                                                                                           | Engineering, in Phase 5 (client-generated key stored on the sale/payment row; small enough not to need an ADR)                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Q17 | `POST /webhook` is public, unauthenticated, and its provider is not recorded anywhere.                                                                                                                                                                                                                                                                                                                                                                                            | Phase 8 integrations. Rebuilding it as-is would open an unauthenticated write path                                                                                                                                           | Keep the route out until the sender and its signature scheme are identified (engineering, Phase 8)                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Q18 | In the legacy app `POST /api/mobile/value-packages` resolves to the **same handler** as `/api/mobile/services`.                                                                                                                                                                                                                                                                                                                                                                   | The mobile contract is frozen, so the question is whether this is a bug to fix or behaviour to preserve                                                                                                                      | Engineering: check what the shipped client expects. If the shapes can be kept, fix it behind the same URL; otherwise preserve the bug deliberately and say so in the inventory                                                                                                                                                                                                                                                                                                                                                                                       |
| Q19 | The legacy surface mixes `PUT` and `POST` for equivalent writes.                                                                                                                                                                                                                                                                                                                                                                                                                  | The new web surface should use one convention; the frozen mobile routes cannot change                                                                                                                                        | Engineering, when each phase adds its routes. Rule for the rebuild: new routes are REST (`POST` create, `PATCH` update, `PUT` only for full replacement); frozen routes keep their verb and are documented as frozen                                                                                                                                                                                                                                                                                                                                                 |
| Q20 | 36 mobile routes are frozen and must come back **one phase at a time**, with identical response shapes.                                                                                                                                                                                                                                                                                                                                                                           | It is easy for a phase to be called complete while a mobile route it owns is still missing                                                                                                                                   | Nothing blocks it — the contract is written down in [`legacy/API-INVENTORY.md`](legacy/API-INVENTORY.md). Each phase's acceptance must check the frozen routes it owns                                                                                                                                                                                                                                                                                                                                                                                               |
| Q22 | The rail's **foot** is not modelled. The handoff puts `Settings` in `.side-foot` beside `Log out`; the app declares `Settings` as an ordinary `navItems` entry — rendered only once a role is supplied, and then in the main nav — and `AppShell` hard-codes its own `Log out` button below the `<nav>`. The labels differ too: `Dashboard`/`Appointments` here, `Home`/`Calendar` in the proposal.                                                                               | Both are user-visible, and role-gating is currently the only thing keeping `Settings` out of the rail, so the foot's shape has to be settled before the settings screen and the top bar's account menu land                  | Product/scope: keep the app's labels and nav shape, or adopt the handoff's (`CONTEXT.md` §5 permits labels to differ). Decide before the first role-aware render arrives with Phase 3 auth                                                                                                                                                                                                                                                                                                                                                                           |
| Q23 | — **Resolved.** The handoff's **amber badge tone had no token**. `.status.progress` (screen 05) uses `#FFF4DE` on `#B9740A`, and `.tier.gold` (screen 07) uses the same pair. The token file exposed amber only as a gradient stop (`--sp-amber-grad-a/b`) for the dashboard income tile, so there was nothing to snap to — [ADR 0006](decisions/0006-snap-handoff-values-to-tokens.md) sends values further than 1px from every token to a question rather than an invented one. | —                                                                                                                                                                                                                            | **Answered by transcription, not approximation.** `--sp-amber-bg` / `--sp-amber-text` are added to `design/handoff/tokens/tokens.css` carrying **the designer's own values**, read out of the handoff's CSS, and the web copy is re-taken (per `AGENTS.md` rule 2). `Badge` gains a `warning` variant. The gradient stops are untouched — a gradient stop and a surface/text pair are different jobs. Screens 05 and 07 are unblocked and render the handoff's colours with no deviation to record. [ADR 0009](decisions/0009-amber-joins-the-handoff-token-file.md) |
| Q24 | — **Resolved.** The sign-in screen has no handoff design. `design/handoff/` draws 11 screens and none of them is login.                                                                                                                                                                                                                                                                                                                                                           | —                                                                                                                                                                                                                            | **Answered by composition.** The handoff icon set ships `lock`, `mail`, `user` and `log-out` (all four already ported), and `Input` / `Button` / `Card` are built and reconciled, so the screen is composed from the delivered system on token values only — no new tokens, no hand-written hex. The layout is recorded as a deliberate invention in [ADR 0008](decisions/0008-login-screen-shape.md). Its read-only tone is purple rather than amber, because amber still has no token (Q23).                                                                       |
| Q25 | **The realm criterion is only half demonstrable.** `login` refuses a `pos`/`mobile` realm with `REALM_NOT_SUPPORTED` and `auth` refuses a token with no tenant realm, but no `pos` or `mobile` route exists yet, so the "and vice versa" half of the criterion cannot be shown.                                                                                                                                                                                                   | The Phase 3 `Realm enforcement` row cannot be closed as written                                                                                                                                                              | Nothing blocks it — it closes when Phase 5 (POS) and the frozen `/api/mobile/*` surface add routes that must refuse a `web` token                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Q26 | — **Resolved.** **`requireRole` has no caller.** It is implemented and unit-tested, but no route mounts it, so "admin screens are gated in the API, not only in the UI" is an assertion with nothing exercising it end to end.                                                                                                                                                                                                                                                    | Was: the Phase 3 `Roles` criterion is unproven. **Closed by Phase 4c:** the two staff writes mount `requireRole("SUPER_ADMIN", "MANAGER")`, and the staff route suite proves a stylist gets 403 while an owner's write lands | Done — 2026-10-05, Phase 4c                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Q27 | **`sales` per-line `paid_price` is ambiguous.** Legacy carried one money column per sale line beside a separate `quantity`, so it is not recorded whether that figure is the price of **one unit** or the **whole line**.                                                                                                                                                                                                                                                         | Nothing in the schema — `SaleLine` stores `unitPrice` **and** `lineTotal`, so it is correct either way — but the **importer** cannot fill both from one source column                                                        | Read one legacy sale: on any line with `quantity > 1`, if `paid_price == sales.total_amount` it is per-line; if `paid_price * quantity` reconstructs the total it is per unit                                                                                                                                                                                                                                                                                                                                                                                        |
| Q28 | **`Customer` has no archived flag.** The Phase 4 criterion says "create, edit and archive a record of each kind", and `Service`/`Product` have `CatalogStatus { ACTIVE, INACTIVE }` to archive against — `Customer` has no equivalent column                                                                                                                                                                                                                                      | The third of the Phase 4 criterion for customers is unmet, and the screen has no archive action                                                                                                                              | A product call: add `archivedAt DateTime?` to `Customer` (a migration plus an ADR), or define archive as a `deletedAt` on all three master-data models at once. **Not decided unilaterally**                                                                                                                                                                                                                                                                                                                                                                         |
| Q29 | **The repository moved and every `docker compose` stack on this host broke at once.** The app containers were still bound to a previous `/media/tuangpi/<uuid>/…` path; Docker silently created the missing directory and mounted it over `/app`, so the API and web containers crash-looped on `ENOENT /app/package.json`                                                                                                                                                        | Nothing was wrong with the code — the stack simply could not start, which reads as "the screens don't exist"                                                                                                                 | Already fixed on this host by `docker compose --env-file .env.docker up -d --force-recreate api web`. **It will recur if the media path changes again**; re-run that whenever `docker ps` shows the app containers restarting                                                                                                                                                                                                                                                                                                                                        |

## 5. Verify status

`npm run verify` is `format:check` → `lint` → `typecheck` → `test`. Last full run:
**exit 0**, 2026-10-05, with Phase 4a, 4b and 4c in the tree: **206 web + 44 API +
37 shared**, no failures. The three steps before the tests passed with no warnings.
(The stages were also run individually at the Phase 4c close — `prettier --check`,
`eslint`, `tsc` and each suite — because the full pipeline's own output is not always
capturable through the editor's shell.)

**The API's database-backed suites are skipped unless `DATABASE_URL` is set**, so
that count of 44 is the unit half only. Run them against a live database to
exercise all **141** — which is what actually proves tenant isolation, and the
catalogue and staff suites Phase 4 added are two of them:

```bash
make test-db   # DATABASE_URL from .env.docker, host port 5433
```

`make smoke` also passes against the running stack (both probes 200, the web proxy
200, and `POST /api/auth/login` returns a usable token).
steps before the tests passed with no warnings. The Phase 4c close reports:

| Step           | Result                                                               |
| -------------- | -------------------------------------------------------------------- |
| `format:check` | Pass — every matched file already Prettier-formatted                 |
| `lint`         | Pass — no errors or warnings in any workspace                        |
| `typecheck`    | Pass — `@glampro/shared`, `@glampro/api`, `@glampro/web`             |
| API tests      | **44 passed, 0 failed** in `verify`; **141** with `DATABASE_URL` set |
| Shared tests   | **37 passed, 0 failed** (3 suites)                                   |
| Web tests      | **27 files, 206 tests passed** (Vitest)                              |

The web half of Phase 3 added 3 files and 29 tests to that suite:
`contexts/__tests__/AuthContext.test.tsx` (6), `lib/api.test.ts` (4),
`pages/__tests__/Login.test.tsx` (14), plus 5 entitlement cases in
`navigation.test.ts`.

**The token copy is still verbatim.** `cmp design/handoff/tokens/tokens.css
apps/web/src/styles/tokens.css` exits 0 — the sign-in screen introduced no
colour, radius or spacing of its own (ADR 0008).

**`npm run verify` does not exercise the database-backed suites**, and that is easy to
mistake for coverage. Three of them — `tenant isolation`, `requireModule` and `web session
endpoints` — are gated on `DATABASE_URL` and report

```
﹣ web session endpoints # DATABASE_URL is not set
```

when it is absent, which is why the API figure above is 44 rather than 141. They were run
separately, and this is the observed result at the Phase 4c close:

```
DATABASE_URL='postgresql://glampro:…@127.0.0.1:5433/glampro_test' \
JWT_SECRET='<the value in .env.docker>' npm test --workspace @glampro/api
→ 141 tests, 141 pass, 0 fail, 0 skipped, 35.6s, exit 0
```

The tests that appear only in that run are the database-gated suites: tenant isolation,
`requireModule`, the five `/api/auth` routes, and the customers, catalogue and staff route
suites. They need a migrated database: `glampro_test` was created on
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
amber badge tone was the exception: it was too far from any token to snap, so it became Q23 —
now closed by [ADR 0009](decisions/0009-amber-joins-the-handoff-token-file.md), which transcribes
the handoff's own `#FFF4DE` / `#B9740A` into the token file rather than inventing a match.

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
