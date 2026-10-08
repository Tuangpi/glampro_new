# 0013 — An appointment takes its duration and its performer from the service

- **Status:** Accepted
- **Date:** 2026-10-08
- **Deciders:** MVP slice M2 (the booking form and `POST /api/appointments`)
- **Related:** [`../mvp.md`](../mvp.md) (M1 and M2), [`../STATE.md`](../STATE.md) §3,
  [`../legacy/reference/legacy-schema.md`](../legacy/reference/legacy-schema.md),
  [`../../apps/api/src/services/appointment.service.ts`](../../apps/api/src/services/appointment.service.ts)

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
