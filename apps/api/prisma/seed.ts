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
    connectionLimit: 5,
  },
  { database: decodeURIComponent(parsed.pathname.slice(1)) },
);

const prisma = new PrismaClient({ adapter });

const main = async () => {
  const passwordHash = await bcrypt.hash('ChangeMe12345', 12);

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
        create: {
          role: 'ORG_OWNER',
          organization: {
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
          },
        },
      },
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
