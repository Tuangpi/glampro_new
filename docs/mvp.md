# The minimal-complete MVP

The full phase plan lives in [`roadmap.md`](roadmap.md). This file draws the smaller
boundary inside it that gets the product to **whole-system testable**: all eight rail
destinations open real screens backed by tenant data, and the end-to-end loop —
sign in → customer → sale → receipt → appointment → dashboard/reports → settings —
works against `make up-d`.

## The done definition

1. Every rail entry (`Dashboard`, `Sale`, `Appointments`, `Customers`, `Products`,
   `Staff`, `Reports`, `Settings`) renders tenant-scoped data from the API rather
   than placeholder copy. There is no Services rail entry ([ADR 0005](decisions/0005-rail-has-no-services-destination.md)).
2. The loop works in the browser: create a customer, ring a sale up for them with a
   cash/card/split tender, read the receipt back, book an appointment for them,
   complete it, and see the day's numbers move on the dashboard and in reports.
3. `npm run verify` exits 0 at every slice boundary, and [`STATE.md`](STATE.md) is
   updated in the same commit.
4. Nothing below the `### Deferred` lines in each slice is faked: an absent
   capability says it is absent (an empty list stays an empty list) rather than
   showing an invented number.

## The slices

One commit per slice, in this order. Each slice closes the phase slice named in
parentheses; the full phase each belongs to is finished later, by work outside
this file.

### M0 — this file (roadmap: no slice)

`docs/mvp.md` is created, `docs/roadmap.md` Phases 5–8 each gain an **MVP** paragraph
naming what the MVP takes and what it leaves for the full phase, and
`docs/STATE.md` §1 and §3 point here. Commit: `docs: freeze the MVP boundary`.

### M1 — POS `/sale` (Phases 5c/5d)

`pages/Sale.tsx` plus `components/sale/` (`SaleItemGrid`, `CartPanel`, `CartLine`,
`CustomerPicker`, `PaymentDialog`, `ReceiptView`), `hooks/useSale.ts`, entries in
`queryKeys.ts`, a route in `routes.tsx`, and the shell's "New sale" button wired to
it with the `openCart` badge counting lines. Flow: category tabs → search → grid →
cart (quantity, per-line staff) → tender (cash, card, split) → inline receipt.
No new contract: the screen reuses `createSaleSchema` and `saleItemSearchQuerySchema`.
Test: `__tests__/Sale.test.tsx`. The demo seed was wired in with this slice, because
the screen is only demonstrable against a populated catalogue: `seed.ts` now seeds the
branch/department/staff-service/customer rows `seed-data.ts` describes, idempotently and
inside `runAsTenant` (see [`STATE.md`](STATE.md) §3).

**Forced decision — service ↔ staff:** there is no service-to-staff mapping in the
schema or in the legacy database, and the MVP adds no table for one. The staff
picker on a service line offers staff **in the service's department**
(`User.departments` ∩ `Service.departmentId`); the line's stored `staffId` is
whatever the cashier picks. Product lines take no performer: the sale's own
`staffId` (who rang it up) attributes them. A real skill matrix is full-phase work.

#### Deferred (full Phase 5)

Sale hold/resume and void from the till, line discounts, receipt printing, cart
persistence across reloads, keyboard shortcuts for the cashier.

### M2 — `/appointments` (Phase 6)

Shared `schemas/appointment.ts`; `appointment.service.ts` + `appointments.routes.ts`
(list by range, read one, create, update, complete); mount in `app.ts`.
`useAppointments.ts`, `pages/Appointments.tsx`,
`components/appointments/AppointmentFormDrawer.tsx`. Record the staff-filtering
M1 decision's twin — staff offered are those in the service's department — as an
ADR.

#### Deferred (full Phase 6)

The calendar grid with drag-to-reschedule, availability and clash detection,
shifts and leave in the booking path, the staff skill matrix, reminders.

### M3 — dashboard + `/reports` (Phase 7)

Shared `schemas/report.ts`; `report.service.ts` + `reports.routes.ts`;
a real `Dashboard.tsx` (today's income, today's appointments, new customers,
low stock); `pages/Reports.tsx` with a date range and two to three tables;
`useReports.ts`. **The tiles need no entitlement**: `/api/reports` is mounted behind
the core `dashboard` module, so every salon has a dashboard — the `reports` add-on
guards screen 10's wider tables, and the seed gains it if and when `pages/Reports.tsx`
reads one of those.

_Landed 2026-10-08:_ the whole server half (`schemas/report.ts`,
`report.service.ts`, `reports.routes.ts`) and the four tiles in `Dashboard.tsx`.
_Still to do:_ `pages/Reports.tsx`, `useReports.ts` and the `Reports` rail entry.

#### Deferred (full Phase 7)

The full report catalogue, CSV/PDF export, charts, scheduled reports.

### M4 — `/settings` (Phase 8)

Shared `schemas/settings.ts`; `settings.service.ts` + `settings.routes.ts`;
`useSettings.ts`; `pages/Settings.tsx` with the salon profile (read/edit), a
read-only modules panel, and a staff/roles summary.

#### Deferred (full Phase 8)

Business hours editing, tax and receipt configuration, notifications, user and
role management beyond the summary, integrations.

## Explicitly outside the MVP

- The platform console (unscheduled in the roadmap; needs a phase and criteria).
- The Phase 9 importer and everything it owns: ADR 0002, Q2, Q5, Q6, Q27, Q28.
- Anything the schema cannot back yet: shifts (Phase 6 deferral), ratings, the
  customer archive question (Q28).
