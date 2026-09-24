import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/database/prisma.js';
import type { MembershipRole } from '../src/generated/prisma/client.js';
import { hashRefreshToken, issueAccessToken } from '../src/modules/auth/tokens.js';
import { zonedTimeToUtc } from '../src/shared/zoned-time.js';
import { truncateAllTables } from './helpers/test-db.js';

/**
 * Appointment coverage against the real middleware chain: `authenticate`,
 * `withTenant`, `requirePermission`, validation, and the contract shapes the web
 * calendar parses. Registration seeds a Singapore salon whose business hours run
 * 09:00–20:00 Monday to Saturday and closed on Sunday, and the tests work in the
 * same zone so the wall-clock arithmetic is readable.
 */
const app = createApp();

const salonZone = 'Asia/Singapore';
const thursday = '2026-09-24';
const sunday = '2026-09-27';

/** Wall clock in the salon's zone as the instant the API expects. */
const at = (date: string, time: string) => zonedTimeToUtc(date, time, salonZone).toISOString();

const registrationInput = {
  firstName: 'Kai',
  lastName: 'Tan',
  email: 'owner@eurosense.test',
  password: 'SecurePassword123',
  organizationName: 'Eurosense Hair Studio',
  locationName: 'Tanjong Pagar',
};

type RegisteredOrg = {
  accessToken: string;
  userId: string;
  organizationId: string;
  membershipId: string;
  locationId: string;
};

const registerOrganization = async (
  overrides: Partial<typeof registrationInput> = {},
): Promise<RegisteredOrg> => {
  const response = await request(app)
    .post('/api/v1/auth/register')
    .send({ ...registrationInput, ...overrides });

  expect(response.status).toBe(201);

  const membership = response.body.data.organizations[0];
  const organizationId = membership.organizationId as string;

  const location = await prisma.location.findFirstOrThrow({
    where: { organizationId },
    select: { id: true },
  });

  return {
    accessToken: response.body.data.accessToken as string,
    userId: response.body.data.user.id as string,
    organizationId,
    membershipId: membership.id as string,
    locationId: location.id,
  };
};

const tokenFor = async (userId: string) => {
  const session = await prisma.authSession.create({
    data: {
      userId,
      tokenFamilyId: `family-${userId}`,
      refreshTokenHash: hashRefreshToken(`refresh-${userId}-${Math.random()}`),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
    select: { id: true },
  });

  const { token } = await issueAccessToken({ userId, sessionId: session.id, platformRole: 'USER' });
  return token;
};

const seedMember = async (organizationId: string, email: string, role: MembershipRole) => {
  const user = await prisma.user.create({
    data: {
      email,
      firstName: 'Test',
      lastName: 'Member',
      credential: { create: { passwordHash: 'not-used-by-the-appointment-tests' } },
    },
    select: { id: true },
  });

  const membership = await prisma.organizationMembership.create({
    data: { organizationId, userId: user.id, role, status: 'ACTIVE' },
    select: { id: true },
  });

  return { userId: user.id, membershipId: membership.id, accessToken: await tokenFor(user.id) };
};

const bearer = (accessToken: string) => `Bearer ${accessToken}`;

const seedCustomer = (organizationId: string, email = 'wei.ling@example.test') =>
  prisma.customer.create({
    data: { organizationId, firstName: 'Wei Ling', lastName: 'Ng', email },
    select: { id: true },
  });

const seedService = async (
  organizationId: string,
  name: string,
  durationMinutes = 45,
  priceInCents = 4500,
) => {
  const category = await prisma.serviceCategory.create({
    data: { organizationId, name: `Category ${name}` },
    select: { id: true },
  });

  const service = await prisma.service.create({
    data: {
      organizationId,
      serviceCategoryId: category.id,
      name,
      durationMinutes,
      priceInCents,
    },
    select: { id: true },
  });

  return service.id;
};

/** The schedule contract expects one entry per weekday. */
const week = (overrides: Record<number, object> = {}) =>
  Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    startsAt: '09:00',
    endsAt: '18:00',
    isWorking: dayOfWeek !== 0,
    ...overrides[dayOfWeek],
  }));

