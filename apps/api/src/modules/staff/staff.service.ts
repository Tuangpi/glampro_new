import type {
  ReplaceStaffServicesRequest,
  ServiceSummary,
  StaffMember,
  StaffProfileDetail,
  StaffProfileRequest,
  StaffProfileSummary,
  StaffQuery,
  UpdateStaffProfileRequest,
} from '@glampro/contracts';
import { prisma } from '../../database/prisma.js';
import { type AuditContext, recordAuditEvent } from '../../shared/audit.js';
import { parseDateOnly, toDateOnly } from '../../shared/dates.js';
import { AppError } from '../../shared/http/app-error.js';
import { serviceSelection, toService } from '../catalog/catalog.service.js';
import { scheduleOf, timeOffOf } from './schedule.service.js';
import {
  assertStaffDateRange,
  scopedStaffRow,
  staffMemberSelection,
  staffSelection,
  toStaffMember,
  toStaffProfile,
} from './staff.common.js';

/**
 * Staff profiles.
 *
 * A profile hangs off an active organization membership, so the salon roster is
 * a view of the people who already exist in the organization rather than a
 * second directory. Services, weekly hours, and time off are the roster's
 * operational detail; identity (name, email) stays on the membership.
 */

export const listStaffProfiles = async (
  organizationId: string,
  query: StaffQuery,
): Promise<StaffProfileSummary[]> => {
  const staff = await prisma.staffProfile.findMany({
    where: {
      organizationId,
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.serviceId ? { serviceAssignments: { some: { serviceId: query.serviceId } } } : {}),
    },
    select: staffSelection,
    orderBy: [
      { membership: { user: { lastName: 'asc' } } },
      { membership: { user: { firstName: 'asc' } } },
    ],
  });

  return staff.map(toStaffProfile);
};

/** Assignments and the detail view read the same projection. */
const assignedServiceRows = (organizationId: string, staffProfileId: string) =>
  prisma.service.findMany({
    where: { organizationId, staffAssignments: { some: { staffProfileId } } },
    select: serviceSelection,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

/**
 * The staff screen renders one person at a time: the profile, the services they
 * perform, their week, and their recorded absences.
 */
export const staffProfileDetailOf = async (
  organizationId: string,
  staffProfileId: string,
): Promise<StaffProfileDetail> => {
  const staff = await scopedStaffRow(organizationId, staffProfileId);

  const [services, schedule, timeOff] = await Promise.all([
    assignedServiceRows(organizationId, staff.id),
    scheduleOf(organizationId, staff.id),
    timeOffOf(organizationId, staff.id),
  ]);

  return {
    ...toStaffProfile(staff),
    services: services.map(toService),
    timeOff,
    schedule,
  };
};

/**
 * The assignments tab reads the service list on its own. It validates tenant
 * scope the same way the detail view does, so a foreign profile ID is a 404.
 */
export const assignedServicesOf = async (
  organizationId: string,
  staffProfileId: string,
): Promise<ServiceSummary[]> => {
  const staff = await scopedStaffRow(organizationId, staffProfileId);
  const services = await assignedServiceRows(organizationId, staff.id);

  return services.map(toService);
};

/**
 * Who can still join the roster: active members of this organization without a
 * profile. `staff.manage` does not imply `members.manage`, so this is how a
 * manager picks the membership a new profile is attached to.
 */
export const listStaffCandidates = async (organizationId: string): Promise<StaffMember[]> => {
  const memberships = await prisma.organizationMembership.findMany({
    where: { organizationId, status: 'ACTIVE', staffProfile: null },
    select: staffMemberSelection,
    orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
  });

  return memberships.map(toStaffMember);
};

/**
 * A profile can only be attached to an active member of the same organization:
 * an invited colleague has no roster presence yet, and a suspended or removed
 * membership must not gain new assignments.
 */
export const createStaffProfile = async (
  organizationId: string,
  input: StaffProfileRequest,
  actorUserId: string,
  context: AuditContext,
): Promise<StaffProfileSummary> => {
  const membership = await prisma.organizationMembership.findFirst({
    where: { id: input.membershipId, organizationId },
    select: { id: true, status: true },
  });

  if (!membership) {
    throw new AppError(404, 'NOT_FOUND', 'Member was not found');
  }

  if (membership.status !== 'ACTIVE') {
    throw new AppError(409, 'CONFLICT', 'Only an active member can have a staff profile');
  }

  const existing = await prisma.staffProfile.findUnique({
    where: { membershipId: membership.id },
    select: { id: true },
  });

  if (existing) {
    throw new AppError(409, 'CONFLICT', 'This member already has a staff profile');
  }

  assertStaffDateRange(input.hireDate ?? null, input.endDate ?? null);

  const created = await prisma.$transaction(async (transaction) => {
    const profile = await transaction.staffProfile.create({
      data: {
        organizationId,
        membershipId: membership.id,
        displayName: input.displayName ?? null,
        jobTitle: input.jobTitle ?? null,
        bio: input.bio ?? null,
        color: input.color ?? null,
        isBookable: input.isBookable,
        hireDate: parseDateOnly(input.hireDate ?? null),
        endDate: parseDateOnly(input.endDate ?? null),
        isActive: input.isActive,
      },
      select: staffSelection,
    });

    // A full week of non-working days gives the schedule screen one row per day
    // without presuming the salon's opening hours.
    await transaction.staffSchedule.createMany({
      data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
        organizationId,
        staffProfileId: profile.id,
        dayOfWeek,
        isWorking: false,
      })),
    });

    return profile;
  });

  await recordAuditEvent(context, {
    action: 'staff.profile_created',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'StaffProfile',
    entityId: created.id,
    metadata: { membershipId: created.membershipId, jobTitle: created.jobTitle },
  });

  return toStaffProfile(created);
};

