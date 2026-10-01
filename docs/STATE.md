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

|                  |                                                                                                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current phase    | **1 — Design system.** Phase 1's foundation is landed: token pipeline settled, icon set ported, hardcoded geometry removed. The UI primitives are the rest of the phase and have not been started. |
| Last commit      | `caecbba` _feat(web): Phase 1 — token copy, icon set and literal-free shell_ (2026-09-30)                                                                                                          |
| Working tree     | Clean. The Phase 1 foundation is committed: `tokens.css` re-copied byte-identically, `styles/app-chrome.css` and `components/icons/` (41 components + barrel), `react-icons` dropped.              |
| `npm run verify` | See §5                                                                                                                                                                                             |
| Dev stack        | `make up-d` → API `:9100`, web `:5173`, Postgres `:5433` (`compose.yaml`, ports documented in `README.Docker.md`)                                                                                  |
| Runtime          | Node 24, npm workspaces (no pnpm), Postgres 17, Prisma 7                                                                                                                                           |

## 2. What actually exists today

| Area                | State of the tree                                                                                                                                                                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API routes          | Four: `GET /health`, `GET /health/ready`, `GET /api/health`, `GET /api/auth/me`. Everything else in the product is still to be built.                                                                                                                                                    |
| API structure       | `createApp()` factory (no port binding, so tests run over real HTTP), Zod validation middleware, error handler, rate limiting, JWT helpers                                                                                                                                               |
| Schema              | Exactly two models: `User` and `RefreshToken`. `GlobalRole` = `SUPER_ADMIN · MANAGER · STAFF · CASHIER`; `AuthRealm` = `web · pos · mobile`                                                                                                                                              |
| Tenancy in the code | **Nothing yet.** No `Tenant`, no `tenantId` column, no tenant claim in a token. Phase 2 is where the tenant plane lands.                                                                                                                                                                 |
| Web pages           | `Dashboard` and `NotFound`. No login screen, no data screens.                                                                                                                                                                                                                            |
| Web shell           | `AppShell` (rail and top bar drawn from `--sp-rail-w` / `--sp-topbar-h` via the `w-rail` / `pl-rail` / `h-topbar` utilities), `RouteWrapper`, `ErrorBoundary`, `PageLoading`, `Toast`                                                                                                    |
| Web nav             | 8 entries from `constants/navigation.ts`: Dashboard, Sale, Appointments, Customers, Products, Services, Reports\*, Settings\* (\* admin roles only)                                                                                                                                      |
| Web styling         | `index.css` maps the handoff tokens onto Tailwind namespaces in one `@theme` block; `styles/tokens.css` is a byte-identical copy of the handoff file; app-only values live in `styles/app-chrome.css`; icons are 41 ported SVG components in `components/icons/` — `react-icons` is gone |
| Shared package      | `@glampro/shared` — Zod schemas, constants and types consumed by both the API and the web app                                                                                                                                                                                            |
| Design package      | `design/handoff/` — 11 screens (+ PNGs for 01–04), `tokens.css` / `tokens.json`, 41 SVG icons                                                                                                                                                                                            |
| Legacy application  | **Not in this repository.** `docs/legacy/` is the transcription of it: the API surface (154 registrations, 151 live routes) and the schema, plus the gaps worth knowing before migrating                                                                                                 |
| Docs                | `architecture.md`, `CONTEXT.md`, `roadmap.md`, `STATE.md`, `decisions/` (0002 + index), `legacy/` (LEGACY-MAP, API-INVENTORY, reference/legacy-schema), `saas/TENANCY.md`, `design/HANDOFF.md`                                                                                           |

## 3. Next up — Phase 1, in order

1. **Build the UI primitives** listed in [`roadmap.md`](roadmap.md) Phase 1, each with its
   keyboard/disabled test.
2. **Re-check every primitive against screens 01–11 at the 1280×900 frame** — this is also
   where the 66px rail item width and the four stand-in icon mappings recorded in
   [`design/HANDOFF.md`](design/HANDOFF.md) §4 get confirmed or corrected.

The two settled items are done: the token copy is byte-identical to the handoff file with
the app-only values moved to `styles/app-chrome.css`, and all 41 handoff icons are ported
with `react-icons` deleted. The remaining Phase 1 work adds no routes and no data. Do not
start Phase 2 models before it is finished: the screens are what fix the field names those
models will carry.

## 4. Open questions

### 4.1 Source-data questions

These change the **schema or the importer**, so each one must be answered before the
phase that owns it is built. Numbers in brackets are the finding numbers in
[`legacy/LEGACY-MAP.md`](legacy/LEGACY-MAP.md) §5.

