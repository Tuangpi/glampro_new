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
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().max(1440).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().max(365).default(30),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().max(1440).default(60),
  EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().int().positive().max(168).default(24),
  INVITATION_TTL_HOURS: z.coerce.number().int().positive().max(8760).default(168),
  EMAIL_TRANSPORT: z.enum(['log', 'disabled']).default('log'),
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

if (result.data.NODE_ENV === 'production' && result.data.EMAIL_TRANSPORT === 'log') {
  console.warn('EMAIL_TRANSPORT=log is ignored in production; outbound email is dropped');
}

export const env = result.data;