export const updateStaffProfile = async (
  organizationId: string,
  staffProfileId: string,
  input: UpdateStaffProfileRequest,
  actorUserId: string,
  context: AuditContext,
): Promise<StaffProfileSummary> => {
  const staff = await scopedStaffRow(organizationId, staffProfileId);

  // An update that moves one side of an existing range still has to stay sane.
  assertStaffDateRange(
    input.hireDate === undefined ? toDateOnly(staff.hireDate) : input.hireDate,
    input.endDate === undefined ? toDateOnly(staff.endDate) : input.endDate,
  );

  const updated = await prisma.staffProfile.update({
    where: { id: staff.id },
    data: {
      ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
      ...(input.jobTitle === undefined ? {} : { jobTitle: input.jobTitle }),
      ...(input.bio === undefined ? {} : { bio: input.bio }),
      ...(input.color === undefined ? {} : { color: input.color }),
      ...(input.isBookable === undefined ? {} : { isBookable: input.isBookable }),
      ...(input.hireDate === undefined ? {} : { hireDate: parseDateOnly(input.hireDate) }),
      ...(input.endDate === undefined ? {} : { endDate: parseDateOnly(input.endDate) }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    },
    select: staffSelection,
  });

  await recordAuditEvent(context, {
    action: 'staff.profile_updated',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'StaffProfile',
    entityId: staff.id,
    metadata: { fields: Object.keys(input) },
  });

  return toStaffProfile(updated);
};

/**
 * The assignment set is replaced whole, the way a schedule is, so removing one
 * service and adding another is a single request. Unknown or foreign service
 * IDs are refused before anything is written.
 */
export const replaceStaffServices = async (
  organizationId: string,
  staffProfileId: string,
  input: ReplaceStaffServicesRequest,
  actorUserId: string,
  context: AuditContext,
): Promise<ServiceSummary[]> => {
  const staff = await scopedStaffRow(organizationId, staffProfileId);
  const serviceIds = [...new Set(input.serviceIds)];

  const matched = await prisma.service.findMany({
    where: { organizationId, id: { in: serviceIds } },
    select: { id: true },
  });

  if (matched.length !== serviceIds.length) {
    throw new AppError(404, 'NOT_FOUND', 'Service was not found');
  }

  const assigned = await prisma.$transaction(async (transaction) => {
    await transaction.staffServiceAssignment.deleteMany({
      where: { organizationId, staffProfileId: staff.id },
    });

    if (serviceIds.length > 0) {
      await transaction.staffServiceAssignment.createMany({
        data: serviceIds.map((serviceId) => ({
          organizationId,
          staffProfileId: staff.id,
          serviceId,
        })),
      });
    }

    return transaction.service.findMany({
      where: { organizationId, id: { in: serviceIds } },
      select: serviceSelection,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  });

  await recordAuditEvent(context, {
    action: 'staff.services_replaced',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'StaffProfile',
    entityId: staff.id,
    metadata: { serviceIds },
  });

  return assigned.map(toService);
};