/** A bookable stylist with services assigned and a Monday-to-Saturday week. */
const bookableStaff = async (
  owner: RegisteredOrg,
  serviceIds: string[],
  membershipId: string = owner.membershipId,
) => {
  const created = await request(app)
    .post('/api/v1/staff')
    .set('authorization', bearer(owner.accessToken))
    .send({ membershipId, displayName: 'Kai' });

  expect(created.status).toBe(201);

  const staffProfileId = created.body.data.staffProfile.id as string;

  const assigned = await request(app)
    .put(`/api/v1/staff/${staffProfileId}/services`)
    .set('authorization', bearer(owner.accessToken))
    .send({ serviceIds });

  expect(assigned.status).toBe(200);

  const scheduled = await request(app)
    .put(`/api/v1/staff/${staffProfileId}/schedule`)
    .set('authorization', bearer(owner.accessToken))
    .send({ schedule: week() });

  expect(scheduled.status).toBe(200);

  return staffProfileId;
};

type Salon = RegisteredOrg & { customerId: string; serviceIds: string[]; staffProfileId: string };

/** A counter keeps each salon's owner email, name, and slug unique. */
let salonCount = 0;

/** One salon with a customer, two services, and a stylist who performs both. */
const salon = async (): Promise<Salon> => {
  salonCount += 1;

  const owner = await registerOrganization({
    email: `owner${salonCount}@eurosense.test`,
    organizationName: `Eurosense Hair Studio ${salonCount}`,
    locationName: `Branch ${salonCount}`,
  });

  const customer = await seedCustomer(owner.organizationId, `wei.ling${salonCount}@example.test`);
  const cut = await seedService(owner.organizationId, 'Women’s cut', 45, 4500);
  const blowDry = await seedService(owner.organizationId, 'Blow dry', 30, 3000);
  const staffProfileId = await bookableStaff(owner, [cut, blowDry]);

  return { ...owner, customerId: customer.id, serviceIds: [cut, blowDry], staffProfileId };
};

const book = (owner: Salon, body: Record<string, unknown> = {}) =>
  request(app)
    .post('/api/v1/appointments')
    .set('authorization', bearer(owner.accessToken))
    .send({
      locationId: owner.locationId,
      customerId: owner.customerId,
      staffProfileId: owner.staffProfileId,
      serviceIds: [owner.serviceIds[0]],
      startsAt: at(thursday, '09:00'),
      ...body,
    });

/** Availability takes its ids as one comma-separated query value. */
const availability = (
  owner: Salon,
  query: Record<string, string | number | string[] | undefined>,
) => {
  const { serviceIds, ...rest } = query;

  return request(app)
    .get('/api/v1/appointments/availability')
    .query({
      locationId: owner.locationId,
      staffProfileId: owner.staffProfileId,
      ...rest,
      ...(serviceIds === undefined
        ? {}
        : { serviceIds: Array.isArray(serviceIds) ? serviceIds.join(',') : serviceIds }),
    })
    .set('authorization', bearer(owner.accessToken));
};

const calendar = (owner: Salon, query: Record<string, string | number> = {}) =>
  request(app)
    .get('/api/v1/appointments')
    .query(query)
    .set('authorization', bearer(owner.accessToken));

/** Books through the API and returns the appointment id. */
const bookedId = async (owner: Salon, body: Record<string, unknown> = {}) => {
  const response = await book(owner, body);

  expect(response.status).toBe(201);

  return response.body.data.appointment.id as string;
};

beforeEach(async () => {
  await truncateAllTables();
});

