import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/database/prisma.js';
import type { MembershipRole } from '../src/generated/prisma/client.js';
import { hashRefreshToken, issueAccessToken } from '../src/modules/auth/tokens.js';
import { truncateAllTables } from './helpers/test-db.js';

/**
 * Catalog and inventory end-to-end coverage against the real middleware chain:
 * `authenticate`, `withTenant`, `requirePermission`, validation, and the
 * contract shapes the web client parses.
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

  return {
    accessToken: response.body.data.accessToken as string,
    userId: response.body.data.user.id as string,
    organizationId: membership.organizationId as string,
    membershipId: membership.id as string,
    locationId: await firstLocationId(membership.organizationId as string),
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
      credential: { create: { passwordHash: 'not-used-by-the-catalog-tests' } },
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

const firstLocationId = async (organizationId: string) => {
  const location = await prisma.location.findFirstOrThrow({
    where: { organizationId },
    select: { id: true },
  });

  return location.id;
};

/** Seeds a category directly so service/product tests stay focused. */
const seedServiceCategory = (organizationId: string, name = 'Cuts') =>
  prisma.serviceCategory.create({
    data: { organizationId, name },
    select: { id: true },
  });

const seedProductCategory = (organizationId: string, name = 'Retail') =>
  prisma.productCategory.create({
    data: { organizationId, name },
    select: { id: true },
  });

const seedProduct = async (
  organizationId: string,
  productCategoryId: string,
  trackInventory = true,
) =>
  prisma.product.create({
    data: {
      organizationId,
      productCategoryId,
      name: 'Shampoo 1L',
      priceInCents: 1800,
      costInCents: 900,
      sku: 'SHMP-001',
      trackInventory,
    },
    select: { id: true },
  });

beforeEach(async () => {
  await truncateAllTables();
});

