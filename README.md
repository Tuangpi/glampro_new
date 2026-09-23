# GlamPro (new)

A multi-tenant SaaS platform for salon operations: appointments, point of sale, staff,
inventory, and reporting, sold to salon businesses as a subscription.

This repository is a fresh start. The previous Laravel application is kept only as a
reference for business rules and workflow; no code is shared.

## Status

Milestones 1 to 3 are in place; see [docs/milestones.md](docs/milestones.md) for the plan.

- npm workspaces monorepo with the web app, API, shared contracts, and shared tooling config
- Express 5 + TypeScript API with security middleware, request correlation, and a standard
  response envelope
- Prisma schema covering tenancy, identity, sessions, invitations, subscriptions, and audit logs
- Authentication: registration, login, refresh-token rotation with reuse detection, logout,
  session listing and revocation, password reset, and email verification
- `authenticate`, `withTenant`, `requirePermission`, `validate`, and CSRF guards for every module
  that follows
- Tenancy administration: organization and location settings, business hours, member roles and
  status, invitations with single-use email links, and a tenant-scoped audit log viewer
- React 19 + TypeScript + Vite + Tailwind shell with a session provider, protected routes, and
  permission-aware navigation
- Zod contracts shared between the API and the web client
- Vitest suites for the API, the web app, and the contracts, including tenant-isolation tests

Feature modules (appointments, POS, inventory, reports) are intentionally not implemented yet.
Routes exist as placeholders and will be built against the foundations described in
[docs/architecture.md](docs/architecture.md).

## Stack

| Layer     | Choice                                                                    |
| --------- | ------------------------------------------------------------------------- |
| Frontend  | React 19, TypeScript, Vite, Tailwind CSS, React Router, lucide-react      |
| Backend   | Node.js 22+, Express 5, TypeScript                                        |
| Database  | MySQL 8.4 with Prisma ORM 7 and the MariaDB driver adapter                |
| Auth      | `jose` HS256 access tokens, bcrypt password hashes, opaque refresh tokens |
| Contracts | Zod schemas shared through `@glampro/contracts`                           |
| Testing   | Vitest, Supertest                                                         |
| Quality   | ESLint flat config, Prettier                                              |

## Layout

```text
glampro_new/
├── apps/
│   ├── api/                    Express API
│   │   ├── prisma/             Schema, config, migrations, seed script
│   │   ├── src/
│   │   │   ├── config/         Environment validation, logger
│   │   │   ├── database/       Prisma client and driver adapter
│   │   │   ├── generated/      Generated Prisma Client (git-ignored)
│   │   │   ├── middleware/     Request context, rate limits, error handling
│   │   │   ├── modules/        Feature modules (health, auth)
│   │   │   ├── shared/         Errors and response helpers
│   │   │   ├── types/          Express type augmentation
│   │   │   ├── app.ts          App composition
│   │   │   └── server.ts       HTTP server and graceful shutdown
│   │   └── tests/              Integration tests
│   └── web/                    React client
│       └── src/
│           ├── app/            Router
│           ├── components/     Layout primitives
│           ├── features/       Feature screens
│           ├── lib/            API client and formatters
│           └── styles/         Tailwind entrypoint
├── packages/
│   ├── contracts/              Zod schemas shared with the API
│   ├── eslint-config/          Shared ESLint configuration
│   └── tsconfig/               Shared TypeScript configurations
├── docs/                       Architecture, authorization, and data model
└── docker-compose.yml          Local MySQL
```

## Prerequisites

- Node.js 22 or newer (Node 24 is used locally)
- npm 10 or newer
- Docker for the local MySQL container, or an existing MySQL 8 server

## Getting started

```bash
# 1. Install workspace dependencies
npm install

# 2. Create the local environment file
cp .env.example .env

# 3. Start MySQL
docker compose up -d

# 4. Generate the Prisma client
npm run db:generate

# 5. Apply migrations (creates the schema)
npm run db:migrate

# 6. Seed an owner account, one organization, and one location
npm run db:seed

# 7. Run the API and the web app together
npm run dev
```