describe('calendar access', () => {
  it('rejects unauthenticated reads and writes', async () => {
    const owner = await salon();

    const read = await request(app).get(`/api/v1/appointments?locationId=${owner.locationId}`);
    expect(read.status).toBe(401);
    expect(read.body.error.code).toBe('AUTHENTICATION_REQUIRED');

    const write = await request(app).post('/api/v1/appointments').send({});
    expect(write.status).toBe(401);

    const slots = await request(app).get('/api/v1/appointments/availability');
    expect(slots.status).toBe(401);
  });

  it('lets a staff member read the calendar but not book', async () => {
    const owner = await salon();
    const stylist = await seedMember(owner.organizationId, 'jia@eurosense.test', 'STAFF');
    await bookedId(owner);

    const readable = await calendar(owner, { date: thursday, locationId: owner.locationId });
    expect(readable.status).toBe(200);
    expect(readable.body.data.appointments).toHaveLength(1);

    const asStaff = await request(app)
      .post('/api/v1/appointments')
      .set('authorization', bearer(stylist.accessToken))
      .send({
        locationId: owner.locationId,
        customerId: owner.customerId,
        staffProfileId: owner.staffProfileId,
        serviceIds: [owner.serviceIds[0]],
        startsAt: at(thursday, '15:00'),
      });

    expect(asStaff.status).toBe(403);
    expect(asStaff.body.error.code).toBe('PERMISSION_DENIED');
  });

  it('reads a foreign appointment, location, customer, staff member, or service as absent', async () => {
    const owner = await salon();
    const rival = await salon();

    const rivalAppointmentId = await bookedId(rival);
    const rivalService = rival.serviceIds[0] as string;

    const detail = await request(app)
      .get(`/api/v1/appointments/${rivalAppointmentId}`)
      .set('authorization', bearer(owner.accessToken));

    expect(detail.status).toBe(404);
    expect(detail.body.error.code).toBe('NOT_FOUND');

    const foreignLocation = await book(owner, { locationId: rival.locationId });
    expect(foreignLocation.status).toBe(404);

    const foreignCustomer = await book(owner, { customerId: rival.customerId });
    expect(foreignCustomer.status).toBe(404);

    const foreignStaff = await book(owner, { staffProfileId: rival.staffProfileId });
    expect(foreignStaff.status).toBe(404);

    const foreignService = await book(owner, { serviceIds: [rivalService] });
    expect(foreignService.status).toBe(404);

    const foreignSlots = await request(app)
      .get('/api/v1/appointments/availability')
      .query({
        locationId: owner.locationId,
        staffProfileId: owner.staffProfileId,
        date: thursday,
        serviceIds: rivalService,
      })
      .set('authorization', bearer(owner.accessToken));

    expect(foreignSlots.status).toBe(404);
  });
});

