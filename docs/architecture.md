# Architecture

## Guiding decisions

1. **Modular monolith.** One deployable API with clear module boundaries. Modules communicate
   through services, not by reaching into each other's data. This keeps transactions simple for
   POS and inventory work while leaving a path to extract services later.
2. **Organization-scoped by construction.** Every tenant-owned row carries `organizationId`, and
   location-owned rows also carry `locationId`. Scope is derived from the authenticated
   membership, never from a client-supplied identifier.
3. **Shared contracts.** Request and response shapes are defined once in Zod inside
   `@glampro/contracts` and consumed by both the API and the web client.
4. **Fail loudly at startup.** Environment variables and production secret requirements are
   validated before the server accepts traffic.
5. **Boring, auditable money handling.** Integer minor units, explicit payment records, and an
   audit trail for financial changes.

## Request lifecycle

```text
HTTP request
  │
  ├─ requestContext          assign/echo x-request-id
  ├─ pino-http               structured request log with requestId
  ├─ helmet                  security headers
  ├─ cors                    credentialed allowlist for WEB_ORIGIN only
  ├─ globalRateLimit         500 requests per 15 minutes per client
  ├─ express.json            body limit 1 MB
  ├─ express.urlencoded      body limit 100 KB
  ├─ cookieParser            read HTTP-only session cookies
  ├─ route handlers
  │    ├─ authenticate       verify access token, load auth context
  │    ├─ withTenant         resolve organization membership into request.tenant
  │    ├─ requirePermission  role-to-permission gate
  │    └─ validate           Zod parse of params, query, and body
  ├─ notFoundHandler         404 with the standard error envelope
  └─ errorHandler            AppError, ZodError, and unexpected errors
```

Raw-body routes such as the Stripe webhook must be registered before `express.json()`, or must
use their own parser, so signature verification sees the untouched payload.

## Module boundaries

```text
apps/api/src/
├── config/          env validation, logger
├── database/        Prisma client lifecycle
├── middleware/      cross-cutting request concerns
├── modules/<name>/  routes, service, schemas
└── shared/          errors, response helpers, small utilities
```

Rules:

- Routes own HTTP concerns only: parsing, status codes, response shaping.
- Services own business rules and database access. They receive an explicit organization context
  rather than reading it from global state.
- Services never import from another module's routes.
- Prisma is used only inside services and the database layer, never in routes.

## Data access

Prisma ORM 7 connects to MySQL through the `@prisma/adapter-mariadb` driver adapter rather than a
Rust query engine. Responsibilities are split deliberately:

- `apps/api/prisma/schema.prisma` declares models, enums, and the MySQL provider only. Prisma 7
  no longer accepts a datasource URL in schema files, so no connection string lives there.
- `apps/api/prisma.config.ts` supplies `DATABASE_URL` and `SHADOW_DATABASE_URL` to the Prisma CLI
  and registers the seed command, which Prisma 7 no longer runs automatically.
- `apps/api/src/database/prisma.ts` parses and validates `DATABASE_URL`, builds the adapter pool,
  and exports one `PrismaClient` instance. The instance is cached on `globalThis` outside
  production so watch mode does not open a new pool on every reload.
- `apps/api/src/generated/prisma` holds the generated client. It is build output, so it is
  git-ignored and excluded from linting and formatting; run `npm run db:generate` before
  typechecking or building.

Because `DATABASE_URL` is validated as a `mysql://` URL before the pool is created, a malformed
value fails at startup instead of on the first query.

## Security controls

| Control             | Implementation                                                          |
| ------------------- | ----------------------------------------------------------------------- |
| Password hashing    | bcrypt, cost 12, hashes stored in `UserCredential`                      |
| Session transport   | HTTP-only cookies; no tokens in `localStorage` or readable cookies      |
| Access tokens       | Short-lived JWTs signed with `ACCESS_TOKEN_SECRET`                      |
| Refresh tokens      | Rotated on every use; only hashes stored in `AuthSession`               |
| Reuse detection     | `AuthSession.tokenFamilyId` revocation on replay                        |
| Session revocation  | `revokedAt` plus device and IP metadata for a session list              |
| CSRF                | `SameSite` cookies plus an `x-csrf-token` header for state changes      |
| Headers             | Helmet defaults                                                         |
| CORS                | Single credentialed origin from `WEB_ORIGIN`, explicit header allowlist |
| Rate limiting       | Global limit plus tighter `authenticationRateLimit` for auth routes     |
| Request size limits | 1 MB JSON, 100 KB form-encoded                                          |
| Input validation    | Zod at the edge, shared with the client                                 |
| Authorization       | Central `requirePermission` middleware keyed off `request.tenant`       |
| Error handling      | Single handler; no stack traces outside development                     |
| Logging             | pino structured logs with request correlation                           |
| Audit trail         | `AuditLog` rows for security and business events                        |
| Shutdown            | Graceful shutdown on `SIGTERM`/`SIGINT` with a 10-second cap            |

Production startup refuses to boot if the development token secrets are still in place.

## Frontend structure

```text
apps/web/src/
├── app/          router and route table
├── components/   layout primitives (AppShell, PageHeader)
├── features/     one directory per module
├── lib/          typed API client, formatters
└── styles/       Tailwind entrypoint and component classes
```

The shell renders a responsive navy sidebar that collapses to a horizontal bar on small screens.
Permission-aware navigation will be driven by the authorization model rather than hard-coded role
checks in components.

## Response contract

Success responses return `{ data, meta }`. Failures return `{ error: { code, message, details? },
meta }`. Codes are stable identifiers such as `ROUTE_NOT_FOUND`, `VALIDATION_ERROR`,
`PERMISSION_DENIED`, `RATE_LIMITED`, and `AUTH_RATE_LIMITED`, so clients branch on codes rather
than messages.

## Theming

The visual direction follows the design handoff. Tokens live in `apps/web/tailwind.config.js`:
`canvas` (`#F3F4FA`), `ink` (`#1B2350`), `brand` (`#6144E4`), `brand-dark`, `muted`, `line`,
`success`, and `warning`. Reusable classes (`.panel`, `.eyebrow`, `.status-pill`) are declared in
`apps/web/src/styles/index.css` so screens compose rather than restyle.

## Environments

| Concern  | Development                          | Production                                   |
| -------- | ------------------------------------ | -------------------------------------------- |
| Database | Docker MySQL 8.4 on `127.0.0.1:3307` | Managed MySQL with backups and TLS           |
| Secrets  | Placeholder secrets in `.env`        | Injected secret manager values, min 32 chars |
| Cookies  | `Secure` off over plain HTTP         | `Secure` on, `SameSite=Lax` or `Strict`      |
| CORS     | `http://localhost:5173`              | Exact deployed web origin                    |
| Errors   | Include the underlying error message | Generic message only                         |

## Known gaps

- The initial migration is committed; create subsequent development migrations with
  `npm run db:migrate -- --name <migration-name>`.
- Email delivery for verification and password reset is not wired to a provider.
- Stripe Billing is modelled but not implemented; `STRIPE_*` variables are optional.
- Rate limiting is in-memory, so it must move to a shared store before running multiple API
  instances.
