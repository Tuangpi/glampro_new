import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/database/prisma.js';
import type { MembershipRole, MembershipStatus } from '../src/generated/prisma/client.js';
import { hashRefreshToken, issueAccessToken } from '../src/modules/auth/tokens.js';
import { truncateAllTables } from './helpers/test-db.js';

/**
 * Staff roster coverage against the real middleware chain: `authenticate`,
 * `withTenant`, `requirePermission`, validation, and the contract shapes the web
 * client parses.
 */
const app = createApp();

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
};

const registerOrganization = async (
  overrides: Partial<typeof registrationInput> = {},
): Promise<RegisteredOrg> => {
  const response = await request(app)
    .post('/api/v1/auth/register')
    .send({ ...registrationInput, ...overrides });

  expect(response.status).toBe(201);

  const membership = response.body.data.organizations[0];

  return {
    accessToken: response.body.data.accessToken as string,
    userId: response.body.data.user.id as string,
    organizationId: membership.organizationId as string,
    membershipId: membership.id as string,
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

const seedMember = async (
  organizationId: string,
  email: string,
  role: MembershipRole,
  status: MembershipStatus = 'ACTIVE',
) => {
  const user = await prisma.user.create({
    data: {
      email,
      firstName: 'Jia',
      lastName: 'Ting',
      credential: { create: { passwordHash: 'not-used-by-the-staff-tests' } },
    },
    select: { id: true },
  });

  const membership = await prisma.organizationMembership.create({
    data: { organizationId, userId: user.id, role, status },
    select: { id: true },
  });

  return { userId: user.id, membershipId: membership.id, accessToken: await tokenFor(user.id) };
};

/** A staff profile needs a service to be assigned, so tests seed one on demand. */
const seedService = async (organizationId: string, name = 'Women’s cut') => {
  const category = await prisma.serviceCategory.create({
    data: { organizationId, name: `Category ${name}` },
    select: { id: true },
  });

  return prisma.service.create({
    data: {
      organizationId,
      serviceCategoryId: category.id,
      name,
      durationMinutes: 45,
      priceInCents: 4500,
    },
    select: { id: true },
  });
};

const bearer = (accessToken: string) => `Bearer ${accessToken}`;

/** The schedule contract expects one entry per weekday. */
const week = (overrides: Record<number, object> = {}) =>
  Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    startsAt: '09:00',
    endsAt: '18:00',
    isWorking: true,
    ...overrides[dayOfWeek],
  }));

/** Creates a profile through the API and returns its id. */
const createProfile = async (
  owner: RegisteredOrg,
  membershipId: string,
  body: Record<string, unknown> = {},
) => {
  const response = await request(app)
    .post('/api/v1/staff')
    .set('authorization', bearer(owner.accessToken))
    .send({ membershipId, jobTitle: 'Senior stylist', ...body });

  expect(response.status).toBe(201);

  return response.body.data.staffProfile.id as string;
};

beforeEach(async () => {
  await truncateAllTables();
});

