# Milestones

Delivery order for GlamPro. Every milestone ships with integration tests and a documentation
update before the next one starts, and each builds on the foundations described in
[architecture.md](architecture.md).

| #   | Milestone                   | State   |
| --- | --------------------------- | ------- |
| 1   | Foundation                  | Done    |
| 2   | Authentication and sessions | Done    |
| 3   | Tenancy administration      | Next    |
| 4   | Catalog and inventory       | Planned |
| 5   | Customers and staff         | Planned |
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

## 3. Tenancy administration — next

Organization and location settings (tax mode, receipt numbering, business hours), member
management with invitations and role changes, membership suspension, and the audit log viewer.

Exit criteria: `members.manage` and `settings.manage` gates on every endpoint, invitation
acceptance tested end to end, and tenant-isolation tests for each new endpoint.

## 4. Catalog and inventory

Service categories and services (duration, price, tax), product categories and products, stock
levels per location, and an append-only inventory movement ledger with adjustment reasons.

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
