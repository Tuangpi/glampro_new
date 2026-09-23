import bcrypt from 'bcrypt';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client.js';

const databaseUrl = process.env.DATABASE_URL ?? 'mysql://glampro:glampro@127.0.0.1:3307/glampro';
const parsed = new URL(databaseUrl);
const adapter = new PrismaMariaDb(
  {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.slice(1)),
    connectionLimit: 5,
  },
  { database: decodeURIComponent(parsed.pathname.slice(1)) },
);

const prisma = new PrismaClient({ adapter });

/**
 * Seeds one salon with an owner, a location, a trial subscription, and a small
 * catalog. Every step is keyed on a natural identifier, so re-running the seed
 * leaves an existing database alone.
 */
const main = async () => {
  const passwordHash = await bcrypt.hash('ChangeMe12345', 12);

  const organization = await prisma.organization.upsert({
    where: { slug: 'eurosense-hair-studio' },
    update: {},
    create: {
      name: 'Eurosense Hair Studio',
      slug: 'eurosense-hair-studio',
      locations: {
        create: {
          name: 'Tanjong Pagar',
          code: 'TPG',
          addressLine1: '21 Tanjong Pagar Road, #01-05',
          city: 'Singapore',
          postalCode: '088444',
          businessHours: {
            create: Array.from({ length: 7 }, (_, dayOfWeek) => ({
              dayOfWeek,
              isClosed: dayOfWeek === 0,
              opensAt: dayOfWeek === 0 ? null : '09:00',
              closesAt: dayOfWeek === 0 ? null : dayOfWeek >= 5 ? '21:00' : '20:00',
            })),
          },
        },
      },
      subscriptions: {
        create: {
          planCode: 'starter',
          status: 'TRIALING',
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      },
    },
    select: { id: true },
  });

  await prisma.user.upsert({
    where: { email: 'owner@glampro.local' },
    update: {},
    create: {
      email: 'owner@glampro.local',
      firstName: 'Kai',
      lastName: 'Tan',
      emailVerifiedAt: new Date(),
      credential: { create: { passwordHash } },
      memberships: {
        create: { role: 'ORG_OWNER', organizationId: organization.id },
      },
    },
  });

  const location = await prisma.location.findFirstOrThrow({
    where: { organizationId: organization.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  const catalogExists =
    (await prisma.serviceCategory.count({ where: { organizationId: organization.id } })) > 0;

  if (catalogExists) {
    return;
  }

  await prisma.serviceCategory.create({
    data: {
      organizationId: organization.id,
      name: 'Cuts',
      sortOrder: 1,
      services: {
        create: [
          {
            organizationId: organization.id,
            name: 'Women’s cut',
            durationMinutes: 45,
            priceInCents: 4500,
            sortOrder: 1,
          },
          {
            organizationId: organization.id,
            name: 'Men’s cut',
            durationMinutes: 30,
            priceInCents: 3200,
            sortOrder: 2,
          },
        ],
      },
    },
  });

  await prisma.serviceCategory.create({
    data: {
      organizationId: organization.id,
      name: 'Colour',
      sortOrder: 2,
      services: {
        create: [
          {
            organizationId: organization.id,
            name: 'Full highlights',
            durationMinutes: 120,
            priceInCents: 18000,
          },
        ],
      },
    },
  });

  const productCategory = await prisma.productCategory.create({
    data: { organizationId: organization.id, name: 'Retail', sortOrder: 1 },
    select: { id: true },
  });

  const product = await prisma.product.create({
    data: {
      organizationId: organization.id,
      productCategoryId: productCategory.id,
      name: 'Shampoo 1L',
      sku: 'SHMP-1L',
      priceInCents: 1800,
      costInCents: 900,
      trackInventory: true,
    },
    select: { id: true },
  });

  // The API seeds a zero-stock level per active location; the seed matches it
  // so the inventory screen has a row to show before the first movement.
  await prisma.inventoryLevel.create({
    data: {
      organizationId: organization.id,
      productId: product.id,
      locationId: location.id,
      quantityOnHand: 12,
    },
  });

  await prisma.inventoryMovement.create({
    data: {
      organizationId: organization.id,
      productId: product.id,
      locationId: location.id,
      movementType: 'INITIAL_STOCK',
      quantity: 12,
      reason: 'Opening count',
    },
  });
};

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
