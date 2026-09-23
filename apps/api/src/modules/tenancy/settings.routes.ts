import { Router } from 'express';
import { z } from 'zod';
import {
  businessHoursRequestSchema,
  createLocationRequestSchema,
  updateLocationRequestSchema,
  updateOrganizationRequestSchema,
} from '@glampro/contracts';
import type {
  BusinessHoursRequest,
  CreateLocationRequest,
  UpdateLocationRequest,
  UpdateOrganizationRequest,
} from '@glampro/contracts';
import { authenticate, authenticationOf } from '../../middleware/authenticate.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { tenantOf, withTenant } from '../../middleware/tenant.js';
import { validate, validatedBody, validatedParams } from '../../middleware/validate.js';
import { auditContextFromRequest } from '../../shared/audit.js';
import { respondSuccess } from '../../shared/http/response.js';
import { requirePermission } from '../auth/authorization.js';
import {
  businessHoursOf,
  createLocation,
  listLocations,
  locationDetailOf,
  organizationSettingsOf,
  replaceBusinessHours,
  updateLocation,
  updateOrganizationSettings,
} from './settings.service.js';

export const settingsRouter = Router();
export const locationsRouter = Router();

const idParamsSchema = z.object({ id: z.string().trim().min(1).max(64) });

type IdParams = { id: string };

settingsRouter.get(
  '/organization',
  authenticate,
  withTenant,
  requirePermission('settings.manage'),
  async (request, response) => {
    respondSuccess(
      request,
      response,
      await organizationSettingsOf(tenantOf(request).organizationId),
    );
  },
);

settingsRouter.patch(
  '/organization',
  authenticate,
  withTenant,
  requirePermission('settings.manage'),
  requireCsrf,
  validate({ body: updateOrganizationRequestSchema }),
  async (request, response) => {
    const settings = await updateOrganizationSettings(
      tenantOf(request).organizationId,
      validatedBody<UpdateOrganizationRequest>(request),
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, settings);
  },
);

locationsRouter.get(
  '/',
  authenticate,
  withTenant,
  requirePermission('settings.manage'),
  async (request, response) => {
    respondSuccess(request, response, {
      locations: await listLocations(tenantOf(request).organizationId),
    });
  },
);

locationsRouter.post(
  '/',
  authenticate,
  withTenant,
  requirePermission('settings.manage'),
  requireCsrf,
  validate({ body: createLocationRequestSchema }),
  async (request, response) => {
    const location = await createLocation(
      tenantOf(request).organizationId,
      validatedBody<CreateLocationRequest>(request),
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { location }, 201);
  },
);

locationsRouter.get(
  '/:id',
  authenticate,
  withTenant,
  requirePermission('settings.manage'),
  validate({ params: idParamsSchema }),
  async (request, response) => {
    const location = await locationDetailOf(
      tenantOf(request).organizationId,
      validatedParams<IdParams>(request).id,
    );

    respondSuccess(request, response, { location });
  },
);

locationsRouter.patch(
  '/:id',
  authenticate,
  withTenant,
  requirePermission('settings.manage'),
  requireCsrf,
  validate({ params: idParamsSchema, body: updateLocationRequestSchema }),
  async (request, response) => {
    const location = await updateLocation(
      tenantOf(request).organizationId,
      validatedParams<IdParams>(request).id,
      validatedBody<UpdateLocationRequest>(request),
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { location });
  },
);

locationsRouter.get(
  '/:id/business-hours',
  authenticate,
  withTenant,
  requirePermission('settings.manage'),
  validate({ params: idParamsSchema }),
  async (request, response) => {
    const hours = await businessHoursOf(
      tenantOf(request).organizationId,
      validatedParams<IdParams>(request).id,
    );

    respondSuccess(request, response, { hours });
  },
);

locationsRouter.put(
  '/:id/business-hours',
  authenticate,
  withTenant,
  requirePermission('settings.manage'),
  requireCsrf,
  validate({ params: idParamsSchema, body: businessHoursRequestSchema }),
  async (request, response) => {
    const hours = await replaceBusinessHours(
      tenantOf(request).organizationId,
      validatedParams<IdParams>(request).id,
      validatedBody<BusinessHoursRequest>(request).hours,
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { hours });
  },
);
