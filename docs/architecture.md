# Glampro — Architecture

Glampro is the Salon Pro management platform: point of sale, appointments,
customers, staff, inventory and reporting, with a mobile client that consumes the
same API.

This document explains **how the system is put together and why**. Operational
instructions live in [`README.md`](../README.md) (day-to-day) and
[`README.Docker.md`](../README.Docker.md) (containers, deployments, secrets).

---

## 1. Stack

| Layer        | Choice                                                      | Notes                                                                                                                   |
| ------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Runtime      | Node.js 24                                                  | `node:24-bookworm-slim` in every image (glibc, so `bcrypt` and the Prisma engine work without musl workarounds)         |
| Language     | TypeScript 6 (strict)                                       | `erasableSyntaxOnly`, `noUnusedLocals`, `noUnusedParameters` — no enums, no runtime namespaces, no parameter properties |
| API          | Express 5 + Zod                                             | Express 5 forwards async rejections to the error middleware, so handlers need no try/catch wrapper                      |
| Database     | PostgreSQL 17                                               | Chosen over the legacy MySQL for transactional DDL, `RETURNING`, window functions and native JSON                       |
| ORM          | Prisma 7 (`prisma-client` generator + `@prisma/adapter-pg`) | Typed queries, committed SQL migrations, `prisma migrate deploy` in a one-shot container                                |
| Auth         | JWT access token + opaque refresh token                     | Three realms (web / POS / mobile), `tokenVersion` for instant revocation                                                |
| Web          | React 19 + Vite 8 + Tailwind 4                              | Tailwind 4 CSS-first theming; there is no `tailwind.config.js`                                                          |
| Server state | TanStack Query 5                                            | All remote data; no Redux                                                                                               |
| Forms        | react-hook-form + `@hookform/resolvers` + Zod               | Schemas shared with the API through `@glampro/shared`                                                                   |
| Tests        | `node:test` (API, shared), Vitest + Testing Library (web)   |                                                                                                                         |
| Monorepo     | npm workspaces                                              | `pnpm` is unavailable in the target environment                                                                         |

### Deliberate deviations from the original plan

Changed during Phase 0 to match the toolchain already proven in the sibling
`explomo_safety` codebase, and to reduce delivery risk:

| Planned                                          | Actual                                                                           | Why                                                                                                                                                                      |
| ------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `node-pg-migrate` with hand-written SQL          | Prisma 7 migrations                                                              | The schema needed modelling anyway; Prisma gives typed queries for the whole API and one migration workflow. `prisma.$queryRaw` stays available for the reporting phase. |
| Tailwind 3 + `tailwind.config.js`                | Tailwind 4 `@theme`                                                              | Matches the sibling project. The handoff's `tokens.css` is imported untouched and mapped onto Tailwind's namespaces.                                                     |
| React Router 6                                   | React Router 8                                                                   | Current major, same `useRoutes` + `RouteObject` API as the sibling project.                                                                                              |
| `dompdf` / `simple-qrcode` / `Maatwebsite Excel` | Browser `qrcode` today; server-side PDF and XLSX arrive with the reporting phase | No drop-in replacements exist, so each library is pulled in by the phase that needs it.                                                                                  |
| Zustand for client state                         | TanStack Query only, for now                                                     | Nothing yet needs a client store. The auth session lives in `localStorage` behind `lib/auth-storage.ts`. Zustand is added only if a cross-page store becomes necessary.  |

---

## 2. Repository layout

