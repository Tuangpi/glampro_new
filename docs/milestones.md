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
| 5   | Customers and staff         | Done    |
| 6   | Appointments                | Done    |
| 7   | Point of sale               | Done    |
| 8   | Reports and dashboard       | Done    |
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

## 5. Customers and staff — done

- Customer profiles behind `customers.manage`, readable with `customers.read`: name, email, phone,
  date of birth, gender, address, an optional member number for loyalty or legacy cards, and an
  `isActive` soft archive.
- Email, phone, and member number are unique per organization when present, so two tenants can
  record the same person; a duplicate reads as `409`.
- Append-only customer notes with the author, rendered as a timeline on the customer screen; the
  author column is nullable so the note survives the removal of the member who wrote it.
- Staff profiles behind `staff.manage`, readable with `staff.read`. A profile hangs off an existing
  `ACTIVE` membership — `membershipId` is unique — so identity stays on the membership and the
  roster never becomes a second directory.
- `GET /staff/candidates` lists active memberships without a profile, so a manager can start one
  without holding `members.manage`.
- Staff-to-service assignments replaced as a full set, a weekly schedule replaced as a full week
  (same shape as business hours, `422` on an invalid week), and dated time off underneath it.
- Guards: a foreign profile, service, or membership reads as `404`; a second profile for one member
  and a profile for a non-active member read as `409`; the hire and end dates cannot invert.
- Audit entries for customer updates and notes, profile creation and updates, service replacement,
  week replacement, and time-off creation and removal.
- Web `Customers` module (book, profile, and note timeline) and `Staff` module (profiles, services,
  schedule, and time off tabs), each gated by the permission it needs.

Deliberately not in this milestone: visit history, which is derived from appointments (milestone 6)
and sales (milestone 7); per-location staff schedules; and any approval workflow on time off. A
membership that is suspended or removed later does not delete the profile — the roster marks it
as no longer an active member.

Exit criteria met: `apps/api/tests/customers.test.ts` and `apps/api/tests/staff.test.ts` cover the
401/403/cross-tenant-404 matrix for every new endpoint, the duplicate and foreign-key conflicts,
the schedule replacement, and the time-off lifecycle;
`packages/contracts/src/schemas/people.test.ts` covers the shared request and summary shapes; and
`npm test`, `npm run lint`, and `npm run build` pass across all three workspaces.

## 6. Appointments — done

- `Appointment`, `AppointmentService`, and `AppointmentStatusHistory`, tenant-scoped and
  location-owned, behind `appointments.manage` and readable with `appointments.read`.
- A booking snapshots the name, duration, and price of every service on the visit, and the visit's
  end time and totals come from those snapshots, so a later catalog edit cannot move or reprice an
  existing booking.
- Availability for one stylist on one local day: the location's business hours intersected with the
  staff member's week, minus recorded absences and visits that still hold their slot, offered in
  fixed steps where the whole visit must fit. `GET /appointments/availability` echoes the resolved
  window, and reports an empty list on a closed day or a day the stylist does not work.
- Wall-clock hours are converted by `apps/api/src/shared/zoned-time.ts`, which reads the location's
  IANA zone through `Intl` and resolves the offset twice so a daylight-saving change cannot shift a
  booking. No date library was added.
- Guards: a foreign appointment, location, customer, staff member, or service reads as `404`; two
  overlapping visits for one stylist, a visit inside a recorded absence, an unavailable service, and
  a service the stylist does not perform read as `409`; a booking with no duration reads as `422`.
- Status moves follow the shared `appointmentStatusTransitions` map: steps may be skipped — a walk-in
  goes straight from `SCHEDULED` to `COMPLETED` — nothing moves backwards, and a completed,
  cancelled, or no-show visit accepts nothing further. Every move appends a row to the visit's own
  trail, and cancelling also records when and why.
- Calendar reads: `date` plus `locationId` returns one local day and echoes its window, `from`/`to`
  returns an instant range, and neither returns the most recent visits, which is what the customer
  screen reads as visit history.
