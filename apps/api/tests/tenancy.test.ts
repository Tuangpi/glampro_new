import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/database/prisma.js';
import type { MembershipRole, MembershipStatus } from '../src/generated/prisma/client.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { hashRefreshToken, issueAccessToken } from '../src/modules/auth/tokens.js';
import { truncateAllTables } from './helpers/test-db.js';

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

/** Issues an access token directly, matching the tenant-isolation harness. */
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
      firstName: 'Test',
      lastName: 'Member',
      credential: { create: { passwordHash: 'not-used-by-the-tenancy-tests' } },
    },
    select: { id: true },
  });

  const membership = await prisma.organizationMembership.create({
    data: { organizationId, userId: user.id, role, status },
    select: { id: true },
  });

  return { userId: user.id, membershipId: membership.id, accessToken: await tokenFor(user.id) };
};

const seedUserWithPassword = async (email: string, password: string) =>
  prisma.user.create({
    data: {
      email,
      firstName: 'Ivy',
      lastName: 'Goh',
      credential: { create: { passwordHash: await hashPassword(password) } },
    },
    select: { id: true },
  });

const loginAs = async (email: string, password: string) => {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(response.status).toBe(200);
  return response.body.data.accessToken as string;
};

/**
 * The raw invitation token only exists in the email, so the stored hash is
 * replaced with the hash of a token the test controls — the same technique the
 * password-reset tests use.
 */
const withKnownInvitationToken = async (invitationId: string, token: string) => {
  await prisma.organizationInvitation.updateMany({
    where: { id: invitationId },
    data: { tokenHash: hashRefreshToken(token) },
  });
};

const firstLocationId = async (organizationId: string) =>
  (await prisma.location.findFirstOrThrow({ where: { organizationId }, select: { id: true } })).id;

const bearer = (accessToken: string) => `Bearer ${accessToken}`;

beforeEach(async () => {
  await truncateAllTables();
});