```
glampro_new/
├── apps/
│   ├── api/                  Express + Prisma API
│   │   ├── prisma/           schema.prisma, migrations/, seed.ts
│   │   ├── generated/        Prisma client (git-ignored; `npm run db:generate`)
│   │   └── src/
│   │       ├── index.ts      Process lifecycle (listen, graceful shutdown)
│   │       ├── app.ts        Express assembly, exported so tests can import it
│   │       ├── lib/          env, logger, prisma, tokens, password, http-error
│   │       ├── middleware/   auth, rate limiting, validation, error handling
│   │       ├── routes/       One router per resource, mounted in app.ts
│   │       ├── services/     Business logic, kept out of route handlers
│   │       ├── types/        Express request augmentation, internal types
│   │       └── utils/        Pure helpers (pagination, money, dates)
│   └── web/                  React SPA
│       ├── nginx.conf        Production server + API proxy
│       └── src/
│           ├── components/   ui/ primitives, layouts/ chrome, icons/
│           ├── constants/    navigation, queryKeys, typography
│           ├── hooks/        Data hooks wrapping TanStack Query
│           ├── lib/          api client, auth-storage, formatters
│           ├── pages/        One folder per screen from the handoff
│           └── styles/       tokens.css (verbatim handoff copy)
├── packages/
│   └── shared/               Zod schemas, API contracts, domain constants
├── docker/                   api.Dockerfile, web.Dockerfile
├── docs/                     this file
├── compose.yaml              Local development stack
└── compose.production.yaml   Self-contained production stack
```

### Why `@glampro/shared` is a built package

Both apps import it at runtime and the API compiles with `tsc` under `NodeNext`.
Pointing `main` at TypeScript sources would break the API build (`rootDir`
violations), so the package compiles to `dist/` and resolves as a normal npm
dependency:

- **Development:** `npm run dev:shared` (`tsc --watch`) keeps `dist/` fresh; the
  root `dev` script runs it beside the API and the web dev server.
- **Docker:** the API dev container runs `npm run build:shared` before starting;
  production images build it in the `build` stage.
- **Consequence:** `npm run build:shared` must run before anything imports the
  package at runtime. Every root script that needs it (`build`, `typecheck`,
  `test`, `dev:docker:*`) already chains it.

### npm workspaces quirk

`npm` 11.4 crashes with `Cannot read properties of null (reading 'edgesOut')`
while resolving this dependency graph, so `.npmrc` sets
`legacy-peer-deps=true`. Two consequences to remember:

1. **Peer dependencies are never installed automatically.** Anything a library
   declares as a peer must be listed explicitly in the workspace manifest — this
   is why `@testing-library/dom` is a direct devDependency of `apps/web` even
   though `@testing-library/react` conceptually owns it.
2. The host, `npm ci` in Docker and CI all read the same `.npmrc`, so the
   resolved tree is consistent everywhere.

---

## 3. Request flow

### Development (`compose.yaml`)

```
browser ──▶ Vite dev server :5173 ──/api, /uploads──▶ api :9000 ──▶ postgres :5432
```

Vite proxies `/api`, so the browser only ever calls a same-origin `/api` path —
identical to production. There is no environment-specific URL logic in the
client and no CORS configuration needed locally.

### Production (`compose.production.yaml`)

```
browser ──▶ nginx :80 ──/api, /uploads, /health──▶ api :9000 ──▶ postgres :5432
             └── static SPA assets from /usr/share/nginx/html
```

Only nginx is published to the host; PostgreSQL and the API stay on the internal
network. A one-shot `migrations` container runs `prisma migrate deploy` between
the database becoming healthy and the API starting.

---

## 4. Configuration

Configuration is environment variables only. No secret is ever baked into an
image, and nothing under `VITE_*` may hold one — those values ship to the
browser.

| Where            | File                                                 | Used by                     |
| ---------------- | ---------------------------------------------------- | --------------------------- |
| Local dev stack  | `.env.docker` (from `.env.docker.example`)           | `compose.yaml`              |
| Production stack | `.env.production` (from `.env.production.example`)   | `compose.production.yaml`   |
| Host-side API    | `apps/api/.env` (from `apps/api/.env.example`)       | `npm run dev` in `apps/api` |
| Host-side web    | `apps/web/.env.local` (from `apps/web/.env.example`) | `npm run dev` in `apps/web` |

`.gitignore` ignores every `.env*` file except the `*.example` templates.

`apps/api/src/lib/env.ts` fails fast at boot when `DATABASE_URL` or `JWT_SECRET`
is missing, so a misconfigured deployment crashes immediately instead of serving
errors for hours.