- Audit entries for booking, editing, replacing the services, and every status change.
- Web `Calendar` module: the day's diary beside the booking form and the selected visit, with the day
  read in the location's zone, the start time picked from the availability endpoint, status actions
  limited to the moves the API allows, and the status trail on the visit.

Deliberately not in this milestone: a week or month grid, drag-and-drop rescheduling, recurring
visits, and any public booking page — Phase 1 is staff-operated, so the front desk books. Times
outside business hours are accepted rather than refused, which [data-model.md](data-model.md)
records: availability hides them, and a walk-in after closing can still be written down.

Exit criteria met: `apps/api/tests/appointments.test.ts` covers the 401/403/cross-tenant-404 matrix
for every endpoint, the snapshot stability, the double-booking and absence conflicts, the
availability cases (a closed day, a non-working day, an existing visit, an absence, and a duration
that no longer fits), the status matrix with its trail, and the reschedule guards;
`apps/api/src/shared/zoned-time.test.ts` covers the zone arithmetic including a daylight-saving day;
`packages/contracts/src/schemas/appointments.test.ts` covers the shared request, query, and read
shapes; and `npm test`, `npm run lint`, and `npm run build` pass across all three workspaces.

## 7. Point of sale — done

Cart with services, products, and staff attribution, split payments across cash, PayNow, and card,
per-location receipt numbering inside the sale transaction, and void/refund flows with audit entries.
The API snapshots catalog values, rejects client-side totals that do not match the server calculation,
writes `SALE` inventory movements, and reverses tracked products through `RETURN` movements. Full
refunds automatically return every remaining tracked product; partial refunds record their returned
quantities. The web `/sales` module includes catalog search, cart controls, split tender entry,
receipt history, and permission-gated void/refund controls.

Exit criteria met: `apps/api/tests/sales.test.ts` covers the 401/403/cross-tenant-404 matrix,
split-payment totals, receipt sequencing, insufficient-stock rollback, voids, partial refunds, and full
refund stock returns; `packages/contracts/src/schemas/sales.test.ts` covers request, query, and
receipt shapes; and `apps/web/src/features/sales/saleView.test.ts` covers cart totals and money
formatting. The POS intentionally records card/PayNow terminal events only and does not integrate a
payment gateway.

## 8. Reports and dashboard — done

- Shared, bounded report queries and response contracts for a dashboard day and inclusive ranges of up
  to 366 local calendar days.
- Tenant- and location-scoped live dashboard KPIs, diary, receipts, and top items behind
  `reports.view`, plus a reduced operational home for roles that do not hold that permission.
- Revenue reporting for non-voided gross sales, current refunds, net sales, average ticket, daily trend,
  and top snapshotted items.
- Appointment outcomes, rates, service demand, booked/completed minutes, and peak local hours.
- Event-time tender and refund movement by payment method, including negative method totals when refunds
  exceed tenders in the selected period.
- Staff appointment, customer, service-time, and explicitly attributed gross service-line reporting.
- Responsive reports UI with location/date controls, Today/7/30/90-day presets, charts, tables, and
  loading, error, and empty states. No chart dependency was added.

Deliberately not in this milestone: exports, scheduled reports, forecasts, commission/payroll rules,
persisted report snapshots, and aggregation across locations with different currencies.

Exit criteria met: `apps/api/tests/reports.test.ts` covers the 401/403/cross-tenant-404 matrix,
range validation, UTC-boundary handling, void and partial-refund revenue, split tenders and refund methods,
appointment outcomes, and staff attribution; `packages/contracts/src/schemas/reports.test.ts` and
`apps/web/src/features/reports/reportView.test.ts` cover shared shapes, presets, chart scaling, and
duration formatting. The focused API/web/contracts suites and the repository quality gates pass.

## 9. Billing and platform admin

Stripe Billing for the salon's GlamPro subscription, subscription-status gating of the API, and a
separate platform-admin surface for GlamPro staff.

## Cross-cutting work

These are not milestones of their own but must land before production traffic:

- An email provider behind the existing `EmailTransport` interface (verification and reset links).
- A shared rate-limit store so the API can run more than one instance.
- CI running lint, typecheck, tests, and build on every change.
- Managed MySQL with backups, TLS, and a documented restore drill.
