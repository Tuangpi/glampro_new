import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { globalRateLimit } from './middleware/rate-limits.js';
import { requestContext } from './middleware/request-context.js';
import { appointmentsRouter } from './modules/appointments/appointments.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import {
  inventoryRouter,
  productCategoriesRouter,
  productsRouter,
  serviceCategoriesRouter,
  servicesRouter,
} from './modules/catalog/catalog.routes.js';
import { customersRouter } from './modules/customers/customers.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { staffRouter } from './modules/staff/staff.routes.js';
import { auditRouter } from './modules/tenancy/audit.routes.js';
import { invitationsRouter, membersRouter } from './modules/tenancy/members.routes.js';
import { locationsRouter, settingsRouter } from './modules/tenancy/settings.routes.js';

/**
 * Reads the request ID set by the preceding requestContext middleware.
 * pino-http types the incoming request as a bare Node request, so the
 * augmented `id` property is read through a narrow structural check.
 */
const requestIdOf = (request: IncomingMessage): string | undefined => {
  const candidate = (request as { id?: unknown }).id;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
};

export const createApp = () => {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(requestContext);
  app.use(
    pinoHttp({
      logger,
      genReqId: (request) => requestIdOf(request) ?? randomUUID(),
      customProps: (request) => ({ requestId: requestIdOf(request) ?? 'unknown' }),
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['content-type', 'x-csrf-token', 'x-request-id'],
      exposedHeaders: ['x-request-id'],
      maxAge: 600,
    }),
  );
  app.use(globalRateLimit);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());

  app.use('/api/v1', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/settings', settingsRouter);
  app.use('/api/v1/locations', locationsRouter);
  app.use('/api/v1/members', membersRouter);
  app.use('/api/v1/invitations', invitationsRouter);
  app.use('/api/v1/audit', auditRouter);
  app.use('/api/v1/service-categories', serviceCategoriesRouter);
  app.use('/api/v1/services', servicesRouter);
  app.use('/api/v1/product-categories', productCategoriesRouter);
  app.use('/api/v1/products', productsRouter);
  app.use('/api/v1/inventory', inventoryRouter);
  app.use('/api/v1/customers', customersRouter);
  app.use('/api/v1/appointments', appointmentsRouter);
  app.use('/api/v1/staff', staffRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
