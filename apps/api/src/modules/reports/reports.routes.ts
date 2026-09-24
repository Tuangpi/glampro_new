import { Router } from 'express';
import { dashboardQuerySchema, reportQuerySchema } from '@glampro/contracts';
import type { DashboardQuery, ReportQuery } from '@glampro/contracts';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantOf, withTenant } from '../../middleware/tenant.js';
import { validate, validatedQuery } from '../../middleware/validate.js';
import { respondSuccess } from '../../shared/http/response.js';
import { requirePermission } from '../auth/authorization.js';
import {
  appointmentReport,
  dashboardFor,
  paymentReport,
  revenueReport,
  staffReport,
} from './reports.service.js';

const reportingGate = [authenticate, withTenant, requirePermission('reports.view')] as const;

export const dashboardRouter = Router();

dashboardRouter.get(
  '/',
  ...reportingGate,
  validate({ query: dashboardQuerySchema }),
  async (request, response) => {
    const query = validatedQuery<DashboardQuery>(request);
    respondSuccess(request, response, {
      dashboard: await dashboardFor(tenantOf(request).organizationId, query.locationId, query.date),
    });
  },
);

export const reportsRouter = Router();

const addReportRoute = (
  path: string,
  load: (organizationId: string, query: ReportQuery) => Promise<unknown>,
  key: string,
) => {
  reportsRouter.get(
    path,
    ...reportingGate,
    validate({ query: reportQuerySchema }),
    async (request, response) => {
      const query = validatedQuery<ReportQuery>(request);
      respondSuccess(request, response, {
        [key]: await load(tenantOf(request).organizationId, query),
      });
    },
  );
};

addReportRoute(
  '/revenue',
  (organizationId, query) => revenueReport(organizationId, query.locationId, query.from, query.to),
  'revenue',
);
addReportRoute(
  '/appointments',
  (organizationId, query) =>
    appointmentReport(organizationId, query.locationId, query.from, query.to),
  'appointments',
);
addReportRoute(
  '/payments',
  (organizationId, query) => paymentReport(organizationId, query.locationId, query.from, query.to),
  'payments',
);
addReportRoute(
  '/staff',
  (organizationId, query) => staffReport(organizationId, query.locationId, query.from, query.to),
  'staff',
);