describe('booking', () => {
  it('books a visit from catalog snapshots and records the first status row', async () => {
    const owner = await salon();

    const response = await book(owner, { serviceIds: owner.serviceIds, notes: '  Prefers Kai  ' });

    expect(response.status).toBe(201);

    const appointment = response.body.data.appointment;

    expect(appointment).toMatchObject({
      organizationId: owner.organizationId,
      locationId: owner.locationId,
      customerId: owner.customerId,
      staffProfileId: owner.staffProfileId,
      status: 'SCHEDULED',
      startsAt: at(thursday, '09:00'),
      endsAt: at(thursday, '10:15'),
      notes: 'Prefers Kai',
      cancelledAt: null,
      createdById: owner.userId,
      durationMinutes: 75,
      priceInCents: 7500,
      customer: { firstName: 'Wei Ling' },
      staff: { displayName: 'Kai' },
      location: { timezone: salonZone },
    });

    expect(
      appointment.services.map((service: { name: string; sortOrder: number }) => [
        service.name,
        service.sortOrder,
      ]),
    ).toEqual([
      ['Women’s cut', 0],
      ['Blow dry', 1],
    ]);

    const detail = await request(app)
      .get(`/api/v1/appointments/${appointment.id}`)
      .set('authorization', bearer(owner.accessToken));

    expect(detail.body.data.appointment.statusHistory).toHaveLength(1);
    expect(detail.body.data.appointment.statusHistory[0]).toMatchObject({
      fromStatus: null,
      toStatus: 'SCHEDULED',
      changedById: owner.userId,
      changedBy: { id: owner.userId },
    });

    const auditEntry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'appointment.created', organizationId: owner.organizationId },
    });

    expect(auditEntry.entityId).toBe(appointment.id);
  });

  it('keeps the snapshot when the catalog is edited afterwards', async () => {
    const owner = await salon();
    const appointmentId = await bookedId(owner);

    const edited = await request(app)
      .patch(`/api/v1/services/${owner.serviceIds[0]}`)
      .set('authorization', bearer(owner.accessToken))
      .send({ durationMinutes: 90, priceInCents: 9900, name: 'Women’s cut and finish' });

    expect(edited.status).toBe(200);

    const detail = await request(app)
      .get(`/api/v1/appointments/${appointmentId}`)
      .set('authorization', bearer(owner.accessToken));

    const appointment = detail.body.data.appointment;

    expect(appointment).toMatchObject({
      endsAt: at(thursday, '09:45'),
      durationMinutes: 45,
      priceInCents: 4500,
    });
    expect(appointment.services[0]).toMatchObject({
      name: 'Women’s cut',
      durationMinutes: 45,
      priceInCents: 4500,
    });
  });

  it('refuses a double booking for the same stylist and allows a touching one', async () => {
    const owner = await salon();
    await bookedId(owner);

    const overlapping = await book(owner, { startsAt: at(thursday, '09:30') });
    expect(overlapping.status).toBe(409);
    expect(overlapping.body.error.code).toBe('CONFLICT');

    // The existing visit runs 09:00–09:45, so 09:45 is free.
    const touching = await book(owner, { startsAt: at(thursday, '09:45') });
    expect(touching.status).toBe(201);

    // A different stylist is unaffected: one profile per member, so the second
    // stylist is a second member of the organization.
    const colleague = await seedMember(owner.organizationId, 'second@eurosense.test', 'STAFF');
    const second = await bookableStaff(owner, owner.serviceIds, colleague.membershipId);
    const elsewhere = await book(owner, {
      startsAt: at(thursday, '09:30'),
      staffProfileId: second,
    });
    expect(elsewhere.status).toBe(201);
  });

  it('refuses a visit inside recorded time off', async () => {
    const owner = await salon();

    const timeOff = await request(app)
      .post(`/api/v1/staff/${owner.staffProfileId}/time-off`)
      .set('authorization', bearer(owner.accessToken))
      .send({ startsAt: at(thursday, '08:00'), endsAt: at(thursday, '12:00'), reason: 'Course' });

    expect(timeOff.status).toBe(201);

    const refused = await book(owner);
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toContain('away');

    // The afternoon is outside the absence.
    const allowed = await book(owner, { startsAt: at(thursday, '13:00') });
    expect(allowed.status).toBe(201);
  });

  it('allows a booking outside business hours, as agreed for the calendar', async () => {
    const owner = await salon();

    // Sunday is closed, and 22:00 is after the salon shuts on a weekday.
    expect((await book(owner, { startsAt: at(sunday, '10:00') })).status).toBe(201);
    expect((await book(owner, { startsAt: at(thursday, '22:00') })).status).toBe(201);
  });

  it('refuses services the stylist does not perform and services that are unavailable', async () => {
    const owner = await salon();
    const otherService = await seedService(owner.organizationId, 'Balayage', 120, 18000);

    const unassigned = await book(owner, { serviceIds: [otherService] });
    expect(unassigned.status).toBe(409);
    expect(unassigned.body.error.message).toContain('does not perform');

    const unavailableService = await seedService(owner.organizationId, 'Perm', 90, 12000);

    await request(app)
      .put(`/api/v1/staff/${owner.staffProfileId}/services`)
      .set('authorization', bearer(owner.accessToken))
      .send({ serviceIds: [...owner.serviceIds, unavailableService] });

    await request(app)
      .patch(`/api/v1/services/${unavailableService}`)
      .set('authorization', bearer(owner.accessToken))
      .send({ isAvailable: false });

    const unavailable = await book(owner, { serviceIds: [unavailableService] });
    expect(unavailable.status).toBe(409);
    expect(unavailable.body.error.message).toContain('is not available');
  });

  it('validates the booking request and refuses a stylist who is not bookable', async () => {
    const owner = await salon();

    const noServices = await book(owner, { serviceIds: [] });
    expect(noServices.status).toBe(422);
    expect(noServices.body.error.code).toBe('VALIDATION_ERROR');

    await request(app)
      .patch(`/api/v1/staff/${owner.staffProfileId}`)
      .set('authorization', bearer(owner.accessToken))
      .send({ isBookable: false });

    const notBookable = await book(owner);
    expect(notBookable.status).toBe(409);
    expect(notBookable.body.error.message).toContain('does not take bookings');
  });
});

