/**
 * The day calendar — handoff screen 06's grid.
 *
 * One column per member of staff plus an **Unassigned** column, a time gutter
 * down the left, and every booking drawn as a block placed by its real
 * `startsAt`/`endsAt` through `calendar-geometry.ts`. There is no calendar
 * library and no new contract: the blocks are the same `AppointmentSummary`
 * rows the day list shows, so the two views are one fact asked twice.
 *
 * Three things the handoff drew that this does not, because the model has
 * nothing behind them: a Week and Month view (the query is a day window), a
 * shift or break block on the track (there is no rota table — `EmployeeLeave`
 * is the only half modelled, and it is not read here yet), and a click-to-book
 * empty slot. The grid is a **view** of the book, and the writes still go
 * through the drawer and, in slice 6c, a drag that posts a real PATCH.
 *
 * The colours are the handoff's own (a purple block, an amber in-progress
 * block, a green done block) mapped onto the project's tokens rather than the
 * file's literals — `tokens.css` is copied, never edited (`AGENTS.md` rule 2).
 */
import type { AppointmentSummary } from "@glampro/shared";

import { Calendar } from "@/components/icons";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import {
  APPOINTMENT_BLOCK_TONE,
  APPOINTMENT_STATUS_LABELS,
  type CalendarBlockTone,
} from "@/constants/appointments";
import { cn, formatTime, getInitials } from "@/lib/utils";
import {
  DAY_END_HOUR,
  DAY_MINUTES,
  DAY_START_HOUR,
  HOUR_HEIGHT,
  PX_PER_MINUTE,
  blockBox,
  type CalendarColumn,
  nowLineTop,
} from "./calendar-geometry";

export type { CalendarColumn };

export interface CalendarViewProps {
  day: Date;
  /** Already loaded for the day — the component owns no query of its own. */
  appointments: AppointmentSummary[];
  columns: CalendarColumn[];
  isPending?: boolean;
  isError?: boolean;
  errorMessage?: string;
  /** Disabled blocks: a suspended salon may look but not open the editor. */
  isReadOnly?: boolean;
  onEdit: (appointment: AppointmentSummary) => void;
  onRetry?: () => void;
}

/** The gutter's width, matching the handoff's 68px time column. */
const GUTTER_WIDTH = 68;
/** A staff column never narrower than this, so a name still fits. */
const MIN_COLUMN_WIDTH = 140;
const TRACK_HEIGHT = DAY_MINUTES * PX_PER_MINUTE;

/** Which column a booking belongs in: its performer, or Unassigned. */
function columnOf(booking: AppointmentSummary): string | null {
  return booking.staffId ?? null;
}

/** A plain-text retry control, so this component needs no Button import cycle. */
function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      type="button"
      onClick={onRetry}
      className="rounded-md bg-purple px-4 py-2 text-sm font-semibold text-white"
    >
      Try again
    </button>
  );
}

