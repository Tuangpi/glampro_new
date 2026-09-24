import type {
  AppointmentServiceSummary,
  AppointmentStatus,
  AppointmentStatusHistory,
  AppointmentSummary,
} from '@glampro/contracts';
import { appointmentStatusTransitions, occupyingAppointmentStatuses } from '@glampro/contracts';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../shared/http/app-error.js';
import { serviceSelection } from '../catalog/catalog.service.js';
import { customerSelection, toCustomer } from '../customers/customers.service.js';
import { staffSelection, toStaffProfile } from '../staff/staff.common.js';

/**
 * Shared plumbing for the appointment module.
 *
 * The calendar, the availability engine, and the booking writes all read the
 * same projection and run the same guards, so tenant scope, the staff overlap
 * rule, and the time-off rule live here instead of being repeated per service.
 */

/** The location summary the appointment contract embeds, matching `/auth/me`. */
const locationSelection = {
  id: true,
  organizationId: true,
  name: true,
  code: true,
  timezone: true,
  currency: true,
  isActive: true,
} as const;

export const appointmentServiceSelection = {
  id: true,
  serviceId: true,
  name: true,
  durationMinutes: true,
  priceInCents: true,
  sortOrder: true,
} as const;

export const appointmentSelection = {
  id: true,
  organizationId: true,
  locationId: true,
  customerId: true,
  staffProfileId: true,
  status: true,
  startsAt: true,
  endsAt: true,
  notes: true,
  cancelledAt: true,
  cancellationReason: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  services: { select: appointmentServiceSelection, orderBy: { sortOrder: 'asc' } },
  customer: { select: customerSelection },
  staffProfile: { select: staffSelection },
  location: { select: locationSelection },
} as const;

export const statusHistorySelection = {
  id: true,
  organizationId: true,
  appointmentId: true,
  fromStatus: true,
  toStatus: true,
  reason: true,
  changedById: true,
  createdAt: true,
  changedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
} as const;

export type AppointmentRow = Prisma.AppointmentGetPayload<{ select: typeof appointmentSelection }>;
export type StatusHistoryRow = Prisma.AppointmentStatusHistoryGetPayload<{
  select: typeof statusHistorySelection;
}>;
type Db = Prisma.TransactionClient;

export const totalDurationOf = (services: readonly { durationMinutes: number }[]): number =>
  services.reduce((total, service) => total + service.durationMinutes, 0);

export const totalPriceOf = (services: readonly { priceInCents: number }[]): number =>
  services.reduce((total, service) => total + service.priceInCents, 0);

export const toAppointmentService = (
  row: AppointmentRow['services'][number],
): AppointmentServiceSummary => ({
  id: row.id,
  serviceId: row.serviceId,
  name: row.name,
  durationMinutes: row.durationMinutes,
  priceInCents: row.priceInCents,
  sortOrder: row.sortOrder,
});

/**
 * The totals are derived from the snapshots rather than read from `Service`, so
 * the calendar keeps showing what was booked even after the catalog changes.
 */
export const toAppointment = (row: AppointmentRow): AppointmentSummary => ({
  id: row.id,
  organizationId: row.organizationId,
  locationId: row.locationId,
  customerId: row.customerId,
  staffProfileId: row.staffProfileId,
  status: row.status,
  startsAt: row.startsAt.toISOString(),
  endsAt: row.endsAt.toISOString(),
  notes: row.notes,
  cancelledAt: row.cancelledAt === null ? null : row.cancelledAt.toISOString(),
  cancellationReason: row.cancellationReason,
  createdById: row.createdById,
  durationMinutes: totalDurationOf(row.services),
  priceInCents: totalPriceOf(row.services),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  services: row.services.map(toAppointmentService),
  customer: toCustomer(row.customer),
  staff: toStaffProfile(row.staffProfile),
  location: row.location,
});

export const toStatusHistory = (row: StatusHistoryRow): AppointmentStatusHistory => ({
  id: row.id,
  organizationId: row.organizationId,
  appointmentId: row.appointmentId,
  fromStatus: row.fromStatus,
  toStatus: row.toStatus,
  reason: row.reason,
  changedById: row.changedById,
  changedBy: row.changedBy,
  createdAt: row.createdAt.toISOString(),
});

/** Every appointment lookup is tenant-scoped, so a foreign ID surfaces as 404. */
export const scopedAppointmentRow = async (
  organizationId: string,
  appointmentId: string,
): Promise<AppointmentRow> => {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, organizationId },
    select: appointmentSelection,
  });

  if (!appointment) {
    throw new AppError(404, 'NOT_FOUND', 'Appointment was not found');
  }

  return appointment;
};

export const scopedLocationRow = async (organizationId: string, locationId: string) => {
  const location = await prisma.location.findFirst({
    where: { id: locationId, organizationId },
    select: locationSelection,
  });

  if (!location) {
    throw new AppError(404, 'NOT_FOUND', 'Location was not found');
  }

  return location;
};

export const scopedCustomerRow = async (organizationId: string, customerId: string) => {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
    select: customerSelection,
  });

  if (!customer) {
    throw new AppError(404, 'NOT_FOUND', 'Customer was not found');
  }

  return customer;
};