describe('availability', () => {
  it('offers slots only inside the business hours and the stylist week', async () => {
    const owner = await salon();

    const thursdays = await availability(owner, {
      date: thursday,
      serviceIds: owner.serviceIds[0],
    });

    expect(thursdays.status).toBe(200);
    expect(thursdays.body.data).toMatchObject({
      date: thursday,
      timezone: salonZone,
      window: { startsAt: at(thursday, '09:00'), endsAt: at(thursday, '18:00') },
    });

    const slots = thursdays.body.data.slots as { startsAt: string; endsAt: string }[];

    // 09:00 to 18:00 in 15-minute steps for a 45-minute visit: 09:00 … 17:15.
    expect(slots[0]).toEqual({
      startsAt: at(thursday, '09:00'),
      endsAt: at(thursday, '09:45'),
    });
    expect(slots.at(-1)?.startsAt).toBe(at(thursday, '17:15'));
    expect(slots).toHaveLength(34);

    const closedDay = await availability(owner, { date: sunday, serviceIds: owner.serviceIds[0] });
    expect(closedDay.body.data.window).toBeNull();
    expect(closedDay.body.data.slots).toEqual([]);

    const coarser = await availability(owner, {
      date: thursday,
      serviceIds: owner.serviceIds[0],
      slotMinutes: 30,
    });

    expect(coarser.body.data.slots.at(-1)?.startsAt).toBe(at(thursday, '17:00'));
    expect(coarser.body.data.slots).toHaveLength(17);
  });

  it('reports no window on a day the stylist does not work', async () => {
    const owner = await salon();

    await request(app)
      .put(`/api/v1/staff/${owner.staffProfileId}/schedule`)
      .set('authorization', bearer(owner.accessToken))
      .send({ schedule: week({ 4: { isWorking: false, startsAt: null, endsAt: null } }) });

    const response = await availability(owner, { date: thursday, serviceIds: owner.serviceIds[0] });

    expect(response.body.data.window).toBeNull();
    expect(response.body.data.slots).toEqual([]);
  });

  it('hides the slots a visit and an absence already hold', async () => {
    const owner = await salon();
    const starts = (response: { body: { data: { slots: { startsAt: string }[] } } }) =>
      response.body.data.slots.map((slot) => slot.startsAt);

    await bookedId(owner, { startsAt: at(thursday, '09:00') });

    const afterBooking = await availability(owner, {
      date: thursday,
      serviceIds: owner.serviceIds[0],
    });

    expect(starts(afterBooking)).not.toContain(at(thursday, '09:00'));
    expect(starts(afterBooking)).not.toContain(at(thursday, '09:30'));
    expect(starts(afterBooking)).toContain(at(thursday, '09:45'));

    await request(app)
      .post(`/api/v1/staff/${owner.staffProfileId}/time-off`)
      .set('authorization', bearer(owner.accessToken))
      .send({ startsAt: at(thursday, '11:00'), endsAt: at(thursday, '12:00'), reason: 'Lunch' });

    const afterAbsence = await availability(owner, {
      date: thursday,
      serviceIds: owner.serviceIds[0],
    });

    expect(starts(afterAbsence)).not.toContain(at(thursday, '10:30'));
    expect(starts(afterAbsence)).toContain(at(thursday, '12:00'));
  });

  it('sizes the visit from the services, or from an explicit duration', async () => {
    const owner = await salon();

    const both = await availability(owner, { date: thursday, serviceIds: owner.serviceIds });
    expect(both.body.data.slots.at(-1)?.startsAt).toBe(at(thursday, '16:45'));

    const whatIf = await availability(owner, { date: thursday, durationMinutes: 75 });
    expect(whatIf.body.data.slots.at(-1)?.startsAt).toBe(at(thursday, '16:45'));

    const noDuration = await availability(owner, { date: thursday });
    expect(noDuration.status).toBe(422);
    expect(noDuration.body.error.code).toBe('VALIDATION_ERROR');

    const noLocation = await request(app)
      .get('/api/v1/appointments/availability')
      .query({ staffProfileId: owner.staffProfileId, date: thursday, durationMinutes: 45 })
      .set('authorization', bearer(owner.accessToken));

    expect(noLocation.status).toBe(422);
  });
});

