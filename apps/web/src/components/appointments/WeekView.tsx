/**
 * The week calendar — handoff screen 06's Week toggle: seven day columns on the day
 * grid's own scale.
 *
 * The day grid draws **who**; the week draws **when**. Each column is a day and every
 * booking is placed by its real times through the same `blockBox(booking, day)` the day
 * view uses, so a 10:00 booking is the same block in both — and a booking that is not on a
 * given day is not drawn on it at all (ADR 0018, decision 2: a booking belongs to the day
 * it starts on, and one crossing midnight is on neither day).
 *
 * A block says who is performing here, because a day column carries no staff name to read
 * it off — which is the one thing the day grid's columns already answer.
 *
 * **This view is read-only** (ADR 0018, decision 5). Dragging a block *down* is the day
 * grid's gesture, where one gutter and one snapped slot make "which minute" unambiguous;
 * across seven columns it would turn a nudge into a week-long move, and the lanes below
 * make "which column, which minute" ambiguous when two blocks share a column. Clicking a
 * block still opens the same drawer, so nothing is unreachable — and the page says so.
 *
 * Overlapping bookings divide their column into **lanes** (`packLanes`) instead of
 * stacking, so a pair the 6b rule could not prevent — two unassigned bookings at 09:00, or
 * a legacy row — is drawn twice over rather than hidden once.
 */
import type { AppointmentSummary } from "@glampro_suite/shared";

import { Calendar } from "@/components/icons";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import { CALENDAR_WEEKDAY_LABELS } from "@/constants/appointments";
import { cn } from "@/lib/utils";
import AppointmentBlock from "./AppointmentBlock";
import {
  DAY_HOURS,
  DAY_START_HOUR,
  HOUR_HEIGHT,
  HOUR_LINES,
  TRACK_HEIGHT,
  blockBox,
  blockMinutes,
  bookingsByDay,
  dayKey,
  gridTemplate,
  isSameDay,
  nowLineTop,
  packLanes,
  weekDays,
} from "./calendar-geometry";

export interface WeekViewProps {
  /** Any day inside the week to draw — the week is the Monday-first one it falls in. */
  day: Date;
  /** Already loaded for the week — the component owns no query of its own. */
  appointments: AppointmentSummary[];
  isPending?: boolean;
  isError?: boolean;
  errorMessage?: string;
  /** A suspended salon may look but not open the editor. */
  isReadOnly?: boolean;
  onEdit: (appointment: AppointmentSummary) => void;
  onRetry?: () => void;
}

