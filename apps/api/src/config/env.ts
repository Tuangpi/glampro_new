import 'dotenv/config';
import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().max(65_535).default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1).default('mysql://glampro:glampro@127.0.0.1:3307/glampro'),
  ACCESS_TOKEN_SECRET: z.string().min(32).default('development-access-secret-change-me'),
  REFRESH_TOKEN_SECRET: z.string().min(32).default('development-refresh-secret-change-me'),
  COOKIE_DOMAIN: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
});

const result = environmentSchema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment configuration', result.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

if (result.data.NODE_ENV === 'production') {
  const insecureDefaults = [
    'development-access-secret-change-me',
    'development-refresh-secret-change-me',
  ];

  if (
    insecureDefaults.includes(result.data.ACCESS_TOKEN_SECRET) ||
    insecureDefaults.includes(result.data.REFRESH_TOKEN_SECRET)
  ) {
    throw new Error('Production token secrets must be explicitly configured');
  }
}

export const env = result.data;