The local MySQL container binds to `127.0.0.1:3307` to avoid conflicts with host MySQL
installations. Prisma uses the separate `glampro_shadow` database during development migrations;
Docker creates it automatically for fresh database volumes.

Integration tests run against a dedicated `glampro_test` database that they truncate between
cases, and they refuse to run against a database whose name does not end in `_test`. Fresh Docker
volumes create it through `docker/mysql/init/02-test-database.sql`; for an existing volume create
it once by hand:

```bash
docker exec glampro-mysql mysql -uroot -plocal-root-password \
  -e "CREATE DATABASE IF NOT EXISTS glampro_test; GRANT ALL PRIVILEGES ON glampro_test.* TO 'glampro'@'%'; FLUSH PRIVILEGES;"
```

`npm test` applies the committed migrations to that database before the suite runs. Set
`DATABASE_URL_TEST` to use a different server.

Prisma Client is generated into `apps/api/src/generated/prisma`, which is git-ignored. Run
`npm run db:generate` after installing dependencies and whenever the schema changes; typechecking
and building the API fail until the client exists. Connection URLs live in `apps/api/prisma.config.ts`
rather than in `schema.prisma`, and the API reaches MySQL through the `@prisma/adapter-mariadb`
driver adapter configured in `apps/api/src/database/prisma.ts`.

- API: http://localhost:4000/api/v1/health
- Web: http://localhost:5173

The Vite dev server proxies `/api` to the API, so `VITE_API_URL` can stay unset locally.
The seeded owner account is `owner@glampro.local` with the password `ChangeMe12345`. Change or
delete it before any environment is reachable by others.

## Scripts

Run from the repository root:

| Script                | Purpose                                            |
| --------------------- | -------------------------------------------------- |
| `npm run dev`         | Run the API and web app together                   |
| `npm run dev:api`     | Run only the API with watch mode                   |
| `npm run dev:web`     | Run only the web app                               |
| `npm run build`       | Build contracts, then the API, then the web app    |
| `npm run typecheck`   | Build contracts and typecheck both apps            |
| `npm run lint`        | Lint the whole repository                          |
| `npm test`            | Run all workspace test suites                      |
| `npm run format`      | Format with Prettier                               |
| `npm run db:generate` | Generate Prisma Client into `src/generated/prisma` |
| `npm run db:migrate`  | Create and apply a development migration           |
| `npm run db:seed`     | Seed local data                                    |
| `npm run db:studio`   | Open Prisma Studio                                 |

## API conventions

All endpoints live under `/api/v1` and use two envelopes:

```jsonc
// Success
{ "data": { }, "meta": { "requestId": "...", "timestamp": "..." } }

// Failure
{ "error": { "code": "PERMISSION_DENIED", "message": "...", "details": {} },
  "meta": { "requestId": "...", "timestamp": "..." } }
```

Errors are raised as `AppError` and rendered by a single handler. `ZodError` becomes a `422`
`VALIDATION_ERROR` with flattened field details. Unexpected errors are logged with the request
ID and never leak stack traces outside development.

Every response carries `meta.requestId` and the matching `x-request-id` header. A client-supplied
`x-request-id` is accepted (truncated to 100 characters) so that traces survive across services.

## Authentication

| Method   | Endpoint                       | Purpose                                            |
| -------- | ------------------------------ | -------------------------------------------------- |
| `POST`   | `/api/v1/auth/register`        | Create an organization, its owner, and a session   |
| `POST`   | `/api/v1/auth/login`           | Start a session                                    |
| `POST`   | `/api/v1/auth/refresh`         | Rotate the refresh token and issue an access token |
| `POST`   | `/api/v1/auth/logout`          | Revoke the session family and clear cookies        |
| `GET`    | `/api/v1/auth/me`              | Current user, membership, permissions, locations   |
| `GET`    | `/api/v1/auth/sessions`        | Active sessions for the signed-in user             |
| `DELETE` | `/api/v1/auth/sessions/:id`    | Revoke one session                                 |
| `POST`   | `/api/v1/auth/password/forgot` | Request a password reset link                      |
| `POST`   | `/api/v1/auth/password/reset`  | Complete a password reset                          |
| `POST`   | `/api/v1/auth/email/verify`    | Confirm an email address                           |

