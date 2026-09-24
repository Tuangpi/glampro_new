import type { AppointmentWindow, AvailabilityQuery, AvailabilitySlot } from '@glampro/contracts';
import { prisma } from '../../database/prisma.js';
import {
  minutesOfDay,
  timeOfMinutes,
  zonedDayRange,
  zonedTimeToUtc,
} from '../../shared/zoned-time.js';
import { scopedStaffRow } from '../staff/staff.common.js';
import {
  assertBookableDuration,
  bookableServicesOf,
  occupyingStatuses,
  scopedLocationRow,
  totalDurationOf,
} from './appointments.common.js';

/**
 * Availability for one staff member on one local day.
 *
 * The day's window is the intersection of the location's business hours and the
 * staff member's weekly schedule. Recorded absences and visits that still hold
 * their slot are then subtracted, and the remaining time is offered in fixed
 * steps, each of which must fit the whole visit. Time outside the window is not
 * offered here, but the booking routes do not refuse it: a salon that takes a
 * walk-in after closing can still record it.
 */

export type AvailabilityResult = {
  date: string;
  timezone: string;
  window: AppointmentWindow | null;
  slots: AvailabilitySlot[];
};

/** A wall-clock window in minutes past local midnight. */
type Interval = { start: number; end: number };

/** Null when the day is not on at all, whatever times it carries. */
const wallClockWindow = (
  row: { startsAt: string | null; endsAt: string | null; isOn: boolean } | null,
): Interval | null =>
  row && row.isOn && row.startsAt !== null && row.endsAt !== null
    ? { start: minutesOfDay(row.startsAt), end: minutesOfDay(row.endsAt) }
    : null;

/** Minutes past local midnight, so the day's arithmetic stays in integers. */
const minutesIntoDay = (instant: Date, dayStart: Date) =>
  Math.round((instant.getTime() - dayStart.getTime()) / 60_000);

export const availabilityFor = async (
  organizationId: string,
  query: AvailabilityQuery,
): Promise<AvailabilityResult> => {
  const location = await scopedLocationRow(organizationId, query.locationId);
  const staff = await scopedStaffRow(organizationId, query.staffProfileId);

  const empty = { date: query.date, timezone: location.timezone, window: null, slots: [] };

  // A roster member who no longer takes bookings simply has no availability.
  if (!staff.isActive || !staff.isBookable) {
    return empty;
  }

  const durationMinutes =
    query.durationMinutes ??
    totalDurationOf(await bookableServicesOf(organizationId, staff.id, query.serviceIds ?? []));

  assertBookableDuration(durationMinutes);

  const day = zonedDayRange(query.date, location.timezone);

  const [businessHour, schedule, absences, bookings] = await Promise.all([
    prisma.businessHour.findFirst({
      where: { locationId: location.id, dayOfWeek: day.dayOfWeek },
      select: { opensAt: true, closesAt: true, isClosed: true },
    }),
    prisma.staffSchedule.findFirst({
      where: { organizationId, staffProfileId: staff.id, dayOfWeek: day.dayOfWeek },
      select: { startsAt: true, endsAt: true, isWorking: true },
    }),
    prisma.staffTimeOff.findMany({
      where: {
        organizationId,
        staffProfileId: staff.id,
        startsAt: { lt: day.endsAt },
        endsAt: { gt: day.startsAt },
      },
      select: { startsAt: true, endsAt: true },
    }),
    prisma.appointment.findMany({
      where: {
        organizationId,
        staffProfileId: staff.id,
        status: { in: occupyingStatuses },
        startsAt: { lt: day.endsAt },
        endsAt: { gt: day.startsAt },
      },
      select: { startsAt: true, endsAt: true },
    }),
  ]);

  const openFrom = wallClockWindow(
    businessHour
      ? {
          startsAt: businessHour.opensAt,
          endsAt: businessHour.closesAt,
          isOn: !businessHour.isClosed,
        }
      : null,
  );
  const worksFrom = wallClockWindow(
    schedule
      ? { startsAt: schedule.startsAt, endsAt: schedule.endsAt, isOn: schedule.isWorking }
      : null,
  );

  if (!openFrom || !worksFrom) {
    return empty;
  }

  const start = Math.max(openFrom.start, worksFrom.start);
  const end = Math.min(openFrom.end, worksFrom.end);

  if (end <= start) {
    return empty;
  }

  const utcAt = (minutes: number) =>
    zonedTimeToUtc(query.date, timeOfMinutes(minutes), location.timezone);

  const busy: Interval[] = [...absences, ...bookings].map((row) => ({
    start: minutesIntoDay(row.startsAt, day.startsAt),
    end: minutesIntoDay(row.endsAt, day.startsAt),
  }));

  const slots: AvailabilitySlot[] = [];

  for (let minute = start; minute + durationMinutes <= end; minute += query.slotMinutes) {
    const slotEnd = minute + durationMinutes;
    const clashes = busy.some((interval) => interval.start < slotEnd && interval.end > minute);

    if (clashes) {
      continue;
    }

    slots.push({ startsAt: utcAt(minute).toISOString(), endsAt: utcAt(slotEnd).toISOString() });
  }

  return {
    date: query.date,
    timezone: location.timezone,
    window: { startsAt: utcAt(start).toISOString(), endsAt: utcAt(end).toISOString() },
    slots,
  };
};
