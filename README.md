# GlamPro (new)

A multi-tenant SaaS platform for salon operations: appointments, point of sale, staff,
inventory, and reporting, sold to salon businesses as a subscription.

This repository is a fresh start. The previous Laravel application is kept only as a
reference for business rules and workflow; no code is shared.

## Status

Milestones 1 to 9 are in place; see [docs/milestones.md](docs/milestones.md) for the delivery record.

- npm workspaces monorepo with the web app, API, shared contracts, and shared tooling config
- Express 5 + TypeScript API with security middleware, request correlation, and a standard
  response envelope
- Prisma schema covering tenancy, identity, sessions, invitations, subscriptions, catalog,
  inventory, customers, staff, appointments, sales, payments, refunds, and audit logs
- Authentication: registration, login, refresh-token rotation with reuse detection, logout,
  session listing and revocation, password reset, and email verification
- `authenticate`, `withTenant`, `requirePermission`, `validate`, and CSRF guards for every module
  that follows
- Tenancy administration: organization and location settings, business hours, member roles and
  status, invitations with single-use email links, and a tenant-scoped audit log viewer
- Catalog and inventory: service and product categories, services and products with availability,
  per-location stock levels, and an append-only inventory movement ledger
- Customers and staff: tenant-scoped customer profiles with an append-only note timeline, staff
  profiles attached to active memberships, staff-to-service assignments, weekly schedules, and time
  off
- Appointments: a day calendar with per-visit service snapshots, availability derived from business
  hours and the staff week, guarded status transitions, and a per-visit status trail
- Point of sale: mixed service/product carts, optional customer and staff attribution, split cash,
  PayNow, card, and other payments, per-location receipts, inventory-backed sales, and refunds/voids
- Reports and dashboard: live location-day KPIs plus revenue, appointment, payment, and staff reports,
  all calculated from tenant-scoped transaction history in the location's time zone
- Billing and platform administration: Stripe Checkout and Customer Portal sessions for the salon
  subscription, signed and idempotent Stripe webhooks, subscription-status tenant gating, audited
  cross-tenant organization controls, and a role-gated platform-admin screen
- React 19 + TypeScript + Vite + Tailwind shell with a session provider, protected routes, and
  permission-aware navigation
- Zod contracts shared between the API and the web client
- Vitest suites for the API, the web app, and the contracts, including tenant-isolation tests

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
│   │   │   ├── modules/        Feature modules (health, auth, catalog, tenancy)
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

## Billing and platform administration

| Method  | Endpoint                                          | Purpose                                             | Gate             |
| ------- | ------------------------------------------------- | --------------------------------------------------- | ---------------- |
| `GET`   | `/api/v1/billing`                                 | Read the tenant-safe subscription summary           | `billing.manage` |
| `POST`  | `/api/v1/billing/checkout`                        | Create a Stripe subscription Checkout session       | `billing.manage` |
| `POST`  | `/api/v1/billing/portal`                          | Create a Stripe Customer Portal session             | `billing.manage` |
| `POST`  | `/api/v1/billing/webhook`                         | Verify and process a signed Stripe event            | Stripe signature |
| `GET`   | `/api/v1/platform/overview`                       | Read cross-tenant organization and billing totals   | `PLATFORM_ADMIN` |
| `GET`   | `/api/v1/platform/organizations`                  | Search organizations and their latest subscriptions | `PLATFORM_ADMIN` |
| `PATCH` | `/api/v1/platform/organizations/:id/status`       | Suspend, activate, or cancel an organization        | `PLATFORM_ADMIN` |
| `PATCH` | `/api/v1/platform/organizations/:id/subscription` | Pause, resume, or cancel its subscription           | `PLATFORM_ADMIN` |

Tenant billing routes use the authenticated membership as their scope and remain reachable while an
organization is paused or cancelled, so the owner can recover through Stripe. Other tenant routes
are refused by `withTenant` for `PAUSED`, `CANCELLED`, or `INCOMPLETE` subscriptions. Platform routes
are authenticated independently and require `User.platformRole = PLATFORM_ADMIN`; every platform
action requires a reason and is audited.

The webhook is mounted before JSON parsing, records each unique Stripe event before applying side
effects, and retries are safe. Stripe identifiers are never included in the tenant-facing summary;
the web client only sees plan/status, dates, and booleans indicating whether provider identifiers
exist.

## Catalog and inventory