describe('service catalog', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await request(app).get('/api/v1/services');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('lets a staff member read but not manage services', async () => {
    const owner = await registerOrganization();
    const staff = await seedMember(owner.organizationId, 'staff@eurosense.test', 'STAFF');

    const readable = await request(app)
      .get('/api/v1/services')
      .set('authorization', bearer(staff.accessToken));

    expect(readable.status).toBe(200);
    expect(readable.body.data.services).toEqual([]);

    const denied = await request(app)
      .post('/api/v1/service-categories')
      .set('authorization', bearer(staff.accessToken))
      .send({ name: 'Cuts' });

    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('PERMISSION_DENIED');
  });

  it('creates a category and a service, then lists them back', async () => {
    const owner = await registerOrganization();

    const category = await request(app)
      .post('/api/v1/service-categories')
      .set('authorization', bearer(owner.accessToken))
      .send({ name: '  Cuts  ', sortOrder: 1 });

    expect(category.status).toBe(201);
    expect(category.body.data.serviceCategory).toMatchObject({
      name: 'Cuts',
      organizationId: owner.organizationId,
      description: null,
      sortOrder: 1,
    });

    const service = await request(app)
      .post('/api/v1/services')
      .set('authorization', bearer(owner.accessToken))
      .send({
        serviceCategoryId: category.body.data.serviceCategory.id,
        name: 'Women’s cut',
        durationMinutes: 45,
        priceInCents: 4500,
      });

    expect(service.status).toBe(201);
    expect(service.body.data.service).toMatchObject({
      name: 'Women’s cut',
      durationMinutes: 45,
      priceInCents: 4500,
      isAvailable: true,
      sortOrder: 0,
    });

    const listed = await request(app)
      .get('/api/v1/services')
      .set('authorization', bearer(owner.accessToken));

    expect(listed.status).toBe(200);
    expect(listed.body.data.services).toHaveLength(1);

    const filtered = await request(app)
      .get(`/api/v1/services?serviceCategoryId=${category.body.data.serviceCategory.id}`)
      .set('authorization', bearer(owner.accessToken));

    expect(filtered.body.data.services).toHaveLength(1);

    const otherCategory = await seedServiceCategory(owner.organizationId, 'Colour');
    const empty = await request(app)
      .get(`/api/v1/services?serviceCategoryId=${otherCategory.id}`)
      .set('authorization', bearer(owner.accessToken));

    expect(empty.body.data.services).toEqual([]);
  });

  it('rejects a service whose category belongs to another organization', async () => {
    const owner = await registerOrganization();
    const rival = await registerOrganization({
      email: 'owner@rival.test',
      organizationName: 'Rival Salon',
      locationName: 'Orchard',
    });

    const rivalCategory = await seedServiceCategory(rival.organizationId, 'Rival Cuts');

    const response = await request(app)
      .post('/api/v1/services')
      .set('authorization', bearer(owner.accessToken))
      .send({
        serviceCategoryId: rivalCategory.id,
        name: 'Borrowed cut',
        durationMinutes: 30,
        priceInCents: 3000,
      });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.message).not.toContain('Rival');
  });

  it('refuses a duplicate category name and an empty update', async () => {
    const owner = await registerOrganization();
    const category = await seedServiceCategory(owner.organizationId, 'Cuts');

    const duplicate = await request(app)
      .post('/api/v1/service-categories')
      .set('authorization', bearer(owner.accessToken))
      .send({ name: 'Cuts' });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('CONFLICT');

    const empty = await request(app)
      .patch(`/api/v1/service-categories/${category.id}`)
      .set('authorization', bearer(owner.accessToken))
      .send({});

    expect(empty.status).toBe(422);
    expect(empty.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('updates a service and writes an audit entry', async () => {
    const owner = await registerOrganization();
    const category = await seedServiceCategory(owner.organizationId);

    const created = await request(app)
      .post('/api/v1/services')
      .set('authorization', bearer(owner.accessToken))
      .send({
        serviceCategoryId: category.id,
        name: 'Women’s cut',
        durationMinutes: 45,
        priceInCents: 4500,
      });

    const serviceId = created.body.data.service.id as string;

    const updated = await request(app)
      .patch(`/api/v1/services/${serviceId}`)
      .set('authorization', bearer(owner.accessToken))
      .send({ priceInCents: 5200, isAvailable: false });

    expect(updated.status).toBe(200);
    expect(updated.body.data.service).toMatchObject({ priceInCents: 5200, isAvailable: false });

    const auditEntry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'catalog.service_updated', organizationId: owner.organizationId },
    });
    expect(auditEntry.entityId).toBe(serviceId);
  });

  it('returns 404 for another tenant’s service', async () => {
    const owner = await registerOrganization();
    const rival = await registerOrganization({
      email: 'owner@rival.test',
      organizationName: 'Rival Salon',
      locationName: 'Orchard',
    });

    const rivalCategory = await seedServiceCategory(rival.organizationId);
    const rivalService = await prisma.service.create({
      data: {
        organizationId: rival.organizationId,
        serviceCategoryId: rivalCategory.id,
        name: 'Rival cut',
        durationMinutes: 30,
        priceInCents: 3000,
      },
      select: { id: true },
    });

    const response = await request(app)
      .get(`/api/v1/services/${rivalService.id}`)
      .set('authorization', bearer(owner.accessToken));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});

describe('product catalog', () => {
  it('creates a product with a SKU and rejects a duplicate one', async () => {
    const owner = await registerOrganization();
    const category = await seedProductCategory(owner.organizationId, 'Retail');

    const created = await request(app)
      .post('/api/v1/products')
      .set('authorization', bearer(owner.accessToken))
      .send({
        productCategoryId: category.id,
        name: 'Shampoo 1L',
        priceInCents: 1800,
        costInCents: 900,
        sku: 'SHMP-001',
        trackInventory: true,
      });

    expect(created.status).toBe(201);
    expect(created.body.data.product).toMatchObject({
      name: 'Shampoo 1L',
      sku: 'SHMP-001',
      priceInCents: 1800,
      costInCents: 900,
      trackInventory: true,
      isAvailable: true,
    });

    const duplicate = await request(app)
      .post('/api/v1/products')
      .set('authorization', bearer(owner.accessToken))
      .send({
        productCategoryId: category.id,
        name: 'Shampoo 500ml',
        priceInCents: 1200,
        sku: 'SHMP-001',
        trackInventory: true,
      });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('CONFLICT');
  });

  it('accepts a product without a SKU and without tracking', async () => {
    const owner = await registerOrganization();
    const category = await seedProductCategory(owner.organizationId, 'Retail');

    const created = await request(app)
      .post('/api/v1/products')
      .set('authorization', bearer(owner.accessToken))
      .send({
        productCategoryId: category.id,
        name: 'Gift card',
        priceInCents: 5000,
        trackInventory: false,
      });

    expect(created.status).toBe(201);
    expect(created.body.data.product).toMatchObject({ sku: null, trackInventory: false });

    const levels = await prisma.inventoryLevel.count();
    expect(levels).toBe(0);
  });

  it('requires products.manage to write and products.read to read', async () => {
    const owner = await registerOrganization();
    const receptionist = await seedMember(
      owner.organizationId,
      'frontdesk@eurosense.test',
      'RECEPTIONIST',
    );

    const readable = await request(app)
      .get('/api/v1/products')
      .set('authorization', bearer(receptionist.accessToken));

    expect(readable.status).toBe(200);

    const denied = await request(app)
      .post('/api/v1/product-categories')
      .set('authorization', bearer(receptionist.accessToken))
      .send({ name: 'Retail' });

    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('PERMISSION_DENIED');
  });

  it('returns 404 for another tenant’s product', async () => {
    const owner = await registerOrganization();
    const rival = await registerOrganization({
      email: 'owner@rival.test',
      organizationName: 'Rival Salon',
      locationName: 'Orchard',
    });

    const rivalCategory = await seedProductCategory(rival.organizationId);
    const rivalProduct = await seedProduct(rival.organizationId, rivalCategory.id);

    const response = await request(app)
      .patch(`/api/v1/products/${rivalProduct.id}`)
      .set('authorization', bearer(owner.accessToken))
      .send({ priceInCents: 1 });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');

    const untouched = await prisma.product.findUniqueOrThrow({
      where: { id: rivalProduct.id },
      select: { priceInCents: true },
    });
    expect(untouched.priceInCents).toBe(1800);
  });
});

