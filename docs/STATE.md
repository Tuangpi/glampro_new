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

|                  |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current phase    | **1 — Design system.** **All 17 primitives are built and tested.** The screen pass in §3 has begun: all 11 handoff screens were rendered at their true frame sizes, the app shell was measured against them and reconciled (see §3), and the standalone primitives have been **measured but not yet reconciled**. Q3, Q14 and Q21 closed alongside it: [ADR 0003](decisions/0003-tenant-scoped-customer-email.md), [0004](decisions/0004-platform-console-is-its-own-app.md) and [0005](decisions/0005-rail-has-no-services-destination.md). |
| Last commit      | Not pinned here on purpose — run `git log -1 --oneline`. Pinning a hash in this file is what made it go stale twice; this file is updated in the same commit as the work it describes.                                                                                                                                                                                                                                                                                                                                                       |
| Working tree     | The primitive list is complete. The screen pass landed the rail reconciliation (`AppShell` now matches the handoff's item geometry, gaps, label size and purple active state), a `Staff` nav entry that answers Q15 and the removal of the rail's `Services` entry ([ADR 0005](decisions/0005-rail-has-no-services-destination.md)); its measurements are in [`design/HANDOFF.md`](design/HANDOFF.md) §2.                                                                                                                                    |
| `npm run verify` | See §5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Dev stack        | `make up-d` → API `:9100`, web `:5173`, Postgres `:5433` (`compose.yaml`, ports documented in `README.Docker.md`)                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Runtime          | Node 24, npm workspaces (no pnpm), Postgres 17, Prisma 7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## 2. What actually exists today

| Area                | State of the tree                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API routes          | Four: `GET /health`, `GET /health/ready`, `GET /api/health`, `GET /api/auth/me`. Everything else in the product is still to be built.                                                                                                                                                                                                                                                                                                                                                                |
| API structure       | `createApp()` factory (no port binding, so tests run over real HTTP), Zod validation middleware, error handler, rate limiting, JWT helpers                                                                                                                                                                                                                                                                                                                                                           |
| Schema              | Exactly two models: `User` and `RefreshToken`. `GlobalRole` = `SUPER_ADMIN · MANAGER · STAFF · CASHIER`; `AuthRealm` = `web · pos · mobile`                                                                                                                                                                                                                                                                                                                                                          |
| Tenancy in the code | **Nothing yet.** No `Tenant`, no `tenantId` column, no tenant claim in a token. Phase 2 is where the tenant plane lands.                                                                                                                                                                                                                                                                                                                                                                             |
| Web pages           | `Dashboard` and `NotFound`. No login screen, no data screens.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Web shell           | `AppShell` (rail and top bar drawn from `--sp-rail-w` / `--sp-topbar-h` via the `w-rail` / `pl-rail` / `h-topbar` utilities; rail items measured against the handoff — see [`design/HANDOFF.md`](design/HANDOFF.md) §2), `RouteWrapper`, `ErrorBoundary`, `PageLoading`, `Toast`                                                                                                                                                                                                                     |
| Web nav             | 8 entries from `constants/navigation.ts`: Dashboard, Sale, Appointments, Customers, Products, Staff, Reports\*, Settings\* (\* admin roles only; the first six are unrestricted, so a signed-out user sees six). No `Services` entry — services are a tab on the products screen and a step in the sale and appointment flows ([ADR 0005](decisions/0005-rail-has-no-services-destination.md))                                                                                                       |
| Web primitives      | All 17: `Button`, `IconButton`, `Input`, `Select`, `Checkbox`, `Card`, `Badge`, `Chip`, `EmptyState`, `Skeleton`, `Tabs`, `Pagination`, `Tooltip`, `Modal`, `Drawer`, `Table`, `Toast`. Shared, non-roadmap helpers: `Field` (label/hint/error shell) and `Dialog` (focus-trapped shell behind `Modal`/`Drawer`). Heights come from `--sp-control-h-sm/md/lg`; every interactive primitive has a keyboard, disabled and accessible-name test. `PageLoading` and `ErrorBoundary` also predate the set |
| Web styling         | `index.css` maps the handoff tokens onto Tailwind namespaces in one `@theme` block (colours, type scale, weights, radii, control heights, shadows); `styles/tokens.css` is a byte-identical copy of the handoff file; app-only values live in `styles/app-chrome.css`; icons are 41 ported SVG components in `components/icons/` — `react-icons` is gone                                                                                                                                             |
| Shared package      | `@glampro/shared` — Zod schemas, constants and types consumed by both the API and the web app                                                                                                                                                                                                                                                                                                                                                                                                        |
| Design package      | `design/handoff/` — 11 screens (+ PNGs for 01–04), `tokens.css` / `tokens.json`, 41 SVG icons                                                                                                                                                                                                                                                                                                                                                                                                        |
| Legacy application  | **Not in this repository.** `docs/legacy/` is the transcription of it: the API surface (154 registrations, 151 live routes) and the schema, plus the gaps worth knowing before migrating                                                                                                                                                                                                                                                                                                             |
| Docs                | `architecture.md`, `CONTEXT.md`, `roadmap.md`, `STATE.md`, `decisions/` (0002–0005 + index), `legacy/` (LEGACY-MAP, API-INVENTORY, reference/legacy-schema), `saas/TENANCY.md`, `design/HANDOFF.md`                                                                                                                                                                                                                                                                                                  |

## 3. Next up — Phase 1, in order

**Done in the screen pass so far.** All 11 handoff screens were rendered at their true frames
with headless Chrome, and the app shell was measured against them and reconciled. Two things
worth carrying forward:

- The frames are **not** all 1280×900. Screens 01–04 use a `.root` container: 01 is 1280×832,
  02 is 900×832, 03 is 1280×900 and 04 is 1280×620 (a reference sheet, not a screen). Only 03
  and 05–11 are 1280×900.
- The rail in screens 05–11 is one shared shell block. Measuring it (rather than reading the
  markup) is what caught four bugs: the two gaps applied the wrong way round, the active item
  painted as a navy tint instead of `--sp-purple`, a 10px label that clipped "Appointments"
  against its own item, and off-by-a-few-px logo margin and rail padding. All four are fixed.
  The numbers, and the one deliberate deviation (item width), are in
  [`design/HANDOFF.md`](design/HANDOFF.md) §2.

1. **Reconcile the standalone primitives.** They have been measured against the rendered handoff
   but not yet changed. The numbers to work from, read out of the browser:

   | Handoff selector  | Measured in the screens                                                       | App today                                         |
   | ----------------- | ----------------------------------------------------------------------------- | ------------------------------------------------- |
   | `.card`           | radius `20px`, 1px `#E3E6F2`                                                  | `rounded-card`, `border-line` — **matches**       |
   | `.card-head`      | padding `16px 20px`, 1px `#EEF0F7` bottom                                     | `px-5 pt-4 pb-3`, **no divider**                  |
   | `.card-title`     | `14.5px` / `800`                                                              | `15.5px` (`text-md`) / `700`                      |
   | `.card-body`      | padding `6px 12px 12px`                                                       | `px-5 pb-5`                                       |
   | `.btn`            | radius `12px` ✅, height **`37px`**, `13.5px`/`700`, padding `11px 18px`      | `h-control` (**`44px`**), `text-sm`/`600`, `px-4` |
   | `.tier` (Badge)   | `10.5px`/`800`, padding `4px 9px`, height `22px`                              | `10px`/`600`, `px-2 py-0.5`, ~`16px`              |
   | `.tab-opt` (Tabs) | padding `13px 0`, `12.5px`/`700`, active = `inset 0 -2px 0 #6144E4`           | see `Tabs`                                        |
   | `.chip`           | `13px`/`600`, padding `8px 14px`, `#2B3160` on `#F3F4FA`, 1px `#E3E6F2`, pill | see `Chip`                                        |

   One of these is a **conflict, not a bug**, and must not be "fixed" towards the screen: the
   handoff draws `.btn` at 37px, but its own token file defines `--sp-control-h-md: 44px` as the
   "standard buttons" height and [`design/HANDOFF.md`](design/HANDOFF.md) §6 requires every
   control to clear 44px. The app follows the token. Record the 37px screen value as the
   designer's under-sized button rather than regressing the app to it.

2. **Confirm the four stand-in icon mappings** in [`design/HANDOFF.md`](design/HANDOFF.md) §4 —
   **done, they hold.** The ported set is the complete handoff directory (41 SVGs) and it ships
   no info, spinner, refresh or arrow-left glyph, so `Bell`, `Settings`, `Eye` and `ChevronLeft`
   remain the nearest delivered shapes. Screen 04 confirms the badge work is still outstanding
   for the sale phase.

Settled: the token copy is byte-identical to the handoff file with the app-only values in
`styles/app-chrome.css`, all 41 handoff icons are ported with `react-icons` deleted, all 17
primitives are built and tested, and Q15 is answered (staff is its own `/staff` route, because
the handoff's own rail draws a Staff entry on every main-nav screen). Q21 is answered too: the
rail has eight entries and no `Services` destination
([ADR 0005](decisions/0005-rail-has-no-services-destination.md)). The screen pass adds no
routes and no data — the `Staff` entry points at a route Phase 4 fills, exactly as `Customers`
and `Products` already did. Do not start Phase 2 models before the phase is finished: the
screens are what fix the field names those models will carry.

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

| #   | Question                                                                                               | Why it blocks                                                                            | What unblocks it                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | `sales.paymenttype_id` points at a `paymenttypes` table **no migration creates** `[1]`                 | The `Sale` model cannot be finalised while it is unknown whether the column is live      | Inspect the production MySQL schema (`information_schema.tables`): if the table exists there it becomes a real model, otherwise the column is dropped |
| Q2  | `users.email` is not unique in the database `[3]`                                                      | The importer has to do _something_ with duplicates — merge, suffix, or fail              | Duplicate report from production (`GROUP BY email HAVING COUNT(*) > 1`), then a written rule per case                                                 |
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

| #   | Question                                                                                                                                                                                                                                                                                                                                                                                            | Why it matters now                                                                                                                                                                                          | Owner / when                                                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q16 | The legacy sale/payment endpoints have **no idempotency key**.                                                                                                                                                                                                                                                                                                                                      | Phase 5 acceptance requires that a double-tap cannot double-charge                                                                                                                                          | Engineering, in Phase 5 (client-generated key stored on the sale/payment row; small enough not to need an ADR)                                                                                                       |
| Q17 | `POST /webhook` is public, unauthenticated, and its provider is not recorded anywhere.                                                                                                                                                                                                                                                                                                              | Phase 8 integrations. Rebuilding it as-is would open an unauthenticated write path                                                                                                                          | Keep the route out until the sender and its signature scheme are identified (engineering, Phase 8)                                                                                                                   |
| Q18 | In the legacy app `POST /api/mobile/value-packages` resolves to the **same handler** as `/api/mobile/services`.                                                                                                                                                                                                                                                                                     | The mobile contract is frozen, so the question is whether this is a bug to fix or behaviour to preserve                                                                                                     | Engineering: check what the shipped client expects. If the shapes can be kept, fix it behind the same URL; otherwise preserve the bug deliberately and say so in the inventory                                       |
| Q19 | The legacy surface mixes `PUT` and `POST` for equivalent writes.                                                                                                                                                                                                                                                                                                                                    | The new web surface should use one convention; the frozen mobile routes cannot change                                                                                                                       | Engineering, when each phase adds its routes. Rule for the rebuild: new routes are REST (`POST` create, `PATCH` update, `PUT` only for full replacement); frozen routes keep their verb and are documented as frozen |
| Q20 | 36 mobile routes are frozen and must come back **one phase at a time**, with identical response shapes.                                                                                                                                                                                                                                                                                             | It is easy for a phase to be called complete while a mobile route it owns is still missing                                                                                                                  | Nothing blocks it — the contract is written down in [`legacy/API-INVENTORY.md`](legacy/API-INVENTORY.md). Each phase's acceptance must check the frozen routes it owns                                               |
| Q22 | The rail's **foot** is not modelled. The handoff puts `Settings` in `.side-foot` beside `Log out`; the app declares `Settings` as an ordinary `navItems` entry — rendered only once a role is supplied, and then in the main nav — and `AppShell` hard-codes its own `Log out` button below the `<nav>`. The labels differ too: `Dashboard`/`Appointments` here, `Home`/`Calendar` in the proposal. | Both are user-visible, and role-gating is currently the only thing keeping `Settings` out of the rail, so the foot's shape has to be settled before the settings screen and the top bar's account menu land | Product/scope: keep the app's labels and nav shape, or adopt the handoff's (`CONTEXT.md` §5 permits labels to differ). Decide before the first role-aware render arrives with Phase 3 auth                           |

## 5. Verify status

`npm run verify` is `format:check` → `lint` → `typecheck` → `test`. Last full run:
**exit 0**, 2026-10-01, after the screen pass landed the rail reconciliation, the `Staff`
nav entry and the removal of the `Services` entry
([ADR 0005](decisions/0005-rail-has-no-services-destination.md)). The web suite moved from 128
to 129 tests: `navigation.test.ts` gains the assertion that the rail carries eight entries and
no `Services` destination — the check that `design/HANDOFF.md` §5's "nine entries" had hidden.

| Step           | Result                                                           |
| -------------- | ---------------------------------------------------------------- |
| `format:check` | Pass — every matched file already Prettier-formatted             |
| `lint`         | Pass — no errors or warnings in any workspace                    |
| `typecheck`    | Pass — `@glampro/shared`, `@glampro/api`, `@glampro/web`         |
| API tests      | **16 passed, 0 failed** (7 suites, `node --test` over real HTTP) |
| Shared tests   | **6 passed, 0 failed** (3 suites)                                |
| Web tests      | **21 files, 129 tests passed** (Vitest)                          |

`npm run build:web` was also run once to confirm the new utilities compile — `w-rail`,
`pl-rail`, `h-topbar`, `rounded-pill`, `text-2xs` and `text-[length:var(--app-rail-icon)]`
all emit CSS, and each resolves to the token it should. `dist/` was deleted afterwards.

The screen pass has **partly** run. The app shell was rendered and measured against screens
05–11 and now matches the handoff — the rail's item geometry, both gaps, the 8.5px/700 label and
the purple active state are verified by reading computed styles back out of the browser, not by
eye, and the app now renders "Customers" at 46.4px, the same width the handoff produces. The
`Staff` entry answers Q15.

The **standalone primitives have not been reconciled**: they were measured against the rendered
screens (the numbers are tabled in §3, item 1) but no change was made to them, so no primitive
has yet been _corrected_ against the design. The token utilities they use (`h-control`,
`size-control`, `rounded-md`, `shadow-purple-btn`, `font-medium`) resolve through the `@theme`
block, but only `font-medium` changed meaning in an earlier pass: it is now the handoff's 600
rather than Tailwind's default 500.

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