describe('organization settings', () => {
  it('requires authentication', async () => {
    const response = await request(app).get('/api/v1/settings/organization');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('denies members without settings.manage', async () => {
    const owner = await registerOrganization();
    const manager = await seedMember(owner.organizationId, 'manager@eurosense.test', 'MANAGER');

    const read = await request(app)
      .get('/api/v1/settings/organization')
      .set('authorization', bearer(manager.accessToken));

    expect(read.status).toBe(403);
    expect(read.body.error.code).toBe('PERMISSION_DENIED');

    const write = await request(app)
      .patch('/api/v1/settings/organization')
      .set('authorization', bearer(manager.accessToken))
      .send({ name: 'Taken Over' });

    expect(write.status).toBe(403);
  });

  it('reads and updates organization settings with an audit entry', async () => {
    const owner = await registerOrganization();

    const before = await request(app)
      .get('/api/v1/settings/organization')
      .set('authorization', bearer(owner.accessToken));

    expect(before.status).toBe(200);
    expect(before.body.data).toMatchObject({
      name: 'Eurosense Hair Studio',
      slug: 'eurosense-hair-studio',
      status: 'TRIAL',
      defaultCurrency: 'SGD',
      legalName: null,
    });

    const updated = await request(app)
      .patch('/api/v1/settings/organization')
      .set('authorization', bearer(owner.accessToken))
      .send({
        name: 'Eurosense Hair Studio Pte Ltd',
        legalName: 'Eurosense Hair Studio Pte Ltd',
        gstRegistrationNumber: 'TG99001122',
        defaultTimezone: 'Asia/Singapore',
      });

    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({
      name: 'Eurosense Hair Studio Pte Ltd',
      legalName: 'Eurosense Hair Studio Pte Ltd',
      gstRegistrationNumber: 'TG99001122',
    });
    expect(updated.body.meta.requestId).toEqual(expect.any(String));

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: owner.organizationId },
      select: { name: true, gstRegistrationNumber: true },
    });
    expect(organization.gstRegistrationNumber).toBe('TG99001122');

    const auditEntry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'settings.organization_updated', organizationId: owner.organizationId },
    });
    expect(auditEntry.actorUserId).toBe(owner.userId);
    expect(auditEntry.entityType).toBe('Organization');
  });

  it('rejects an update with no fields', async () => {
    const owner = await registerOrganization();

    const response = await request(app)
      .patch('/api/v1/settings/organization')
      .set('authorization', bearer(owner.accessToken))
      .send({});

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('locations and business hours', () => {
  it('requires authentication and settings.manage', async () => {
    const anonymous = await request(app).get('/api/v1/locations');
    expect(anonymous.status).toBe(401);

    const owner = await registerOrganization();
    const receptionist = await seedMember(
      owner.organizationId,
      'frontdesk@eurosense.test',
      'RECEPTIONIST',
    );

    const denied = await request(app)
      .post('/api/v1/locations')
      .set('authorization', bearer(receptionist.accessToken))
      .send({ name: 'Never Branch' });

    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('PERMISSION_DENIED');
  });

  it('lists the registration location with its receipt settings', async () => {
    const owner = await registerOrganization();

    const response = await request(app)
      .get('/api/v1/locations')
      .set('authorization', bearer(owner.accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data.locations).toHaveLength(1);
    expect(response.body.data.locations[0]).toMatchObject({
      name: 'Tanjong Pagar',
      organizationId: owner.organizationId,
      pricesIncludeTax: true,
      receiptPrefix: 'SALE',
      nextReceiptNumber: 1,
      isActive: true,
      countryCode: 'SG',
    });
  });

  it('updates tax mode and receipt numbering with an audit entry', async () => {
    const owner = await registerOrganization();
    const locationId = await firstLocationId(owner.organizationId);

    const response = await request(app)
      .patch(`/api/v1/locations/${locationId}`)
      .set('authorization', bearer(owner.accessToken))
      .send({ pricesIncludeTax: false, receiptPrefix: 'INV', city: 'Singapore' });

    expect(response.status).toBe(200);
    expect(response.body.data.location).toMatchObject({
      pricesIncludeTax: false,
      receiptPrefix: 'INV',
      city: 'Singapore',
      nextReceiptNumber: 1,
    });

    const auditEntry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'settings.location_updated', organizationId: owner.organizationId },
    });
    expect(auditEntry.entityId).toBe(locationId);
  });

  it('creates a location with default business hours and refuses duplicate codes', async () => {
    const owner = await registerOrganization();

    const created = await request(app)
      .post('/api/v1/locations')
      .set('authorization', bearer(owner.accessToken))
      .send({ name: 'Ann Siang' });

    expect(created.status).toBe(201);
    expect(created.body.data.location).toMatchObject({
      name: 'Ann Siang',
      code: 'ANNSIANG',
      organizationId: owner.organizationId,
      currency: 'SGD',
    });

    const locationId = created.body.data.location.id as string;
    const hours = await prisma.businessHour.findMany({ where: { locationId } });
    expect(hours).toHaveLength(7);

    const duplicate = await request(app)
      .post('/api/v1/locations')
      .set('authorization', bearer(owner.accessToken))
      .send({ name: 'Ann Siang Two', code: 'annsiang' });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('CONFLICT');

    const auditEntry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'settings.location_created', organizationId: owner.organizationId },
    });
    expect(auditEntry.entityId).toBe(locationId);
  });

  it('replaces business hours for the whole week', async () => {
    const owner = await registerOrganization();
    const locationId = await firstLocationId(owner.organizationId);

    const hours = [
      { dayOfWeek: 0, opensAt: null, closesAt: null, isClosed: true },
      ...Array.from({ length: 6 }, (_, index) => ({
        dayOfWeek: index + 1,
        opensAt: '10:00',
        closesAt: '19:00',
        isClosed: false,
      })),
    ];

    const response = await request(app)
      .put(`/api/v1/locations/${locationId}/business-hours`)
      .set('authorization', bearer(owner.accessToken))
      .send({ hours });

    expect(response.status).toBe(200);
    expect(response.body.data.hours).toHaveLength(7);
    expect(response.body.data.hours[0]).toMatchObject({ dayOfWeek: 0, isClosed: true });
    expect(response.body.data.hours[1]).toMatchObject({ opensAt: '10:00', closesAt: '19:00' });

    const stored = await prisma.businessHour.findFirstOrThrow({
      where: { locationId, dayOfWeek: 0 },
    });
    expect(stored.isClosed).toBe(true);
    expect(stored.opensAt).toBeNull();

    const auditEntry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'settings.business_hours_updated', organizationId: owner.organizationId },
    });
    expect(auditEntry.entityId).toBe(locationId);
  });

  it('rejects an incomplete business-hours payload', async () => {
    const owner = await registerOrganization();
    const locationId = await firstLocationId(owner.organizationId);

    const response = await request(app)
      .put(`/api/v1/locations/${locationId}/business-hours`)
      .set('authorization', bearer(owner.accessToken))
      .send({ hours: [{ dayOfWeek: 1, opensAt: '09:00', closesAt: '18:00', isClosed: false }] });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for another tenant’s location', async () => {
    const owner = await registerOrganization();
    const rival = await registerOrganization({
      email: 'owner@rival.test',
      organizationName: 'Rival Salon',
      locationName: 'Orchard',
    });
    const rivalLocationId = await firstLocationId(rival.organizationId);

    const patched = await request(app)
      .patch(`/api/v1/locations/${rivalLocationId}`)
      .set('authorization', bearer(owner.accessToken))
      .send({ city: 'Hijacked' });

    expect(patched.status).toBe(404);
    expect(patched.body.error.code).toBe('NOT_FOUND');

    const hours = await request(app)
      .get(`/api/v1/locations/${rivalLocationId}/business-hours`)
      .set('authorization', bearer(owner.accessToken));

    expect(hours.status).toBe(404);

    const rivalLocation = await prisma.location.findUniqueOrThrow({
      where: { id: rivalLocationId },
      select: { city: true },
    });
    expect(rivalLocation.city).toBeNull();
  });
});

