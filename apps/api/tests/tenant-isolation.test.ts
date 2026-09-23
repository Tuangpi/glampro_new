import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/database/prisma.js';
import type {
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
} from '../src/generated/prisma/client.js';
import { authenticate } from '../src/middleware/authenticate.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { requestContext } from '../src/middleware/request-context.js';
import { organizationHeader, withTenant } from '../src/middleware/tenant.js';
import { requirePermission } from '../src/modules/auth/authorization.js';
import { hashRefreshToken, issueAccessToken } from '../src/modules/auth/tokens.js';
import { respondSuccess } from '../src/shared/http/response.js';
import { truncateAllTables } from './helpers/test-db.js';

/**
 * Exercises the tenant boundary with the real middleware chain. Feature modules
 * reuse this pattern: authenticate, withTenant, requirePermission, handler.
 */
const app = express();
app.disable('x-powered-by');
app.use(requestContext);
app.use(express.json());
app.use(cookieParser());
app.get('/api/v1/context', authenticate, withTenant, (req, res) =>
  respondSuccess(req, res, req.tenant ?? null),
);
app.get(
  '/api/v1/refunds',
  authenticate,
  withTenant,
  requirePermission('sales.refund'),
  (req, res) => respondSuccess(req, res, { allowed: true }),
);
app.use(errorHandler);

const slugify = (value: string) => value.toLowerCase().replace(/\s+/g, '-');

const seedOrganization = (
  name: string,
  organizationStatus: OrganizationStatus = 'ACTIVE',
  withLocation = true,
) =>
  prisma.organization.create({
    data: {
      name,
      slug: slugify(name),
      status: organizationStatus,
      ...(withLocation ? { locations: { create: { name: `${name} Branch`, code: 'MAIN' } } } : {}),
    },
    select: { id: true, locations: { select: { id: true, code: true } } },
  });

const seedMember = async (
  organizationId: string,
  email: string,
  role: MembershipRole,
  membershipStatus: MembershipStatus = 'ACTIVE',
) => {
  const user = await prisma.user.create({
    data: {
      email,
      firstName: 'Test',
      lastName: 'Member',
      credential: { create: { passwordHash: 'not-used-by-the-tenant-tests' } },
    },
    select: { id: true },
  });

  const membership = await prisma.organizationMembership.create({
    data: { organizationId, userId: user.id, role, status: membershipStatus },
    select: { id: true },
  });

  const session = await prisma.authSession.create({
    data: {
      userId: user.id,
      tokenFamilyId: `family-${email}`,
      refreshTokenHash: hashRefreshToken(`${email}-refresh-token`),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
    select: { id: true },
  });

  const { token } = await issueAccessToken({
    userId: user.id,
    sessionId: session.id,
    platformRole: 'USER',
  });

  return { userId: user.id, membershipId: membership.id, accessToken: token };
};

const bearer = (accessToken: string) => `Bearer ${accessToken}`;

beforeEach(async () => {
  await truncateAllTables();
});

describe('tenant isolation', () => {
  it('rejects a request without an access token', async () => {
    const response = await request(app).get('/api/v1/context');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('resolves the organization scope for an active membership', async () => {
    const organization = await seedOrganization('Eurosense Hair Studio');
    const member = await seedMember(organization.id, 'manager@eurosense.test', 'MANAGER');

    const response = await request(app)
      .get('/api/v1/context')
      .set('authorization', bearer(member.accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      organizationId: organization.id,
      membershipId: member.membershipId,
      role: 'MANAGER',
      locationIds: [organization.locations[0]?.id],
    });
  });

  it('rejects a user without an active membership', async () => {
    const organization = await seedOrganization('Eurosense Hair Studio');
    const member = await seedMember(
      organization.id,
      'suspended@eurosense.test',
      'STAFF',
      'SUSPENDED',
    );

    const response = await request(app)
      .get('/api/v1/context')
      .set('authorization', bearer(member.accessToken));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('TENANT_REQUIRED');
  });
});

describe('cross-tenant access', () => {
  it('returns 404, not 403, when the requested organization is not the member of the user', async () => {
    const ownOrganization = await seedOrganization('Eurosense Hair Studio');
    const otherOrganization = await seedOrganization('Rival Salon');
    const member = await seedMember(ownOrganization.id, 'owner@eurosense.test', 'ORG_OWNER');

    const response = await request(app)
      .get('/api/v1/context')
      .set('authorization', bearer(member.accessToken))
      .set(organizationHeader, otherOrganization.id);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.message).not.toContain('Rival Salon');
  });

  it('requires an organization header when the user belongs to several', async () => {
    const first = await seedOrganization('Eurosense Hair Studio');
    const second = await seedOrganization('Eurosense Orchard');
    const member = await seedMember(first.id, 'multi@eurosense.test', 'ORG_OWNER');
    await prisma.organizationMembership.create({
      data: { organizationId: second.id, userId: member.userId, role: 'MANAGER', status: 'ACTIVE' },
    });

    const ambiguous = await request(app)
      .get('/api/v1/context')
      .set('authorization', bearer(member.accessToken));

    expect(ambiguous.status).toBe(400);
    expect(ambiguous.body.error.code).toBe('TENANT_REQUIRED');
    expect(ambiguous.body.error.message).toContain(organizationHeader);

    const selected = await request(app)
      .get('/api/v1/context')
      .set('authorization', bearer(member.accessToken))
      .set(organizationHeader, second.id);

    expect(selected.status).toBe(200);
    expect(selected.body.data.organizationId).toBe(second.id);
    expect(selected.body.data.role).toBe('MANAGER');
  });

  it('enforces permissions from the membership role', async () => {
    const organization = await seedOrganization('Eurosense Hair Studio');
    const staff = await seedMember(organization.id, 'staff@eurosense.test', 'STAFF');
    const manager = await seedMember(organization.id, 'manager@eurosense.test', 'MANAGER');

    const denied = await request(app)
      .get('/api/v1/refunds')
      .set('authorization', bearer(staff.accessToken));

    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('PERMISSION_DENIED');

    const allowed = await request(app)
      .get('/api/v1/refunds')
      .set('authorization', bearer(manager.accessToken));

    expect(allowed.status).toBe(200);
    expect(allowed.body.data).toEqual({ allowed: true });
  });

  it('refuses memberships in a suspended organization', async () => {
    const organization = await seedOrganization('Eurosense Hair Studio', 'SUSPENDED');
    const member = await seedMember(organization.id, 'owner@eurosense.test', 'ORG_OWNER');

    const response = await request(app)
      .get('/api/v1/context')
      .set('authorization', bearer(member.accessToken));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ORGANIZATION_INACTIVE');
  });
});
