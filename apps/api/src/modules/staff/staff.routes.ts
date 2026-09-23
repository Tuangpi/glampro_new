import { Router } from 'express';
import { z } from 'zod';
import {
  createStaffProfileRequestSchema,
  replaceStaffServicesRequestSchema,
  staffQuerySchema,
  staffScheduleRequestSchema,
  staffTimeOffRequestSchema,
  updateStaffProfileRequestSchema,
} from '@glampro/contracts';
import type {
  ReplaceStaffServicesRequest,
  StaffProfileRequest,
  StaffQuery,
  StaffScheduleRequest,
  StaffTimeOffRequest,
  UpdateStaffProfileRequest,
} from '@glampro/contracts';
import { authenticate, authenticationOf } from '../../middleware/authenticate.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { tenantOf, withTenant } from '../../middleware/tenant.js';
import {
  validate,
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../../middleware/validate.js';
import { auditContextFromRequest } from '../../shared/audit.js';
import { respondSuccess } from '../../shared/http/response.js';
import { requirePermission } from '../auth/authorization.js';
import {
  createStaffTimeOff,
  listStaffSchedule,
  listStaffTimeOff,
  removeStaffTimeOff,
  replaceStaffSchedule,
} from './schedule.service.js';
import {
  assignedServicesOf,
  createStaffProfile,
  listStaffCandidates,
  listStaffProfiles,
  replaceStaffServices,
  staffProfileDetailOf,
  updateStaffProfile,
} from './staff.service.js';

export const staffRouter = Router();

const idParamsSchema = z.object({ id: z.string().trim().min(1).max(64) });
const timeOffParamsSchema = z.object({
  id: z.string().trim().min(1).max(64),
  timeOffId: z.string().trim().min(1).max(64),
});

type IdParams = { id: string };
type TimeOffParams = { id: string; timeOffId: string };

/**
 * Staff is the salon roster: the whole team can read it, while managers and
 * above hold `staff.manage` and change profiles, assignments, and the week.
 */

staffRouter.get(
  '/',
  authenticate,
  withTenant,
  requirePermission('staff.read'),
  validate({ query: staffQuerySchema }),
  async (request, response) => {
    respondSuccess(request, response, {
      staffProfiles: await listStaffProfiles(
        tenantOf(request).organizationId,
        validatedQuery<StaffQuery>(request),
      ),
    });
  },
);

/**
 * Declared before `/:id` so the literal path wins over the parameter route.
 * Only holders of `staff.manage` can start a profile, so only they see who is
 * still missing one.
 */
staffRouter.get(
  '/candidates',
  authenticate,
  withTenant,
  requirePermission('staff.manage'),
  async (request, response) => {
    respondSuccess(request, response, {
      candidates: await listStaffCandidates(tenantOf(request).organizationId),
    });
  },
);

staffRouter.post(
  '/',
  authenticate,
  withTenant,
  requirePermission('staff.manage'),
  requireCsrf,
  validate({ body: createStaffProfileRequestSchema }),
  async (request, response) => {
    const staffProfile = await createStaffProfile(
      tenantOf(request).organizationId,
      validatedBody<StaffProfileRequest>(request),
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { staffProfile }, 201);
  },
);

staffRouter.get(
  '/:id',
  authenticate,
  withTenant,
  requirePermission('staff.read'),
  validate({ params: idParamsSchema }),
  async (request, response) => {
    const staffProfile = await staffProfileDetailOf(
      tenantOf(request).organizationId,
      validatedParams<IdParams>(request).id,
    );

    respondSuccess(request, response, { staffProfile });
  },
);

staffRouter.patch(
  '/:id',
  authenticate,
  withTenant,
  requirePermission('staff.manage'),
  requireCsrf,
  validate({ params: idParamsSchema, body: updateStaffProfileRequestSchema }),
  async (request, response) => {
    const staffProfile = await updateStaffProfile(
      tenantOf(request).organizationId,
      validatedParams<IdParams>(request).id,
      validatedBody<UpdateStaffProfileRequest>(request),
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { staffProfile });
  },
);

/** Assigned services: the set is replaced whole. */

staffRouter.get(
  '/:id/services',
  authenticate,
  withTenant,
  requirePermission('staff.read'),
  validate({ params: idParamsSchema }),
  async (request, response) => {
    respondSuccess(request, response, {
      services: await assignedServicesOf(
        tenantOf(request).organizationId,
        validatedParams<IdParams>(request).id,
      ),
    });
  },
);

staffRouter.put(
  '/:id/services',
  authenticate,
  withTenant,
  requirePermission('staff.manage'),
  requireCsrf,
  validate({ params: idParamsSchema, body: replaceStaffServicesRequestSchema }),
  async (request, response) => {
    const services = await replaceStaffServices(
      tenantOf(request).organizationId,
      validatedParams<IdParams>(request).id,
      validatedBody<ReplaceStaffServicesRequest>(request),
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { services });
  },
);

/** Weekly schedule: a full week is replaced at once, like business hours. */

staffRouter.get(
  '/:id/schedule',
  authenticate,
  withTenant,
  requirePermission('staff.read'),
  validate({ params: idParamsSchema }),
  async (request, response) => {
    respondSuccess(request, response, {
      schedule: await listStaffSchedule(
        tenantOf(request).organizationId,
        validatedParams<IdParams>(request).id,
      ),
    });
  },
);

staffRouter.put(
  '/:id/schedule',
  authenticate,
  withTenant,
  requirePermission('staff.manage'),
  requireCsrf,
  validate({ params: idParamsSchema, body: staffScheduleRequestSchema }),
  async (request, response) => {
    const schedule = await replaceStaffSchedule(
      tenantOf(request).organizationId,
      validatedParams<IdParams>(request).id,
      validatedBody<StaffScheduleRequest>(request),
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { schedule });
  },
);

/** Time off: dated absences layered on top of the recurring week. */

staffRouter.get(
  '/:id/time-off',
  authenticate,
  withTenant,
  requirePermission('staff.read'),
  validate({ params: idParamsSchema }),
  async (request, response) => {
    respondSuccess(request, response, {
      timeOff: await listStaffTimeOff(
        tenantOf(request).organizationId,
        validatedParams<IdParams>(request).id,
      ),
    });
  },
);

staffRouter.post(
  '/:id/time-off',
  authenticate,
  withTenant,
  requirePermission('staff.manage'),
  requireCsrf,
  validate({ params: idParamsSchema, body: staffTimeOffRequestSchema }),
  async (request, response) => {
    const timeOff = await createStaffTimeOff(
      tenantOf(request).organizationId,
      validatedParams<IdParams>(request).id,
      validatedBody<StaffTimeOffRequest>(request),
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { timeOff }, 201);
  },
);

staffRouter.delete(
  '/:id/time-off/:timeOffId',
  authenticate,
  withTenant,
  requirePermission('staff.manage'),
  requireCsrf,
  validate({ params: timeOffParamsSchema }),
  async (request, response) => {
    const params = validatedParams<TimeOffParams>(request);

    const timeOff = await removeStaffTimeOff(
      tenantOf(request).organizationId,
      params.id,
      params.timeOffId,
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { timeOff });
  },
);