describe('status trail', () => {
  const move = (owner: Salon, appointmentId: string, body: Record<string, unknown>) =>
    request(app)
      .patch(`/api/v1/appointments/${appointmentId}/status`)
      .set('authorization', bearer(owner.accessToken))
      .send(body);

  const detailOf = (owner: Salon, appointmentId: string) =>
    request(app)
      .get(`/api/v1/appointments/${appointmentId}`)
      .set('authorization', bearer(owner.accessToken));

  it('walks a visit to completed and records every step in order', async () => {
    const owner = await salon();
    const appointmentId = await bookedId(owner);

    for (const status of ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED']) {
      const response = await move(owner, appointmentId, { status });

      expect(response.status).toBe(200);
      expect(response.body.data.appointment.status).toBe(status);
    }

    const detail = await detailOf(owner, appointmentId);

    expect(
      detail.body.data.appointment.statusHistory.map((row: { toStatus: string }) => row.toStatus),
    ).toEqual(['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED']);

    const auditEntry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'appointment.status_changed', entityId: appointmentId },
      orderBy: { createdAt: 'desc' },
    });

    expect(auditEntry.metadata).toMatchObject({
      fromStatus: 'IN_PROGRESS',
      toStatus: 'COMPLETED',
    });
  });

  it('lets a walk-in be completed in one step', async () => {
    const owner = await salon();
    const appointmentId = await bookedId(owner);

    const response = await move(owner, appointmentId, { status: 'COMPLETED' });

    expect(response.status).toBe(200);
    expect(response.body.data.appointment.status).toBe('COMPLETED');
  });

  it('refuses a repeated, backwards, or post-terminal move', async () => {
    const owner = await salon();
    const appointmentId = await bookedId(owner);

    const repeated = await move(owner, appointmentId, { status: 'SCHEDULED' });
    expect(repeated.status).toBe(409);
    expect(repeated.body.error.code).toBe('CONFLICT');

    await move(owner, appointmentId, { status: 'CONFIRMED' });

    const backwards = await move(owner, appointmentId, { status: 'SCHEDULED' });
    expect(backwards.status).toBe(409);

    await move(owner, appointmentId, { status: 'COMPLETED' });

    const afterCompletion = await move(owner, appointmentId, { status: 'IN_PROGRESS' });
    expect(afterCompletion.status).toBe(409);
    expect(afterCompletion.body.error.message).toContain('cannot move');
  });

  it('records a cancellation, frees the slot, and keeps the finished visit', async () => {
    const owner = await salon();
    const appointmentId = await bookedId(owner);

    const cancelled = await move(owner, appointmentId, { status: 'CANCELLED', reason: 'Ill' });

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.appointment).toMatchObject({
      status: 'CANCELLED',
      cancellationReason: 'Ill',
    });
    expect(typeof cancelled.body.data.appointment.cancelledAt).toBe('string');

    // The slot is bookable again, because a cancelled visit holds no time.
    expect((await book(owner)).status).toBe(201);

    const slots = await availability(owner, { date: thursday, serviceIds: owner.serviceIds[0] });
    const starts = (slots.body.data.slots as { startsAt: string }[]).map((slot) => slot.startsAt);

    expect(starts).not.toContain(at(thursday, '09:00'));

    // The cancelled row keeps its own history rather than disappearing.
    const detail = await detailOf(owner, appointmentId);
    expect(detail.body.data.appointment.statusHistory).toHaveLength(2);
  });
});

