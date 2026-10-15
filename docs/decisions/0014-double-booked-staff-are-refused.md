# 0014 — A double-booked member of staff is refused, not warned

- **Status:** Accepted
- **Date:** 2026-10-12
- **Deciders:** Phase 6, slice 6b (the calendar grid's clash rule)
- **Related:** [ADR 0013](0013-appointment-performers-come-from-the-service.md),
  [`../../apps/api/src/services/appointment.service.ts`](../../apps/api/src/services/appointment.service.ts),
  [`../STATE.md`](../STATE.md) §3 and §4.2 (Q34),
  [`../mvp.md`](../mvp.md) → M2

## Evidence review — 2026-10-15

The accepted refusal policy below is preserved. These qualifications describe the
current code, not newly approved policy. Historical references remain historical,
as explained in the [ADR index](README.md#historical-references-and-current-scope).

- **The overlap predicate, blocker statuses and self-exclusion are implemented.**
  `assertNoClash` in
  [`appointment.service.ts`](../../apps/api/src/services/appointment.service.ts)
  queries the same performer using strict start/end inequalities, excludes the
  updated row's ID, and returns immediately for a null performer. Its occupying
  statuses are the shared status list minus `CANCELLED`. This filters **existing
  blockers**, not the target booking's status. Unassignment skips only this clash
  check; other validation and write failures can still prevent a drag succeeding.
- **Open correctness issue — reactivation skips validation.**
  [`appointment.ts`](../../packages/shared/src/schemas/appointment.ts) permits a
  status-only patch. `updateAppointment` checks clashes only when `startsAt` or
  `staffId` is supplied, so changing `CANCELLED` to any occupying status can reclaim
  a slot already taken by another booking without checking it. This is distinct
  from the documented concurrent-write race: sequential requests can reach it.
- **Cancelled targets are checked as though they occupy time.** Create always
  calls `assertNoClash`; update calls it for a supplied start or performer without
  considering the merged status. Thus creating a cancelled booking, moving an
  already cancelled booking, or cancelling while changing time/staff can be
  refused against an occupying blocker. Under decision item 3's cancelled-is-free
  rule, target status must be considered too. Regression tests should cover both
  cancellation and reactivation, not only a cancelled existing blocker.
- **Open correctness issue — not every window change triggers the check.** As
  recorded in [ADR 0013's evidence review](0013-appointment-performers-come-from-the-service.md#evidence-review--2026-10-15),
  service-only patches and catalogue-driven resizing during unrelated edits can
  change the end time without supplying either trigger. Decision item 6 therefore
  does not currently ensure that every changed window is validated. These resize
  and status findings are control-flow evidence, not live database reproductions.
- **The error shape differs from the historical description.** The service uses
  [`conflict`](../../apps/api/src/lib/http-error.ts) with `409` and code
  `APPOINTMENT_CLASH`, not `CONFLICT`, and supplies no field-level details. The
  message contains the first matching blocker's customer name (or the walk-in
  fallback) and times, formatted in the server runtime's timezone, not an explicit
  salon timezone. The drawer shows this as a form-level error, not a highlighted
  time/staff field. Decide on field details and timezone display explicitly rather
  than relying on the staff-form analogy below.
- **The current drag path has a dedicated optimistic mutation.**
  [`CalendarView.tsx`](../../apps/web/src/components/appointments/CalendarView.tsx)
  emits `onReschedule` to
  [`Appointments.tsx`](../../apps/web/src/pages/Appointments.tsx), which calls
  `useRescheduleAppointment` from
  [`useAppointments.ts`](../../apps/web/src/hooks/useAppointments.ts), not
  `useUpdateAppointment`. That hook snapshots calendar queries, optimistically
  patches start/staff, restores snapshots on error and invalidates appointment
  queries on settlement. The page supplies the error-toast callback. The hook
  also throws from `onError`; error/toast delivery and rollback need a focused
  mutation test rather than being inferred from component drag tests.
- **The concurrency caveat remains, without a measured timing bound.** The clash
  query and write are separate operations. The
  [`Appointment` model](../../apps/api/prisma/schema.prisma) has ordinary indexes;
  inspected migration SQL contains no `EXCLUDE`/`btree_gist` overlap constraint.
  No deployed schema was inspected. The historical "few milliseconds" claim is
  not a measured guarantee: the race window depends on execution timing. Review
  database range types and existing conflicting rows before any constraint work;
  this review neither adds a migration nor approves a locking strategy.
- **Coverage is useful but incomplete.**
  [`appointment.service.test.ts`](../../apps/api/src/services/appointment.service.test.ts)
  contains database-backed cases for refused create/moves, touching edges,
  cancelled blockers, no-shows, unassigned creates, self-exclusion and tenant
  separation. It does not cover reactivation, cancelled targets, service-only or
  catalogue-driven resizing, or concurrent writes. It was inspected, not run,
  pending confirmation of a disposable database. Database-free contract checks
  confirmed cancelled create, status-only reactivation, cancellation with a time
  patch, explicit unassignment and the occupying-status complement (5 assertions);
  they do not establish service behavior. Focused web tests passed (3 files / 64
  tests):
  [`CalendarView.test.tsx`](../../apps/web/src/components/appointments/__tests__/CalendarView.test.tsx),
  [`calendar-geometry.test.ts`](../../apps/web/src/components/appointments/__tests__/calendar-geometry.test.ts)
  and [`Appointments.test.tsx`](../../apps/web/src/pages/__tests__/Appointments.test.tsx).
  The page mocks appointment hooks, and the grid tests assert drag callbacks;
  neither establishes real mutation rollback, conflict-toast delivery or database
  refusal. Those need dedicated regression coverage.

## Context

The calendar grid (handoff screen 06) draws one column per member of staff, which
makes the thing the day list hid obvious: **two blocks can occupy the same person
at the same time.** Nothing in `Appointment` prevents it. The legacy system had
the same gap — `appointments` has no unique index and no availability check
anywhere in its 154 routes, so a salon could book the same stylist twice and the
system agreed with both bookings.

The grid makes the gap visible but does not create it, and a grid is exactly the
surface where a clash becomes expensive: a drag that silently overlaps two
services means the salon promises two people the same twenty minutes of one
person's hands.

The rebuild's `Appointment` carries `startsAt`, `endsAt`, `durationMinutes`,
`status` and a nullable `staffId`, and Phase 2 gave it no overlap-exclusion
constraint. Postgres can express one (`EXCLUDE USING gist` over a `tstzrange`
with `btree_gist`), but it was not added and would need an extension plus a
migration touching every tenant's `appointments`. So the choice is what the
**application** does when it detects an overlap, not whether the database can
express one.

Three answers exist: silently allow it, allow it with a warning the user may
dismiss, or refuse it.

## Decision

1. **An overlapping active booking for the same performer is refused with `409`** —
   the same `conflict` helper the staff form's duplicate email uses, with code
   `CONFLICT`, on both `POST /api/appointments` and `PATCH /api/appointments/:id`.
   Refusal is unconditional: there is no override, no role that bypasses it, and
   no flag on the request.

2. **Overlap is half-open:** two windows clash when
   `existing.startsAt < new.endsAt && existing.endsAt > new.startsAt`. Touching
   edges are not a clash — a 09:00–10:00 block and a 10:00–11:00 block are a
   back-to-back day, which is the normal case and must never be refused.

3. **Every status except `CANCELLED` occupies the slot.** `SCHEDULED`,
   `IN_PROGRESS`, `COMPLETED` and `NO_SHOW` all count. A cancelled booking freed
   its slot the moment it was cancelled; a no-show did not — the time was still
   held and cannot be given to somebody else after the fact. The constant holding
   this is `OCCUPYING_APPOINTMENT_STATUSES` in `appointment.service.ts`, and it is
   the complement of `{ CANCELLED }` rather than a second list to keep in sync.

4. **An unassigned booking is never clash-checked.** `staffId = null` means
   nobody is named, so there is nobody to double-book; the drag into the
   "Unassigned" column always succeeds.

5. **A booking never clashes with itself.** On update, the check excludes the
   row's own `id`, so rescheduling an appointment to the window it already
   occupies is a no-op rather than a conflict.

6. **The check re-runs on every window or performer change.** In
   `updateAppointment` it runs when `startsAt` or `staffId` is present in the
   patch, and on the **merged** values — the performer after the edit and the
   performer before it — because moving a booking onto a stylist clashes just as
   much as moving a booking's time under the same stylist.

7. **The message names the clash**, so the drawer and the drag can both render
   the server's sentence verbatim rather than inventing a vaguer one: it carries
   the clashing customer's name and the overlapping window, falling back to
   "another appointment" for a booking with no customer row (a walk-in).

## Why not the alternatives

| Alternative                                                        | Why it was rejected                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Allow overlapping bookings silently (legacy's behaviour)           | It is the failure the grid exists to expose. Two people would be promised the same twenty minutes and the screen would render it as a legitimate day.                                                                                                                                                                                                                           |
| Allow with a dismissible warning                                   | A warning the desk may dismiss is a warning that will be dismissed, and the refusal has to be implemented anyway to know when to warn. Half the code, none of the guarantee.                                                                                                                                                                                                    |
| Allow overlap when the services are in different departments       | Same person, same time — the department is about skill, not about being in two places. ADR 0013 makes department the eligibility rule; it does not make a person divisible.                                                                                                                                                                                                     |
| Enforce it with a Postgres `EXCLUDE` constraint over a `tstzrange` | Stronger, and noted as the eventual fix, but it needs `btree_gist`, a migration over every tenant's `appointments`, and partial-index treatment for the `CANCELLED`-is-free and self-exclusion rules above — a schema change this phase cannot verify against the running stack. The application check is the rule now; the constraint would be a second line of defence later. |
| Refuse unassigned overlaps too                                     | There is no performer to clash with. It would make the Unassigned column unusable for a salon that books loosely.                                                                                                                                                                                                                                                               |

## Consequences

- **Positive:** the calendar cannot be driven into a state the salon cannot
  honour, and the drag's error and the form's error are the same sentence from
  the same server.
- **Positive:** the rule is one implementation on two paths — create and update —
  so a booking can never enter a clashing state through the door the other did
  not watch.
- **Negative / accepted:** a race remains. Two concurrent requests can both pass
  the check and both write, because the check and the write are not one atomic
  statement. It is the same residual the whole service layer carries (nothing
  here runs `SERIALIZABLE`), it needs both requests inside the same few
  milliseconds, and the honest fix is the `EXCLUDE` constraint above rather than
  a per-staff advisory lock. It is documented in the service comment so the next
  reader does not mistake the check for a guarantee.
- **Negative / accepted:** a salon that genuinely runs two people through one
  station (a washing bay, an assistant) has no way to express it and must book
  the second half unassigned.
- **Neutral:** the `409` shape matches the staff form's, so the browser already
  knows how to put a conflict on the field that caused it.

## Enforcement

- **The service:** `assertNoClash` in `appointment.service.ts` runs inside both
  write paths and throws `conflict(…, "CONFLICT")` naming the overlapping
  booking. The statuses that occupy a slot are the named constant.
- **Tests:** `apps/api/src/services/appointment.service.test.ts` covers
  a refused create, a refused reschedule onto another performer, a refused
  reschedule onto the same performer, allowed back-to-back edges, a cancelled
  blocker that frees the slot, an unassigned target that is never checked, and a
  self-reschedule that is a no-op.
- **The client:** `components/appointments/CalendarView.tsx`'s drag calls the
  existing `useUpdateAppointment` and renders the server's message on failure,
  reverting the block to where it was.
