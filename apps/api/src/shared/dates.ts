/**
 * Date-only helpers.
 *
 * `DATE` columns hold a calendar day with no time zone — a birthday or a hire
 * date must not shift when the server or the browser sits in another zone — so
 * they cross the API as `YYYY-MM-DD` strings rather than timestamps.
 */

export const toDateOnly = (value: Date | null): string | null =>
  value === null ? null : value.toISOString().slice(0, 10);

/** Reads a validated `YYYY-MM-DD` string into the UTC midnight Prisma expects. */
export const parseDateOnly = (value: string | null): Date | null =>
  value === null ? null : new Date(`${value}T00:00:00.000Z`);