export default function WeekView({
  day,
  appointments,
  isPending = false,
  isError = false,
  errorMessage,
  isReadOnly = false,
  onEdit,
  onRetry,
}: WeekViewProps) {
  if (isPending) {
    return (
      <div className="flex flex-col gap-3 p-5" aria-busy="true">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-16" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        title="The week could not be loaded"
        description={errorMessage ?? "These bookings are unavailable right now."}
        icon={<Calendar />}
        action={
          onRetry ? (
            <Button onClick={onRetry} variant="secondary">
              Try again
            </Button>
          ) : undefined
        }
      />
    );
  }

  const days = weekDays(day);
  const byDay = bookingsByDay(appointments);
  const today = new Date();

  if (appointments.length === 0) {
    return (
      <div className="p-5">
        <EmptyState
          title="Nothing booked that week"
          description="Move the week, or book the first appointment and it will appear on the grid."
          icon={<Calendar />}
        />
      </div>
    );
  }

  return (
    <div className="rounded-card overflow-hidden border border-line bg-surface">
      {/* Day heads — a second grid with the same template, so a head always sits exactly
          above its own column. `CALENDAR_WEEKDAY_LABELS` is Monday-first, the same first
          day `weekDays` returns. */}
      <div
        className="grid border-b border-line-soft"
        style={{ gridTemplateColumns: gridTemplate(days.length) }}
      >
        <div className="border-r border-line-soft" />
        {days.map((column, index) => (
          <div
            key={dayKey(column)}
            className="flex flex-col items-center gap-1 border-r border-line-soft px-2 py-2.5"
          >
            <span className="text-2xs font-bold tracking-wide text-ink-muted uppercase">
              {CALENDAR_WEEKDAY_LABELS[index]}
            </span>
            <span
              aria-hidden
              className={cn(
                "flex size-6 items-center justify-center rounded-pill text-xs font-extrabold",
                isSameDay(column, today) ? "bg-purple text-white" : "text-ink",
              )}
            >
              {column.getDate()}
            </span>
          </div>
        ))}
      </div>

      <div className="max-h-[70vh] overflow-auto">
        <div
          className="grid"
          style={{ gridTemplateColumns: gridTemplate(days.length) }}
          aria-label={`Week of ${days[0]?.toDateString() ?? ""}`}
        >
          {/* Time gutter: hour labels, each centred on its own hour line. */}
          <div className="relative border-r border-line-soft" style={{ height: TRACK_HEIGHT }}>
            {DAY_HOURS.map((hour) => (
              <span
                key={hour}
                className="absolute inset-x-0 pr-2 text-right text-2xs font-bold text-ink-faint"
                style={{
                  top: (hour - DAY_START_HOUR) * HOUR_HEIGHT,
                  transform: "translateY(-50%)",
                }}
              >
                {`${String(hour).padStart(2, "0")}:00`}
              </span>
            ))}
          </div>

          {days.map((column) => (
            <DayTrack
              key={dayKey(column)}
              day={column}
              appointments={byDay.get(dayKey(column)) ?? []}
              showingToday={isSameDay(column, today)}
              isReadOnly={isReadOnly}
              onEdit={onEdit}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * One day column: the hour lines, that day's blocks in their lanes, and the now-indicator
 * when the column is today.
 *
 * There is no drop handler here and there should not be one — the week is read-only
 * (ADR 0018, decision 5), so a block is only ever a link to the drawer.
 */
function DayTrack({
  day,
  appointments,
  showingToday,
  isReadOnly,
  onEdit,
}: {
  day: Date;
  appointments: AppointmentSummary[];
  showingToday: boolean;
  isReadOnly: boolean;
  onEdit: (appointment: AppointmentSummary) => void;
}) {
  // `blockMinutes` answers "is this booking on this day at all?", which is what keeps the
  // week honest: a booking is drawn in its own column and in no other.
  const placed = appointments.flatMap((booking) => {
    const span = blockMinutes(booking, day);
    const box = blockBox(booking, day);
    return span === null || box === null ? [] : [{ booking, span, box }];
  });

  const lanes = packLanes(
    placed.map(({ booking, span }) => ({ id: booking.id, start: span.start, end: span.end })),
  );
  const nowTop = showingToday ? nowLineTop(new Date()) : null;

  return (
    <div
      // Exposed so a test can assert a block rendered in its own day's column, not merely
      // that a block exists somewhere on the grid.
      data-day={dayKey(day)}
      className="relative border-r border-line-soft"
      style={{ height: TRACK_HEIGHT, backgroundImage: HOUR_LINES }}
    >
      {placed.map(({ booking, box }) => (
        <AppointmentBlock
          key={booking.id}
          booking={booking}
          top={box.top}
          height={box.height}
          lane={lanes.get(booking.id)}
          showStaff
          isReadOnly={isReadOnly}
          onEdit={onEdit}
        />
      ))}

      {nowTop === null ? null : (
        <div
          data-testid="now-line"
          className="pointer-events-none absolute inset-x-0 z-3 h-0.5 bg-danger"
          style={{ top: nowTop }}
        />
      )}
      {/* The day is exposed for assistive tech, since a grid of time blocks carries no
          other statement of which day it is drawing. */}
      <span className="sr-only">{day.toDateString()}</span>
    </div>
  );
}