| #   | Question                                                                                               | Why it blocks                                                                            | What unblocks it                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | `sales.paymenttype_id` points at a `paymenttypes` table **no migration creates** `[1]`                 | The `Sale` model cannot be finalised while it is unknown whether the column is live      | Inspect the production MySQL schema (`information_schema.tables`): if the table exists there it becomes a real model, otherwise the column is dropped |
| Q2  | `users.email` is not unique in the database `[3]`                                                      | The importer has to do _something_ with duplicates — merge, suffix, or fail              | Duplicate report from production (`GROUP BY email HAVING COUNT(*) > 1`), then a written rule per case                                                 |
| Q3  | `customers.email` is **globally** unique, so one person cannot be a customer of two salons `[4]`       | Decides whether `Customer.email` is unique per tenant — a Phase 2 commitment             | Product decision; recommended `(tenantId, email)` unique, which also settles what to do with existing collisions. Needs an ADR                        |
| Q4  | "Employee" and "user" are the same row `[5]`                                                           | Phase 4 staff screens, and whether `User` gains a staff profile or a second model        | Confirm against the legacy controllers — the `employee_*` tables point at `users.id`. Expected outcome: one model, differentiated by role             |
| Q5  | `users.gender` is an integer, `customers.gender` a string `[6]`                                        | Importer normalisation — one representation or two                                       | List the distinct values in production, choose one enum, write the mapping                                                                            |
| Q6  | `customers.dob` and `giftcards.expired_date` are strings `[7]`                                         | A malformed date must not abort a whole salon's import                                   | Query for the values that do not parse (`''`, `0000-00-00`, `DD/MM/YYYY`) and decide: null, or fail loudly                                            |
| Q7  | `appointments.date` + `time` duplicate `start_time` `[8]`                                              | The importer must trust one column; picking the wrong one silently re-times appointments | Read the legacy write paths to see which pair is set on create and on edit                                                                            |
| Q8  | `appointments.status` is a boolean for a five-state lifecycle `[9]`                                    | The new enum and its migration mapping                                                   | Read the call sites to learn what `0` and `1` mean (completed? cancelled? paid?)                                                                      |
| Q9  | `employee_leaves` has no approval column although approve/reject endpoints exist `[10]`                | Determines whether approval history is recoverable or was never stored                   | Check whether those endpoints write anywhere else (a log table, `user_infos`). If nowhere, the state was never persisted and the new model is free    |
| Q10 | `employee_comissions.sale_amount` is an integer `[11]` and every money column is `decimal(8,2)` `[12]` | Truncated amounts cannot be recovered by widening the target column                      | Widening is already agreed. Still open: does the cutover need a one-off correction query for commissions? Product call                                |
| Q11 | `migration_access` may gate nothing — the `MigrationController` routes are commented out `[13]`        | Decides whether Phase 9 imports through a CLI job or an in-app screen                    | Decide the shape of the importer; [`roadmap.md`](roadmap.md) currently plans a CLI job in Phase 9                                                     |

### 4.2 Build questions

These are ours to decide; none of them needs production data.

| #   | Question                                                                                                        | Why it matters now                                                                                                                                                                                           | Owner / when                                                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q14 | Where does the **platform console** live — a surface inside `apps/web` or its own app?                          | It has no phase in [`roadmap.md`](roadmap.md) ("Not scheduled yet") and the realm it needs does not exist: `AuthRealm` is `web · pos · mobile`. The console's login cannot be designed until this is settled | Architecture decision, before Phase 3 (auth). Own realm ⇒ ADR                                                                                                                                                        |
| Q15 | Where does **staff** live in the navigation — its own route or a section of Settings?                           | Screen 09 exists but the nav has no staff entry (8 items); building the Phase 1 shell twice would be waste                                                                                                   | Engineering, during the Phase 1 shell                                                                                                                                                                                |
| Q16 | The legacy sale/payment endpoints have **no idempotency key**.                                                  | Phase 5 acceptance requires that a double-tap cannot double-charge                                                                                                                                           | Engineering, in Phase 5 (client-generated key stored on the sale/payment row; small enough not to need an ADR)                                                                                                       |
| Q17 | `POST /webhook` is public, unauthenticated, and its provider is not recorded anywhere.                          | Phase 8 integrations. Rebuilding it as-is would open an unauthenticated write path                                                                                                                           | Keep the route out until the sender and its signature scheme are identified (engineering, Phase 8)                                                                                                                   |
| Q18 | In the legacy app `POST /api/mobile/value-packages` resolves to the **same handler** as `/api/mobile/services`. | The mobile contract is frozen, so the question is whether this is a bug to fix or behaviour to preserve                                                                                                      | Engineering: check what the shipped client expects. If the shapes can be kept, fix it behind the same URL; otherwise preserve the bug deliberately and say so in the inventory                                       |
| Q19 | The legacy surface mixes `PUT` and `POST` for equivalent writes.                                                | The new web surface should use one convention; the frozen mobile routes cannot change                                                                                                                        | Engineering, when each phase adds its routes. Rule for the rebuild: new routes are REST (`POST` create, `PATCH` update, `PUT` only for full replacement); frozen routes keep their verb and are documented as frozen |
| Q20 | 36 mobile routes are frozen and must come back **one phase at a time**, with identical response shapes.         | It is easy for a phase to be called complete while a mobile route it owns is still missing                                                                                                                   | Nothing blocks it — the contract is written down in [`legacy/API-INVENTORY.md`](legacy/API-INVENTORY.md). Each phase's acceptance must check the frozen routes it owns                                               |

## 5. Verify status

`npm run verify` is `format:check` → `lint` → `typecheck` → `test`. Last full run:
**exit 0**, 2026-09-30, after the Phase 1 foundation change — re-confirmed on a clean
tree at `caecbba`.

| Step           | Result                                                           |
| -------------- | ---------------------------------------------------------------- |
| `format:check` | Pass — every matched file already Prettier-formatted             |
| `lint`         | Pass — no errors or warnings in any workspace                    |
| `typecheck`    | Pass — `@glampro/shared`, `@glampro/api`, `@glampro/web`         |
| API tests      | **16 passed, 0 failed** (7 suites, `node --test` over real HTTP) |
| Shared tests   | **6 passed, 0 failed** (3 suites)                                |
| Web tests      | **4 files, 25 tests passed** (Vitest)                            |

`npm run build:web` was also run once to confirm the new utilities compile — `w-rail`,
`pl-rail`, `h-topbar`, `rounded-pill`, `text-2xs` and `text-[length:var(--app-rail-icon)]`
all emit CSS, and each resolves to the token it should. `dist/` was deleted afterwards.

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
