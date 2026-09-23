import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { z } from 'zod';
import { PrismaClient } from '../generated/prisma/client.js';

const databaseUrlSchema = z
  .string()
  .min(1)
  .refine(
    (value) => {
      try {
        const parsed = new URL(value);
        return (
          parsed.protocol === 'mysql:' && Boolean(parsed.hostname) && parsed.pathname.length > 1
        );
      } catch {
        return false;
      }
    },
    { message: 'DATABASE_URL must be a mysql:// connection string with a database name' },
  );

const parseDatabaseUrl = (databaseUrl: string) => {
  const parsed = new URL(databaseUrlSchema.parse(databaseUrl));

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.slice(1)),
  };
};

const createAdapter = () => {
  const { host, port, user, password, database } = parseDatabaseUrl(
    process.env.DATABASE_URL ?? 'mysql://glampro:glampro@127.0.0.1:3307/glampro',
  );

  // The database is part of the pool config so the session selects a schema;
  // the adapter option only feeds connection metadata, and raw SQL fails
  // without it with "No database selected".
  return new PrismaMariaDb(
    { host, port, user, password, database, connectionLimit: 5 },
    { database },
  );
};

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter: createAdapter() });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
