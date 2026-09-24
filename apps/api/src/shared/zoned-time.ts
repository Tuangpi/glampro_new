/**
 * Zoned time helpers.
 *
 * Business hours and weekly staff schedules are wall-clock strings such as
 * `09:00` that belong to a location's IANA time zone, while appointments are
 * instants. These helpers are the only place that converts between the two, so
 * the availability engine and the booking writes cannot drift apart.
 *
 * `Intl.DateTimeFormat` is used rather than a date library: Node ships full ICU,
 * and only two operations are needed — local wall clock to instant, and instant
 * to local wall clock. The two-pass offset resolution keeps both correct across
 * a daylight-saving change.
 */

export type ZonedParts = {
  /** Local calendar day as `YYYY-MM-DD`. */
  date: string;
  /** Local wall clock as `HH:MM`. */
  time: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 is Sunday, matching the `BusinessHour` and `StaffSchedule` convention. */
  dayOfWeek: number;
};

export type ZonedDayRange = {
  date: string;
  timeZone: string;
  dayOfWeek: number;
  /** First instant of the local day, inclusive. */
  startsAt: Date;
  /** First instant of the next local day, exclusive. */
  endsAt: Date;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (timeZone: string) => {
  const cached = formatterCache.get(timeZone);

  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    // `hour12: false` reports midnight as 24 in some ICU versions; h23 does not.
    hourCycle: 'h23',
  });

  formatterCache.set(timeZone, formatter);
  return formatter;
};

const pad = (value: number) => String(value).padStart(2, '0');

/** The weekday of a `YYYY-MM-DD` date, read as a plain calendar day. */
export const dayOfWeekOfDate = (date: string): number =>
  new Date(`${date}T00:00:00.000Z`).getUTCDay();

/** Calendar-day arithmetic on `YYYY-MM-DD`, so month and year ends roll over. */
export const addDays = (date: string, days: number): string => {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
};

/** Reads an instant as wall clock in the given zone. */
export const zonedPartsAt = (instant: Date, timeZone: string): ZonedParts => {
  const parts = new Map(
    formatterFor(timeZone)
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value] as const),
  );

  const year = Number(parts.get('year'));
  const month = Number(parts.get('month'));
  const day = Number(parts.get('day'));
  const date = `${year}-${pad(month)}-${pad(day)}`;

  return {
    date,
    time: `${parts.get('hour')}:${parts.get('minute')}`,
    year,
    month,
    day,
    hour: Number(parts.get('hour')),
    minute: Number(parts.get('minute')),
    second: Number(parts.get('second')),
    dayOfWeek: dayOfWeekOfDate(date),
  };
};

/** The zone's offset from UTC at one instant, in milliseconds. */
export const timeZoneOffsetMs = (instant: Date, timeZone: string): number => {
  const local = zonedPartsAt(instant, timeZone);

  return (
    Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) -
    instant.getTime()
  );
};

/**
 * Converts wall clock in a zone to the instant it names. The offset is read
 * twice, because the first guess can land on the far side of a daylight-saving
 * change, where the offset differs from the one that produced the guess.
 */
export const zonedTimeToUtc = (date: string, time: string, timeZone: string): Date => {
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number);
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute);

  const firstOffset = timeZoneOffsetMs(new Date(wallClockAsUtc), timeZone);
  const candidate = new Date(wallClockAsUtc - firstOffset);
  const correctedOffset = timeZoneOffsetMs(candidate, timeZone);

  return correctedOffset === firstOffset ? candidate : new Date(wallClockAsUtc - correctedOffset);
};

/** The instants that bracket one local calendar day. */
export const zonedDayRange = (date: string, timeZone: string): ZonedDayRange => ({
  date,
  timeZone,
  dayOfWeek: dayOfWeekOfDate(date),
  startsAt: zonedTimeToUtc(date, '00:00', timeZone),
  endsAt: zonedTimeToUtc(addDays(date, 1), '00:00', timeZone),
});

/** Minutes past local midnight for an `HH:MM` wall clock string. */
export const minutesOfDay = (time: string): number => {
  const [hour, minute] = time.split(':').map(Number);

  return (hour ?? 0) * 60 + (minute ?? 0);
};

/** The inverse of `minutesOfDay`, zero padded for `HH:MM` columns. */
export const timeOfMinutes = (minutes: number): string =>
  `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
