import type { StaffMember, StaffProfileSummary } from '@glampro/contracts';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { toDateOnly } from '../../shared/dates.js';
import { AppError } from '../../shared/http/app-error.js';

/**
 * Shared plumbing for the staff module.
 *
 * Profiles, weekly schedules, and time off live in separate service files
 * (mirroring the catalog and inventory split), and each of them needs the same
 * tenant-scoped lookup and row projection. Keeping both here means the module
 * has one place to enforce tenant scope instead of duplicating the guard.
 */

const memberSelection = {
  id: true,
  role: true,
  status: true,
  user: {
    select: { id: true, email: true, firstName: true, lastName: true, avatarUrl: true },
  },
} as const;

/** The candidate list and every profile share one membership projection. */
export const staffMemberSelection = memberSelection;

export const staffSelection = {
  id: true,
  organizationId: true,
  membershipId: true,
  displayName: true,
  jobTitle: true,
  bio: true,
  color: true,
  isBookable: true,
  hireDate: true,
  endDate: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  membership: { select: memberSelection },
} as const;

type MemberRow = Prisma.OrganizationMembershipGetPayload<{ select: typeof memberSelection }>;
export type StaffRow = Prisma.StaffProfileGetPayload<{ select: typeof staffSelection }>;

/** Identity comes from the membership, so a profile never duplicates a name. */
export const toStaffMember = (membership: MemberRow): StaffMember => ({
  membershipId: membership.id,
  role: membership.role,
  status: membership.status,
  userId: membership.user.id,
  email: membership.user.email,
  firstName: membership.user.firstName,
  lastName: membership.user.lastName,
  avatarUrl: membership.user.avatarUrl,
});

export const toStaffProfile = (row: StaffRow): StaffProfileSummary => ({
  id: row.id,
  organizationId: row.organizationId,
  membershipId: row.membershipId,
  displayName: row.displayName,
  jobTitle: row.jobTitle,
  bio: row.bio,
  color: row.color,
  isBookable: row.isBookable,
  hireDate: toDateOnly(row.hireDate),
  endDate: toDateOnly(row.endDate),
  isActive: row.isActive,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  member: toStaffMember(row.membership),
});

/** Every staff lookup is tenant-scoped, so a foreign ID surfaces as 404. */
export const scopedStaffRow = async (
  organizationId: string,
  staffProfileId: string,
): Promise<StaffRow> => {
  const staff = await prisma.staffProfile.findFirst({
    where: { id: staffProfileId, organizationId },
    select: staffSelection,
  });

  if (!staff) {
    throw new AppError(404, 'NOT_FOUND', 'Staff profile was not found');
  }

  return staff;
};

/**
 * The hire and end dates bracket the employment, so they cannot invert. The
 * contract checks the pair when both arrive together; this catches an update
 * that only changes one side of an existing range.
 */
export const assertStaffDateRange = (hireDate: string | null, endDate: string | null) => {
  if (hireDate !== null && endDate !== null && endDate < hireDate) {
    throw new AppError(409, 'CONFLICT', 'The end date cannot be before the hire date');
  }
};