Access tokens are short-lived HS256 JWTs held in memory by the web client. The refresh token is an
opaque value in an HTTP-only cookie scoped to `/api/v1/auth`, and only its SHA-256 hash is stored.
Each refresh rotates the token; replaying a retired token revokes the whole session family. A
readable `glampro_csrf` cookie plus the `x-csrf-token` header protects the cookie-authenticated
endpoints, and every state change that matters is written to `AuditLog`.

Protected routes accept `authorization: Bearer <access token>`. Routes that resolve tenant scope
also accept `x-organization-id`, which only selects among memberships the user already holds —
never a scope the client invents.

Email verification and password reset messages go through the `EmailTransport` interface. The
development transport writes them to the API log (`EMAIL_TRANSPORT=log`) and is ignored in
production, where a provider implementation is required.

## Tenancy administration

| Method   | Endpoint                               | Purpose                                 | Gate               |
| -------- | -------------------------------------- | --------------------------------------- | ------------------ |
| `GET`    | `/api/v1/settings/organization`        | Read organization settings              | `settings.manage`  |
| `PATCH`  | `/api/v1/settings/organization`        | Update organization settings            | `settings.manage`  |
| `GET`    | `/api/v1/locations`                    | List locations                          | `settings.manage`  |
| `POST`   | `/api/v1/locations`                    | Create a location with default hours    | `settings.manage`  |
| `GET`    | `/api/v1/locations/:id`                | Read one location                       | `settings.manage`  |
| `PATCH`  | `/api/v1/locations/:id`                | Update tax mode, receipts, and contact  | `settings.manage`  |
| `GET`    | `/api/v1/locations/:id/business-hours` | Read the weekly opening hours           | `settings.manage`  |
| `PUT`    | `/api/v1/locations/:id/business-hours` | Replace the weekly opening hours        | `settings.manage`  |
| `GET`    | `/api/v1/members`                      | List members                            | `members.manage`   |
| `PATCH`  | `/api/v1/members/:id`                  | Change a member's role                  | `members.manage`   |
| `PATCH`  | `/api/v1/members/:id/status`           | Suspend, reactivate, or remove a member | `members.manage`   |
| `GET`    | `/api/v1/invitations`                  | List invitations                        | `members.manage`   |
| `POST`   | `/api/v1/invitations`                  | Invite someone by email                 | `members.manage`   |
| `DELETE` | `/api/v1/invitations/:id`              | Revoke an invitation                    | `members.manage`   |
| `POST`   | `/api/v1/invitations/accept`           | Accept an invitation (signed-in caller) | authenticated only |
| `GET`    | `/api/v1/audit`                        | Read the audit log, paginated           | `audit.read`       |

Membership guards stop you from changing your own role or status, and any change that would leave
the organization without an active owner is refused with `409 CONFLICT`. Cross-tenant record IDs
return `404`, never `403`.

Invitation links point at `/invitations/accept?token=…` in the web app. Only the token's SHA-256
hash is stored, links expire after `INVITATION_TTL_HOURS` (seven days by default), and acceptance
requires the signed-in account's email to match the invited address. Acceptance is the single
tenant write that runs without `withTenant`, because the acceptor cannot hold an active membership
yet.

## Documentation

- [docs/architecture.md](docs/architecture.md) — boundaries, request lifecycle, security controls
- [docs/authorization.md](docs/authorization.md) — roles, permissions, tenant isolation rules
- [docs/data-model.md](docs/data-model.md) — current schema and planned entities
- [docs/milestones.md](docs/milestones.md) — delivery order and exit criteria per milestone

## Scope notes

Phase 1 is staff-operated. Appointments are created and managed by salon employees; there is no
public booking, customer portal, or mobile application yet. Stripe Billing covers the salon's
GlamPro subscription and is separate from the POS "card" payment method, which only records that
a card payment was taken on the salon's own terminal.

The seeded owner account (`owner@glampro.local`) exists for local development only and shares the
development password in this document; change or delete it before any environment is reachable by
others.

All monetary values are stored as integer minor units, for example `5800` for `S$58.00`.