describe('members', () => {
  it('requires authentication and members.manage', async () => {
    const anonymous = await request(app).get('/api/v1/members');
    expect(anonymous.status).toBe(401);

    const owner = await registerOrganization();
    const receptionist = await seedMember(
      owner.organizationId,
      'frontdesk@eurosense.test',
      'RECEPTIONIST',
    );

    const denied = await request(app)
      .get('/api/v1/members')
      .set('authorization', bearer(receptionist.accessToken));

    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('PERMISSION_DENIED');
  });

  it('lists members with the signed-in member flagged', async () => {
    const owner = await registerOrganization();
    await seedMember(owner.organizationId, 'staff@eurosense.test', 'STAFF');

    const response = await request(app)
      .get('/api/v1/members')
      .set('authorization', bearer(owner.accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data.members).toHaveLength(2);

    const self = response.body.data.members.find((member: { isSelf: boolean }) => member.isSelf);
    expect(self).toMatchObject({
      role: 'ORG_OWNER',
      status: 'ACTIVE',
      user: { email: 'owner@eurosense.test' },
    });
  });

  it('changes a member role and writes an audit entry', async () => {
    const owner = await registerOrganization();
    const staff = await seedMember(owner.organizationId, 'staff@eurosense.test', 'STAFF');

    const response = await request(app)
      .patch(`/api/v1/members/${staff.membershipId}`)
      .set('authorization', bearer(owner.accessToken))
      .send({ role: 'MANAGER' });

    expect(response.status).toBe(200);
    expect(response.body.data.member).toMatchObject({ role: 'MANAGER', isSelf: false });

    const auditEntry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'members.role_changed', organizationId: owner.organizationId },
    });
    expect(auditEntry.entityId).toBe(staff.membershipId);
  });

  it('refuses to change your own membership', async () => {
    const owner = await registerOrganization();

    const role = await request(app)
      .patch(`/api/v1/members/${owner.membershipId}`)
      .set('authorization', bearer(owner.accessToken))
      .send({ role: 'ORG_ADMIN' });

    expect(role.status).toBe(409);
    expect(role.body.error.code).toBe('CONFLICT');

    const status = await request(app)
      .patch(`/api/v1/members/${owner.membershipId}/status`)
      .set('authorization', bearer(owner.accessToken))
      .send({ status: 'SUSPENDED' });

    expect(status.status).toBe(409);
    expect(status.body.error.code).toBe('CONFLICT');
  });

  it('protects the last active owner', async () => {
    const owner = await registerOrganization();
    const admin = await seedMember(owner.organizationId, 'admin@eurosense.test', 'ORG_ADMIN');

    const demote = await request(app)
      .patch(`/api/v1/members/${owner.membershipId}`)
      .set('authorization', bearer(admin.accessToken))
      .send({ role: 'ORG_ADMIN' });

    expect(demote.status).toBe(409);
    expect(demote.body.error.message).toContain('owner');

    const suspend = await request(app)
      .patch(`/api/v1/members/${owner.membershipId}/status`)
      .set('authorization', bearer(admin.accessToken))
      .send({ status: 'SUSPENDED' });

    expect(suspend.status).toBe(409);
    expect(suspend.body.error.message).toContain('owner');
  });

  it('suspends a member, blocks their tenant access, and reactivates them', async () => {
    const owner = await registerOrganization();
    const staff = await seedMember(owner.organizationId, 'staff@eurosense.test', 'STAFF');

    const suspended = await request(app)
      .patch(`/api/v1/members/${staff.membershipId}/status`)
      .set('authorization', bearer(owner.accessToken))
      .send({ status: 'SUSPENDED' });

    expect(suspended.status).toBe(200);
    expect(suspended.body.data.member.status).toBe('SUSPENDED');

    const blocked = await request(app)
      .get('/api/v1/members')
      .set('authorization', bearer(staff.accessToken));

    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('TENANT_REQUIRED');

    const reactivated = await request(app)
      .patch(`/api/v1/members/${staff.membershipId}/status`)
      .set('authorization', bearer(owner.accessToken))
      .send({ status: 'ACTIVE' });

    expect(reactivated.status).toBe(200);
    expect(reactivated.body.data.member.status).toBe('ACTIVE');

    const removed = await request(app)
      .patch(`/api/v1/members/${staff.membershipId}/status`)
      .set('authorization', bearer(owner.accessToken))
      .send({ status: 'REMOVED' });

    expect(removed.status).toBe(200);
    expect(removed.body.data.member.status).toBe('REMOVED');

    for (const action of ['members.suspended', 'members.reactivated', 'members.removed']) {
      const auditEntry = await prisma.auditLog.findFirst({
        where: { action, organizationId: owner.organizationId },
      });
      expect(auditEntry, `expected an audit entry for ${action}`).not.toBeNull();
    }
  });

  it('returns 404 for another tenant’s member', async () => {
    const owner = await registerOrganization();
    const rival = await registerOrganization({
      email: 'owner@rival.test',
      organizationName: 'Rival Salon',
      locationName: 'Orchard',
    });
    const rivalMember = await seedMember(rival.organizationId, 'rival-staff@rival.test', 'STAFF');

    const response = await request(app)
      .patch(`/api/v1/members/${rivalMember.membershipId}`)
      .set('authorization', bearer(owner.accessToken))
      .send({ role: 'MANAGER' });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});

