const defaultDatabaseUrl = 'mysql://glampro:glampro@127.0.0.1:3307/glampro';

const databaseNameOf = (databaseUrl: string) => new URL(databaseUrl).pathname.replace(/^\//, '');

export const withDatabaseName = (databaseUrl: string, databaseName: string) => {
  const parsed = new URL(databaseUrl);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
};

/**
 * Integration tests truncate tables between cases, so the suite owns a
 * dedicated database. Pointing it anywhere but a `_test` database is refused.
 */
export const testDatabaseUrl = () => {
  const explicit = process.env.DATABASE_URL_TEST;
  const url =
    explicit && explicit.length > 0
      ? explicit
      : withDatabaseName(process.env.DATABASE_URL ?? defaultDatabaseUrl, 'glampro_test');

  const databaseName = databaseNameOf(url);

  if (!/_test$/.test(databaseName)) {
    throw new Error(
      `Refusing to run tests against the "${databaseName}" database. Use a database whose name ends in _test.`,
    );
  }

  return url;
};

export const shadowDatabaseUrl = () => {
  const explicit =
    process.env.SHADOW_DATABASE_URL ?? process.env.DATABASE_URL ?? defaultDatabaseUrl;
  return withDatabaseName(explicit, 'glampro_shadow');
};
