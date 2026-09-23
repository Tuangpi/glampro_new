# Milestones

Delivery order for GlamPro. Every milestone ships with integration tests and a documentation
update before the next one starts, and each builds on the foundations described in
[architecture.md](architecture.md).

| #   | Milestone                   | State   |
| --- | --------------------------- | ------- |
| 1   | Foundation                  | Done    |
| 2   | Authentication and sessions | Done    |
| 3   | Tenancy administration      | Done    |
| 4   | Catalog and inventory       | Done    |
| 5   | Customers and staff         | Next    |
| 6   | Appointments                | Planned |
| 7   | Point of sale               | Planned |
| 8   | Reports and dashboard       | Planned |
| 9   | Billing and platform admin  | Planned |

## 1. Foundation — done

npm workspaces monorepo, Express 5 API with security middleware and the standard response
envelope, Prisma 7 schema and initial migration, shared Zod contracts, React 19 web shell, and
Vitest suites.

## 2. Authentication and sessions — done

- `authenticate`, `withTenant`, `requirePermission`, `validate`, and the CSRF guard.
- Registration that creates the organization, first location, business hours, owner membership,
  and a trial subscription in one transaction.
- Login, refresh-token rotation with reuse detection, logout, session listing and revocation.
- Password reset and email verification with single-use hashed tokens.
- Audit entries for registration, login outcomes, rotation, logout, reset, and verification.
- Web session provider, protected routes, login/register/reset/verify screens, and
  permission-aware navigation.

Exit criteria met: `npm test` covers the 401/403/cross-tenant-404 matrix and the rotation and
reuse cases, and the seeded owner can sign in against the local MySQL container.

## 3. Tenancy administration — done

- Organization settings (legal and GST details, timezone) behind `settings.manage`.
- Location settings behind `settings.manage`: tax mode, receipt prefix (the receipt counter stays
  server-managed), address and contact fields, plus location creation with default business hours.
- Per-location business hours as a full-week replacement, validated against the shared contract.
- Member management behind `members.manage`: role changes, suspend/reactivate/remove, with guards
  against changing your own membership and against leaving the organization without an owner.
- Invitations: single-use SHA-256-hashed tokens delivered through `EmailTransport`, expiry from
  `INVITATION_TTL_HOURS`, duplicate and already-a-member conflicts, and revocation.
- Invitation acceptance runs on `authenticate` alone — the acceptor has no membership yet — and
  requires the signed-in email to match the invitation.
- Audit log viewer behind `audit.read`, paginated and scoped to the organization.

Exit criteria met: `apps/api/tests/tenancy.test.ts` covers the 401/403/cross-tenant-404 matrix for
every new endpoint, invitation acceptance is tested end to end through to the permissions returned
by `/auth/me`, and `npm test` passes across all three workspaces.

## 4. Catalog and inventory — done

- Service categories and services behind `services.manage`, readable with `services.read`: name,
  description, duration in minutes, price in cents, sort order, and availability.
- Product categories and products behind `products.manage`, readable with `products.read`: optional
  per-organization SKU, price, cost, inventory-tracking flag, and availability.
- Inventory levels per product and location, readable with `inventory.read`.
- Stock adjustments behind `inventory.adjust`, recorded as append-only `InventoryMovement` rows with
  an optional reason and the performer, applied to the level inside one transaction.
- Guards: category names are unique per organization, SKUs are unique per organization when present,
  a rejected cross-tenant category or product reads as `404`, an adjustment that would drive stock
  below zero reads as `409`, and a product that does not track inventory refuses movements.
- A tracked product starts with a zero-stock level row per active location, and turning tracking on
  later backfills the same rows inside the update transaction.
- Audit entries for category, service, and product changes plus every inventory movement.
- Web `Products & inventory` module with Services, Products, and Inventory tabs, gated by the read
  permission each tab needs.

Exit criteria met: `apps/api/tests/catalog.test.ts` covers the 401/403/cross-tenant-404 matrix for
every new endpoint, the signed movement ledger, the below-zero guard, and the zero-stock seeding;
`packages/contracts/src/schemas/catalog.test.ts` covers the shared request and summary shapes; and
`npm test` passes across all three workspaces.

## 5. Customers and staff

Customer profiles with visit history and notes, staff profiles, staff-to-service assignments,
weekly schedules, and time off.

## 6. Appointments

Calendar with status transitions (`SCHEDULED` to `COMPLETED`, `CANCELLED`, `NO_SHOW`),
availability derived from business hours and staff schedules, snapshot pricing and duration on
each appointment service, and a status history trail.

## 7. Point of sale

Cart with services, products, and staff attribution, split payments across cash, PayNow, and
card, per-location receipt numbering inside the sale transaction, and void/refund flows with
audit entries.

## 8. Reports and dashboard

Live dashboard KPIs and revenue, appointment, payment, and staff reporting, replacing the sample
figures currently shown on the dashboard.

## 9. Billing and platform admin

Stripe Billing for the salon's GlamPro subscription, subscription-status gating of the API, and a
separate platform-admin surface for GlamPro staff.

## Cross-cutting work

These are not milestones of their own but must land before production traffic:

- An email provider behind the existing `EmailTransport` interface (verification and reset links).
- A shared rate-limit store so the API can run more than one instance.
- CI running lint, typecheck, tests, and build on every change.
- Managed MySQL with backups, TLS, and a documented restore drill.
