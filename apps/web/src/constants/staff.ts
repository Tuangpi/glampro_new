/**
 * Staff vocabulary — the words for a role and for the screen-09 status filter.
 *
 * One place for both, because the drawer's role picker and the list's role badge
 * would otherwise each invent their own label for `SUPER_ADMIN`, and the two would
 * drift into "Super admin" and "Super Admin" on the same screen.
 *
 * The role list is derived from `GLOBAL_ROLES` rather than re-typed, so a role added
 * to the contract is a TypeScript error here (the record is exhaustive) instead of a
 * person who cannot be labelled.
 */
import type { BadgeVariant } from "@/components/ui/Badge";
import { GLOBAL_ROLES, type GlobalRole } from "@glampro/shared";

export const ROLE_LABELS: Record<GlobalRole, string> = {
  SUPER_ADMIN: "Super admin",
  MANAGER: "Manager",
  STAFF: "Staff",
  CASHIER: "Cashier",
};

/** For the drawer's `<Select>`; the same four roles in the contract's own order. */
export const ROLE_OPTIONS = GLOBAL_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

/**
 * Role-to-tone for the list. The two roles that can write are the two purple ones:
 * the colour repeats what the label already says rather than carrying the meaning,
 * which is why every badge also renders its own text.
 */
export const ROLE_BADGE: Record<GlobalRole, BadgeVariant> = {
  SUPER_ADMIN: "purple",
  MANAGER: "purple",
  STAFF: "neutral",
  CASHIER: "neutral",
};

/**
 * The screen's three-way status filter.
 *
 * A tri-state rather than a boolean because the toolbar draws three options and
 * `?disabled=true` cannot express "all" — the same reason `staffListQuerySchema`
 * takes an enum.
 */
export type StaffStatusFilter = "all" | "active" | "disabled";

export const STATUS_FILTERS: ReadonlyArray<{ value: StaffStatusFilter; label: string }> = [
  { value: "all", label: "All staff" },
  { value: "active", label: "Active only" },
  { value: "disabled", label: "Disabled" },
];
