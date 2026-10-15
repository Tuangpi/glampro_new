# 0013 — An appointment takes its duration and its performer from the service

- **Status:** Accepted
- **Date:** 2026-10-08
- **Deciders:** MVP slice M2 (the booking form and `POST /api/appointments`)
- **Related:** [`../mvp.md`](../mvp.md) (M1 and M2), [`../STATE.md`](../STATE.md) §3,
  [`../legacy/reference/legacy-schema.md`](../legacy/reference/legacy-schema.md),
  [`../../apps/api/src/services/appointment.service.ts`](../../apps/api/src/services/appointment.service.ts)

## Evidence review — 2026-10-15

The accepted service-derived policy below is preserved. Current implementation
needs these qualifications; this review does not approve the discrepancies as new
policy or change application behavior. Missing historical sources are explained
in the [ADR index](README.md#historical-references-and-current-scope).

- **Duration has a default, and extra input is ignored rather than rejected.**
  [`appointment.service.ts`](../../apps/api/src/services/appointment.service.ts)
  resolves a tenant-scoped service and uses its duration, falling back to **60
  minutes** when it is null. The booking drawer uses the same fallback for its
  preview. This is not a missing-duration refusal, despite the comment in
  [`catalogue.ts`](../../packages/shared/src/schemas/catalogue.ts).
  [`appointment.ts`](../../packages/shared/src/schemas/appointment.ts) requires a
  service on create and omits duration/end-time inputs on create and update, but
  its non-strict object schemas strip unknown keys: a client can send those keys;
  they do not reach the service through the validated routes. Six database-free
  contract assertions confirmed the required service, unassigned create, stripped
  duration/end-time keys on both paths, explicit unassignment and service-only patch.
- **Open correctness issue — snapshot versus refresh on every patch.**
  [`schema.prisma`](../../apps/api/prisma/schema.prisma) and the shared appointment
  contract describe duration as a booking-time snapshot. `updateAppointment`
  instead reloads the current catalogue service and rewrites `durationMinutes`
  and `endsAt` on every patch, including comment/status-only edits. A catalogue
  duration change therefore takes effect on the next unrelated edit, and current
  department membership is rechecked too. Decide explicitly when the snapshot
  should be retained or replaced; do not treat this as an approved snapshot policy.
- **Open correctness issue — resizing can bypass clash validation.** The update
  path calls `assertNoClash` only when `startsAt` or `staffId` is supplied. A
  service-only patch, or an unrelated patch after the catalogue duration changes,
  can extend the window without checking its new end against another booking.
  This conflicts with [ADR 0014](0014-double-booked-staff-are-refused.md)'s refusal
  policy. It is a control-flow finding, not a database-backed reproduction; add
  regression coverage for both resize paths when implementing the fix.
- **Eligibility is tenant existence plus department, not active-status parity.**
  `assertPerformerEligible` permits an existing tenant user when the service has
  no department, otherwise requires its department link. Missing staff/service
  rows produce `404`; a department mismatch produces `400` with code
  `STAFF_NOT_IN_DEPARTMENT`, but **no `body.staffId` detail**, contrary to decision
  item 2 and Enforcement below. The drawer therefore displays a form-level error.
  It requests active staff and active services, while these server lookups do not
  check `User.disabled` or service status. The claim that the API refuses everything
  the picker would not offer is too strong. Active-status policy remains open.
- **Browser narrowing and the till asymmetry remain implemented.**
  [`AppointmentFormDrawer.tsx`](../../apps/web/src/components/appointments/AppointmentFormDrawer.tsx)
  filters by department, clears an incompatible performer when switching service,
  permits unassigned bookings and posts neither duration nor end time.
  [`Sale.tsx`](../../apps/web/src/pages/Sale.tsx) narrows each service line's picker,
  while `assertStaffExist` in
  [`sale.service.ts`](../../apps/api/src/services/sale.service.ts) checks tenant
  existence, not department membership. That asymmetry is the accepted decision,
  not a new defect identified by this review.
- **The historical coverage claims are not supported by the current tests.**
  [`appointments.routes.test.ts`](../../apps/api/src/routes/appointments.routes.test.ts)
  asserts a 45-minute derived end and completion stamping, but not refusal of an
  out-of-department performer. The database-backed
  [`appointment.service.test.ts`](../../apps/api/src/services/appointment.service.test.ts)
  focuses on clashes, not catalogue edits or service-only resizing. Neither was
  run pending confirmation of a disposable database. Mocked browser
  [`Appointments.test.tsx`](../../apps/web/src/pages/__tests__/Appointments.test.tsx)
  replaces the booking drawer, and
  [`Sale.test.tsx`](../../apps/web/src/pages/__tests__/Sale.test.tsx) has no explicit
  department-picker assertion. Both passed (2 files / 32 tests), but that is not
  evidence of performer-filtering or API eligibility coverage. Add focused tests
  for department rejection, no-department/unassigned cases, fallback duration,
  snapshot handling, resizing clashes and drawer filtering/reset behavior.

## Context

Legacy had **no link between a service and the staff who can perform it**. `services`
carried a department and `users` carried departments, but the booking form offered
every active employee for every service, and `appointments.duration` was a column
the browser filled in. Two failures followed from that:

1. A root-colour booking could be assigned to a nail technician. Nothing refused
   it, so commission and utilisation reports counted work nobody did.
2. A booking's length was whatever the form said. A two-hour block could be placed
   on a one-hour service.

The rebuild has the same data: `Service.departmentId` and `User.departments`
(the `StaffDepartment` join). There is **no skill matrix** — no `service_staff`
table in legacy, none in the new schema — and the MVP does not add one. So "who may
perform this" has to be answered from what exists, or not answered at all.

The same question arrives from the till: a sale line credits a performer, which is
what `SaleLine.staffId` exists for. The booking form and the till's cart are two
front doors onto one question.

## Decision

1. **Duration is a fact about the service, never an input.** `Service.durationMinutes`
   is optional in the catalogue, but a booking cannot be created without a service
   (`createAppointmentSchema` requires `serviceId` and has **no** duration or
   `endsAt` field at all), and the server computes both. A client cannot post a
   length, so it cannot post a wrong one.
2. **A performer must belong to the service's department.** Where the service names
   a department, a booking's `staffId` must be a user whose `User.departments`
   contain it; the API answers `400` with the field path otherwise.
3. **A service with no department accepts anyone.** The rule is an intersection, not
   a restriction: with nothing to intersect against, every staff member is eligible.
   The same holds for `staffId` being absent — an unassigned booking is legal, and a
   stylist can be assigned later.
4. **The client narrows, the server decides.** Both the booking form and the till's
   cart line offer only eligible staff, and the API refuses what it would not have
   offered rather than trusting the list it was sent.
5. **The till's half is advice, the booking's half is a rule.** `POST /api/sales`
   checks that a line's `staffId` **exists** in the tenant
   (`assertStaffExist`); it does not check the department. The reasoning is in
   "Why not the alternatives" below, and it is the one asymmetry in this decision.

## Why not the alternatives

| Alternative                                                            | Why it was rejected                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Let the form post the end time, as legacy did                          | The form is not the authority on how long a service takes, and a mistyped end time is invisible until two bookings collide.                                                                                                                                                                                                                                                       |
| Offer every staff member for every service (legacy's behaviour)        | Commission and utilisation then contain work nobody performed, which is the failure this decision exists to prevent. There is no skill matrix to do better with.                                                                                                                                                                                                                  |
| Add a `service_staff` mapping table now                                | The MVP does not get to invent a model the salon has no way to maintain: nothing in the legacy database or the handoff lets a salon enter a skill matrix, so the table would be empty for every migrated tenant — and an empty matrix offers **nobody**. Department is the finest grain real data supports.                                                                       |
| Enforce the department on a **sale line** too, exactly as on a booking | A sale is rung up _after_ the work, so the cashier may credit whoever actually did it even when they are not in the service's department (a manager covering, a trainee assisting). A booking is a promise made in advance, which the API holds to the mapping; a sale is a record of what happened, and refusing it at the till would refuse money the salon has already earned. |
| Refuse a booking that names no performer                               | A walk-in request is real: the desk books the slot and assigns a stylist later. `staffId` is nullable on purpose.                                                                                                                                                                                                                                                                 |

## Consequences

- **Positive:** the day view cannot show a booking the API would have refused, and
  the two screens apply one rule instead of two similar ones.
- **Positive:** a mis-booked performer is a `400` at create/update time rather than
  a wrong row in a report.
- **Negative / accepted:** a salon that wants a genuinely cross-trained team cannot
  express it, because `Service.departmentId` is one department. That is the honest
  limit of the current model, recorded as full-phase work in [`../mvp.md`](../mvp.md)
  (the staff skill matrix).
- **Negative / accepted:** the till's narrowing lives only in the browser, so a
  custom client can credit a line to any user in the salon. That is a weaker
  guarantee than the booking's, and it is deliberate — see the table above.
- **Neutral:** a service whose department has nobody stays bookable and shows an
  empty performer list; the booking is simply unassigned.

## Enforcement

- **Structurally:** `createAppointmentSchema` / `updateAppointmentSchema` carry no
  duration field, so a length cannot be posted at all.
- **The service:** `appointment.service.ts` resolves the service, computes
  `endsAt`/`durationMinutes` from it, and runs its eligibility check (which throws
  `badRequest` naming `body.staffId`) before writing.
- **The client:** `AppointmentFormDrawer` filters the performer list to
  `person.departments.some((link) => link.id === selectedService.departmentId)`, and
  `pages/Sale.tsx` applies the same filter per service line in the cart.
- **Tests:** the appointment route suite covers a refused performer against a live
  database. The till's rule is covered in
  `apps/web/src/pages/__tests__/Sale.test.tsx` only as far as the picker goes,
  because the API is not the thing enforcing it.
