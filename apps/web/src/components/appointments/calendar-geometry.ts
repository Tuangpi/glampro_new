/**
 * Calendar grid geometry — pure maths, no DOM.
 *
 * The day view places every booking by its real `startsAt`/`endsAt` rather than
 * by a fixed row height, so a 30-minute fill and a 90-minute colour occupy
 * honestly different amounts of the track. The handoff (screen 06) drew a
 * 9:00–19:00 grid at a placeholder 1.2px/minute; the same *idea* is kept — one
 * scale for the whole day, minutes → pixels — with a wider window and a clean
 * hour height so the maths stays obvious and testable.
 *
 * Everything here is a pure function of a `Date`, which is what lets the grid
 * be unit-tested in jsdom without rendering a single block.
 */

import type { AppointmentSummary } from "@glampro/shared";

/** First hour shown in the gutter (local time). */
export const DAY_START_HOUR = 8;
/** First hour *past* the last one shown — the track ends at this hour. */
export const DAY_END_HOUR = 20;
/** Pixels per hour — an hour is always this tall, whatever its contents. */
export const HOUR_HEIGHT = 72;
/** Derived: pixels per minute, the one scale the whole grid uses. */
export const PX_PER_MINUTE = HOUR_HEIGHT / 60;
/** Minutes across the whole visible window. */
export const DAY_MINUTES = (DAY_END_HOUR - DAY_START_HOUR) * 60;
/** The smallest a block is drawn at, so a 5-minute booking is still clickable. */
export const MIN_BLOCK_PX = 22;
/** Drop targets snap to this many minutes (the handoff's quarter-hour slots). */
export const SNAP_MINUTES = 15;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Minutes since local midnight for an instant, fractional seconds dropped. */
export function minutesIntoDay(instant: Date): number {
  return instant.getHours() * 60 + instant.getMinutes();
}

/**
 * A block's box on the track, or `null` when the booking does not overlap the
 * visible window at all.
 *
 * `top`/`height` are in pixels and already clamped to the day, so a booking
 * that starts before 08:00 is drawn from the top edge rather than off-grid, and
 * one that runs past 20:00 is clipped at the bottom. `durationMinutes` is the
 * fallback span when `endsAt` is somehow absent (it is not, but the contract
 * allows it), so the block never collapses to zero height.
 */
export function blockBox(booking: {
  startsAt: string;
  endsAt?: string | null;
  durationMinutes?: number | null;
}): { top: number; height: number } | null {
  const start = new Date(booking.startsAt);
  if (Number.isNaN(start.getTime())) return null;

  const end =
    booking.endsAt != null
      ? new Date(booking.endsAt)
      : new Date(start.getTime() + (booking.durationMinutes ?? 30) * 60_000);

  const startMin = clamp(minutesIntoDay(start) - DAY_START_HOUR * 60, 0, DAY_MINUTES);
  const endMin = clamp(minutesIntoDay(end) - DAY_START_HOUR * 60, 0, DAY_MINUTES);

  if (endMin <= startMin) return null;

  return {
    top: startMin * PX_PER_MINUTE,
    height: Math.max(MIN_BLOCK_PX, (endMin - startMin) * PX_PER_MINUTE),
  };
}

/** Where the "now" indicator sits, or `null` outside the visible window. */
export function nowLineTop(now: Date): number | null {
  const minutes = minutesIntoDay(now) - DAY_START_HOUR * 60;
  if (minutes < 0 || minutes > DAY_MINUTES) return null;
  return minutes * PX_PER_MINUTE;
}

/** Round a fractional minute offset to the nearest slot (default quarter-hour). */
export function snapToSlot(minutes: number, slot = SNAP_MINUTES): number {
  return Math.round(minutes / slot) * slot;
}

/**
 * The instant a drop at `offsetMinutes` from the gutter top means, snapped.
 *
 * `offsetMinutes` is a raw pixel-derived minute offset within the day; this
 * turns it back into an absolute instant on `day` so a drag can be posted as a
 * real `startsAt`. Kept here so slice 6c's gesture reuses one definition of
 * "the time under the pointer" that the tests can pin.
 */
export function instantFromOffset(day: Date, offsetMinutes: number): Date {
  const snapped = clamp(snapToSlot(offsetMinutes), 0, DAY_MINUTES);
  const result = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  result.setMinutes(DAY_START_HOUR * 60 + snapped);
  return result;
}

/** One vertical track. `id === null` is the Unassigned column. */
export interface CalendarColumn {
  id: string | null;
  name: string;
  role?: string;
}

/**
 * The tracks the day gets: one per member of staff, then Unassigned.
 *
 * Staff come from the roster rather than from the bookings, so a stylist with
 * an empty day still has a column — "nobody booked them" and "they are not on
 * today" must look different. Unassigned is always last and always present,
 * because a booking with no performer is a real thing the day has to show.
 *
 * Kept here, beside the geometry, because it is the same kind of pure function
 * of its inputs — and because a component file must export only components
 * (`react-refresh/only-export-components`).
 */
export function buildCalendarColumns(
  appointments: AppointmentSummary[],
  staff: ReadonlyArray<{ id: string; name: string; role?: string }>,
): CalendarColumn[] {
  const columns: CalendarColumn[] = staff.map((member) => ({
    id: member.id,
    name: member.name,
    role: member.role,
  }));

  // A staff id on a booking with no matching roster row (a disabled account,
  // a page raced by a write) still deserves a column rather than a lost block.
  for (const booking of appointments) {
    if (booking.staffId && !columns.some((column) => column.id === booking.staffId)) {
      columns.push({ id: booking.staffId, name: booking.staffName ?? "Unassigned" });
    }
  }

  columns.push({ id: null, name: "Unassigned" });
  return columns;
}
