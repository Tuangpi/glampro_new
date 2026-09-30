/**
 * Shared display helpers.
 *
 * Every formatter returns "—" for missing input so tables never render
 * "Invalid Date", "null" or an empty cell.
 */

const EMPTY = "—";

export function formatDate(
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" },
): string {
  const date = toDate(value);
  return date ? date.toLocaleDateString("en-GB", options) : EMPTY;
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return EMPTY;
  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : EMPTY;
}

/** `YYYY-MM-DD` in local time — safe for `<input type="date">`. */
export function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Formats a minor-unit amount (cents) as a currency string. */
export function formatMoney(
  minorUnits: number | null | undefined,
  currency = "USD",
  locale = "en-US",
): string {
  if (minorUnits === null || minorUnits === undefined || !Number.isFinite(minorUnits)) return EMPTY;
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minorUnits / 100);
}

/** "1h 15m" / "45m" from a duration in minutes. */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return EMPTY;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours > 0 ? `${hours}h ${remainder}m` : `${remainder}m`;
}

/** Up to two uppercase initials, for avatar fallbacks. */
export function getInitials(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

/** `IN_PROGRESS` → `in progress`. */
export function formatStatus(status: string | null | undefined): string {
  if (!status) return EMPTY;
  return status.replace(/_/g, " ").toLowerCase();
}

/** Joins conditional class names. */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
