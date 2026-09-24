import type {
  AppointmentDetail,
  AppointmentQuery,
  AppointmentServiceSummary,
  AppointmentSummary,
  AppointmentWindow,
  ChangeAppointmentStatusRequest,
  CreateAppointmentRequest,
  ReplaceAppointmentServicesRequest,
  UpdateAppointmentRequest,
} from '@glampro/contracts';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { type AuditContext, recordAuditEvent } from '../../shared/audit.js';
import { zonedDayRange } from '../../shared/zoned-time.js';
import { scopedStaffRow } from '../staff/staff.common.js';
import {
  appointmentSelection,
  assertBookableDuration,
  assertNoStaffOverlap,
  assertNoTimeOffOverlap,
  assertReschedulable,
  assertStaffBookable,
  assertStatusTransition,
  bookableServicesOf,
  scopedAppointmentRow,
  scopedCustomerRow,
  scopedLocationRow,
  statusHistorySelection,
  toAppointment,
  toAppointmentService,
  toStatusHistory,
  totalDurationOf,
} from './appointments.common.js';

/**
 * Appointments.
 *
 * A booking snapshots the services it contains, so the calendar keeps the
 * duration and price that were agreed even after the catalog changes. Writes run
 * the overlap and absence guards inside the same transaction as the write, and
 * every change leaves an audit entry.
 */

export type AppointmentList = {
  appointments: AppointmentSummary[];
  window: AppointmentWindow | null;
};

export const listAppointments = async (
  organizationId: string,
  query: AppointmentQuery,
): Promise<AppointmentList> => {
  const filters: Prisma.AppointmentWhereInput = {
    organizationId,
    ...(query.locationId ? { locationId: query.locationId } : {}),
    ...(query.staffProfileId ? { staffProfileId: query.staffProfileId } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.status ? { status: query.status } : {}),
  };

  const { date, locationId } = query;

  // A local day: the contract guarantees a location for a date, because the day
  // itself depends on the location's time zone.
  if (date !== undefined && locationId !== undefined) {
    const location = await scopedLocationRow(organizationId, locationId);
    const day = zonedDayRange(date, location.timezone);

    const appointments = await prisma.appointment.findMany({
      where: { ...filters, startsAt: { gte: day.startsAt, lt: day.endsAt } },
      select: appointmentSelection,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: query.limit,
    });

    return {
      appointments: appointments.map(toAppointment),
      window: { startsAt: day.startsAt.toISOString(), endsAt: day.endsAt.toISOString() },
    };
  }

  if (query.from !== undefined && query.to !== undefined) {
    const appointments = await prisma.appointment.findMany({
      where: { ...filters, startsAt: { gte: new Date(query.from), lt: new Date(query.to) } },
      select: appointmentSelection,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: query.limit,
    });

    return {
      appointments: appointments.map(toAppointment),
      window: { startsAt: query.from, endsAt: query.to },
    };
  }

  // No window asked for: the most recent visits, which is what the customer
  // screen reads as visit history.
  const appointments = await prisma.appointment.findMany({
    where: filters,
    select: appointmentSelection,
    orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
    take: query.limit,
  });

  return { appointments: appointments.map(toAppointment), window: null };
};

