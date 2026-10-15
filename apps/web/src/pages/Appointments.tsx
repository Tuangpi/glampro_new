/**
 * Appointments — handoff screens 03 and 06: the book as a list, a **day** grid, a
 * **week** grid and a **month** of chips.
 *
 * **MVP slice M2** (`docs/mvp.md`) shipped the list; **Phase 6** added the calendar grid
 * and its drag, plus the server-side clash refusal both surfaces (ADR 0014). **Slice 6d**
 * added the Week and Month views, which is what makes the handoff's own `Day · Week ·
 * Month` switch the real control it drew (ADR 0018). All four views are one fact asked
 * twice: the same `AppointmentSummary` rows, the same drawer for the write, the same
 * refusal — each asking the endpoint for a different *window* of the same book.
 *
 * Two of them carry a caveat the desk can see rather than discover. The week and the month
 * are **read-only** — the day grid is the only place a block can be dragged, because one
 * gutter and one snapped slot are what make "which minute" unambiguous — so the month and
 * the week say so. And a calendar read is one page, so when a window holds more than a
 * page the view names what it is not drawing instead of drawing a confident month with a
 * hole in it. Shifts/leave, the skill matrix and reminders are still not stubbed here: an
 * absent capability is absent, not faked.
 *
 * Each window is computed from the **browser's** day, week and month and sent as instants,
 * the same edges the dashboard's tiles count, so "3 appointments today" and the three rows
 * below are one fact asked twice. "Today" is local because the salon's day is local; the
 * schema has no timezone column to ask about (see `schemas/appointment.ts`).
 */
import { useState } from "react";

import type { AppointmentDetail, AppointmentSummary } from "@glampro_suite/shared";

import AppointmentFormDrawer from "@/components/appointments/AppointmentFormDrawer";
import CalendarView, { type RescheduleInput } from "@/components/appointments/CalendarView";
import MonthView from "@/components/appointments/MonthView";
import WeekView from "@/components/appointments/WeekView";
import {
  addDays,
  buildCalendarColumns,
  dayWindow,
  monthWindow,
  shiftMonth,
  startOfWeek,
  weekWindow,
  type CalendarColumn,
} from "@/components/appointments/calendar-geometry";
import { Calendar, ChevronLeft, Plus, Search } from "@/components/icons";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Select from "@/components/ui/Select";
import Skeleton from "@/components/ui/Skeleton";
import Table, { type TableColumn } from "@/components/ui/Table";
import { showToast } from "@/components/ui/toast-store";
import {
  APPOINTMENT_STATUS_BADGE,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_OPTIONS,
  OPEN_APPOINTMENT_STATUSES,
} from "@/constants/appointments";
import { useAuth } from "@/contexts/AuthContext";
import {
  CALENDAR_PAGE_SIZE,
  useAppointmentList,
  useCalendarAppointments,
  useRescheduleAppointment,
  useUpdateAppointment,
} from "@/hooks/useAppointments";
import { useStaffList } from "@/hooks/useStaff";
import { get, getErrorMessage } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";

const PAGE_SIZE = 20;

/** The four views screen 06's toolbar draws, in the order the handoff draws them. */
const VIEW_OPTIONS = [
  { key: "list", label: "List" },
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
] as const;

type AppointmentView = (typeof VIEW_OPTIONS)[number]["key"];

/** Whether the list is showing the browser's own day. */
function isToday(day: Date): boolean {
  return day.toDateString() === new Date().toDateString();
}

/**
 * The toolbar's subtitle: whichever **range** the view on screen is showing.
 *
 * The week is named by both of its edges, because "the week of the 14th" is a question
 * rather than an answer, and the month by its name, because a month has no edges to
 * misread. `formatDate` reads local calendar fields, which is the same clock the windows
 * and the grid are built from.
 */
