import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { processStripeEvent } from '../src/modules/billing/billing.service.js';
import { prisma } from '../src/database/prisma.js';
import { hashRefreshToken, issueAccessToken } from '../src/modules/auth/tokens.js';
import { truncateAllTables } from './helpers/test-db.js';

const app = createApp();

const registrationInput = {
  firstName: 'Kai',
  lastName: 'Tan',
  email: 'billing-owner@example.test',
  password: 'SecurePassword123',
  organizationName: 'Billing Test Salon',
  locationName: 'Tanjong Pagar',
};

type RegisteredSalon = {
  accessToken: string;
  userId: string;
  organizationId: string;
};

const registerSalon = async (): Promise<RegisteredSalon> => {
  const response = await request(app).post('/api/v1/auth/register').send(registrationInput);
  expect(response.status).toBe(201);
  const membership = response.body.data.organizations[0];
  return {
    accessToken: response.body.data.accessToken as string,
    userId: response.body.data.user.id as string,
    organizationId: membership.organizationId as string,
  };
};

const accessTokenFor = async (userId: string, platformRole: 'USER' | 'PLATFORM_ADMIN') => {
  const session = await prisma.authSession.create({
    data: {
      userId,
      tokenFamilyId: `billing-family-${userId}`,
      refreshTokenHash: hashRefreshToken(`billing-refresh-${userId}-${Date.now()}`),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
    select: { id: true },
  });
  const { token } = await issueAccessToken({ userId, sessionId: session.id, platformRole });
  return token;
};

const seedPlatformAdmin = async () => {
  const user = await prisma.user.create({
    data: {
      email: 'platform-admin@example.test',
      firstName: 'Platform',
      lastName: 'Admin',
      platformRole: 'PLATFORM_ADMIN',
      credential: { create: { passwordHash: 'not-used-by-this-test' } },
    },
    select: { id: true },
  });
  return { userId: user.id, accessToken: await accessTokenFor(user.id, 'PLATFORM_ADMIN') };
};

beforeEach(async () => {
  await truncateAllTables();
});

describe('Stripe webhook idempotency', () => {
  it('claims an event only once when Stripe retries it', async () => {
    const event = {
      id: 'evt_billing_duplicate_test',
      type: 'customer.created',
      data: { object: { id: 'cus_test' } },
    } as unknown as Parameters<typeof processStripeEvent>[0];
    const context = { requestId: null, ipAddress: null, userAgent: null };

    await expect(processStripeEvent(event, context)).resolves.toEqual({ duplicate: false });
    await expect(processStripeEvent(event, context)).resolves.toEqual({ duplicate: true });
    await expect(prisma.stripeWebhookEvent.count({ where: { eventId: event.id } })).resolves.toBe(
      1,
    );
  });
});

describe('billing endpoints', () => {
  it('requires authentication and billing.manage', async () => {
    const anonymous = await request(app).get('/api/v1/billing');
    expect(anonymous.status).toBe(401);

    const salon = await registerSalon();
    const response = await request(app)
      .get('/api/v1/billing')
      .set('authorization', `Bearer ${salon.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      stripeConfigured: false,
      checkoutEnabled: false,
      organizationStatus: 'TRIAL',
      subscription: { status: 'TRIALING', planCode: 'starter' },
    });
    expect(response.body.data.subscription).not.toHaveProperty('providerCustomerId');
  });

  it('keeps billing available while blocking other tenant operations when paused', async () => {
    const salon = await registerSalon();
    await prisma.subscription.updateMany({
      where: { organizationId: salon.organizationId },
      data: { status: 'PAUSED' },
    });

    const billing = await request(app)
      .get('/api/v1/billing')
      .set('authorization', `Bearer ${salon.accessToken}`);
    expect(billing.status).toBe(200);
    expect(billing.body.data.subscription.status).toBe('PAUSED');

    const settings = await request(app)
      .get('/api/v1/settings/organization')
      .set('authorization', `Bearer ${salon.accessToken}`);
    expect(settings.status).toBe(403);
    expect(settings.body.error.code).toBe('ORGANIZATION_INACTIVE');
  });
});

describe('platform administration endpoints', () => {
  it('rejects ordinary users and allows platform admins across tenants', async () => {
    const salon = await registerSalon();
    const denied = await request(app)
      .get('/api/v1/platform/overview')
      .set('authorization', `Bearer ${salon.accessToken}`);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('PLATFORM_ADMIN_REQUIRED');

    const admin = await seedPlatformAdmin();
    const overview = await request(app)
      .get('/api/v1/platform/overview')
      .set('authorization', `Bearer ${admin.accessToken}`);
    expect(overview.status).toBe(200);
    expect(overview.body.data.organizations.total).toBe(1);

    const organizations = await request(app)
      .get('/api/v1/platform/organizations')
      .set('authorization', `Bearer ${admin.accessToken}`);
    expect(organizations.status).toBe(200);
    expect(organizations.body.data.organizations[0]).toMatchObject({
      id: salon.organizationId,
      status: 'TRIAL',
    });
  });

  it('applies and audits organization actions without tenant membership', async () => {
    const salon = await registerSalon();
    const admin = await seedPlatformAdmin();

    const response = await request(app)
      .patch(`/api/v1/platform/organizations/${salon.organizationId}/status`)
      .set('authorization', `Bearer ${admin.accessToken}`)
      .send({ action: 'SUSPEND', reason: 'Manual account review' });

    expect(response.status).toBe(200);
    expect(response.body.data.organization.status).toBe('SUSPENDED');
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'platform.organization_status_changed' },
    });
    expect(audit).toMatchObject({
      actorType: 'PLATFORM_ADMIN',
      actorUserId: admin.userId,
      organizationId: salon.organizationId,
    });
  });

  it('updates a local trial subscription when Stripe is not configured', async () => {
    const salon = await registerSalon();
    const admin = await seedPlatformAdmin();

    const response = await request(app)
      .patch(`/api/v1/platform/organizations/${salon.organizationId}/subscription`)
      .set('authorization', `Bearer ${admin.accessToken}`)
      .send({ action: 'PAUSE', reason: 'Payment review' });

    expect(response.status).toBe(200);
    expect(response.body.data.subscription.status).toBe('PAUSED');
    const subscription = await prisma.subscription.findFirstOrThrow({
      where: { organizationId: salon.organizationId },
    });
    expect(subscription.status).toBe('PAUSED');
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: salon.organizationId },
    });
    expect(organization.status).toBe('SUSPENDED');
  });
});
