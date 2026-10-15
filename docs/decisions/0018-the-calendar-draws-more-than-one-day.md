# 0018 — The calendar draws more than one day

- **Status:** Accepted
- **Date:** 2026-10-14
- **Deciders:** Phase 6d (the week and month views)
- **Related:** [ADR 0014](0014-double-booked-staff-are-refused.md), [ADR 0013](0013-appointment-performers-come-from-the-service.md),
  [`../roadmap.md`](../roadmap.md) Phase 6, [`../design/HANDOFF.md`](../design/HANDOFF.md) §5,
  [`../STATE.md`](../STATE.md) §4.2

## Evidence review — 2026-10-15

The accepted start-day bucketing and view-interaction policy below is preserved.
Historical roadmap/handoff references are context, not current acceptance evidence;
see the [ADR index](README.md#historical-references-and-current-scope).

- **Windows and reads match the stated local-browser policy.**
  [`calendar-geometry.ts`](../../apps/web/src/components/appointments/calendar-geometry.ts)
  constructs day, Monday-first week and calendar-month edges using local calendar
  fields. [`useCalendarAppointments`](../../apps/web/src/hooks/useAppointments.ts)
  reads the existing endpoint at a fixed page size of 200, enabled for the visible
  calendar view. [`Appointments.tsx`](../../apps/web/src/pages/Appointments.tsx)
  still also invokes the list read outside list view; “one read per view” must not
  be interpreted as no concurrent list request. The hook retains previous data
  during a range change. No salon timezone preference is applied by this path.
- **The API selects starts within the inclusive window.**
  [`listAppointments`](../../apps/api/src/services/appointment.service.ts) filters
  `startsAt` with `gte`/`lte` and orders by start then ID. This is not an overlap
  query. Start-day bucketing is consistent with that policy, but excludes a booking
  that starts before the requested window even when it occupies visible time in it.
- **The midnight argument is only an example, not a general proof.**
  `blockMinutes` clamps the actual start/end span to 08:00–20:00 on the supplied
  day; it does not reject all midnight crossings. A 23:00–01:00 booking is invisible
  on both days, as tested, but a 19:00–09:00 crossing intersects visible time on
  both days. Start-day bucketing and the starts-within-window read still limit
  which day receives it. The Context and rejected-overlap-query rationale below
  overgeneralize from the short overnight example; changing query semantics needs
  explicit policy review, not a silent documentation-led implementation change.
- **Read-only means no dragging, not no editing.**
  [`WeekView.tsx`](../../apps/web/src/components/appointments/WeekView.tsx) uses
  shared geometry and overlap lanes without drag targets;
  [`MonthView.tsx`](../../apps/web/src/components/appointments/MonthView.tsx) draws
  up to three chips per start day and a remaining count. Both open the editor on
  click for writable tenants. Suspended-tenant controls are disabled. This does
  not resolve ADR 0013/0014's server write-validation defects.
- **Truncation is disclosed, not eliminated.** The page compares returned rows
  with `total` and names the ceiling. It does not automatically fetch later pages;
  a sparse calendar is not proof of availability. P1-01's full acceptance still
  needs assessment beyond this historical decision.
- **Verification is frontend-only.** The geometry, day, week, month and appointment
  page suites passed: five files / 88 tests. They cover local windows, lane packing,
  representative overnight behavior, chips, click/drag affordances and the
  truncation notice. Page hooks are mocked; these tests do not establish deployed
  reads, server clash refusal, mutation rollback, salon-timezone behavior or live
  multi-page completeness. PostgreSQL was not accessed.

## Context

Handoff screen 06 draws a **Day / Week / Month** toggle. Phase 6a–6c built only the day
grid, and the roadmap parked the other two with a reason that was true at the time:
`GET /api/appointments` filters `startsAt` **inside** the window, so a booking that begins
the previous evening never appears in a week that contains its end — and the grid's
geometry (`buildCalendarColumns`, the 08:00–20:00 gutter) was one day by construction.

Three things had to be decided before a second and third view could be drawn, and each of
them is expensive to reverse once drawings exist:

1. **What a multi-day read means.** The endpoint already takes any `from`/`to`
   (`appointmentListQuerySchema`), and the 6b clash rule is already cross-day, so the
   question was never "which endpoint" but "which rule does a window use to decide which
   day a booking belongs to".
2. **What a week column does with two bookings at the same time.** The 6b refusal stops a
   _new_ double-booking for one performer, but it cannot stop two unassigned bookings at
   09:00, nor a legacy row that already overlaps.
3. **Whether the new views are writable.** The day grid is: 6c drags a block. A week grid
   raises the stakes — a horizontal drag across seven columns is a week-long move, and a
   month chip has nowhere to be dragged to.

The gutter decides the straddle question on its own evidence: the visible window is
**08:00–20:00**, so a booking that crosses midnight (23:00 → 01:00) is clamped to nothing on
_both_ its days — `blockMinutes` returns `null` for the start day (23:00 is past 20:00) and
for the end day (01:00 is before 08:00). A straddle-aware query would therefore change no
pixel: the booking is undrawable whichever of the two questions the read asks.

## Decision

1. **A window is two instants, computed in the browser, and there is no new endpoint.**
   `dayWindow`, `weekWindow` and `monthWindow` live in `calendar-geometry.ts` beside the
   rest of the grid's maths and return local-midnight-to-23:59:59.999 edges. The week
   window is the whole **Monday-first** week containing the anchor day; the month window is
   the calendar month, not the drawn grid. The contract is untouched — `/api/appointments`
   already accepts arbitrary `from`/`to`, and `/api/mobile/*` is frozen.
2. **A booking belongs to the day it starts.** Bucketing is `dayKey(new Date(startsAt))`
   (`bookingsByDay`), with no overlap flag, no second filter and no server change. The rule
   is uniform across the grid, the chips and the day window's own edges, so the same booking
   is on the same day in every view.
3. **The week is seven day columns on the same 08:00–20:00 scale.** The gutter, the hour
   lines, the pixel-per-minute scale, the now-line and the frame widths come from
   `calendar-geometry.ts` — the day grid and the week grid cannot drift apart, because there
   is one definition of the frame and one `blockBox(booking, day)`.
4. **Overlapping bookings share their column's width in lanes.** `packLanes` assigns each
   block the first free lane using the **half-open** comparison ADR 0014 already uses
   (`start >= previousEnd` is free, so touching edges share a lane), and `lanes` is the
   width of the overlapping **cluster**, not of the day — an afternoon booking is not
   squeezed into a third of its column because the morning had three. Nothing is refused or
   hidden: a legacy overlap is drawn as two readable blocks.
5. **Week and month are read-only.** No drag and no drop target: 6c's gesture stays where
   its geometry is unambiguous (one day, one gutter, one snapped slot). Clicking a block or
   a chip still opens the drawer, so the write path is the same one the day view uses, and
   the page says the views are read-only rather than letting a drag silently do nothing.
6. **Month draws chips, not scaled blocks.** Seven columns of whole Monday-first weeks
   (`monthGridDays`, 28/35/42 days) with up to three chips per day and a `+N more` line.
   Cells outside the month are drawn (a date, no chips): the read is the month window, so a
   neighbouring month's chips would be a second request per month and a drawing of a month
   the desk did not ask for.
7. **The page-size ceiling is disclosed, not hidden.** A month is the first window that can
   plausibly exceed `MAX_PAGE_SIZE` (200). When the loaded rows are fewer than the reported
   `total`, the page says **"Showing the first _N_ of _M_ appointments"** instead of drawing
   a month that silently lost bookings.

## Why not the alternatives

| Alternative                                                | Why it was rejected                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A straddle-aware read (`startsAt < to && endsAt > from`)   | It changes what the _list_ means for every caller to fix a drawing that cannot exist: the 08:00–20:00 gutter already clamps a midnight-crossing booking to nothing on both days. The rule is pinned by a test instead of by a change to `listAppointments` (decision 2). |
| An `overlapsWindow` flag on the list query                 | A second way to ask one question, and one the web app would be the only caller of. The contract stays smaller; the day the rule changes, it changes in one place.                                                                                                        |
| A `/api/appointments/calendar` endpoint                    | Nothing new is needed from the server: the same rows, the same summary schema, a different window. It would be a second contract to keep in step with the frozen `/api/mobile/*` one and with `requireModule("appointments")`.                                           |
| A third-party calendar library                             | The project has one hand-written grid whose geometry is unit-tested without rendering a single block; a library would bring its own weekend rules, its own token-mismatched styling and an escape hatch around the tenancy-scoped client.                                |
| A Sunday-first week                                        | The legacy rota and the handoff both draw Monday-first, and a salon's week is a working week. `WEEK_STARTS_ON` states it once, so a Sunday-first salon is a one-line change rather than a search.                                                                        |
| Drag-to-reschedule in the week view                        | A seven-column drop target turns one gesture into a week-long move, and the lane-packed geometry makes "which column, which minute" ambiguous between two blocks that share a column. The day view keeps the gesture.                                                    |
| Reading the padded month grid (28–42 days), not the month  | A request whose window depends on which weekday the month starts on, and chips drawn for a month the desk cannot see the edges of. The padded cells are calendar paper, not data.                                                                                        |
| Asking the server for a total instead of noticing one page | The envelope already carries `total`; the page compares it with what it drew. A count query would be a new endpoint for a sentence the response already contains.                                                                                                        |

## Consequences

- **Positive:** the handoff's toggle is real — `List · Day · Week · Month` — with no API
  change, no migration and no new dependency.
- **Positive:** one definition of the frame and one date-aware `blockBox`, so a block cannot
  sit at one time in the day grid and another time in the week grid.
- **Positive:** a legacy overlapping pair is now **readable** rather than stacked, which is
  the first time the rebuild has drawn the state 6b only prevents going forward.
- **Negative / accepted:** a booking that crosses midnight is drawn in no view. It is still
  returned by the week/month reads (it starts inside the window), so it appears in the day
  window's list and can be opened there — but the day it ends on never shows it. A gutter
  that covers the whole 24 hours, or an all-day strip above the grid, is the fix, and both
  are drawing decisions this phase did not make.
- **Negative / accepted:** the week view cannot move a booking, so rescheduling a
  three-day-old mistake means switching to Day. That is deliberate and the page says so.
- **Negative / accepted:** a month with more than 200 bookings is a first page plus a
  sentence rather than 201 chips. The alternative — a grid that silently omits days — is the
  failure mode a calendar must not have.
- **Neutral:** the padded month cells are empty by construction, so a chip never appears in
  a day the desk did not load. The read is the month; the paper is the month's weeks.
- **Neutral:** `CALENDAR_PAGE_SIZE` is still 200, the contract's own `MAX_PAGE_SIZE`. Nothing
  pages; the notice is the honest half of that choice.

## Enforcement

- **The straddle rule:** `blockMinutes` returns `null` on **both** days of a crossing
  booking, pinned in `calendar-geometry.test.ts` and in `WeekView.test.tsx` (such a booking
  draws no block at all).
- **The lane comparison:** `packLanes` reuses the half-open test ADR 0014 states, and its
  tests pin touching edges sharing a lane, three-deep stacking, and a cluster that is only
  as wide as it needs.
- **The frame:** `GUTTER_WIDTH`, `MIN_COLUMN_WIDTH`, `HOUR_HEIGHT`, `TRACK_HEIGHT`,
  `DAY_HOURS` and `gridTemplate` are exported from `calendar-geometry.ts` and imported by
  both grids, so the two cannot disagree about the gutter.
- **The read:** `useCalendarAppointments` is called once per view with that view's own
  window and enabled only while the view is on screen; `Appointments.test.tsx` asserts the
  window each switch asks for.
- **The disclosure:** the notice renders when the loaded rows are fewer than `total`,
  asserted in `Appointments.test.tsx` against a mocked `total` of 480.
- **Not enforced:** nothing prevents a future view from re-deriving a window inline instead
  of calling `dayWindow`/`weekWindow`/`monthWindow`. The next phase that draws a range should
  move those calls behind the hook if that happens.