describe('editing a visit', () => {
  const detailOf = (owner: Salon, appointmentId: string) =>
    request(app)
      .get(`/api/v1/appointments/${appointmentId}`)
      .set('authorization', bearer(owner.accessToken));

  it('replaces the service set, re-snapshots it, and re-bounds the visit', async () => {
    const owner = await salon();
    const appointmentId = await bookedId(owner, { serviceIds: [owner.serviceIds[0]] });

    const replaced = await request(app)
      .put(`/api/v1/appointments/${appointmentId}/services`)
      .set('authorization', bearer(owner.accessToken))
      .send({ serviceIds: owner.serviceIds });

    expect(replaced.status).toBe(200);
    expect(replaced.body.data.services).toHaveLength(2);
    expect(replaced.body.data.services[0]).toMatchObject({ name: 'Women’s cut', sortOrder: 0 });

    const detail = await detailOf(owner, appointmentId);

    expect(detail.body.data.appointment).toMatchObject({
      durationMinutes: 75,
      priceInCents: 7500,
      endsAt: at(thursday, '10:15'),
    });
  });

  it('refuses a longer service set that collides with the next visit, and an empty one', async () => {
    const owner = await salon();
    const appointmentId = await bookedId(owner);
    await bookedId(owner, { startsAt: at(thursday, '10:00') });

    const extending = await request(app)
      .put(`/api/v1/appointments/${appointmentId}/services`)
      .set('authorization', bearer(owner.accessToken))
      .send({ serviceIds: owner.serviceIds });

    // 09:00 plus both services would run to 10:15, into the 10:00 visit.
    expect(extending.status).toBe(409);
    expect(extending.body.error.code).toBe('CONFLICT');

    const empty = await request(app)
      .put(`/api/v1/appointments/${appointmentId}/services`)
      .set('authorization', bearer(owner.accessToken))
      .send({ serviceIds: [] });

    expect(empty.status).toBe(422);
  });

  it('reschedules into a free slot and refuses a taken one', async () => {
    const owner = await salon();
    const first = await bookedId(owner);
    await bookedId(owner, { startsAt: at(thursday, '11:00') });

    const clash = await request(app)
      .patch(`/api/v1/appointments/${first}`)
      .set('authorization', bearer(owner.accessToken))
      .send({ startsAt: at(thursday, '11:15') });

    expect(clash.status).toBe(409);

    const moved = await request(app)
      .patch(`/api/v1/appointments/${first}`)
      .set('authorization', bearer(owner.accessToken))
      .send({ startsAt: at(thursday, '13:00'), notes: 'Running late' });

    expect(moved.status).toBe(200);
    expect(moved.body.data.appointment).toMatchObject({
      startsAt: at(thursday, '13:00'),
      endsAt: at(thursday, '13:45'),
      notes: 'Running late',
    });

    const auditEntry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'appointment.updated', entityId: first },
    });

    expect(auditEntry.metadata).toMatchObject({ fields: ['startsAt', 'notes'] });
  });

  it('keeps a finished visit where it is, while still allowing a note', async () => {
    const owner = await salon();
    const appointmentId = await bookedId(owner);

    await request(app)
      .patch(`/api/v1/appointments/${appointmentId}/status`)
      .set('authorization', bearer(owner.accessToken))
      .send({ status: 'COMPLETED' });

    const moved = await request(app)
      .patch(`/api/v1/appointments/${appointmentId}`)
      .set('authorization', bearer(owner.accessToken))
      .send({ startsAt: at(thursday, '15:00') });

    expect(moved.status).toBe(409);
    expect(moved.body.error.message).toContain('cannot be moved');

    const noted = await request(app)
      .patch(`/api/v1/appointments/${appointmentId}`)
      .set('authorization', bearer(owner.accessToken))
      .send({ notes: 'Left a tip' });

    expect(noted.status).toBe(200);
    expect(noted.body.data.appointment.notes).toBe('Left a tip');
  });
});