| Method  | Endpoint                         | Purpose                                 | Gate               |
| ------- | -------------------------------- | --------------------------------------- | ------------------ |
| `GET`   | `/api/v1/service-categories`     | List service categories                 | `services.read`    |
| `POST`  | `/api/v1/service-categories`     | Create a service category               | `services.manage`  |
| `PATCH` | `/api/v1/service-categories/:id` | Rename or reorder a service category    | `services.manage`  |
| `GET`   | `/api/v1/services`               | List services, optionally by category   | `services.read`    |
| `POST`  | `/api/v1/services`               | Create a service                        | `services.manage`  |
| `GET`   | `/api/v1/services/:id`           | Read one service                        | `services.read`    |
| `PATCH` | `/api/v1/services/:id`           | Update price, duration, or availability | `services.manage`  |
| `GET`   | `/api/v1/product-categories`     | List product categories                 | `products.read`    |
| `POST`  | `/api/v1/product-categories`     | Create a product category               | `products.manage`  |
| `PATCH` | `/api/v1/product-categories/:id` | Rename or reorder a product category    | `products.manage`  |
| `GET`   | `/api/v1/products`               | List products, optionally by category   | `products.read`    |
| `POST`  | `/api/v1/products`               | Create a product                        | `products.manage`  |
| `GET`   | `/api/v1/products/:id`           | Read one product                        | `products.read`    |
| `PATCH` | `/api/v1/products/:id`           | Update price, cost, SKU, or tracking    | `products.manage`  |
| `GET`   | `/api/v1/inventory/levels`       | Stock on hand, optionally per location  | `inventory.read`   |
| `GET`   | `/api/v1/inventory/movements`    | Movement ledger, optionally per product | `inventory.read`   |
| `POST`  | `/api/v1/inventory/movements`    | Record a stock adjustment               | `inventory.adjust` |

Prices and costs travel as integer cents. Category names are unique per organization, and a SKU is
unique per organization when one is given. Stock is never edited directly: `POST
/inventory/movements` appends a ledger row and applies its signed effect to the level inside one
transaction. `ADJUST_IN`, `RETURN`, and `INITIAL_STOCK` add stock; `ADJUST_OUT`, `SALE`, `DAMAGE`,
`EXPIRY`, and `STOCK_CORRECTION` remove it. An adjustment that would leave a level below zero is
refused with `409 CONFLICT`, and a product that does not track inventory refuses movements the same
way. `SALE` rows are reserved for the point of sale.

## Customers and staff

| Method   | Endpoint                                | Purpose                                | Gate                  |
| -------- | --------------------------------------- | -------------------------------------- | --------------------- |
| `GET`    | `/api/v1/customers`                     | Search the customer book               | `customers.read`      |
| `POST`   | `/api/v1/customers`                     | Create a customer profile              | `customers.manage`    |
| `GET`    | `/api/v1/customers/:id`                 | Read one customer with their notes     | `customers.read`      |
| `PATCH`  | `/api/v1/customers/:id`                 | Update a profile                       | `customers.manage`    |
| `GET`    | `/api/v1/customers/:id/notes`           | Read the note timeline                 | `customers.read`      |
| `POST`   | `/api/v1/customers/:id/notes`           | Append a note                          | `customers.manage`    |
| `GET`    | `/api/v1/staff`                         | List the roster, optionally by service | `staff.read`          |
| `POST`   | `/api/v1/staff`                         | Create a profile for an active member  | `staff.manage`        |
| `GET`    | `/api/v1/staff/candidates`              | Active members without a profile       | `staff.manage`        |
| `GET`    | `/api/v1/staff/:id`                     | Read a profile with services and week  | `staff.read`          |
| `PATCH`  | `/api/v1/staff/:id`                     | Update job title, colour, or dates     | `staff.manage`        |
| `GET`    | `/api/v1/staff/:id/services`            | Read the assigned services             | `staff.read`          |
| `PUT`    | `/api/v1/staff/:id/services`            | Replace the assignment set             | `staff.manage`        |
| `GET`    | `/api/v1/staff/:id/schedule`            | Read the weekly schedule               | `staff.read`          |
| `PUT`    | `/api/v1/staff/:id/schedule`            | Replace the whole week                 | `staff.manage`        |
| `GET`    | `/api/v1/staff/:id/time-off`            | List recorded absences                 | `staff.read`          |
| `POST`   | `/api/v1/staff/:id/time-off`            | Record an absence                      | `staff.manage`        |
| `DELETE` | `/api/v1/staff/:id/time-off/:timeOffId` | Remove an absence                      | `staff.manage`        |
| `GET`    | `/api/v1/appointments`                  | Read the calendar or visit history     | `appointments.read`   |
| `GET`    | `/api/v1/appointments/availability`     | Free slots for one stylist and day     | `appointments.read`   |
| `GET`    | `/api/v1/appointments/:id`              | Read one visit with its status trail   | `appointments.read`   |
| `POST`   | `/api/v1/appointments`                  | Book a visit                           | `appointments.manage` |
| `PATCH`  | `/api/v1/appointments/:id`              | Reschedule, change stylist, or note    | `appointments.manage` |
| `PUT`    | `/api/v1/appointments/:id/services`     | Replace the visit's services           | `appointments.manage` |
| `PATCH`  | `/api/v1/appointments/:id/status`       | Move the visit to another status       | `appointments.manage` |

