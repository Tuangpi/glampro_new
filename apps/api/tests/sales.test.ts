import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/database/prisma.js';
import type { MembershipRole } from '../src/generated/prisma/client.js';
import { hashRefreshToken, issueAccessToken } from '../src/modules/auth/tokens.js';
import { truncateAllTables } from './helpers/test-db.js';

const app = createApp();

type Salon = {
  accessToken: string;
  userId: string;
  organizationId: string;
  membershipId: string;
  locationId: string;
  serviceId: string;
  productId: string;
  staffProfileId: string;
  customerId: string;
};

let salonCount = 0;

const registerSalon = async (): Promise<Salon> => {
  salonCount += 1;
  const response = await request(app)
    .post('/api/v1/auth/register')
    .send({
      firstName: 'Kai',
      lastName: 'Tan',
      email: `sales-owner-${salonCount}@example.test`,
      password: 'SecurePassword123',
      organizationName: `Sales Salon ${salonCount}`,
      locationName: `Sales Branch ${salonCount}`,
    });
  expect(response.status).toBe(201);

  const membership = response.body.data.organizations[0];
  const organizationId = membership.organizationId as string;
  const location = await prisma.location.findFirstOrThrow({
    where: { organizationId },
    select: { id: true },
  });
  const serviceCategory = await prisma.serviceCategory.create({
    data: { organizationId, name: 'Sales services' },
    select: { id: true },
  });
  const service = await prisma.service.create({
    data: {
      organizationId,
      serviceCategoryId: serviceCategory.id,
      name: 'Signature cut',
      durationMinutes: 45,
      priceInCents: 4500,
    },
    select: { id: true },
  });
  const productCategory = await prisma.productCategory.create({
    data: { organizationId, name: 'Retail' },
    select: { id: true },
  });
  const product = await prisma.product.create({
    data: {
      organizationId,
      productCategoryId: productCategory.id,
      name: 'Shampoo',
      priceInCents: 1800,
      trackInventory: true,
    },
    select: { id: true },
  });
  await prisma.inventoryLevel.create({
    data: { organizationId, productId: product.id, locationId: location.id, quantityOnHand: 5 },
  });
  const customer = await prisma.customer.create({
    data: { organizationId, firstName: 'Walk', lastName: 'In' },
    select: { id: true },
  });
  const staffProfile = await prisma.staffProfile.create({
    data: { organizationId, membershipId: membership.id, displayName: 'Kai' },
    select: { id: true },
  });

  return {
    accessToken: response.body.data.accessToken as string,
    userId: response.body.data.user.id as string,
    organizationId,
    membershipId: membership.id as string,
    locationId: location.id,
    serviceId: service.id,
    productId: product.id,
    staffProfileId: staffProfile.id,
    customerId: customer.id,
  };
};

const tokenFor = async (userId: string, organizationId: string, membershipId: string) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { platformRole: true },
  });
  const session = await prisma.authSession.create({
    data: {
      userId,
      tokenFamilyId: `sales-family-${userId}`,
      refreshTokenHash: hashRefreshToken(`sales-refresh-${userId}-${Math.random()}`),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
    select: { id: true },
  });
  const { token } = await issueAccessToken({
    userId,
    sessionId: session.id,
    platformRole: user.platformRole,
  });
  return { token, organizationId, membershipId };
};

const seedLimitedMember = async (salon: Salon, email: string, role: MembershipRole) => {
  const user = await prisma.user.create({
    data: {
      email,
      firstName: 'Team',
      lastName: 'Member',
      credential: { create: { passwordHash: 'unused' } },
    },
    select: { id: true },
  });
  const membership = await prisma.organizationMembership.create({
    data: { organizationId: salon.organizationId, userId: user.id, role, status: 'ACTIVE' },
    select: { id: true },
  });
  return tokenFor(user.id, salon.organizationId, membership.id);
};

const bearer = (token: string) => `Bearer ${token}`;

const saleBody = (salon: Salon, overrides: Record<string, unknown> = {}) => ({
  locationId: salon.locationId,
  customerId: salon.customerId,
  lines: [
    {
      type: 'SERVICE',
      serviceId: salon.serviceId,
      quantity: 1,
      staffProfileId: salon.staffProfileId,
    },
    { type: 'PRODUCT', productId: salon.productId, quantity: 2 },
  ],
  payments: [
    { method: 'CASH', amountInCents: 1000 },
    { method: 'CARD', amountInCents: 7100 },
  ],
  ...overrides,
});

const createSale = (salon: Salon, overrides: Record<string, unknown> = {}) =>
  request(app)
    .post('/api/v1/sales')
    .set('authorization', bearer(salon.accessToken))
    .send(saleBody(salon, overrides));

beforeEach(async () => {
  await truncateAllTables();
});

