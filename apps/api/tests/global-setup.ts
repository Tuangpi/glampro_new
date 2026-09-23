import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shadowDatabaseUrl, testDatabaseUrl } from './helpers/test-database.js';

const apiRoot = fileURLToPath(new URL('..', import.meta.url));
const prismaCli = path.resolve(apiRoot, '../../node_modules/prisma/build/index.js');

/** Applies committed migrations to the test database before the suite runs. */
const setupDatabase = () => {
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy', '--config', 'prisma.config.ts'], {
    cwd: apiRoot,
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl(),
      SHADOW_DATABASE_URL: shadowDatabaseUrl(),
    },
    stdio: 'inherit',
  });
};

export default setupDatabase;