describe('calendar reads', () => {
  it('returns the local day window for a date, and the most recent visits otherwise', async () => {
    const owner = await salon();
    const thursdayVisit = await bookedId(owner, { startsAt: at(thursday, '09:00') });
    const fridayVisit = await bookedId(owner, { startsAt: at('2026-09-25', '09:00') });

    const day = await calendar(owner, { date: thursday, locationId: owner.locationId });

    expect(day.body.data.window).toEqual({
      startsAt: at(thursday, '00:00'),
      endsAt: at('2026-09-25', '00:00'),
    });
    expect(day.body.data.appointments.map((row: { id: string }) => row.id)).toEqual([
      thursdayVisit,
    ]);

    const recent = await calendar(owner);

    expect(recent.body.data.window).toBeNull();
    expect(recent.body.data.appointments.map((row: { id: string }) => row.id)).toEqual([
      fridayVisit,
      thursdayVisit,
    ]);

    const cancelled = await calendar(owner, { status: 'CANCELLED' });
    expect(cancelled.body.data.appointments).toEqual([]);
  });

  it('answers the customer visit history', async () => {
    const owner = await salon();
    await bookedId(owner, { startsAt: at(thursday, '09:00') });
    await bookedId(owner, { startsAt: at('2026-09-25', '09:00') });

    const otherCustomer = await seedCustomer(owner.organizationId, 'other@example.test');

    const history = await calendar(owner, { customerId: owner.customerId, limit: 1 });

    expect(history.body.data.appointments).toHaveLength(1);
    expect(history.body.data.appointments[0]).toMatchObject({
      customerId: owner.customerId,
      startsAt: at('2026-09-25', '09:00'),
    });

    const none = await calendar(owner, { customerId: otherCustomer.id });
    expect(none.body.data.appointments).toEqual([]);
  });

  it('validates the window inputs', async () => {
    const owner = await salon();

    const dateWithoutLocation = await calendar(owner, { date: thursday });
    expect(dateWithoutLocation.status).toBe(422);

    const halfRange = await calendar(owner, { from: at(thursday, '00:00') });
    expect(halfRange.status).toBe(422);

    const both = await calendar(owner, {
      date: thursday,
      locationId: owner.locationId,
      from: at(thursday, '00:00'),
      to: at('2026-09-25', '00:00'),
    });
    expect(both.status).toBe(422);

    const missingLocation = await calendar(owner, { date: thursday, locationId: 'loc_missing' });
    expect(missingLocation.status).toBe(404);

    const range = await calendar(owner, {
      from: at(thursday, '00:00'),
      to: at('2026-09-25', '00:00'),
    });

    expect(range.status).toBe(200);
    expect(range.body.data.window).toEqual({
      startsAt: at(thursday, '00:00'),
      endsAt: at('2026-09-25', '00:00'),
    });
  });
});
