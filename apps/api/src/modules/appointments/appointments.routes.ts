import { Router } from 'express';
import { z } from 'zod';
import {
  appointmentQuerySchema,
  availabilityQuerySchema,
  changeAppointmentStatusRequestSchema,
  createAppointmentRequestSchema,
  replaceAppointmentServicesRequestSchema,
  updateAppointmentRequestSchema,
} from '@glampro/contracts';
import type {
  AppointmentQuery,
  AvailabilityQuery,
  ChangeAppointmentStatusRequest,
  CreateAppointmentRequest,
  ReplaceAppointmentServicesRequest,
  UpdateAppointmentRequest,
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
  appointmentDetailOf,
  changeAppointmentStatus,
  createAppointment,
  listAppointments,
  replaceAppointmentServices,
  updateAppointment,
} from './appointments.service.js';
import { availabilityFor } from './availability.service.js';

export const appointmentsRouter = Router();

const idParamsSchema = z.object({ id: z.string().trim().min(1).max(64) });

type IdParams = { id: string };

/**
 * The calendar. Everyone who can open it reads appointments; reception, managers,
 * and owners hold `appointments.manage` and move them through their statuses.
 */

appointmentsRouter.get(
  '/',
  authenticate,
  withTenant,
  requirePermission('appointments.read'),
  validate({ query: appointmentQuerySchema }),
  async (request, response) => {
    respondSuccess(
      request,
      response,
      await listAppointments(
        tenantOf(request).organizationId,
        validatedQuery<AppointmentQuery>(request),
      ),
    );
  },
);

/** Declared before `/:id` so the literal path wins over the parameter route. */
appointmentsRouter.get(
  '/availability',
  authenticate,
  withTenant,
  requirePermission('appointments.read'),
  validate({ query: availabilityQuerySchema }),
  async (request, response) => {
    respondSuccess(
      request,
      response,
      await availabilityFor(
        tenantOf(request).organizationId,
        validatedQuery<AvailabilityQuery>(request),
      ),
    );
  },
);

appointmentsRouter.get(
  '/:id',
  authenticate,
  withTenant,
  requirePermission('appointments.read'),
  validate({ params: idParamsSchema }),
  async (request, response) => {
    respondSuccess(request, response, {
      appointment: await appointmentDetailOf(
        tenantOf(request).organizationId,
        validatedParams<IdParams>(request).id,
      ),
    });
  },
);

appointmentsRouter.post(
  '/',
  authenticate,
  withTenant,
  requirePermission('appointments.manage'),
  requireCsrf,
  validate({ body: createAppointmentRequestSchema }),
  async (request, response) => {
    const appointment = await createAppointment(
      tenantOf(request).organizationId,
      validatedBody<CreateAppointmentRequest>(request),
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { appointment }, 201);
  },
);

appointmentsRouter.patch(
  '/:id',
  authenticate,
  withTenant,
  requirePermission('appointments.manage'),
  requireCsrf,
  validate({ params: idParamsSchema, body: updateAppointmentRequestSchema }),
  async (request, response) => {
    const appointment = await updateAppointment(
      tenantOf(request).organizationId,
      validatedParams<IdParams>(request).id,
      validatedBody<UpdateAppointmentRequest>(request),
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { appointment });
  },
);

/** A different service set is a different length, so it is replaced as a set. */
appointmentsRouter.put(
  '/:id/services',
  authenticate,
  withTenant,
  requirePermission('appointments.manage'),
  requireCsrf,
  validate({ params: idParamsSchema, body: replaceAppointmentServicesRequestSchema }),
  async (request, response) => {
    const services = await replaceAppointmentServices(
      tenantOf(request).organizationId,
      validatedParams<IdParams>(request).id,
      validatedBody<ReplaceAppointmentServicesRequest>(request),
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { services });
  },
);

/** Status changes are recorded in the appointment's own trail. */
appointmentsRouter.patch(
  '/:id/status',
  authenticate,
  withTenant,
  requirePermission('appointments.manage'),
  requireCsrf,
  validate({ params: idParamsSchema, body: changeAppointmentStatusRequestSchema }),
  async (request, response) => {
    const appointment = await changeAppointmentStatus(
      tenantOf(request).organizationId,
      validatedParams<IdParams>(request).id,
      validatedBody<ChangeAppointmentStatusRequest>(request),
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { appointment });
  },
);