describe('staff roster', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await request(app).get('/api/v1/staff');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('lets a receptionist read the roster but not change it', async () => {
    const owner = await registerOrganization();
    const receptionist = await seedMember(
      owner.organizationId,
      'front@eurosense.test',
      'RECEPTIONIST',
    );
    await createProfile(owner, owner.membershipId);

    const readable = await request(app)
      .get('/api/v1/staff')
      .set('authorization', bearer(receptionist.accessToken));

    expect(readable.status).toBe(200);
    expect(readable.body.data.staffProfiles).toHaveLength(1);

    const denied = await request(app)
      .post('/api/v1/staff')
      .set('authorization', bearer(receptionist.accessToken))
      .send({ membershipId: receptionist.membershipId });

    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('PERMISSION_DENIED');
  });

  it('lists only active members without a profile, and only for a manager', async () => {
    const owner = await registerOrganization();
    const stylist = await seedMember(owner.organizationId, 'jia@eurosense.test', 'STAFF');
    await seedMember(owner.organizationId, 'new@eurosense.test', 'STAFF', 'INVITED');

    const unauthenticated = await request(app).get('/api/v1/staff/candidates');
    expect(unauthenticated.status).toBe(401);

    const candidates = await request(app)
      .get('/api/v1/staff/candidates')
      .set('authorization', bearer(owner.accessToken));

    expect(candidates.status).toBe(200);
    // 'Tan' sorts before 'Ting', and an invited colleague has no roster
    // presence yet, so only the two active memberships are offered.
    expect(
      candidates.body.data.candidates.map((entry: { membershipId: string }) => entry.membershipId),
    ).toEqual([owner.membershipId, stylist.membershipId]);

    await createProfile(owner, owner.membershipId);

    const afterProfile = await request(app)
      .get('/api/v1/staff/candidates')
      .set('authorization', bearer(owner.accessToken));

    expect(
      afterProfile.body.data.candidates.map(
        (entry: { membershipId: string }) => entry.membershipId,
      ),
    ).toEqual([stylist.membershipId]);

    // A receptionist reads the roster but cannot start a profile.
    const receptionist = await seedMember(
      owner.organizationId,
      'front@eurosense.test',
      'RECEPTIONIST',
    );

    const denied = await request(app)
      .get('/api/v1/staff/candidates')
      .set('authorization', bearer(receptionist.accessToken));

    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('PERMISSION_DENIED');
  });

  it('creates a profile for an active member and seeds a full week', async () => {
    const owner = await registerOrganization();
    const stylist = await seedMember(owner.organizationId, 'jia@eurosense.test', 'STAFF');

    const response = await request(app)
      .post('/api/v1/staff')
      .set('authorization', bearer(owner.accessToken))
      .send({
        membershipId: stylist.membershipId,
        displayName: 'Jia',
        jobTitle: '  Senior stylist  ',
        color: '#6144E4',
        hireDate: '2024-02-01',
      });

    expect(response.status).toBe(201);
    expect(response.body.data.staffProfile).toMatchObject({
      membershipId: stylist.membershipId,
      jobTitle: 'Senior stylist',
      color: '#6144E4',
      hireDate: '2024-02-01',
      isBookable: true,
      isActive: true,
      organizationId: owner.organizationId,
      member: { email: 'jia@eurosense.test', role: 'STAFF', status: 'ACTIVE' },
    });

    const staffProfileId = response.body.data.staffProfile.id as string;
    const schedule = await prisma.staffSchedule.findMany({
      where: { staffProfileId },
      orderBy: { dayOfWeek: 'asc' },
    });

    expect(schedule).toHaveLength(7);
    expect(schedule.map((entry) => entry.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(schedule.every((entry) => !entry.isWorking && entry.startsAt === null)).toBe(true);

    const listed = await request(app)
      .get('/api/v1/staff')
      .set('authorization', bearer(owner.accessToken));

    expect(listed.body.data.staffProfiles).toHaveLength(1);

    const auditEntry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'staff.profile_created', organizationId: owner.organizationId },
    });

    expect(auditEntry.entityId).toBe(staffProfileId);
  });

  it('refuses a profile for a member who is not active, and a second profile for one member', async () => {
    const owner = await registerOrganization();
    const invited = await seedMember(
      owner.organizationId,
      'invited@eurosense.test',
      'STAFF',
      'INVITED',
    );

    const invitedAttempt = await request(app)
      .post('/api/v1/staff')
      .set('authorization', bearer(owner.accessToken))
      .send({ membershipId: invited.membershipId });

    expect(invitedAttempt.status).toBe(409);
    expect(invitedAttempt.body.error.code).toBe('CONFLICT');

    await createProfile(owner, owner.membershipId);

    const duplicate = await request(app)
      .post('/api/v1/staff')
      .set('authorization', bearer(owner.accessToken))
      .send({ membershipId: owner.membershipId });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('CONFLICT');
  });

  it('refuses a profile whose membership belongs to another organization', async () => {
    const owner = await registerOrganization();
    const rival = await registerOrganization({
      email: 'owner@rival.test',
      organizationName: 'Rival Salon',
      locationName: 'Orchard',
    });

    const response = await request(app)
      .post('/api/v1/staff')
      .set('authorization', bearer(owner.accessToken))
      .send({ membershipId: rival.membershipId });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.message).not.toContain('Rival');
  });

  it('returns 404 for another tenant’s profile, week, services, and time off', async () => {
    const owner = await registerOrganization();
    const rival = await registerOrganization({
      email: 'owner@rival.test',
      organizationName: 'Rival Salon',
      locationName: 'Orchard',
    });
    const rivalProfileId = await createProfile(rival, rival.membershipId);

    for (const path of [
      `/api/v1/staff/${rivalProfileId}`,
      `/api/v1/staff/${rivalProfileId}/services`,
      `/api/v1/staff/${rivalProfileId}/schedule`,
      `/api/v1/staff/${rivalProfileId}/time-off`,
    ]) {
      const response = await request(app).get(path).set('authorization', bearer(owner.accessToken));

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    }

    const written = await request(app)
      .put(`/api/v1/staff/${rivalProfileId}/services`)
      .set('authorization', bearer(owner.accessToken))
      .send({ serviceIds: [] });

    expect(written.status).toBe(404);
  });

  it('replaces the service assignment set and refuses a foreign service', async () => {
    const owner = await registerOrganization();
    const rival = await registerOrganization({
      email: 'owner@rival.test',
      organizationName: 'Rival Salon',
      locationName: 'Orchard',
    });

    const staffProfileId = await createProfile(owner, owner.membershipId);
    const cut = await seedService(owner.organizationId);
    const colour = await seedService(owner.organizationId, 'Full highlights');
    const rivalService = await seedService(rival.organizationId, 'Rival cut');

    const assigned = await request(app)
      .put(`/api/v1/staff/${staffProfileId}/services`)
      .set('authorization', bearer(owner.accessToken))
      .send({ serviceIds: [cut.id, colour.id] });

    expect(assigned.status).toBe(200);
    expect(assigned.body.data.services).toHaveLength(2);

    const reduced = await request(app)
      .put(`/api/v1/staff/${staffProfileId}/services`)
      .set('authorization', bearer(owner.accessToken))
      .send({ serviceIds: [colour.id] });

    expect(reduced.status).toBe(200);
    expect(reduced.body.data.services).toMatchObject([{ id: colour.id }]);

    const refused = await request(app)
      .put(`/api/v1/staff/${staffProfileId}/services`)
      .set('authorization', bearer(owner.accessToken))
      .send({ serviceIds: [colour.id, rivalService.id] });

    expect(refused.status).toBe(404);
    expect(refused.body.error.code).toBe('NOT_FOUND');

    // The refused request left the previous set untouched.
    const listed = await request(app)
      .get(`/api/v1/staff/${staffProfileId}/services`)
      .set('authorization', bearer(owner.accessToken));

    expect(listed.body.data.services).toMatchObject([{ id: colour.id }]);

    const detail = await request(app)
      .get(`/api/v1/staff/${staffProfileId}`)
      .set('authorization', bearer(owner.accessToken));

    expect(detail.status).toBe(200);
    expect(detail.body.data.staffProfile.services).toHaveLength(1);

    const auditEntry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'staff.services_replaced', organizationId: owner.organizationId },
    });

    expect(auditEntry.entityId).toBe(staffProfileId);
  });

  it('replaces the week, normalises non-working days, and rejects an invalid week', async () => {
    const owner = await registerOrganization();
    const staffProfileId = await createProfile(owner, owner.membershipId);

    const replaced = await request(app)
      .put(`/api/v1/staff/${staffProfileId}/schedule`)
      .set('authorization', bearer(owner.accessToken))
      .send({
        schedule: week({
          0: { isWorking: false, startsAt: null, endsAt: null },
          6: { startsAt: '10:00', endsAt: '14:00' },
        }),
      });

    expect(replaced.status).toBe(200);
    expect(replaced.body.data.schedule).toHaveLength(7);
    expect(replaced.body.data.schedule[0]).toMatchObject({
      dayOfWeek: 0,
      isWorking: false,
      startsAt: null,
    });
    expect(replaced.body.data.schedule[6]).toMatchObject({ startsAt: '10:00', endsAt: '14:00' });

    const incomplete = await request(app)
      .put(`/api/v1/staff/${staffProfileId}/schedule`)
      .set('authorization', bearer(owner.accessToken))
      .send({ schedule: week().slice(0, 6) });

    expect(incomplete.status).toBe(422);
    expect(incomplete.body.error.code).toBe('VALIDATION_ERROR');

    const inverted = await request(app)
      .put(`/api/v1/staff/${staffProfileId}/schedule`)
      .set('authorization', bearer(owner.accessToken))
      .send({ schedule: week({ 3: { startsAt: '18:00', endsAt: '09:00' } }) });

    expect(inverted.status).toBe(422);

    const schedule = await request(app)
      .get(`/api/v1/staff/${staffProfileId}/schedule`)
      .set('authorization', bearer(owner.accessToken));

    expect(schedule.status).toBe(200);
    expect(schedule.body.data.schedule).toHaveLength(7);

    const auditEntry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'staff.schedule_replaced', organizationId: owner.organizationId },
    });

    expect(auditEntry.entityId).toBe(staffProfileId);
  });

  it('records, lists, and removes time off, refusing an inverted window', async () => {
    const owner = await registerOrganization();
    const staffProfileId = await createProfile(owner, owner.membershipId);

    const created = await request(app)
      .post(`/api/v1/staff/${staffProfileId}/time-off`)
      .set('authorization', bearer(owner.accessToken))
      .send({
        startsAt: '2026-10-01T01:00:00.000Z',
        endsAt: '2026-10-02T10:00:00.000Z',
        reason: 'Annual leave',
      });

    expect(created.status).toBe(201);
    expect(created.body.data.timeOff).toMatchObject({
      staffProfileId,
      reason: 'Annual leave',
      createdById: owner.userId,
      createdBy: { id: owner.userId },
    });

    const timeOffId = created.body.data.timeOff.id as string;

    const inverted = await request(app)
      .post(`/api/v1/staff/${staffProfileId}/time-off`)
      .set('authorization', bearer(owner.accessToken))
      .send({ startsAt: '2026-10-02T10:00:00.000Z', endsAt: '2026-10-01T01:00:00.000Z' });

    expect(inverted.status).toBe(422);
    expect(inverted.body.error.code).toBe('VALIDATION_ERROR');

    const listed = await request(app)
      .get(`/api/v1/staff/${staffProfileId}/time-off`)
      .set('authorization', bearer(owner.accessToken));

    expect(listed.body.data.timeOff).toHaveLength(1);

    const detail = await request(app)
      .get(`/api/v1/staff/${staffProfileId}`)
      .set('authorization', bearer(owner.accessToken));

    expect(detail.body.data.staffProfile.timeOff).toHaveLength(1);

    const removed = await request(app)
      .delete(`/api/v1/staff/${staffProfileId}/time-off/${timeOffId}`)
      .set('authorization', bearer(owner.accessToken));

    expect(removed.status).toBe(200);
    expect(removed.body.data.timeOff).toMatchObject({ id: timeOffId });

    const afterRemoval = await request(app)
      .get(`/api/v1/staff/${staffProfileId}/time-off`)
      .set('authorization', bearer(owner.accessToken));

    expect(afterRemoval.body.data.timeOff).toEqual([]);

    const removedAgain = await request(app)
      .delete(`/api/v1/staff/${staffProfileId}/time-off/${timeOffId}`)
      .set('authorization', bearer(owner.accessToken));

    expect(removedAgain.status).toBe(404);
  });

  it('updates a profile and refuses a range that inverts an existing date', async () => {
    const owner = await registerOrganization();
    const staffProfileId = await createProfile(owner, owner.membershipId, {
      hireDate: '2024-02-01',
    });

    const updated = await request(app)
      .patch(`/api/v1/staff/${staffProfileId}`)
      .set('authorization', bearer(owner.accessToken))
      .send({ jobTitle: 'Head stylist', isBookable: false });

    expect(updated.status).toBe(200);
    expect(updated.body.data.staffProfile).toMatchObject({
      jobTitle: 'Head stylist',
      isBookable: false,
    });

    const invalidRange = await request(app)
      .patch(`/api/v1/staff/${staffProfileId}`)
      .set('authorization', bearer(owner.accessToken))
      .send({ endDate: '2023-01-01' });

    expect(invalidRange.status).toBe(409);
    expect(invalidRange.body.error.code).toBe('CONFLICT');

    const auditEntry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'staff.profile_updated', organizationId: owner.organizationId },
    });

    expect(auditEntry.entityId).toBe(staffProfileId);
  });
});