describe('invitations', () => {
  it('requires authentication to accept and members.manage to invite', async () => {
    const anonymousList = await request(app).get('/api/v1/invitations');
    expect(anonymousList.status).toBe(401);

    const anonymousAccept = await request(app)
      .post('/api/v1/invitations/accept')
      .send({ token: 'anything' });
    expect(anonymousAccept.status).toBe(401);

    const owner = await registerOrganization();
    const manager = await seedMember(owner.organizationId, 'manager@eurosense.test', 'MANAGER');

    const denied = await request(app)
      .post('/api/v1/invitations')
      .set('authorization', bearer(manager.accessToken))
      .send({ email: 'invitee@eurosense.test', role: 'STAFF' });

    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('PERMISSION_DENIED');
  });

  it('creates an invitation and refuses duplicates and existing members', async () => {
    const owner = await registerOrganization();

    const created = await request(app)
      .post('/api/v1/invitations')
      .set('authorization', bearer(owner.accessToken))
      .send({ email: 'ivy@eurosense.test', role: 'ORG_ADMIN' });

    expect(created.status).toBe(201);
    expect(created.body.data.invitation).toMatchObject({
      email: 'ivy@eurosense.test',
      role: 'ORG_ADMIN',
      status: 'PENDING',
      invitedBy: { firstName: 'Kai' },
    });

    const invitationId = created.body.data.invitation.id as string;
    const row = await prisma.organizationInvitation.findUniqueOrThrow({
      where: { id: invitationId },
      select: { organizationId: true, tokenHash: true, expiresAt: true },
    });
    expect(row.organizationId).toBe(owner.organizationId);
    expect(row.tokenHash).toHaveLength(64);
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const duplicate = await request(app)
      .post('/api/v1/invitations')
      .set('authorization', bearer(owner.accessToken))
      .send({ email: 'ivy@eurosense.test', role: 'STAFF' });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('CONFLICT');

    const existing = await request(app)
      .post('/api/v1/invitations')
      .set('authorization', bearer(owner.accessToken))
      .send({ email: 'owner@eurosense.test', role: 'STAFF' });

    expect(existing.status).toBe(409);
    expect(existing.body.error.message).toContain('already a member');

    const auditEntry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'members.invited', organizationId: owner.organizationId },
    });
    expect(auditEntry.entityId).toBe(invitationId);
  });

  it('accepts an invitation end to end and grants the invited permissions', async () => {
    const owner = await registerOrganization();
    const invitee = await seedUserWithPassword('ivy@eurosense.test', 'SecurePassword123');

    const created = await request(app)
      .post('/api/v1/invitations')
      .set('authorization', bearer(owner.accessToken))
      .send({ email: 'ivy@eurosense.test', role: 'ORG_ADMIN' });

    expect(created.status).toBe(201);

    const invitationId = created.body.data.invitation.id as string;
    await withKnownInvitationToken(invitationId, 'known-invitation-token');

    const inviteeToken = await loginAs('ivy@eurosense.test', 'SecurePassword123');

    const accepted = await request(app)
      .post('/api/v1/invitations/accept')
      .set('authorization', bearer(inviteeToken))
      .send({ token: 'known-invitation-token' });

    expect(accepted.status).toBe(200);
    expect(accepted.body.data.membership).toMatchObject({
      role: 'ORG_ADMIN',
      status: 'ACTIVE',
      organizationId: owner.organizationId,
      organization: { name: 'Eurosense Hair Studio' },
    });

    const invitation = await prisma.organizationInvitation.findUniqueOrThrow({
      where: { id: invitationId },
      select: { status: true, acceptedById: true, acceptedAt: true },
    });
    expect(invitation).toMatchObject({ status: 'ACCEPTED', acceptedById: invitee.id });
    expect(invitation.acceptedAt).not.toBeNull();

    const membership = await prisma.organizationMembership.findUniqueOrThrow({
      where: {
        organizationId_userId: { organizationId: owner.organizationId, userId: invitee.id },
      },
      select: { role: true, status: true },
    });
    expect(membership).toEqual({ role: 'ORG_ADMIN', status: 'ACTIVE' });

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', bearer(inviteeToken))
      .set('x-organization-id', owner.organizationId);

    expect(me.status).toBe(200);
    expect(me.body.data.permissions).toContain('members.manage');

    const replayed = await request(app)
      .post('/api/v1/invitations/accept')
      .set('authorization', bearer(inviteeToken))
      .send({ token: 'known-invitation-token' });

    expect(replayed.status).toBe(400);
    expect(replayed.body.error.code).toBe('INVALID_TOKEN');

    const auditEntry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'members.invitation_accepted', organizationId: owner.organizationId },
    });
    expect(auditEntry.actorUserId).toBe(invitee.id);
  });

  it('refuses acceptance by a different account', async () => {
    const owner = await registerOrganization();
    await seedUserWithPassword('ivy@eurosense.test', 'SecurePassword123');
    await seedUserWithPassword('impostor@eurosense.test', 'SecurePassword123');

    const created = await request(app)
      .post('/api/v1/invitations')
      .set('authorization', bearer(owner.accessToken))
      .send({ email: 'ivy@eurosense.test', role: 'ORG_ADMIN' });

    const invitationId = created.body.data.invitation.id as string;
    await withKnownInvitationToken(invitationId, 'known-invitation-token');

    const impostorToken = await loginAs('impostor@eurosense.test', 'SecurePassword123');

    const response = await request(app)
      .post('/api/v1/invitations/accept')
      .set('authorization', bearer(impostorToken))
      .send({ token: 'known-invitation-token' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('PERMISSION_DENIED');

    const invitation = await prisma.organizationInvitation.findUniqueOrThrow({
      where: { id: invitationId },
      select: { status: true },
    });
    expect(invitation.status).toBe('PENDING');
  });

  it('rejects unknown tokens and revoked invitations', async () => {
    const owner = await registerOrganization();
    await seedUserWithPassword('ivy@eurosense.test', 'SecurePassword123');
    const ivyToken = await loginAs('ivy@eurosense.test', 'SecurePassword123');

    const unknown = await request(app)
      .post('/api/v1/invitations/accept')
      .set('authorization', bearer(ivyToken))
      .send({ token: 'not-a-real-token' });

    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('INVALID_TOKEN');

    const created = await request(app)
      .post('/api/v1/invitations')
      .set('authorization', bearer(owner.accessToken))
      .send({ email: 'ivy@eurosense.test', role: 'STAFF' });

    const invitationId = created.body.data.invitation.id as string;
    await withKnownInvitationToken(invitationId, 'revoked-token');

    const revoked = await request(app)
      .delete(`/api/v1/invitations/${invitationId}`)
      .set('authorization', bearer(owner.accessToken));

    expect(revoked.status).toBe(200);
    expect(revoked.body.data.invitation.status).toBe('REVOKED');

    const acceptAfterRevoke = await request(app)
      .post('/api/v1/invitations/accept')
      .set('authorization', bearer(ivyToken))
      .send({ token: 'revoked-token' });

    expect(acceptAfterRevoke.status).toBe(400);
    expect(acceptAfterRevoke.body.error.code).toBe('INVALID_TOKEN');

    const revokeAgain = await request(app)
      .delete(`/api/v1/invitations/${invitationId}`)
      .set('authorization', bearer(owner.accessToken));

    expect(revokeAgain.status).toBe(409);
    expect(revokeAgain.body.error.code).toBe('CONFLICT');

    const auditEntry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'members.invitation_revoked', organizationId: owner.organizationId },
    });
    expect(auditEntry.entityId).toBe(invitationId);
  });

  it('returns 404 for another tenant’s invitation', async () => {
    const owner = await registerOrganization();
    const rival = await registerOrganization({
      email: 'owner@rival.test',
      organizationName: 'Rival Salon',
      locationName: 'Orchard',
    });

    const created = await request(app)
      .post('/api/v1/invitations')
      .set('authorization', bearer(rival.accessToken))
      .send({ email: 'someone@rival.test', role: 'STAFF' });

    const rivalInvitationId = created.body.data.invitation.id as string;

    const response = await request(app)
      .delete(`/api/v1/invitations/${rivalInvitationId}`)
      .set('authorization', bearer(owner.accessToken));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');

    const stillPending = await prisma.organizationInvitation.findUniqueOrThrow({
      where: { id: rivalInvitationId },
      select: { status: true },
    });
    expect(stillPending.status).toBe('PENDING');
  });
});

