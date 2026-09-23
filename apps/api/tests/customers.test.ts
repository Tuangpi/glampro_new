import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/database/prisma.js';
import type { MembershipRole } from '../src/generated/prisma/client.js';
import { hashRefreshToken, issueAccessToken } from '../src/modules/auth/tokens.js';
import { truncateAllTables } from './helpers/test-db.js';

/**
 * Customer profile coverage against the real middleware chain: `authenticate`,
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

const seedMember = async (organizationId: string, email: string, role: MembershipRole) => {
  const user = await prisma.user.create({
    data: {
      email,
      firstName: 'Test',
      lastName: 'Member',
      credential: { create: { passwordHash: 'not-used-by-the-customer-tests' } },
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

const seedCustomer = (
  organizationId: string,
  overrides: Partial<{ firstName: string; lastName: string; email: string; phone: string }> = {},
) =>
  prisma.customer.create({
    data: {
      organizationId,
      firstName: 'Wei Ling',
      lastName: 'Ng',
      email: 'wei.ling@example.test',
      phone: '+65 9123 4567',
      ...overrides,
    },
    select: { id: true },
  });

beforeEach(async () => {
  await truncateAllTables();
});

describe('customer profiles', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await request(app).get('/api/v1/customers');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('lets a staff member read but not manage customers', async () => {
    const owner = await registerOrganization();
    const staff = await seedMember(owner.organizationId, 'staff@eurosense.test', 'STAFF');
    await seedCustomer(owner.organizationId);

    const readable = await request(app)
      .get('/api/v1/customers')
      .set('authorization', bearer(staff.accessToken));

    expect(readable.status).toBe(200);
    expect(readable.body.data.customers).toHaveLength(1);

    const denied = await request(app)
      .post('/api/v1/customers')
      .set('authorization', bearer(staff.accessToken))
      .send({ firstName: 'Someone' });

    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('PERMISSION_DENIED');
  });

  it('creates a customer, then lists, searches, and reads it back', async () => {
    const owner = await registerOrganization();

    const created = await request(app)
      .post('/api/v1/customers')
      .set('authorization', bearer(owner.accessToken))
      .send({
        firstName: '  Wei Ling ',
        lastName: 'Ng',
        email: ' Wei.Ling@Example.Test ',
        phone: '+65 9123 4567',
        dateOfBirth: '1992-04-18',
        gender: 'FEMALE',
        memberNumber: 'M-1001',
      });

    expect(created.status).toBe(201);
    expect(created.body.data.customer).toMatchObject({
      firstName: 'Wei Ling',
      email: 'wei.ling@example.test',
      dateOfBirth: '1992-04-18',
      gender: 'FEMALE',
      countryCode: 'SG',
      isActive: true,
      organizationId: owner.organizationId,
    });

    const customerId = created.body.data.customer.id as string;

    await request(app)
      .post('/api/v1/customers')
      .set('authorization', bearer(owner.accessToken))
      .send({ firstName: 'Ravi', lastName: 'Kumar', phone: '+65 8000 0000' });

    const listed = await request(app)
      .get('/api/v1/customers')
      .set('authorization', bearer(owner.accessToken));

    expect(listed.status).toBe(200);
    expect(listed.body.data.customers).toHaveLength(2);

    const searched = await request(app)
      .get('/api/v1/customers?q=9123')
      .set('authorization', bearer(owner.accessToken));

    expect(searched.body.data.customers).toHaveLength(1);
    expect(searched.body.data.customers[0].id).toBe(customerId);

    const readBack = await request(app)
      .get(`/api/v1/customers/${customerId}`)
      .set('authorization', bearer(owner.accessToken));

    expect(readBack.status).toBe(200);
    expect(readBack.body.data.customer).toMatchObject({ memberNumber: 'M-1001', notes: [] });
  });

  it('refuses a duplicate email or phone, while leaving the same keys free for another tenant', async () => {
    const owner = await registerOrganization();
    await seedCustomer(owner.organizationId, {
      email: 'taken@example.test',
      phone: '+65 9111 1111',
    });

    const duplicateEmail = await request(app)
      .post('/api/v1/customers')
      .set('authorization', bearer(owner.accessToken))
      .send({ firstName: 'Another', email: 'Taken@Example.test' });

    expect(duplicateEmail.status).toBe(409);
    expect(duplicateEmail.body.error.code).toBe('CONFLICT');

    const duplicatePhone = await request(app)
      .post('/api/v1/customers')
      .set('authorization', bearer(owner.accessToken))
      .send({ firstName: 'Another', phone: '+65 9111 1111' });

    expect(duplicatePhone.status).toBe(409);

    const rival = await registerOrganization({
      email: 'owner@rival.test',
      organizationName: 'Rival Salon',
      locationName: 'Orchard',
    });

    const allowedForRival = await request(app)
      .post('/api/v1/customers')
      .set('authorization', bearer(rival.accessToken))
      .send({ firstName: 'Another', email: 'taken@example.test' });

    expect(allowedForRival.status).toBe(201);

    // Without a contact detail there is nothing to clash on.
    const walkIn = await request(app)
      .post('/api/v1/customers')
      .set('authorization', bearer(owner.accessToken))
      .send({ firstName: 'Walk', lastName: 'In' });

    expect(walkIn.status).toBe(201);
  });

  it('returns 404 for another tenant’s customer, notes, and updates', async () => {
    const owner = await registerOrganization();
    const rival = await registerOrganization({
      email: 'owner@rival.test',
      organizationName: 'Rival Salon',
      locationName: 'Orchard',
    });

    const rivalCustomer = await seedCustomer(rival.organizationId, {
      email: 'rival@example.test',
      phone: '+65 9222 2222',
    });

    const read = await request(app)
      .get(`/api/v1/customers/${rivalCustomer.id}`)
      .set('authorization', bearer(owner.accessToken));

    expect(read.status).toBe(404);
    expect(read.body.error.code).toBe('NOT_FOUND');
    expect(read.body.error.message).not.toContain('Rival');

    const notes = await request(app)
      .get(`/api/v1/customers/${rivalCustomer.id}/notes`)
      .set('authorization', bearer(owner.accessToken));

    expect(notes.status).toBe(404);

    const updated = await request(app)
      .patch(`/api/v1/customers/${rivalCustomer.id}`)
      .set('authorization', bearer(owner.accessToken))
      .send({ firstName: 'Taken over' });

    expect(updated.status).toBe(404);

    const stored = await prisma.customer.findUniqueOrThrow({
      where: { id: rivalCustomer.id },
      select: { firstName: true },
    });

    expect(stored.firstName).toBe('Wei Ling');
  });

  it('clears an optional detail with an explicit null and audits the change', async () => {
    const owner = await registerOrganization();
    const customer = await seedCustomer(owner.organizationId);

    const cleared = await request(app)
      .patch(`/api/v1/customers/${customer.id}`)
      .set('authorization', bearer(owner.accessToken))
      .send({ email: null, isActive: false });

    expect(cleared.status).toBe(200);
    expect(cleared.body.data.customer).toMatchObject({ email: null, isActive: false });

    const auditEntry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'customer.updated', organizationId: owner.organizationId },
    });

    expect(auditEntry.entityId).toBe(customer.id);
  });

  it('appends notes to the timeline and refuses a blank one', async () => {
    const owner = await registerOrganization();
    const customer = await seedCustomer(owner.organizationId);

    const created = await request(app)
      .post(`/api/v1/customers/${customer.id}/notes`)
      .set('authorization', bearer(owner.accessToken))
      .send({ body: '  Allergic to ammonia  ' });

    expect(created.status).toBe(201);
    expect(created.body.data.note).toMatchObject({
      body: 'Allergic to ammonia',
      customerId: customer.id,
      author: { id: owner.userId, email: 'owner@eurosense.test' },
    });

    const blank = await request(app)
      .post(`/api/v1/customers/${customer.id}/notes`)
      .set('authorization', bearer(owner.accessToken))
      .send({ body: '   ' });

    expect(blank.status).toBe(422);
    expect(blank.body.error.code).toBe('VALIDATION_ERROR');

    const notes = await request(app)
      .get(`/api/v1/customers/${customer.id}/notes`)
      .set('authorization', bearer(owner.accessToken));

    expect(notes.status).toBe(200);
    expect(notes.body.data.notes).toHaveLength(1);

    const auditEntry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'customer.note_added', organizationId: owner.organizationId },
    });

    expect(auditEntry.entityId).toBe(created.body.data.note.id);
  });

  it('rejects a create without a first name and an empty update', async () => {
    const owner = await registerOrganization();
    const customer = await seedCustomer(owner.organizationId);

    const nameless = await request(app)
      .post('/api/v1/customers')
      .set('authorization', bearer(owner.accessToken))
      .send({ lastName: 'No first name' });

    expect(nameless.status).toBe(422);
    expect(nameless.body.error.code).toBe('VALIDATION_ERROR');

    const emptyUpdate = await request(app)
      .patch(`/api/v1/customers/${customer.id}`)
      .set('authorization', bearer(owner.accessToken))
      .send({});

    expect(emptyUpdate.status).toBe(422);
    expect(emptyUpdate.body.error.code).toBe('VALIDATION_ERROR');
  });
});
