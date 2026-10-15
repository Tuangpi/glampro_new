/**
 * Wall clock — the one conversion a rota cannot do without.
 *
 * A shift is stored as **minutes since local midnight** on a day of the week,
 * because "9:00 AM – 6:00 PM every Tuesday" is a statement about the clock in
 * front of the salon, not about any instant. A booking is stored as a **UTC
 * instant**, because that is the only way two salons in two timezones can hold
 * bookings without one reading the other's. The availability gate is the single
 * place those two representations meet, and this file is the bridge.
 *
 * **The bridge is an IANA timezone the browser sends, exactly as
 * `reportRangeQuerySchema` already does.** `GET /api/reports/overview` takes a
 * validated `timeZone` and formats each sale into it with `Intl`, because the
 * schema has no timezone column and letting the server guess would put "today"
 * somewhere the salon is not. The gate has the same problem and uses the same
 * answer, so there is one convention in this codebase rather than two.
 *
 * What is deliberately **not** used:
 *
 * - **`Date#getHours()`** would read the *server's* clock. A salon in Bangkok
 *   booking 09:00 would be gated by a container in Frankfurt at 04:00 and refused
 *   a shift it is standing in the middle of. That bug passes every test pinned to
 *   a UTC or same-offset fixture and only appears in production.
 * - **The offset carried on the instant's own string** is the tempting version,
 *   and it is wrong here for a reason worth recording: the client sends
 *   `Date#toISOString()`, which is **always `Z`**. So every offset would read as
 *   `+00:00` and the wall clock would come out as UTC — the same bug, wearing a
 *   cleverer disguise. It would only work if every caller changed to emit local
 *   offsets, which nothing in the tree does.
 *
 * `Intl.DateTimeFormat` in a named zone answers both questions at once — which
 * weekday it is there and how many minutes past midnight — and it gets DST right
 * because it applies the zone's own rules to the instant rather than assuming a
 * fixed offset.
 */

/**
 * Reads an instant as the wall clock of `timeZone`: the weekday there (0 =
 * Sunday, matching `Date#getDay()`, which is how `StaffShift.dayOfWeek` is
 * numbered) and the minutes past local midnight.
 *
 * `timeZone` must be a valid IANA zone. The contract validates it at the route
 * boundary (`timeZoneSchema` in `packages/shared`), so a bad zone is a `400`
 * before it reaches here; this function would otherwise throw a `RangeError`
 * from `Intl` and surface as a `500`.
 */
export function wallClockAt(
  instant: Date,
  timeZone: string,
): { dayOfWeek: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);

  const part = (type: Intl.DateTimeFormatPartTypes): string | undefined =>
    parts.find((candidate) => candidate.type === type)?.value;

  // `en-US` names the weekdays; `Date#getDay()` is the numbering the column uses,
  // so the two are mapped through one list rather than through a second convention.
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(part("weekday") ?? "");

  // `hour12: false` renders midnight as `24` in some ICU versions, so the day
  // wraps rather than reading 1440 minutes into a day that does not have them.
  const hour = Number(part("hour")) % 24;
  const minute = Number(part("minute"));

  return { dayOfWeek: weekday < 0 ? 0 : weekday, minutes: hour * 60 + minute };
}

/** `"09:00"` → `540`. The rota editor's inputs and the shift chip both read these. */
export function formatMinuteOfDay(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/** `540` → `"9:00 AM"`, the shape the handoff's `.staff-shift` chip draws. */
export function formatShiftTime(minutes: number): string {
  const total = ((minutes % 1440) + 1440) % 1440;
  const hours24 = Math.floor(total / 60);
  const suffix = hours24 < 12 ? "AM" : "PM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(total % 60).padStart(2, "0")} ${suffix}`;
}