export default function CalendarView({
  day,
  appointments,
  columns,
  isPending = false,
  isError = false,
  errorMessage,
  isReadOnly = false,
  onEdit,
  onRetry,
}: CalendarViewProps) {
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
        title="The calendar could not be loaded"
        description={errorMessage ?? "The day's bookings are unavailable right now."}
        icon={<Calendar />}
        action={onRetry ? <RetryButton onRetry={onRetry} /> : undefined}
      />
    );
  }

  // Buckets keyed by column, filled once rather than filtered per track — a
  // day with 40 bookings and 6 columns is one pass, not six.
  const byColumn = new Map<string | null, AppointmentSummary[]>();
  for (const column of columns) byColumn.set(column.id, []);
  for (const booking of appointments) {
    const key = columnOf(booking);
    const bucket = byColumn.get(key);
    if (bucket) bucket.push(booking);
    else byColumn.set(key, [booking]);
  }

  const showingToday = day.toDateString() === new Date().toDateString();

  if (appointments.length === 0) {
    return (
      <div className="p-5">
        <EmptyState
          title="Nothing booked that day"
          description="Move the date, or book the first appointment and it will appear on the grid."
          icon={<Calendar />}
        />
      </div>
    );
  }

  return (
    <div className="rounded-card overflow-hidden border border-line bg-surface">
      {/* Staff header — a second grid with the same template, so a column head
          always sits exactly above its own track. */}
      <div
        className="grid border-b border-line-soft"
        style={{ gridTemplateColumns: gridTemplate(columns.length) }}
      >
        <div className="border-r border-line-soft" />
        {columns.map((column) => (
          <div
            key={column.id ?? "unassigned"}
            className="flex items-center gap-2.5 border-r border-line-soft px-3 py-3.5"
          >
            <span
              aria-hidden
              className={cn(
                "flex size-7.5 shrink-0 items-center justify-center rounded-pill text-2xs font-extrabold",
                column.id === null ? "bg-surface-2 text-ink-muted" : "bg-navy text-white",
              )}
            >
              {column.id === null ? "?" : getInitials(column.name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-extrabold text-ink">{column.name}</span>
              {column.role ? (
                <span className="block truncate text-2xs text-ink-muted">{column.role}</span>
              ) : null}
            </span>
          </div>
        ))}
      </div>

      <div className="max-h-[70vh] overflow-auto">
        <div
          className="grid"
          style={{ gridTemplateColumns: gridTemplate(columns.length) }}
          aria-label={`Calendar for ${day.toDateString()}`}
        >
          {/* Time gutter: hour labels, each centred on its own hour line. */}
          <div className="relative border-r border-line-soft" style={{ height: TRACK_HEIGHT }}>
            {HOURS.map((hour) => (
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

          {columns.map((column) => (
            <StaffTrack
              key={column.id ?? "unassigned"}
              column={column}
              day={day}
              appointments={byColumn.get(column.id) ?? []}
              showingToday={showingToday}
              isReadOnly={isReadOnly}
              onEdit={onEdit}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** A block's tint, kept as three maps so each is one class per tone. */
const TONE_BORDER: Record<CalendarBlockTone, string> = {
  brand: "border-l-purple",
  success: "border-l-success",
  warning: "border-l-warning",
  neutral: "border-l-line",
  danger: "border-l-danger",
};

const TONE_BACKGROUND: Record<CalendarBlockTone, string> = {
  brand: "bg-purple-soft",
  success: "bg-success-soft",
  warning: "bg-warning-soft",
  neutral: "bg-surface-2",
  danger: "bg-danger/10",
};

const TONE_TEXT: Record<CalendarBlockTone, string> = {
  brand: "text-purple",
  success: "text-success-text",
  warning: "text-warning",
  neutral: "text-ink-muted",
  danger: "text-danger",
};

/** Hour lines, drawn as one repeating gradient instead of N absolutely placed divs. */
const HOUR_LINES = `repeating-linear-gradient(to bottom, transparent 0, transparent ${
  HOUR_HEIGHT - 1
}px, var(--color-line-soft) ${HOUR_HEIGHT - 1}px, var(--color-line-soft) ${HOUR_HEIGHT}px)`;

/**
 * The header and the body are two separate grids that must agree, so both take
 * their template from here — the gutter plus one equal column per track.
 */
function gridTemplate(columnCount: number): string {
  return `${GUTTER_WIDTH}px repeat(${columnCount}, minmax(${MIN_COLUMN_WIDTH}px, 1fr))`;
}

/** The hour labels down the gutter — one per hour, from 08:00 to 19:00. */
const HOURS = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR },
  (_, index) => DAY_START_HOUR + index,
);

/**
 * One booking, drawn on its track.
 *
 * A block is a button rather than a div with a handler: the desk reaches the
 * editor by keyboard as well as by mouse, and a clickable div that is not a
 * button is how a screen reader ends up with a silent grid. `isReadOnly` keeps
 * it inert — a suspended salon sees the day but cannot open the write path.
 */
function AppointmentBlock({
  booking,
  top,
  height,
  isReadOnly,
  onEdit,
}: {
  booking: AppointmentSummary;
  top: number;
  height: number;
  isReadOnly: boolean;
  onEdit: (appointment: AppointmentSummary) => void;
}) {
  const tone = APPOINTMENT_BLOCK_TONE[booking.status];
  const customer = booking.customerName ?? "Walk-in";
  const label = `${customer}, ${APPOINTMENT_STATUS_LABELS[booking.status]}`;
  // Below ~34px there is room for the name and nothing else, so the service
  // line and the time range are dropped rather than overflowing the block.
  const compact = height < 34;

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={isReadOnly}
      onClick={() => onEdit(booking)}
      style={{ top, height }}
      className={cn(
        "absolute right-1.5 left-1.5 overflow-hidden rounded-sm border-l-[3px] px-2 py-1 text-left shadow-[0_2px_6px_rgba(27,35,80,0.08)] transition",
        "hover:brightness-[0.97] disabled:hover:brightness-100",
        TONE_BORDER[tone],
        TONE_BACKGROUND[tone],
      )}
    >
      <p className="truncate text-xs leading-tight font-extrabold text-ink">{customer}</p>
      {compact ? null : (
        <p className={cn("mt-0.5 truncate text-2xs", TONE_TEXT[tone])}>
          {booking.serviceName ?? "—"}
        </p>
      )}
      {compact ? null : (
        <p className="truncate text-2xs text-ink-muted">
          {formatTime(booking.startsAt)} – {formatTime(booking.endsAt)}
        </p>
      )}
    </button>
  );
}

/**
 * One vertical track: the hour lines, the day's blocks for that performer, and
 * the now-indicator when the track is today.
 */
function StaffTrack({
  column,
  day,
  appointments,
  showingToday,
  isReadOnly,
  onEdit,
}: {
  column: CalendarColumn;
  day: Date;
  appointments: AppointmentSummary[];
  showingToday: boolean;
  isReadOnly: boolean;
  onEdit: (appointment: AppointmentSummary) => void;
}) {
  const nowTop = showingToday ? nowLineTop(new Date()) : null;
  const placed = appointments
    .map((booking) => ({ booking, box: blockBox(booking) }))
    .filter(
      (entry): entry is { booking: AppointmentSummary; box: { top: number; height: number } } =>
        entry.box !== null,
    );

  return (
    <div
      // Exposed so a test can assert a block rendered under its own staff head,
      // not merely that a block exists somewhere on the grid.
      data-column={column.id ?? "unassigned"}
      className="relative border-r border-line-soft"
      style={{ height: TRACK_HEIGHT, backgroundImage: HOUR_LINES }}
    >
      {placed.map(({ booking, box }) => (
        <AppointmentBlock
          key={booking.id}
          booking={booking}
          top={box.top}
          height={box.height}
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
      {/* The day is exposed for assistive tech, since a grid of time blocks
          carries no other statement of which day it is drawing. */}
      <span className="sr-only">{day.toDateString()}</span>
    </div>
  );
}
