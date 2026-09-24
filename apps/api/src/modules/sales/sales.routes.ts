import { Router } from 'express';
import { z } from 'zod';
import {
  createSaleRefundRequestSchema,
  createSaleRequestSchema,
  saleQuerySchema,
  voidSaleRequestSchema,
} from '@glampro/contracts';
import type {
  CreateSaleRefundRequest,
  CreateSaleRequest,
  SaleQuery,
  VoidSaleRequest,
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
import { createSale, listSales, refundSale, saleDetailOf, voidSale } from './sales.service.js';

export const salesRouter = Router();

const idParamsSchema = z.object({ id: z.string().trim().min(1).max(64) });
type IdParams = { id: string };

salesRouter.get(
  '/',
  authenticate,
  withTenant,
  requirePermission('sales.read'),
  validate({ query: saleQuerySchema }),
  async (request, response) => {
    respondSuccess(request, response, {
      sales: await listSales(tenantOf(request).organizationId, validatedQuery<SaleQuery>(request)),
    });
  },
);

salesRouter.get(
  '/:id',
  authenticate,
  withTenant,
  requirePermission('sales.read'),
  validate({ params: idParamsSchema }),
  async (request, response) => {
    respondSuccess(request, response, {
      sale: await saleDetailOf(
        tenantOf(request).organizationId,
        validatedParams<IdParams>(request).id,
      ),
    });
  },
);

salesRouter.post(
  '/',
  authenticate,
  withTenant,
  requirePermission('sales.create'),
  requireCsrf,
  validate({ body: createSaleRequestSchema }),
  async (request, response) => {
    const sale = await createSale(
      tenantOf(request).organizationId,
      validatedBody<CreateSaleRequest>(request),
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { sale }, 201);
  },
);

salesRouter.post(
  '/:id/void',
  authenticate,
  withTenant,
  requirePermission('sales.void'),
  requireCsrf,
  validate({ params: idParamsSchema, body: voidSaleRequestSchema }),
  async (request, response) => {
    const input = validatedBody<VoidSaleRequest>(request);
    const sale = await voidSale(
      tenantOf(request).organizationId,
      validatedParams<IdParams>(request).id,
      input.reason,
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { sale });
  },
);

salesRouter.post(
  '/:id/refunds',
  authenticate,
  withTenant,
  requirePermission('sales.refund'),
  requireCsrf,
  validate({ params: idParamsSchema, body: createSaleRefundRequestSchema }),
  async (request, response) => {
    const sale = await refundSale(
      tenantOf(request).organizationId,
      validatedParams<IdParams>(request).id,
      validatedBody<CreateSaleRefundRequest>(request),
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { sale });
  },
);