A customer's email, phone, and member number are each unique per organization when present, so the
same person can be recorded by two tenants, while a duplicate inside one tenant reads as `409`.
Notes are append-only and keep their text even if the member who wrote them is later removed. A
staff profile is a 1:1 extension of an `ACTIVE` organization membership — created with `POST
/staff`, which names the membership — so a person's name and email are never copied onto the roster.
`GET /staff/candidates` exists because `staff.manage` does not imply `members.manage`: a manager
needs the member list to start a profile. Service assignments and the weekly schedule are replaced
as whole sets, and a foreign profile, service, or membership ID reads as `404`.

An appointment carries one stylist and one or more services, each snapshotted with the name,
duration, and price used at booking time, so a later catalog edit cannot move or reprice it. The
visit's end time comes from those snapshots. `GET /appointments/availability` intersects the
location's business hours with the stylist's week, subtracts recorded absences and visits that still
hold their slot, and offers the remainder in fixed steps where the whole visit fits. Two overlapping
visits for one stylist, and a visit inside a recorded absence, read as `409`; times outside business
hours are accepted, because a walk-in after closing still has to be written down. Status moves follow
the transitions declared in `@glampro/contracts`, skipping ahead is allowed (a walk-in can be booked
and completed in one step), and nothing moves backwards out of `COMPLETED`, `CANCELLED`, or
`NO_SHOW`. Times are read and written in the location's zone rather than the caller's, using
`apps/api/src/shared/zoned-time.ts`.

## Point of sale

The sales module is a tenant-scoped cashier workflow. A sale snapshots its service/product lines and
payment tenders, allocates the next receipt number for the location, and updates tracked inventory
inside the same transaction. Card and PayNow rows record that a salon terminal completed a payment;
the API does not store card numbers or contact a payment gateway.

| Method | Endpoint                    | Purpose                                        | Gate           |
| ------ | --------------------------- | ---------------------------------------------- | -------------- |
| `GET`  | `/api/v1/sales`             | List recent sales for a location or customer   | `sales.read`   |
| `GET`  | `/api/v1/sales/:id`         | Read one receipt, payments, and reversals      | `sales.read`   |
| `POST` | `/api/v1/sales`             | Create a mixed cart and complete payment       | `sales.create` |
| `POST` | `/api/v1/sales/:id/void`    | Void a completed sale and return tracked stock | `sales.void`   |
| `POST` | `/api/v1/sales/:id/refunds` | Record a full or partial refund                | `sales.refund` |

The browser checkout uses the shared Zod contracts, calculates a preview for the current catalog, and
lets the API remain authoritative for prices, discounts, payment totals, stock, and receipt numbers.
Tracked products create `SALE` inventory movements when sold and `RETURN` movements when voided or
refunded. Full refunds automatically return every remaining tracked product; partial refunds can
return selected quantities through the API contract.

## Reports and dashboard

Reporting is live rather than snapshotted. Every read is scoped to one active location and a bounded
inclusive local date range of at most 366 days; the API converts the range through that location's
IANA time zone before querying UTC instants.

| Method | Endpoint                       | Purpose                                              | Gate           |
| ------ | ------------------------------ | ---------------------------------------------------- | -------------- |
| `GET`  | `/api/v1/dashboard`            | Live KPIs, diary, receipts, and top items for a day  | `reports.view` |
| `GET`  | `/api/v1/reports/revenue`      | Gross/net sales, refunds, average ticket, and trends | `reports.view` |
| `GET`  | `/api/v1/reports/appointments` | Outcomes, rates, service demand, and peak hours      | `reports.view` |
| `GET`  | `/api/v1/reports/payments`     | Tender and refund movement by payment method         | `reports.view` |
| `GET`  | `/api/v1/reports/staff`        | Appointments, service time, customers, and sales     | `reports.view` |

Voided sales are excluded. Gross sales are the recorded non-voided sale totals; net sales subtract each
sale's currently recorded refunded amount, and average ticket divides net sales by the non-voided sale
count. The payment report is event-based: tenders use `SalePayment.createdAt`, refunds use
`SaleRefund.createdAt`, and a method can be negative when refunds in the period exceed its tenders.
Staff sales count gross service lines explicitly attributed to a profile; refund money is not allocated
to staff because the current refund ledger does not assign a monetary amount or employee to a line.

Owners, administrators, and managers receive the full dashboard. Roles without `reports.view` keep an
operational home containing the day's diary and recent receipts through their existing appointment and
sales permissions, without salon-wide financial aggregates. The reports page has Today, 7-day, 30-day,
and 90-day presets, manual dates, responsive charts, and explicit loading, empty, and error states.
Exports, forecasting, persisted report snapshots, and cross-location currency aggregation are not part
of this milestone.

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

The seeded owner account (`owner@glampro.local`) and the seeded stylist (`stylist@glampro.local`)
exist for local development only and share the development password in this document; change or
delete them before any environment is reachable by others.

All monetary values are stored as integer minor units, for example `5800` for `S$58.00`.
