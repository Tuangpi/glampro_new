import { Router } from 'express';
import { z } from 'zod';
import {
  platformOrganizationActionRequestSchema,
  platformOrganizationQuerySchema,
  platformSubscriptionActionRequestSchema,
} from '@glampro/contracts';
import type {
  PlatformOrganizationActionRequest,
  PlatformOrganizationQuery,
  PlatformSubscriptionActionRequest,
} from '@glampro/contracts';
import { authenticate, authenticationOf } from '../../middleware/authenticate.js';
import { requireCsrf } from '../../middleware/csrf.js';
import {
  validate,
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../../middleware/validate.js';
import { auditContextFromRequest } from '../../shared/audit.js';
import { respondSuccess } from '../../shared/http/response.js';
import { requirePlatformAdmin } from '../auth/authorization.js';
import {
  changePlatformOrganizationStatus,
  changePlatformSubscriptionStatus,
  listPlatformOrganizations,
  platformOverview,
} from './platform.service.js';

export const platformRouter = Router();
const paramsSchema = z.object({ id: z.string().trim().min(1).max(64) });
type IdParams = { id: string };
const gate = [authenticate, requirePlatformAdmin] as const;

platformRouter.get('/overview', ...gate, async (request, response) => {
  respondSuccess(request, response, await platformOverview());
});

platformRouter.get(
  '/organizations',
  ...gate,
  validate({ query: platformOrganizationQuerySchema }),
  async (request, response) => {
    respondSuccess(
      request,
      response,
      await listPlatformOrganizations(validatedQuery<PlatformOrganizationQuery>(request)),
    );
  },
);

platformRouter.patch(
  '/organizations/:id/status',
  ...gate,
  requireCsrf,
  validate({ params: paramsSchema, body: platformOrganizationActionRequestSchema }),
  async (request, response) => {
    respondSuccess(request, response, {
      organization: await changePlatformOrganizationStatus(
        validatedParams<IdParams>(request).id,
        validatedBody<PlatformOrganizationActionRequest>(request),
        authenticationOf(request).userId,
        auditContextFromRequest(request),
      ),
    });
  },
);

platformRouter.patch(
  '/organizations/:id/subscription',
  ...gate,
  requireCsrf,
  validate({ params: paramsSchema, body: platformSubscriptionActionRequestSchema }),
  async (request, response) => {
    respondSuccess(request, response, {
      subscription: await changePlatformSubscriptionStatus(
        validatedParams<IdParams>(request).id,
        validatedBody<PlatformSubscriptionActionRequest>(request),
        authenticationOf(request).userId,
        auditContextFromRequest(request),
      ),
    });
  },
);