describe('audit log', () => {
  it('requires authentication and audit.read', async () => {
    const anonymous = await request(app).get('/api/v1/audit');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('AUTHENTICATION_REQUIRED');

    const owner = await registerOrganization();
    const manager = await seedMember(owner.organizationId, 'manager@eurosense.test', 'MANAGER');

    const denied = await request(app)
      .get('/api/v1/audit')
      .set('authorization', bearer(manager.accessToken));

    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('PERMISSION_DENIED');
  });

  it('lists only its own organization’s entries, newest first', async () => {
    const owner = await registerOrganization();
    const rival = await registerOrganization({
      email: 'owner@rival.test',
      organizationName: 'Rival Salon',
      locationName: 'Orchard',
    });

    // Registration writes its own audit entry; this test seeds an exact trail.
    await prisma.auditLog.deleteMany({ where: { organizationId: owner.organizationId } });

    const base = Date.now();
    await prisma.auditLog.createMany({
      data: [
        {
          organizationId: owner.organizationId,
          actorUserId: owner.userId,
          actorType: 'USER',
          action: 'older.entry',
          createdAt: new Date(base - 1000),
        },
        {
          organizationId: owner.organizationId,
          actorUserId: owner.userId,
          actorType: 'USER',
          action: 'newer.entry',
          createdAt: new Date(base),
        },
        {
          organizationId: rival.organizationId,
          actorUserId: rival.userId,
          actorType: 'USER',
          action: 'rival.entry',
          createdAt: new Date(base),
        },
      ],
    });

    const response = await request(app)
      .get('/api/v1/audit')
      .set('authorization', bearer(owner.accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(2);

    const actions = response.body.data.items.map((entry: { action: string }) => entry.action);
    expect(actions).toEqual(['newer.entry', 'older.entry']);
    expect(response.body.data.items[0].actor).toMatchObject({
      firstName: 'Kai',
      email: 'owner@eurosense.test',
    });
  });

  it('paginates and validates the query', async () => {
    const owner = await registerOrganization();

    // Registration writes its own audit entry; this test seeds an exact trail.
    await prisma.auditLog.deleteMany({ where: { organizationId: owner.organizationId } });

    const base = Date.now();

    await prisma.auditLog.createMany({
      data: [1, 2, 3].map((index) => ({
        organizationId: owner.organizationId,
        actorType: 'USER',
        action: `entry.${index}`,
        createdAt: new Date(base + index),
      })),
    });

    const firstPage = await request(app)
      .get('/api/v1/audit?page=1&pageSize=2')
      .set('authorization', bearer(owner.accessToken));

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data).toMatchObject({ page: 1, pageSize: 2, total: 3 });
    expect(firstPage.body.data.items).toHaveLength(2);

    const secondPage = await request(app)
      .get('/api/v1/audit?page=2&pageSize=2')
      .set('authorization', bearer(owner.accessToken));

    expect(secondPage.body.data.items).toHaveLength(1);
    expect(secondPage.body.data.items[0].action).toBe('entry.1');

    const invalid = await request(app)
      .get('/api/v1/audit?page=0')
      .set('authorization', bearer(owner.accessToken));

    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });
});
