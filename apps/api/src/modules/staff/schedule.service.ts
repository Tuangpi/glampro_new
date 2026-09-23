import type {
  StaffScheduleRequest,
  StaffScheduleSummary,
  StaffTimeOffRequest,
  StaffTimeOffSummary,
} from '@glampro/contracts';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { type AuditContext, recordAuditEvent } from '../../shared/audit.js';
import { AppError } from '../../shared/http/app-error.js';
import { scopedStaffRow } from './staff.common.js';

/**
 * Weekly schedules and time off.
 *
 * A staff member's week mirrors `BusinessHour`: one row per weekday, replaced as
 * a whole week in a single request. Time off is a dated absence window layered on
 * top of the recurring week, and it is recorded and removed rather than edited,
 * so the roster history stays readable.
 */

const scheduleSelection = {
  id: true,
  dayOfWeek: true,
  startsAt: true,
  endsAt: true,
  isWorking: true,
} as const;

const timeOffSelection = {
  id: true,
  organizationId: true,
  staffProfileId: true,
  startsAt: true,
  endsAt: true,
  reason: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
} as const;

/** The absence list is capped the way the movement ledger is. */
const timeOffLimit = 100;

type ScheduleRow = Prisma.StaffScheduleGetPayload<{ select: typeof scheduleSelection }>;
type TimeOffRow = Prisma.StaffTimeOffGetPayload<{ select: typeof timeOffSelection }>;

const toScheduleEntry = (row: ScheduleRow): StaffScheduleSummary => ({
  id: row.id,
  dayOfWeek: row.dayOfWeek,
  startsAt: row.startsAt,
  endsAt: row.endsAt,
  isWorking: row.isWorking,
});

const toTimeOff = (row: TimeOffRow): StaffTimeOffSummary => ({
  ...row,
  startsAt: row.startsAt.toISOString(),
  endsAt: row.endsAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** The whole week, Sunday first, so the client renders a stable grid. */
export const scheduleOf = async (
  organizationId: string,
  staffProfileId: string,
): Promise<StaffScheduleSummary[]> => {
  const schedule = await prisma.staffSchedule.findMany({
    where: { organizationId, staffProfileId },
    select: scheduleSelection,
    orderBy: { dayOfWeek: 'asc' },
  });

  return schedule.map(toScheduleEntry);
};

/**
 * The schedule tab reads the week on its own. The profile lookup is what turns a
 * foreign or unknown ID into a 404 instead of an empty week.
 */
export const listStaffSchedule = async (
  organizationId: string,
  staffProfileId: string,
): Promise<StaffScheduleSummary[]> => {
  const staff = await scopedStaffRow(organizationId, staffProfileId);

  return scheduleOf(organizationId, staff.id);
};

/**
 * Replaces the week in one transaction, matching the business-hours pattern.
 * Non-working days never keep times, so a day that was switched off cannot leave
 * stale hours behind.
 */
export const replaceStaffSchedule = async (
  organizationId: string,
  staffProfileId: string,
  input: StaffScheduleRequest,
  actorUserId: string,
  context: AuditContext,
): Promise<StaffScheduleSummary[]> => {
  const staff = await scopedStaffRow(organizationId, staffProfileId);

  const schedule = await prisma.$transaction(async (transaction) => {
    await transaction.staffSchedule.deleteMany({
      where: { organizationId, staffProfileId: staff.id },
    });

    await transaction.staffSchedule.createMany({
      data: input.schedule.map((entry) => ({
        organizationId,
        staffProfileId: staff.id,
        dayOfWeek: entry.dayOfWeek,
        startsAt: entry.isWorking ? entry.startsAt : null,
        endsAt: entry.isWorking ? entry.endsAt : null,
        isWorking: entry.isWorking,
      })),
    });

    return transaction.staffSchedule.findMany({
      where: { organizationId, staffProfileId: staff.id },
      select: scheduleSelection,
      orderBy: { dayOfWeek: 'asc' },
    });
  });

  await recordAuditEvent(context, {
    action: 'staff.schedule_replaced',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'StaffProfile',
    entityId: staff.id,
    metadata: {
      workingDays: input.schedule
        .filter((entry) => entry.isWorking)
        .map((entry) => entry.dayOfWeek),
    },
  });

  return schedule.map(toScheduleEntry);
};

/** Newest first, so the most recently added absences read at the top. */
export const timeOffOf = async (
  organizationId: string,
  staffProfileId: string,
): Promise<StaffTimeOffSummary[]> => {
  const timeOff = await prisma.staffTimeOff.findMany({
    where: { organizationId, staffProfileId },
    select: timeOffSelection,
    orderBy: { startsAt: 'desc' },
    take: timeOffLimit,
  });

  return timeOff.map(toTimeOff);
};

/** The time-off tab reads the list on its own, with the usual scope check. */
export const listStaffTimeOff = async (
  organizationId: string,
  staffProfileId: string,
): Promise<StaffTimeOffSummary[]> => {
  const staff = await scopedStaffRow(organizationId, staffProfileId);

  return timeOffOf(organizationId, staff.id);
};

export const createStaffTimeOff = async (
  organizationId: string,
  staffProfileId: string,
  input: StaffTimeOffRequest,
  actorUserId: string,
  context: AuditContext,
): Promise<StaffTimeOffSummary> => {
  const staff = await scopedStaffRow(organizationId, staffProfileId);

  const created = await prisma.staffTimeOff.create({
    data: {
      organizationId,
      staffProfileId: staff.id,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      reason: input.reason ?? null,
      createdById: actorUserId,
    },
    select: timeOffSelection,
  });

  await recordAuditEvent(context, {
    action: 'staff.time_off_recorded',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'StaffTimeOff',
    entityId: created.id,
    metadata: {
      staffProfileId: staff.id,
      startsAt: created.startsAt.toISOString(),
      endsAt: created.endsAt.toISOString(),
    },
  });

  return toTimeOff(created);
};

/**
 * Removing an absence is a real delete: a day off recorded by mistake should not
 * sit in the roster pretending to be history. The audit entry keeps the record
 * of who removed it and when.
 */
export const removeStaffTimeOff = async (
  organizationId: string,
  staffProfileId: string,
  timeOffId: string,
  actorUserId: string,
  context: AuditContext,
): Promise<StaffTimeOffSummary> => {
  const staff = await scopedStaffRow(organizationId, staffProfileId);

  const existing = await prisma.staffTimeOff.findFirst({
    where: { id: timeOffId, organizationId, staffProfileId: staff.id },
    select: { id: true },
  });

  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Time off was not found');
  }

  const deleted = await prisma.staffTimeOff.delete({
    where: { id: existing.id },
    select: timeOffSelection,
  });

  await recordAuditEvent(context, {
    action: 'staff.time_off_removed',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'StaffTimeOff',
    entityId: deleted.id,
    metadata: {
      staffProfileId: staff.id,
      startsAt: deleted.startsAt.toISOString(),
      endsAt: deleted.endsAt.toISOString(),
    },
  });

  return toTimeOff(deleted);
};