Uploads live in `UPLOADS_DIR` (default `uploads`, relative to `apps/api`), are
served from `/uploads`, and are backed by a named volume in production.

---

## 5. Database conventions

### Naming

Prisma models are PascalCase (`User`), and every model maps to a snake_case
table with `@@map`. Columns keep camelCase in the generated client. This was a
deliberate choice for a greenfield schema: the reporting phase writes a lot of
raw SQL, and quoted CamelCase identifiers make that painful.

```prisma
model User {
  globalRole GlobalRole @default(STAFF)
  @@map("users")          // → users.globalRole
}
```

### Migrations

- Only committed SQL migrations are applied, in every environment, by
  `prisma migrate deploy` (`npm run db:migrate`).
- `prisma migrate dev` (`npm run db:migrate:dev -- --name <change>`) creates a
  migration from schema changes during development. It never runs against
  production.
- `prisma migrate reset` (`npm run db:reset`) is destructive and development-only.
- Migrations run in a one-shot container before the API starts, so a rollout can
  never serve traffic against an unmigrated schema.

### Seeding

`prisma/seed.ts` is idempotent (upserts by email) and controlled by `SEED_MODE`:

| Mode                    | Behaviour                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `development` (default) | One `SUPER_ADMIN` plus demo manager / staff / cashier accounts                                     |
| `production`            | Exactly one administrator built from `ADMIN_EMAIL` / `ADMIN_NAME` / `ADMIN_PASSWORD`, nothing else |

Passwords are bcrypt hashes (`BCRYPT_ROUNDS`, default 10; use 12 in production).

---

## 6. Authentication and authorisation

Two tokens, three realms.

| Token   | Format                            | Lifetime   | Storage                                             |
| ------- | --------------------------------- | ---------- | --------------------------------------------------- |
| Access  | JWT (HS256, issuer `glampro-api`) | 15 minutes | `localStorage` (web)                                |
| Refresh | Opaque 32-byte random string      | 30 days    | Only its SHA-256 hash is stored in `refresh_tokens` |

- `realm` (`web` / `pos` / `mobile`) is a claim in the access token, so the API
  can refuse a POS token on an admin-only endpoint even when the role matches.
- `tokenVersion` on `users` is compared against the claim on every request.
  Logout, password change or a forced sign-out increments it and invalidates all
  outstanding access tokens immediately.
- `refresh_tokens` rows are rotated on every refresh; a revoked or expired row
  returns `SESSION_INVALIDATED`.
- The `auth` middleware re-reads the user from the database on every request, so
  a disabled account or a role change applies to the next request rather than
  after the access token expires.

Client behaviour: the axios interceptor clears the session and redirects to
`/login` on a 401, carrying the server's message through `sessionStorage` so the
login screen can explain why the user was signed out.

---

## 7. API conventions

| Concern              | Convention                                                                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prefix               | `/api/*` for resources; `/health` and `/health/ready` for probes                                                                                                                                    |
| Envelope             | `{ "data": ... }` for single objects, `{ "data": [...], "total", "page", "pageSize", "pageCount" }` for lists                                                                                       |
| Errors               | `{ "statusCode", "message", "code"?, "details"? }` — `code` is a stable machine-readable string                                                                                                     |
| Validation           | `validate(schema, source)` middleware; parsed output is read with `validated(req, source)` from `req.validated`, never written back onto `req.query` (Express 5 exposes those as read-only getters) |
| Pagination           | `?page=&pageSize=` via `paginationQuerySchema`, capped by `MAX_PAGE_SIZE`; `parsePagination` is the single source of truth                                                                          |
| Rate limits          | 1000 requests / 15 min per IP on `/api`, 20 / 15 min on auth endpoints (successful requests exempt)                                                                                                 |
| Security headers     | `helmet`, CSP disabled (the SPA is served elsewhere), CORP relaxed so `/uploads` renders cross-origin                                                                                               |
| CORS                 | Strict allowlist from `CORS_ORIGINS`; requests with no `Origin` header (curl, native mobile, same-origin) are allowed                                                                               |
| Body size            | 2 MB JSON/urlencoded                                                                                                                                                                                |
| Errors from handlers | Throw `HttpError` (see `lib/http-error.ts`); the terminal error handler maps `HttpError`, `ZodError` and Prisma `P2002` to responses and logs the rest as a 500                                     |