export const assertStaffBookable = (staff: { isActive: boolean; isBookable: boolean }) => {
  if (!staff.isActive) {
    throw new AppError(409, 'CONFLICT', 'That staff member is no longer on the roster');
  }

  if (!staff.isBookable) {
    throw new AppError(409, 'CONFLICT', 'That staff member does not take bookings');
  }
};

/**
 * Loads the chosen services in the order they were asked for — the visit runs in
 * that order — and refuses any that are unavailable or that the staff member is
 * not assigned to. A staff member with no assignments at all may perform
 * anything, so a salon that has not filled the Services tab is not blocked.
 */
export const bookableServicesOf = async (
  organizationId: string,
  staffProfileId: string,
  serviceIds: string[],
) => {
  const services = await prisma.service.findMany({
    where: { organizationId, id: { in: serviceIds } },
    select: serviceSelection,
  });

  if (services.length !== serviceIds.length) {
    throw new AppError(404, 'NOT_FOUND', 'Service was not found');
  }

  const unavailable = services.find((service) => !service.isAvailable);

  if (unavailable) {
    throw new AppError(409, 'CONFLICT', `“${unavailable.name}” is not available`);
  }

  const assignments = await prisma.staffServiceAssignment.findMany({
    where: { organizationId, staffProfileId },
    select: { serviceId: true },
  });

  if (assignments.length > 0) {
    const assigned = new Set(assignments.map((row) => row.serviceId));
    const unassigned = services.find((service) => !assigned.has(service.id));

    if (unassigned) {
      throw new AppError(
        409,
        'CONFLICT',
        `That staff member does not perform “${unassigned.name}”`,
      );
    }
  }

  const byId = new Map(services.map((service) => [service.id, service]));

  return serviceIds.flatMap((serviceId) => {
    const service = byId.get(serviceId);

    return service ? [service] : [];
  });
};

/** A booking with no duration at all would be a zero-length calendar entry. */
export const assertBookableDuration = (durationMinutes: number) => {
  if (durationMinutes <= 0) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'The selected services have no duration, so there is nothing to book',
    );
  }
};

/** The statuses that hold a staff member's time, for the overlap queries. */
export const occupyingStatuses = [...occupyingAppointmentStatuses];

/**
 * A staff member cannot be in two places at once. Touching windows are fine — a
 * 10:00–11:00 cut leaves 11:00 free — and finished or cancelled visits release
 * their slot. Run inside the write transaction so the check and the write cannot
 * be interleaved.
 */
export const assertNoStaffOverlap = async (input: {
  organizationId: string;
  staffProfileId: string;
  startsAt: Date;
  endsAt: Date;
  excludingAppointmentId?: string;
  db?: Db;
}) => {
  const db = input.db ?? prisma;

  const clash = await db.appointment.findFirst({
    where: {
      organizationId: input.organizationId,
      staffProfileId: input.staffProfileId,
      status: { in: occupyingStatuses },
      startsAt: { lt: input.endsAt },
      endsAt: { gt: input.startsAt },
      ...(input.excludingAppointmentId ? { id: { not: input.excludingAppointmentId } } : {}),
    },
    select: { id: true },
  });

  if (clash) {
    throw new AppError(
      409,
      'CONFLICT',
      'That staff member already has an appointment at that time',
    );
  }
};

/** Absences are dated windows, and a visit may not be booked inside one. */
export const assertNoTimeOffOverlap = async (input: {
  organizationId: string;
  staffProfileId: string;
  startsAt: Date;
  endsAt: Date;
  db?: Db;
}) => {
  const db = input.db ?? prisma;

  const absence = await db.staffTimeOff.findFirst({
    where: {
      organizationId: input.organizationId,
      staffProfileId: input.staffProfileId,
      startsAt: { lt: input.endsAt },
      endsAt: { gt: input.startsAt },
    },
    select: { id: true },
  });

  if (absence) {
    throw new AppError(409, 'CONFLICT', 'That staff member is recorded as away for that time');
  }
};

/**
 * Status changes follow the shared transition map: the calendar offers only
 * these moves, and the API refuses anything else so a stale screen cannot walk a
 * finished visit back into the diary.
 */
export const assertStatusTransition = (from: AppointmentStatus, to: AppointmentStatus) => {
  if (from === to) {
    throw new AppError(409, 'CONFLICT', `The appointment is already ${to.toLowerCase()}`);
  }

  if (!appointmentStatusTransitions[from].includes(to)) {
    throw new AppError(
      409,
      'CONFLICT',
      `A ${from.toLowerCase()} appointment cannot move to ${to.toLowerCase()}`,
    );
  }
};

/**
 * A finished or cancelled visit keeps its place in the calendar. Its notes can
 * still be edited, but its time and staff member are history.
 */
export const assertReschedulable = (status: AppointmentStatus) => {
  if (status === 'COMPLETED' || status === 'CANCELLED' || status === 'NO_SHOW') {
    throw new AppError(409, 'CONFLICT', `A ${status.toLowerCase()} appointment cannot be moved`);
  }
};