describe('sales access', () => {
  it('rejects unauthenticated reads and writes', async () => {
    const read = await request(app).get('/api/v1/sales');
    const write = await request(app).post('/api/v1/sales').send({});

    expect(read.status).toBe(401);
    expect(read.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    expect(write.status).toBe(401);
  });

  it('allows a receptionist to create and read sales but not void or refund them', async () => {
    const salon = await registerSalon();
    const receptionist = await seedLimitedMember(salon, 'reception@example.test', 'RECEPTIONIST');
    const headers = {
      authorization: bearer(receptionist.token),
      'x-organization-id': receptionist.organizationId,
    };
    const created = await request(app).post('/api/v1/sales').set(headers).send(saleBody(salon));

    expect(created.status).toBe(201);
    expect((await request(app).get('/api/v1/sales').set(headers)).status).toBe(200);

    const voided = await request(app)
      .post(`/api/v1/sales/${created.body.data.sale.id}/void`)
      .set(headers)
      .send({ reason: 'Not allowed' });
    expect(voided.status).toBe(403);
    expect(voided.body.error.code).toBe('PERMISSION_DENIED');

    const refunded = await request(app)
      .post(`/api/v1/sales/${created.body.data.sale.id}/refunds`)
      .set(headers)
      .send({ amountInCents: 100, method: 'CASH', reason: 'Not allowed' });
    expect(refunded.status).toBe(403);
  });

  it('returns a cross-tenant sale as not found', async () => {
    const first = await registerSalon();
    const second = await registerSalon();
    const created = await createSale(first);
    expect(created.status).toBe(201);

    const response = await request(app)
      .get(`/api/v1/sales/${created.body.data.sale.id}`)
      .set('authorization', bearer(second.accessToken));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});

describe('sales checkout', () => {
  it('creates a mixed sale, splits payment, numbers receipts, and writes SALE inventory', async () => {
    const salon = await registerSalon();
    const response = await createSale(salon);

    expect(response.status).toBe(201);
    expect(response.body.data.sale).toMatchObject({
      receiptCode: 'SALE-000001',
      status: 'COMPLETED',
      subtotalInCents: 8100,
      totalInCents: 8100,
      paidInCents: 8100,
    });
    expect(response.body.data.sale.lines).toHaveLength(2);
    expect(response.body.data.sale.payments).toHaveLength(2);

    const stock = await prisma.inventoryLevel.findFirstOrThrow({
      where: { organizationId: salon.organizationId, productId: salon.productId },
    });
    expect(stock.quantityOnHand).toBe(3);
    const movement = await prisma.inventoryMovement.findFirstOrThrow({
      where: { organizationId: salon.organizationId, movementType: 'SALE' },
    });
    expect(movement.quantity).toBe(2);
    expect(movement.saleId).toBe(response.body.data.sale.id);
  });

  it('rejects an unbalanced payment total without consuming stock', async () => {
    const salon = await registerSalon();
    const response = await createSale(salon, {
      payments: [{ method: 'CASH', amountInCents: 100 }],
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.sale.count({ where: { organizationId: salon.organizationId } })).toBe(0);
    const stock = await prisma.inventoryLevel.findFirstOrThrow({
      where: { organizationId: salon.organizationId, productId: salon.productId },
    });
    expect(stock.quantityOnHand).toBe(5);
  });

  it('rolls back a sale when tracked stock is insufficient', async () => {
    const salon = await registerSalon();
    const response = await createSale(salon, {
      lines: [{ type: 'PRODUCT', productId: salon.productId, quantity: 6 }],
      payments: [{ method: 'CASH', amountInCents: 10800 }],
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
    expect(await prisma.sale.count({ where: { organizationId: salon.organizationId } })).toBe(0);
    const stock = await prisma.inventoryLevel.findFirstOrThrow({
      where: { organizationId: salon.organizationId, productId: salon.productId },
    });
    expect(stock.quantityOnHand).toBe(5);
  });
});

describe('sale reversals', () => {
  it('voids a completed sale and returns tracked products to stock', async () => {
    const salon = await registerSalon();
    const created = await createSale(salon);
    const saleId = created.body.data.sale.id as string;

    const voided = await request(app)
      .post(`/api/v1/sales/${saleId}/void`)
      .set('authorization', bearer(salon.accessToken))
      .send({ reason: 'Duplicate transaction' });

    expect(voided.status).toBe(200);
    expect(voided.body.data.sale.status).toBe('VOIDED');
    expect(voided.body.data.sale.voidReason).toBe('Duplicate transaction');
    const stock = await prisma.inventoryLevel.findFirstOrThrow({
      where: { organizationId: salon.organizationId, productId: salon.productId },
    });
    expect(stock.quantityOnHand).toBe(5);
    expect(
      await prisma.inventoryMovement.count({
        where: { organizationId: salon.organizationId, saleId, movementType: 'RETURN' },
      }),
    ).toBe(1);
  });

  it('supports partial and full refunds while recording returned quantities', async () => {
    const salon = await registerSalon();
    const created = await createSale(salon);
    const saleId = created.body.data.sale.id as string;

    const partial = await request(app)
      .post(`/api/v1/sales/${saleId}/refunds`)
      .set('authorization', bearer(salon.accessToken))
      .send({ amountInCents: 1000, method: 'CASH', reason: 'Goodwill adjustment' });

    expect(partial.status).toBe(200);
    expect(partial.body.data.sale.status).toBe('PARTIALLY_REFUNDED');
    expect(partial.body.data.sale.refundedInCents).toBe(1000);

    const full = await request(app)
      .post(`/api/v1/sales/${saleId}/refunds`)
      .set('authorization', bearer(salon.accessToken))
      .send({ amountInCents: 7100, method: 'CARD', reason: 'Full return' });

    expect(full.status).toBe(200);
    expect(full.body.data.sale.status).toBe('REFUNDED');
    expect(full.body.data.sale.refunds[1].lines).toHaveLength(1);
    const stock = await prisma.inventoryLevel.findFirstOrThrow({
      where: { organizationId: salon.organizationId, productId: salon.productId },
    });
    expect(stock.quantityOnHand).toBe(5);
  });

  it('increments the per-location receipt counter for the next sale', async () => {
    const salon = await registerSalon();
    expect((await createSale(salon)).body.data.sale.receiptCode).toBe('SALE-000001');
    expect((await createSale(salon)).body.data.sale.receiptCode).toBe('SALE-000002');
  });
});