export const appointmentDetailOf = async (
  organizationId: string,
  appointmentId: string,
): Promise<AppointmentDetail> => {
  const appointment = await scopedAppointmentRow(organizationId, appointmentId);

  const statusHistory = await prisma.appointmentStatusHistory.findMany({
    where: { organizationId, appointmentId: appointment.id },
    select: statusHistorySelection,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  return { ...toAppointment(appointment), statusHistory: statusHistory.map(toStatusHistory) };
};

/** The service rows the appointment will carry, snapshotted from the catalog. */
const snapshotsOf = (
  services: readonly { id: string; name: string; durationMinutes: number; priceInCents: number }[],
) =>
  services.map((service, sortOrder) => ({
    serviceId: service.id,
    name: service.name,
    durationMinutes: service.durationMinutes,
    priceInCents: service.priceInCents,
    sortOrder,
  }));

export const createAppointment = async (
  organizationId: string,
  input: CreateAppointmentRequest,
  actorUserId: string,
  context: AuditContext,
): Promise<AppointmentSummary> => {
  const location = await scopedLocationRow(organizationId, input.locationId);
  const customer = await scopedCustomerRow(organizationId, input.customerId);
  const staff = await scopedStaffRow(organizationId, input.staffProfileId);

  assertStaffBookable(staff);

  const services = await bookableServicesOf(organizationId, staff.id, input.serviceIds);
  const durationMinutes = totalDurationOf(services);
  assertBookableDuration(durationMinutes);

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

  const appointment = await prisma.$transaction(async (transaction) => {
    await assertNoStaffOverlap({
      db: transaction,
      organizationId,
      staffProfileId: staff.id,
      startsAt,
      endsAt,
    });
    await assertNoTimeOffOverlap({
      db: transaction,
      organizationId,
      staffProfileId: staff.id,
      startsAt,
      endsAt,
    });

    return transaction.appointment.create({
      data: {
        organizationId,
        locationId: location.id,
        customerId: customer.id,
        staffProfileId: staff.id,
        status: 'SCHEDULED',
        startsAt,
        endsAt,
        notes: input.notes ?? null,
        createdById: actorUserId,
        services: {
          create: snapshotsOf(services).map((row) => ({ ...row, organizationId })),
        },
        statusHistory: {
          create: {
            organizationId,
            fromStatus: null,
            toStatus: 'SCHEDULED',
            changedById: actorUserId,
          },
        },
      },
      select: appointmentSelection,
    });
  });

  await recordAuditEvent(context, {
    action: 'appointment.created',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'Appointment',
    entityId: appointment.id,
    metadata: {
      locationId: location.id,
      customerId: customer.id,
      staffProfileId: staff.id,
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
      serviceIds: services.map((service) => service.id),
    },
  });

  return toAppointment(appointment);
};

export const updateAppointment = async (
  organizationId: string,
  appointmentId: string,
  input: UpdateAppointmentRequest,
  actorUserId: string,
  context: AuditContext,
): Promise<AppointmentSummary> => {
  const existing = await scopedAppointmentRow(organizationId, appointmentId);

  if (input.startsAt !== undefined || input.staffProfileId !== undefined) {
    assertReschedulable(existing.status);
  }

  const staff = await scopedStaffRow(
    organizationId,
    input.staffProfileId ?? existing.staffProfileId,
  );

  if (staff.id !== existing.staffProfileId) {
    assertStaffBookable(staff);
    // The new staff member has to perform every service already on the visit.
    await bookableServicesOf(
      organizationId,
      staff.id,
      existing.services.map((service) => service.serviceId),
    );
  }

  const location =
    input.locationId === undefined || input.locationId === existing.locationId
      ? null
      : await scopedLocationRow(organizationId, input.locationId);

  const durationMinutes = totalDurationOf(existing.services);
  const startsAt = input.startsAt === undefined ? existing.startsAt : new Date(input.startsAt);
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

  const appointment = await prisma.$transaction(async (transaction) => {
    await assertNoStaffOverlap({
      db: transaction,
      organizationId,
      staffProfileId: staff.id,
      startsAt,
      endsAt,
      excludingAppointmentId: existing.id,
    });
    await assertNoTimeOffOverlap({
      db: transaction,
      organizationId,
      staffProfileId: staff.id,
      startsAt,
      endsAt,
    });

    return transaction.appointment.update({
      where: { id: existing.id },
      data: {
        ...(location ? { locationId: location.id } : {}),
        staffProfileId: staff.id,
        startsAt,
        endsAt,
        ...(input.notes === undefined ? {} : { notes: input.notes }),
      },
      select: appointmentSelection,
    });
  });

  await recordAuditEvent(context, {
    action: 'appointment.updated',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'Appointment',
    entityId: existing.id,
    metadata: { fields: Object.keys(input) },
  });

  return toAppointment(appointment);
};

export const replaceAppointmentServices = async (
  organizationId: string,
  appointmentId: string,
  input: ReplaceAppointmentServicesRequest,
  actorUserId: string,
  context: AuditContext,
): Promise<AppointmentServiceSummary[]> => {
  const existing = await scopedAppointmentRow(organizationId, appointmentId);

  const services = await bookableServicesOf(
    organizationId,
    existing.staffProfileId,
    input.serviceIds,
  );
  const durationMinutes = totalDurationOf(services);
  assertBookableDuration(durationMinutes);

  // A different service set is a different length, so the visit is re-bounded
  // and its slot re-checked.
  const endsAt = new Date(existing.startsAt.getTime() + durationMinutes * 60_000);

  const updated = await prisma.$transaction(async (transaction) => {
    await assertNoStaffOverlap({
      db: transaction,
      organizationId,
      staffProfileId: existing.staffProfileId,
      startsAt: existing.startsAt,
      endsAt,
      excludingAppointmentId: existing.id,
    });
    await assertNoTimeOffOverlap({
      db: transaction,
      organizationId,
      staffProfileId: existing.staffProfileId,
      startsAt: existing.startsAt,
      endsAt,
    });

    await transaction.appointmentService.deleteMany({
      where: { organizationId, appointmentId: existing.id },
    });

    await transaction.appointmentService.createMany({
      data: snapshotsOf(services).map((row) => ({
        ...row,
        organizationId,
        appointmentId: existing.id,
      })),
    });

    return transaction.appointment.update({
      where: { id: existing.id },
      data: { endsAt },
      select: appointmentSelection,
    });
  });

  await recordAuditEvent(context, {
    action: 'appointment.services_replaced',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'Appointment',
    entityId: existing.id,
    metadata: { serviceIds: services.map((service) => service.id) },
  });

  return updated.services.map(toAppointmentService);
};

export const changeAppointmentStatus = async (
  organizationId: string,
  appointmentId: string,
  input: ChangeAppointmentStatusRequest,
  actorUserId: string,
  context: AuditContext,
): Promise<AppointmentSummary> => {
  const existing = await scopedAppointmentRow(organizationId, appointmentId);

  assertStatusTransition(existing.status, input.status);

  const appointment = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.appointment.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        // Cancelling is the only move that carries a reason and a timestamp.
        ...(input.status === 'CANCELLED'
          ? { cancelledAt: new Date(), cancellationReason: input.reason ?? null }
          : {}),
      },
      select: appointmentSelection,
    });

    await transaction.appointmentStatusHistory.create({
      data: {
        organizationId,
        appointmentId: existing.id,
        fromStatus: existing.status,
        toStatus: input.status,
        reason: input.reason ?? null,
        changedById: actorUserId,
      },
    });

    return updated;
  });

  await recordAuditEvent(context, {
    action: 'appointment.status_changed',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'Appointment',
    entityId: existing.id,
    metadata: {
      fromStatus: existing.status,
      toStatus: input.status,
      ...(input.reason ? { reason: input.reason } : {}),
    },
  });

  return toAppointment(appointment);
};
