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

  if (!catalogExists) {
    await seedCatalog(organization.id, location.id);
  }

  // Fixtures added after the catalog are keyed on natural identifiers and run on
  // every seed, so a database created by an earlier milestone still gains them.
  await seedPeople(organization.id, passwordHash);
};

/** The service menu, the retail catalog, and the opening stock count. */
const seedCatalog = async (organizationId: string, locationId: string) => {
  await prisma.serviceCategory.create({
    data: {
      organizationId,
      name: 'Cuts',
      sortOrder: 1,
      services: {
        create: [
          {
            organizationId,
            name: 'Women’s cut',
            durationMinutes: 45,
            priceInCents: 4500,
            sortOrder: 1,
          },
          {
            organizationId,
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
      organizationId,
      name: 'Colour',
      sortOrder: 2,
      services: {
        create: [
          {
            organizationId,
            name: 'Full highlights',
            durationMinutes: 120,
            priceInCents: 18000,
          },
        ],
      },
    },
  });

  const productCategory = await prisma.productCategory.create({
    data: { organizationId, name: 'Retail', sortOrder: 1 },
    select: { id: true },
  });

  const product = await prisma.product.create({
    data: {
      organizationId,
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
      organizationId,
      productId: product.id,
      locationId,
      quantityOnHand: 12,
    },
  });

  await prisma.inventoryMovement.create({
    data: {
      organizationId,
      productId: product.id,
      locationId,
      movementType: 'INITIAL_STOCK',
      quantity: 12,
      reason: 'Opening count',
    },
  });
};

/** The week a new roster profile starts with: Sunday off, 10:00–19:00 otherwise. */
const scheduleOf = (organizationId: string, staffProfileId: string) =>
  Array.from({ length: 7 }, (_, dayOfWeek) => ({
    organizationId,
    staffProfileId,
    dayOfWeek,
    isWorking: dayOfWeek !== 0,
    startsAt: dayOfWeek === 0 ? null : '10:00',
    endsAt: dayOfWeek === 0 ? null : '19:00',
  }));

/** Only fills a gap: a profile that already has a week keeps it. */
const ensureWeek = async (organizationId: string, staffProfileId: string) => {
  const existing = await prisma.staffSchedule.count({ where: { staffProfileId } });

  if (existing === 0) {
    await prisma.staffSchedule.createMany({ data: scheduleOf(organizationId, staffProfileId) });
  }
};

/**
 * People fixtures: a second teammate with a roster profile, plus two customers
 * and their notes. Written with upserts and gap checks, so seeding twice leaves
 * the rows alone, and a database from an earlier milestone still gains them.
 */
const seedPeople = async (organizationId: string, passwordHash: string) => {
  /** The owner's own roster profile, so the salon has a bookable person. */
  const owner = await prisma.organizationMembership.findFirstOrThrow({
    where: { organizationId, role: 'ORG_OWNER' },
    select: { id: true, userId: true },
  });

  const ownerStaff = await prisma.staffProfile.upsert({
    where: { membershipId: owner.id },
    update: {},
    create: {
      organizationId,
      membershipId: owner.id,
      jobTitle: 'Salon director',
      color: '#2B3160',
      hireDate: new Date('2022-01-10'),
    },
    select: { id: true },
  });

  await ensureWeek(organizationId, ownerStaff.id);
  /** A second teammate: a user, a STAFF membership, and a bookable profile. */
  const stylistUser = await prisma.user.upsert({
    where: { email: 'stylist@glampro.local' },
    update: {},
    create: {
      email: 'stylist@glampro.local',
      firstName: 'Jia',
      lastName: 'Ting',
      emailVerifiedAt: new Date(),
      credential: { create: { passwordHash } },
    },
    select: { id: true },
  });

  const stylistMembership = await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId, userId: stylistUser.id } },
    update: {},
    create: { organizationId, userId: stylistUser.id, role: 'STAFF' },
    select: { id: true },
  });

  const stylistStaff = await prisma.staffProfile.upsert({
    where: { membershipId: stylistMembership.id },
    update: {},
    create: {
      organizationId,
      membershipId: stylistMembership.id,
      displayName: 'Jia',
      jobTitle: 'Senior stylist',
      bio: 'Balayage and curly cutting.',
      color: '#6144E4',
      hireDate: new Date('2024-02-01'),
    },
    select: { id: true },
  });

  await ensureWeek(organizationId, stylistStaff.id);

  const timeOffExists = await prisma.staffTimeOff.count({
    where: { staffProfileId: stylistStaff.id },
  });

  if (timeOffExists === 0) {
    // A day off a week out, so the time-off tab has a row to show.
    const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.staffTimeOff.create({
      data: {
        organizationId,
        staffProfileId: stylistStaff.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 24 * 60 * 60 * 1000),
        reason: 'Annual leave',
        createdById: owner.userId,
      },
    });
  }

  const staffProfileIds = [ownerStaff.id, stylistStaff.id];
  /** Both profiles perform every service in the seeded menu. */
  const services = await prisma.service.findMany({
    where: { organizationId },
    select: { id: true },
    orderBy: { sortOrder: 'asc' },
  });

  const assignments = services.flatMap((service) =>
    staffProfileIds.map((staffProfileId) => ({ staffProfileId, serviceId: service.id })),
  );

  const existing = await prisma.staffServiceAssignment.findMany({
    where: { organizationId },
    select: { staffProfileId: true, serviceId: true },
  });

  const assignedKeys = new Set(existing.map((row) => `${row.staffProfileId}:${row.serviceId}`));

  const missing = assignments.filter(
    (row) => !assignedKeys.has(`${row.staffProfileId}:${row.serviceId}`),
  );

  if (missing.length > 0) {
    await prisma.staffServiceAssignment.createMany({
      data: missing.map((row) => ({ organizationId, ...row })),
    });
  }
  /**
   * Two customers, each keyed on their email so the seed can run twice. The
   * profile is written before its note, because a note hangs off the customer.
   */
  const customers = [
    {
      firstName: 'Wei Ling',
      lastName: 'Ng',
      email: 'wei.ling@example.test',
      phone: '+65 9123 4567',
      memberNumber: 'M-1001',
      gender: 'FEMALE' as const,
      note: 'Prefers a quiet chair. Sensitive to strong ammonia.',
    },
    {
      firstName: 'Priya',
      lastName: 'Raman',
      email: 'priya.raman@example.test',
      phone: '+65 9876 5432',
      memberNumber: null,
      gender: 'FEMALE' as const,
      note: 'Allergic to henna — patch test before colour.',
    },
  ];

  for (const entry of customers) {
    const customer = await prisma.customer.upsert({
      where: { organizationId_email: { organizationId, email: entry.email } },
      update: {},
      create: {
        organizationId,
        firstName: entry.firstName,
        lastName: entry.lastName,
        email: entry.email,
        phone: entry.phone,
        memberNumber: entry.memberNumber,
        gender: entry.gender,
      },
      select: { id: true },
    });

    const noteExists = await prisma.customerNote.count({ where: { customerId: customer.id } });

    if (noteExists === 0) {
      await prisma.customerNote.create({
        data: {
          organizationId,
          customerId: customer.id,
          authorUserId: owner.userId,
          body: entry.note,
        },
      });
    }
  }
};

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
