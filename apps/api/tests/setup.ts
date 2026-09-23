import { testDatabaseUrl } from './helpers/test-database.js';

/**
 * Runs before every test file, ahead of the application modules, so the API
 * and the Prisma client resolve against the dedicated test database.
 */
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.EMAIL_TRANSPORT = 'disabled';
process.env.DATABASE_URL = testDatabaseUrl();