describe('inventory', () => {
  it('seeds a zero-stock level per active location for a tracked product', async () => {
    const owner = await registerOrganization();
    const category = await seedProductCategory(owner.organizationId, 'Retail');

    await request(app)
      .post('/api/v1/products')
      .set('authorization', bearer(owner.accessToken))
      .send({
        productCategoryId: category.id,
        name: 'Shampoo 1L',
        priceInCents: 1800,
        trackInventory: true,
      });

    const response = await request(app)
      .get('/api/v1/inventory/levels')
      .set('authorization', bearer(owner.accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data.inventoryLevels).toHaveLength(1);
    expect(response.body.data.inventoryLevels[0]).toMatchObject({
      locationId: owner.locationId,
      quantityOnHand: 0,
      product: { name: 'Shampoo 1L', trackInventory: true },
    });
  });

  it('applies signed movements to the level and keeps an append-only ledger', async () => {
    const owner = await registerOrganization();
    const category = await seedProductCategory(owner.organizationId, 'Retail');
    const product = await seedProduct(owner.organizationId, category.id);

    const received = await request(app)
      .post('/api/v1/inventory/movements')
      .set('authorization', bearer(owner.accessToken))
      .send({
        locationId: owner.locationId,
        productId: product.id,
        movementType: 'INITIAL_STOCK',
        quantity: 12,
        reason: 'Opening count',
      });

    expect(received.status).toBe(201);
    expect(received.body.data.inventoryMovement).toMatchObject({
      movementType: 'INITIAL_STOCK',
      quantity: 12,
      reason: 'Opening count',
      performedById: owner.userId,
      performedBy: { id: owner.userId, email: 'owner@eurosense.test' },
    });

    await request(app)
      .post('/api/v1/inventory/movements')
      .set('authorization', bearer(owner.accessToken))
      .send({
        locationId: owner.locationId,
        productId: product.id,
        movementType: 'DAMAGE',
        quantity: 2,
      });

    const level = await prisma.inventoryLevel.findFirstOrThrow({
      where: { productId: product.id },
      select: { quantityOnHand: true },
    });
    expect(level.quantityOnHand).toBe(10);

    const movements = await request(app)
      .get(`/api/v1/inventory/movements?productId=${product.id}`)
      .set('authorization', bearer(owner.accessToken));

    expect(movements.status).toBe(200);
    expect(movements.body.data.inventoryMovements).toHaveLength(2);
    expect(
      movements.body.data.inventoryMovements.map((row: { quantity: number }) => row.quantity),
    ).toEqual([2, 12]);

    const audited = await prisma.auditLog.count({
      where: { action: 'inventory.movement_recorded', organizationId: owner.organizationId },
    });
    expect(audited).toBe(2);
  });

  it('refuses an adjustment that would push stock below zero', async () => {
    const owner = await registerOrganization();
    const category = await seedProductCategory(owner.organizationId, 'Retail');
    const product = await seedProduct(owner.organizationId, category.id);

    const response = await request(app)
      .post('/api/v1/inventory/movements')
      .set('authorization', bearer(owner.accessToken))
      .send({
        locationId: owner.locationId,
        productId: product.id,
        movementType: 'ADJUST_OUT',
        quantity: 1,
      });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');

    const movements = await prisma.inventoryMovement.count();
    expect(movements).toBe(0);
  });

  it('refuses movements for a product that does not track inventory', async () => {
    const owner = await registerOrganization();
    const category = await seedProductCategory(owner.organizationId, 'Retail');
    const product = await seedProduct(owner.organizationId, category.id, false);

    const response = await request(app)
      .post('/api/v1/inventory/movements')
      .set('authorization', bearer(owner.accessToken))
      .send({
        locationId: owner.locationId,
        productId: product.id,
        movementType: 'ADJUST_IN',
        quantity: 5,
      });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('requires inventory.adjust to write and inventory.read to read', async () => {
    const owner = await registerOrganization();
    const staff = await seedMember(owner.organizationId, 'staff@eurosense.test', 'STAFF');
    const receptionist = await seedMember(
      owner.organizationId,
      'frontdesk@eurosense.test',
      'RECEPTIONIST',
    );
    const category = await seedProductCategory(owner.organizationId, 'Retail');
    const product = await seedProduct(owner.organizationId, category.id);

    const staffRead = await request(app)
      .get('/api/v1/inventory/levels')
      .set('authorization', bearer(staff.accessToken));

    expect(staffRead.status).toBe(403);
    expect(staffRead.body.error.code).toBe('PERMISSION_DENIED');

    const receptionistRead = await request(app)
      .get('/api/v1/inventory/levels')
      .set('authorization', bearer(receptionist.accessToken));

    expect(receptionistRead.status).toBe(200);

    const receptionistWrite = await request(app)
      .post('/api/v1/inventory/movements')
      .set('authorization', bearer(receptionist.accessToken))
      .send({
        locationId: owner.locationId,
        productId: product.id,
        movementType: 'ADJUST_IN',
        quantity: 1,
      });

    expect(receptionistWrite.status).toBe(403);
    expect(receptionistWrite.body.error.code).toBe('PERMISSION_DENIED');
  });

  it('returns 404 for another tenant’s product and location', async () => {
    const owner = await registerOrganization();
    const rival = await registerOrganization({
      email: 'owner@rival.test',
      organizationName: 'Rival Salon',
      locationName: 'Orchard',
    });

    const rivalCategory = await seedProductCategory(rival.organizationId);
    const rivalProduct = await seedProduct(rival.organizationId, rivalCategory.id);

    const foreignProduct = await request(app)
      .post('/api/v1/inventory/movements')
      .set('authorization', bearer(owner.accessToken))
      .send({
        locationId: owner.locationId,
        productId: rivalProduct.id,
        movementType: 'ADJUST_IN',
        quantity: 5,
      });

    expect(foreignProduct.status).toBe(404);
    expect(foreignProduct.body.error.code).toBe('NOT_FOUND');

    const ownCategory = await seedProductCategory(owner.organizationId, 'Retail');
    const ownProduct = await seedProduct(owner.organizationId, ownCategory.id);

    const foreignLocation = await request(app)
      .post('/api/v1/inventory/movements')
      .set('authorization', bearer(owner.accessToken))
      .send({
        locationId: rival.locationId,
        productId: ownProduct.id,
        movementType: 'ADJUST_IN',
        quantity: 5,
      });

    expect(foreignLocation.status).toBe(404);
    expect(foreignLocation.body.error.code).toBe('NOT_FOUND');
  });

  it('never lists another tenant’s inventory levels', async () => {
    const owner = await registerOrganization();
    const rival = await registerOrganization({
      email: 'owner@rival.test',
      organizationName: 'Rival Salon',
      locationName: 'Orchard',
    });

    const rivalCategory = await seedProductCategory(rival.organizationId);
    const rivalProduct = await seedProduct(rival.organizationId, rivalCategory.id);

    await prisma.inventoryLevel.create({
      data: {
        organizationId: rival.organizationId,
        productId: rivalProduct.id,
        locationId: rival.locationId,
        quantityOnHand: 7,
      },
    });

    const response = await request(app)
      .get('/api/v1/inventory/levels')
      .set('authorization', bearer(owner.accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data.inventoryLevels).toEqual([]);
  });
});
