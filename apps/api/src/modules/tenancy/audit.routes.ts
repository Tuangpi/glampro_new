import { Router } from 'express';
import { auditLogQuerySchema } from '@glampro/contracts';
import type { AuditLogQuery } from '@glampro/contracts';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantOf, withTenant } from '../../middleware/tenant.js';
import { validate, validatedQuery } from '../../middleware/validate.js';
import { respondSuccess } from '../../shared/http/response.js';
import { requirePermission } from '../auth/authorization.js';
import { listAuditEntries } from './audit.service.js';

export const auditRouter = Router();

auditRouter.get(
  '/',
  authenticate,
  withTenant,
  requirePermission('audit.read'),
  validate({ query: auditLogQuerySchema }),
  async (request, response) => {
    const page = await listAuditEntries(
      tenantOf(request).organizationId,
      validatedQuery<AuditLogQuery>(request),
    );

    respondSuccess(request, response, page);
  },
);
