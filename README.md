# GlamPro (new)

A multi-tenant SaaS platform for salon operations: appointments, point of sale, staff,
inventory, and reporting, sold to salon businesses as a subscription.

This repository is a fresh start. The previous Laravel application is kept only as a
reference for business rules and workflow; no code is shared.

## Status

Milestone 1 (foundation) is in place:

- npm workspaces monorepo with the web app, API, shared contracts, and shared tooling config
- Express 5 + TypeScript API with security middleware, request correlation, and a standard
  response envelope
- Prisma schema covering tenancy, identity, sessions, invitations, subscriptions, and audit logs
- React 19 + TypeScript + Vite + Tailwind shell inspired by the design handoff
- Zod contracts shared between the API and the web client
- Vitest suites for the API and the web app

Feature modules (appointments, POS, inventory, reports) are intentionally not implemented yet.
Routes exist as placeholders and will be built against the foundations described in
[docs/architecture.md](docs/architecture.md).

## Stack

| Layer     | Choice                                                               |
| --------- | -------------------------------------------------------------------- |
| Frontend  | React 19, TypeScript, Vite, Tailwind CSS, React Router, lucide-react |
| Backend   | Node.js 22+, Express 5, TypeScript                                   |
| Database  | MySQL 8.4 with Prisma ORM 7 and the MariaDB driver adapter           |
| Contracts | Zod schemas shared through `@glampro/contracts`                      |
| Testing   | Vitest, Supertest                                                    |
| Quality   | ESLint flat config, Prettier                                         |

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

## Documentation

- [docs/architecture.md](docs/architecture.md) — boundaries, request lifecycle, security controls
- [docs/authorization.md](docs/authorization.md) — roles, permissions, tenant isolation rules
- [docs/data-model.md](docs/data-model.md) — current schema and planned entities

## Scope notes

Phase 1 is staff-operated. Appointments are created and managed by salon employees; there is no
public booking, customer portal, or mobile application yet. Stripe Billing covers the salon's
GlamPro subscription and is separate from the POS "card" payment method, which only records that
a card payment was taken on the salon's own terminal.

All monetary values are stored as integer minor units, for example `5800` for `S$58.00`.