function viewSubtitle(view: AppointmentView, day: Date): string {
  if (view === "month") {
    return formatDate(day.toISOString(), { month: "long", year: "numeric" });
  }

  if (view === "week") {
    const first = startOfWeek(day);
    const last = addDays(first, 6);
    const from = formatDate(first.toISOString(), { day: "numeric", month: "short" });
    const to = formatDate(last.toISOString(), { day: "numeric", month: "short", year: "numeric" });
    return `${from} – ${to}`;
  }

  return formatDate(day.toISOString(), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Where a booking made from this view starts.
 *
 * The desk books *into the view it is looking at*, so a new appointment lands on
 * the next half hour when that view is today, and at 09:00 on a day that is not —
 * "now" on yesterday's list would be a trap. Derived rather than kept in state:
 * the value is only read by the drawer's initialiser, and it has to be right at
 * the moment the desk opens the form, not whenever the day last changed.
 */
function bookingStart(day: Date): string {
  if (!isToday(day)) {
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0).toISOString();
  }

  const now = new Date();
  const rounded = new Date(now);
  rounded.setMinutes(now.getMinutes() > 30 ? 60 : 30, 0, 0);
  return rounded.toISOString();
}

export default function Appointments() {
  const { isReadOnly } = useAuth();

  const [day, setDay] = useState(() => new Date());
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<AppointmentDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // One book, four ways of asking for it (ADR 0018): the list and the day grid each read
  // the anchor day, the week the seven days that hold it, the month the calendar month.
  // `day` stays the anchor all four share, so switching view never moves the desk
  // somewhere it did not ask to be.
  const [view, setView] = useState<AppointmentView>("list");

  // Booking defaults come from `bookingStart(day)` at the moment the drawer opens
  // — see that function; there is no effect writing into state for it.

  const showList = view === "list";
  const showDay = view === "day";
  const showWeek = view === "week";
  const showMonth = view === "month";
  const stepUnit = showMonth ? "month" : showWeek ? "week" : "day";

  const dayRange = dayWindow(day);
  const weekRange = weekWindow(day);
  const monthRange = monthWindow(day);

  const { data, isPending, isError, error, isFetching, refetch } = useAppointmentList({
    page: 1,
    pageSize: PAGE_SIZE,
    from: dayRange.from,
    to: dayRange.to,
    status: (status || undefined) as AppointmentSummary["status"] | undefined,
  });

  // Each window is read only while its own view is on screen, so the list pays for no
  // calendar at all and the views the desk is not looking at pay for nothing either. All
  // three stay in the cache once fetched, so stepping to the week and back is instant.
  const dayCalendar = useCalendarAppointments(dayRange, showDay);
  const weekCalendar = useCalendarAppointments(weekRange, showWeek);
  const monthCalendar = useCalendarAppointments(monthRange, showMonth);

  /** The view on screen is the only one whose rows, pending and error state are drawn. */
  const calendar = showMonth ? monthCalendar : showWeek ? weekCalendar : dayCalendar;
  const calendarRows = calendar.data?.data ?? [];

  // The roster is the day grid's alone: the week writes the performer on each block and
  // the month draws chips, so neither has a staff column for a roster to fill.
  const staff = useStaffList({ page: 1, pageSize: 200, status: "active" }, showDay);
  const gridColumns: CalendarColumn[] = buildCalendarColumns(
    dayCalendar.data?.data ?? [],
    (staff.data?.data ?? []).map((member) => ({
      id: member.id,
      name: member.name,
      role: member.position ?? undefined,
    })),
  );

  const update = useUpdateAppointment();
  const reschedule = useRescheduleAppointment();
  const rows = data?.data ?? [];
  const showingToday = isToday(day);
  // A calendar read is one page (`CALENDAR_PAGE_SIZE`), and a month can hold more. The
  // envelope carries the total, so the page **says** what it is not drawing rather than
  // drawing a confident month with holes in it (ADR 0018, decision 7). Only ever true off
  // the list, whose own page size is smaller but whose paging is visible.
  const truncated = !showList && (calendar.data?.total ?? 0) > calendarRows.length;

  /**
   * The arrow steps the unit the view on screen shows: a day in List and Day, a week in
   * Week, a month in Month — so "next" always means next of what is being looked at.
   */
  function stepBy(direction: 1 | -1) {
    // `shiftMonth` holds the day of the month where it exists (31 January + a month is 28
    // February, not 3 March) and `addDays` builds from calendar fields, so neither a short
    // month nor a DST night can walk the anchor somewhere the desk did not ask for.
    setDay((current) => {
      if (showMonth) return shiftMonth(current, direction);
      return addDays(current, showWeek ? 7 * direction : direction);
    });
  }

  function openCreate() {
    setEditing(null);
    setDrawerOpen(true);
  }

  /**
   * A drag on the grid. The move is optimistic (the block jumps under the
   * pointer); if the server refuses it — a clash (`409`, ADR 0014) or a
   * performer outside the service's department (ADR 0013) — the block snaps
   * back and the toast carries the server's own message.
   */
  function handleReschedule(id: string, input: RescheduleInput) {
    reschedule.mutate(
      { id, input },
      {
        onError: (error_) => showToast("error", getErrorMessage(error_)),
      },
    );
  }

  async function openEdit(appointment: AppointmentSummary) {
    // A list row is a summary and the form needs the whole record (finishedAt),
    // so opening the editor is a second read rather than a re-use of the row —
    // the same rule the customer screen keeps.
    setEditing(await get<AppointmentDetail>(`/appointments/${appointment.id}`));
    setDrawerOpen(true);
  }

  async function quickStatus(appointment: AppointmentSummary, next: "COMPLETED" | "CANCELLED") {
    try {
      await update.mutateAsync({ id: appointment.id, input: { status: next } });
      showToast(
        "success",
        next === "COMPLETED" ? "Appointment completed." : "Appointment cancelled.",
      );
    } catch (error_) {
      showToast("error", getErrorMessage(error_));
    }
  }

  const columns: TableColumn<AppointmentSummary>[] = [
    {
      key: "time",
      header: "Time",
      cell: (row) => (
        <div>
          <p className="font-bold text-ink">
            {new Date(row.startsAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <p className="text-xs text-ink-muted">
            {row.durationMinutes ? `${row.durationMinutes} min` : "—"}
          </p>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      cell: (row) =>
        row.customerName ? (
          <span className="font-bold text-ink">{row.customerName}</span>
        ) : (
          <span className="text-ink-muted">Walk-in</span>
        ),
    },
    { key: "service", header: "Service", cell: (row) => row.serviceName ?? "—" },
    { key: "staff", header: "Performer", cell: (row) => row.staffName ?? "Unassigned" },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <Badge variant={APPOINTMENT_STATUS_BADGE[row.status]}>
          {APPOINTMENT_STATUS_LABELS[row.status]}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <div className="flex justify-end gap-1.5">
          {OPEN_APPOINTMENT_STATUSES.includes(row.status) ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={isReadOnly || update.isPending}
                onClick={() => void quickStatus(row, "COMPLETED")}
              >
                Complete
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={isReadOnly || update.isPending}
                onClick={() => void quickStatus(row, "CANCELLED")}
              >
                Cancel
              </Button>
            </>
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => void openEdit(row)}>
            Edit
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl">Appointments</h2>
          <p className="mt-1 text-sm text-ink-muted">{viewSubtitle(view, day)}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-line bg-surface">
            <button
              type="button"
              aria-label={`Previous ${stepUnit}`}
              onClick={() => stepBy(-1)}
              className="flex h-control w-control items-center justify-center text-ink-body transition hover:bg-surface-muted"
            >
              <ChevronLeft aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setDay(new Date())}
              className={cn(
                "h-control px-3 text-sm font-medium transition",
                showingToday ? "text-purple" : "text-ink-body hover:bg-surface-muted",
              )}
            >
              Today
            </button>
            <button
              type="button"
              aria-label={`Next ${stepUnit}`}
              onClick={() => stepBy(1)}
              className="flex h-control w-control items-center justify-center text-ink-body transition hover:bg-surface-muted"
            >
              <ChevronLeft aria-hidden className="rotate-180" />
            </button>
          </div>

          {/* List | Day | Week | Month — the handoff's own Day/Week/Month switch (screen
              06), plus the list it also drew. The arrows above step whichever unit the
              pressed view shows, so the toggle is also what the arrows mean. */}
          <div className="flex items-center gap-1 rounded-md border border-line bg-surface p-0.5">
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={view === option.key}
                onClick={() => setView(option.key)}
                className={cn(
                  "h-control rounded-sm px-3 text-sm font-medium transition",
                  view === option.key
                    ? "bg-purple-soft text-purple"
                    : "text-ink-body hover:bg-surface-muted",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          {showList ? (
            <Select
              label="Status"
              hideLabel
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              options={APPOINTMENT_STATUS_OPTIONS}
              className="w-44"
            />
          ) : null}

          <Button onClick={openCreate} disabled={isReadOnly}>
            <Plus aria-hidden />
            Book appointment
          </Button>
        </div>
      </header>

      {/* Said out loud rather than silently truncated: a month drawn from one page has
          holes in it, and a hole in a calendar reads as free time. `total` comes from the
          envelope, so this is the response's own number rather than a second count. */}
      {truncated ? (
        <p
          role="status"
          className="rounded-card border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning"
        >
          Showing the first {calendarRows.length} of {calendar.data?.total ?? 0} appointments{" "}
          {showMonth ? "this month" : showWeek ? "this week" : "this day"} — a calendar read is at
          most {CALENDAR_PAGE_SIZE} at a time. Step to a smaller range, or use the list for the
          rest.
        </p>
      ) : null}

      {/* The week and the month cannot move a booking (ADR 0018, decision 5), and that is a
          limitation the desk should read rather than discover by dragging nothing. */}
      {showWeek || showMonth ? (
        <p className="text-sm text-ink-muted">
          Read-only view. To move a booking, drag its block in the day grid — or open it here to
          change anything else.
        </p>
      ) : null}

      {showList ? (
        <section
          aria-busy={isPending || isFetching}
          aria-label="Appointments for the selected day"
          className="rounded-card border border-line bg-surface"
        >
          <div className="flex items-center justify-between border-b border-line-soft px-5 py-3.5">
            <p className="text-sm text-ink-muted">
              {isPending
                ? "Loading appointments…"
                : `${data?.total ?? 0} ${data?.total === 1 ? "appointment" : "appointments"}`}
              {status
                ? ` · ${APPOINTMENT_STATUS_OPTIONS.find((option) => option.value === status)?.label}`
                : ""}
            </p>
          </div>

          {isPending ? (
            <div className="flex flex-col gap-3 p-5">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-11" />
              ))}
            </div>
          ) : isError ? (
            <EmptyState
              title="The book could not be loaded"
              description={getErrorMessage(error)}
              icon={<Calendar />}
              action={<Button onClick={() => void refetch()}>Try again</Button>}
            />
          ) : (
            <Table
              caption="Appointments for the selected day"
              columns={columns}
              rows={rows}
              rowKey={(row) => row.id}
              className="rounded-none border-0"
              empty={
                status || !showingToday ? (
                  <EmptyState
                    title="Nothing booked for that view"
                    description={
                      status
                        ? "No appointments match this status on the selected day."
                        : "The book is empty for this day. Move the date or book the first one."
                    }
                    icon={<Search />}
                    action={
                      <Button variant="secondary" onClick={() => setStatus("")}>
                        Clear filter
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    title="No appointments today"
                    description="Book the first appointment of the day and it will show up here."
                    icon={<Calendar />}
                    action={
                      <Button onClick={openCreate} disabled={isReadOnly}>
                        Book appointment
                      </Button>
                    }
                  />
                )
              }
            />
          )}
        </section>
      ) : showMonth ? (
        <MonthView
          day={day}
          appointments={calendarRows}
          isPending={calendar.isPending}
          isError={calendar.isError}
          errorMessage={calendar.error ? getErrorMessage(calendar.error) : undefined}
          isReadOnly={isReadOnly}
          onEdit={openEdit}
          onRetry={() => void calendar.refetch()}
        />
      ) : showWeek ? (
        <WeekView
          day={day}
          appointments={calendarRows}
          isPending={calendar.isPending}
          isError={calendar.isError}
          errorMessage={calendar.error ? getErrorMessage(calendar.error) : undefined}
          isReadOnly={isReadOnly}
          onEdit={openEdit}
          onRetry={() => void calendar.refetch()}
        />
      ) : (
        <CalendarView
          day={day}
          appointments={calendarRows}
          columns={gridColumns}
          isPending={calendar.isPending}
          isError={calendar.isError}
          errorMessage={calendar.error ? getErrorMessage(calendar.error) : undefined}
          isReadOnly={isReadOnly}
          onEdit={openEdit}
          onReschedule={handleReschedule}
          onRetry={() => void calendar.refetch()}
        />
      )}

      <AppointmentFormDrawer
        // Remounting on open and on record change is what clears the form.
        key={`${editing?.id ?? "new"}:${drawerOpen}`}
        open={drawerOpen}
        appointment={editing}
        defaultStartsAt={bookingStart(day)}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
