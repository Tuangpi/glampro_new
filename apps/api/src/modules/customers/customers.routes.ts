import { Router } from 'express';
import { z } from 'zod';
import {
  createCustomerNoteRequestSchema,
  createCustomerRequestSchema,
  customerQuerySchema,
  updateCustomerRequestSchema,
} from '@glampro/contracts';
import type {
  CreateCustomerNoteRequest,
  CustomerQuery,
  CustomerRequest,
  UpdateCustomerRequest,
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
  createCustomer,
  createCustomerNote,
  customerDetailOf,
  listCustomerNotes,
  listCustomers,
  updateCustomer,
} from './customers.service.js';

export const customersRouter = Router();

const idParamsSchema = z.object({ id: z.string().trim().min(1).max(64) });

type IdParams = { id: string };

/**
 * Customers are readable by anyone who can open the book — a stylist can look a
 * client up — while writes need `customers.manage`, which reception, managers,
 * and owners hold.
 */

customersRouter.get(
  '/',
  authenticate,
  withTenant,
  requirePermission('customers.read'),
  validate({ query: customerQuerySchema }),
  async (request, response) => {
    respondSuccess(request, response, {
      customers: await listCustomers(
        tenantOf(request).organizationId,
        validatedQuery<CustomerQuery>(request),
      ),
    });
  },
);

customersRouter.post(
  '/',
  authenticate,
  withTenant,
  requirePermission('customers.manage'),
  requireCsrf,
  validate({ body: createCustomerRequestSchema }),
  async (request, response) => {
    const customer = await createCustomer(
      tenantOf(request).organizationId,
      validatedBody<CustomerRequest>(request),
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { customer }, 201);
  },
);

customersRouter.get(
  '/:id',
  authenticate,
  withTenant,
  requirePermission('customers.read'),
  validate({ params: idParamsSchema }),
  async (request, response) => {
    const customer = await customerDetailOf(
      tenantOf(request).organizationId,
      validatedParams<IdParams>(request).id,
    );

    respondSuccess(request, response, { customer });
  },
);

customersRouter.patch(
  '/:id',
  authenticate,
  withTenant,
  requirePermission('customers.manage'),
  requireCsrf,
  validate({ params: idParamsSchema, body: updateCustomerRequestSchema }),
  async (request, response) => {
    const customer = await updateCustomer(
      tenantOf(request).organizationId,
      validatedParams<IdParams>(request).id,
      validatedBody<UpdateCustomerRequest>(request),
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { customer });
  },
);

customersRouter.get(
  '/:id/notes',
  authenticate,
  withTenant,
  requirePermission('customers.read'),
  validate({ params: idParamsSchema }),
  async (request, response) => {
    respondSuccess(request, response, {
      notes: await listCustomerNotes(
        tenantOf(request).organizationId,
        validatedParams<IdParams>(request).id,
      ),
    });
  },
);

customersRouter.post(
  '/:id/notes',
  authenticate,
  withTenant,
  requirePermission('customers.manage'),
  requireCsrf,
  validate({ params: idParamsSchema, body: createCustomerNoteRequestSchema }),
  async (request, response) => {
    const note = await createCustomerNote(
      tenantOf(request).organizationId,
      validatedParams<IdParams>(request).id,
      validatedBody<CreateCustomerNoteRequest>(request),
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { note }, 201);
  },
);
