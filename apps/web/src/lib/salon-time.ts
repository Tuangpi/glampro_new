/**
 * Salon-local time — interpreting API instants in the salon's saved timezone,
 * never the browser's local clock.
 *
 * Every instant the API sends is a UTC moment. A salon in Asia/Singapore serving
 * a desk in America/Los_Angeles must draw 09:00 as 09:00 Singapore time, not 09:00
 * Los Angeles time. This module converts between instants and the salon's wall
 * clock using `Intl.DateTimeFormat(timeZone)`, which is ICU-backed and does not
 * depend on the host process's timezone, so the same test run passes whether the
 * machine is set to Los Angeles, Auckland or Singapore.
 *
 * A `Date` is always one instant. The convention here: when a function returns a
 * `Date` meant to be read as "salon local", its host-local getters (`getHours`,
 * `getDate`, …) read the salon wall clock. That lets the existing calendar
 * geometry (built on host-local getters) stay pure while drawing salon time.
 */

export interface SalonWallClock {
  year: number;
  /** 1-based month. */
  month: number;
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
  millisecond: number;
}

const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  fractionalSecondDigits: 3,
  hour12: false,
} as const;

/**
 * The wall-clock components of `instant` as read in `timeZone`. Returns `null`
 * for an invalid instant.
 */
export function salonWallClock(instant: Date, timeZone: string): SalonWallClock | null {
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    ...DATE_TIME_OPTIONS,
    timeZone,
  }).formatToParts(instant);
  const get = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
    millisecond: get("fractionalSecond"),
  };
}

/**
 * A `Date` whose host-local fields read the salon wall-clock of `instant`.
 *
 * `new Date(2026, 9, 9, 9, 0)` reads 09:00 in the host timezone. Passing the
 * salon wall-clock fields of an instant there returns a `Date` whose own
 * getters read that salon wall-clock, regardless of the host timezone. Use it
 * to hand the calendar geometry a `Date` that "is" a salon-local day or time.
 * Returns `null` for an invalid instant.
 */
export function toSalonDate(instant: Date | string, timeZone: string): Date | null {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) return null;
  const wall = salonWallClock(date, timeZone);
  if (!wall) return null;
  return new Date(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
    wall.millisecond,
  );
}

/**
 * The real instant whose wall-clock in `timeZone` matches `salonDate`'s
 * host-local fields — the inverse of `toSalonDate`. Used to turn a salon-local
 * day boundary or a snapped drop slot back into the instant the API expects.
 *
 * The offset between host and salon is constant within a DST period, so one
 * correction lands exactly; up to three iterations keep a drop made right at a
 * DST boundary from drifting an hour.
 */
export function instantFromSalonDate(salonDate: Date, timeZone: string): Date {
  const target = Date.UTC(
    salonDate.getFullYear(),
    salonDate.getMonth(),
    salonDate.getDate(),
    salonDate.getHours(),
    salonDate.getMinutes(),
    salonDate.getSeconds(),
    salonDate.getMilliseconds(),
  );
  let instant = salonDate.getTime();
  for (let i = 0; i < 3; i++) {
    const actual = salonWallClock(new Date(instant), timeZone);
    if (!actual) return new Date(instant);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
      actual.millisecond,
    );
    const diffMinutes = (target - actualAsUtc) / 60_000;
    if (Math.abs(diffMinutes) < 0.5) return new Date(instant);
    instant += diffMinutes * 60_000;
  }
  return new Date(instant);
}

/** The calendar date of `instant` in `timeZone` — `2026-10-09`, not UTC. */
export function salonDayKey(instant: Date, timeZone: string): string | null {
  const wall = salonWallClock(instant, timeZone);
  if (!wall) return null;
  const month = String(wall.month).padStart(2, "0");
  const date = String(wall.day).padStart(2, "0");
  return `${wall.year}-${month}-${date}`;
}

/** Minutes since salon-local midnight for `instant`, fractional seconds dropped. */
export function salonMinutesIntoDay(instant: Date, timeZone: string): number | null {
  const wall = salonWallClock(instant, timeZone);
  if (!wall) return null;
  return wall.hour * 60 + wall.minute;
}

/** Salon-local midnight of the day `instant` falls on, as a salon-local `Date`. */
export function salonStartOfDay(instant: Date, timeZone: string): Date | null {
  const wall = salonWallClock(instant, timeZone);
  if (!wall) return null;
  return new Date(wall.year, wall.month - 1, wall.day, 0, 0, 0, 0);
}

/** The last millisecond of `instant`'s salon-local day, as a salon-local `Date`. */
export function salonEndOfDay(instant: Date, timeZone: string): Date | null {
  const wall = salonWallClock(instant, timeZone);
  if (!wall) return null;
  return new Date(wall.year, wall.month - 1, wall.day, 23, 59, 59, 999);
}

/** `days` later than `salonDate`, holding the salon wall clock at midnight. */
export function salonAddDays(salonDate: Date, days: number): Date {
  return new Date(salonDate.getFullYear(), salonDate.getMonth(), salonDate.getDate() + days);
}

/** Whether two instants fall on the same salon-local day. */
export function salonIsSameDay(left: Date, right: Date, timeZone: string): boolean {
  const leftKey = salonDayKey(left, timeZone);
  return leftKey !== null && leftKey === salonDayKey(right, timeZone);
}
