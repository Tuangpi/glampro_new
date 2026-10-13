/**
 * Appointments vocabulary — the words the day view and the form share.
 *
 * One place for both, for the same reason `constants/staff.ts` holds the role
 * labels: the table's status cell, the filter and the drawer must not each
 * invent their own word for `NO_SHOW`. The lists are derived from the
 * contract's own `APPOINTMENT_STATUSES` rather than re-typed, so a status
 * added there is a compile error here instead of a row nobody can name.
 */
import type { BadgeVariant } from "@/components/ui/Badge";
import { APPOINTMENT_STATUSES, type AppointmentStatusValue } from "@glampro/shared";

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatusValue, string> = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No show",
};

/**
 * Tender-to-tone, redrawn as status-to-tone. Every badge renders its own text,
 * so the colour repeats what the label already says rather than carrying the
 * meaning on its own.
 */
export const APPOINTMENT_STATUS_BADGE: Record<AppointmentStatusValue, BadgeVariant> = {
  SCHEDULED: "purple",
  IN_PROGRESS: "warning",
  COMPLETED: "success",
  CANCELLED: "neutral",
  NO_SHOW: "danger",
};

/**
 * The day toolbar's status filter. The empty option means "no filter" and is
 * **left off the request** rather than posted — the same rule `?status=` keeps
 * on the catalogue tabs: a server that receives "" and a server that receives
 * nothing must be one rule, not two.
 */
export const APPOINTMENT_STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  ...APPOINTMENT_STATUSES.map((status) => ({
    value: status,
    label: APPOINTMENT_STATUS_LABELS[status],
  })),
];

/** Statuses a booking can still be moved out of by the day view's quick actions. */
export const OPEN_APPOINTMENT_STATUSES: readonly AppointmentStatusValue[] = [
  "SCHEDULED",
  "IN_PROGRESS",
];

/**
 * The day grid tints a block by status too, but on its own palette — a filled
 * calendar block is not the list's outlined badge, so it gets a separate set of
 * tones rather than borrowing `BadgeVariant`. Kept beside the badge map for the
 * same reason both live in this file: one word per status, shared by the grid
 * and its tests.
 */
export type CalendarBlockTone = "brand" | "success" | "warning" | "neutral" | "danger";

export const APPOINTMENT_BLOCK_TONE: Record<AppointmentStatusValue, CalendarBlockTone> = {
  SCHEDULED: "brand",
  IN_PROGRESS: "warning",
  COMPLETED: "success",
  CANCELLED: "neutral",
  NO_SHOW: "danger",
};