### Mobile compatibility

`/api/mobile/*` serves the existing mobile client and **must stay
byte-compatible**: the same paths, the same field names, and the same legacy
envelope. Where the new web endpoints use the cleaner shapes in the table above,
the mobile routes keep their own adapters. `normalisePaginated` in the web client
also accepts the legacy paging field names (`currentPage`, `perPage`,
`totalPages`) so list responses stay readable by both surfaces.

---

## 8. Design system

The UI follows the **Salon Pro** handoff package:

- `apps/web/src/styles/tokens.css` is a **verbatim copy** of the handoff's
  `tokens/tokens.css`. Change values in the handoff and re-copy; never edit them
  here.
- `apps/web/src/index.css` maps the useful `--sp-*` variables onto Tailwind's
  namespaces inside `@theme`, so components write semantic classes
  (`bg-surface`, `text-ink-muted`, `rounded-card`, `h-control`) instead of
  repeating `bg-[var(--sp-surface)]`.

| Handoff token                                            | Tailwind utility                                      | Use                                      |
| -------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------- |
| `--sp-bg`, `--sp-surface`, `--sp-surface-2`              | `bg-bg`, `bg-surface`, `bg-surface-2`                 | Page, cards, input fills                 |
| `--sp-border`, `--sp-border-soft`                        | `border-line`, `border-line-soft`                     | Hairlines and dividers                   |
| `--sp-text-primary`, `--sp-text-body`, `--sp-text-muted` | `text-ink`, `text-ink-body`, `text-ink-muted`         | Type hierarchy                           |
| `--sp-purple`, `--sp-purple-dark`, `--sp-purple-bg`      | `bg-purple`, `hover:bg-purple-dark`, `bg-purple-soft` | Primary accent                           |
| `--sp-navy`                                              | `bg-navy`                                             | Icon rail, cart ticket                   |
| `--sp-control-h-md` (44px)                               | `h-control`, `w-control`                              | Buttons, inputs — the minimum tap target |
| `--sp-radius-xl`                                         | `rounded-card`                                        | Section cards and panels                 |
| `--sp-shadow-menu`                                       | `shadow-menu`                                         | Popovers and toasts                      |

### Frame geometry

Screens 05–11 use a fixed app frame, reproduced in
`components/layouts/AppShell.tsx`:

- **84px navy icon rail** on the left (`w-[84px]`)
- **76px white top bar** above the content (`h-[76px]`)
- Content area on `--sp-bg`

Typography is Plus Jakarta Sans, loaded from Google Fonts in `index.html` with a
`system-ui` fallback stack. Self-host it before deploying anywhere that cannot
reach Google Fonts.

### Icons

The handoff ships 40 stroke-based 24×24 SVGs. They live in the handoff package's
`icons/` directory and are ported into `apps/web/src/components/icons/` as inline
SVG components (inline, so `currentColor` inheritance works). react-icons
(Feather set, the same 24×24 stroke style) covers everything outside the
handoff's set until that port is complete.

### Accessibility and states

The handoff mockups intentionally omit loading, empty, error, validation and
keyboard states. Every real screen must add them: `PageLoading` for route chunks,
`ErrorBoundary` for render failures, TanStack Query error surfaces for request
failures, and an `aria-label` on every icon-only button.

---

## 9. Front-end conventions

- **One API client.** `lib/api.ts` exports `get`, `getPaginated`, `post`, `put`,
  `patch`, `del`, `getErrorMessage` and `getValidationDetails`. Components never
  call axios directly.
- **Query keys come from `constants/queryKeys.ts`.** Lists are
  `["domain", "list"]` with filters appended as the last element; details embed
  the id. Invalidation is prefix-based, so `queryKeys.customers.list()`
  invalidates every filtered variant.
- **Server state only.** No Redux. Local UI state stays in `useState` or a
  component-scoped hook.
- **Path alias `@/`** resolves to `apps/web/src` in TypeScript, Vite and Vitest.
- **Session storage** is centralised in `lib/auth-storage.ts`
  (`getAccessToken`, `setSession`, `clearSession`, notices). No component touches
  `localStorage` keys directly.
- **Formatting** goes through `lib/utils.ts` so every table renders "—" instead
  of "Invalid Date" or "null".

---

## 10. Testing

| Workspace         | Runner                     | Location              | Scope                                                                                 |
| ----------------- | -------------------------- | --------------------- | ------------------------------------------------------------------------------------- |
| `@glampro/shared` | `node --import tsx --test` | `src/**/*.test.ts`    | Schema parsing, defaults, coercion                                                    |
| `@glampro/api`    | `node --import tsx --test` | `src/**/*.test.ts`    | Pure helpers, token round-trips, HTTP contract via `createApp()` on an ephemeral port |
| `@glampro/web`    | Vitest + Testing Library   | `src/**/*.test.ts(x)` | Formatters, pagination normalisation, navigation filtering, component behaviour       |

`createApp()` deliberately does not bind a port, so API tests can exercise real
routing, middleware and error serialisation without a database. Anything that
needs a database is an integration test and belongs to the compose stack, not the
unit suite.

Run everything with `npm run verify` (format check, lint, type-check, tests).

---

## 11. Containers

Both images are multi-stage and built from the repository root, because the build
context spans the npm workspaces.

| Target         | Used by                   | Contents                                                       |
| -------------- | ------------------------- | -------------------------------------------------------------- |
| `dependencies` | —                         | Manifests + `npm ci`                                           |
| `build`        | —                         | Compiled shared package, generated Prisma client, compiled app |
| `development`  | `compose.yaml`            | Full toolchain, source bind-mounted, hot reload                |
| `migration`    | `compose.production.yaml` | `prisma migrate deploy`, runs once                             |
| `runtime`      | `compose.production.yaml` | Production dependencies + `dist` only, `USER node`             |

Developer-experience details worth knowing:

- Source is bind-mounted, so edits reload live.
- `node_modules` and the generated Prisma client live in **named volumes seeded
  from the image**, so host-installed binaries never leak into a container and
  vice versa.
- After changing any `package.json`, rebuild with `-V` (`make rebuild`) so those
  volumes are refreshed from the new image.
- The repository may sit on a filesystem where inotify does not fire, so the dev
  servers poll by default (`VITE_USE_POLLING`, `CHOKIDAR_USEPOLLING`).

---

## 12. Roadmap and current status

| Phase | Scope                                                              | Status       |
| ----- | ------------------------------------------------------------------ | ------------ |
| 0     | Monorepo, tooling, Docker, health endpoints, docs                  | **Complete** |
| 1     | Design system: handoff tokens, icon port, UI primitives, app shell | **Complete** |
| 2     | Full data model: catalogue, customers, staff, appointments, sales  | Not started  |
| 3     | Auth: login / refresh / logout, roles, protected routes            | Not started  |
| 4     | Master data screens: customers, products, services, staff          | Not started  |
| 5     | POS Sale + confirmation (handoff screens 01–02)                    | Not started  |
| 6     | Appointments and calendar (handoff screens 03, 06)                 | Not started  |
| 7     | Dashboard and reports (handoff screens 05, 10)                     | Not started  |
| 8     | Settings and integrations (handoff screen 11)                      | Not started  |
| 9     | Hardening and the live MySQL → PostgreSQL data migration           | Not started  |

`GET /api/auth/me` already exists so the session plumbing (token verification,
database re-validation) is exercised end to end. Login, refresh and logout land
in Phase 3.
