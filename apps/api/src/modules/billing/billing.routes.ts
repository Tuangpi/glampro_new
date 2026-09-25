import { Router, type Request, type Response } from 'express';
import { authenticate, authenticationOf } from '../../middleware/authenticate.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { tenantOf, withTenantForBilling } from '../../middleware/tenant.js';
import { auditContextFromRequest } from '../../shared/audit.js';
import { AppError } from '../../shared/http/app-error.js';
import { respondSuccess } from '../../shared/http/response.js';
import { requirePermission } from '../auth/authorization.js';
import {
  constructStripeEvent,
  createCheckoutSession,
  createCustomerPortalSession,
  getBillingSummary,
  processStripeEvent,
} from './billing.service.js';

export const billingRouter = Router();

billingRouter.get(
  '/',
  authenticate,
  withTenantForBilling,
  requirePermission('billing.manage'),
  async (request, response) => {
    respondSuccess(request, response, await getBillingSummary(tenantOf(request).organizationId));
  },
);

billingRouter.post(
  '/checkout',
  authenticate,
  withTenantForBilling,
  requirePermission('billing.manage'),
  requireCsrf,
  async (request, response) => {
    const tenant = tenantOf(request);
    respondSuccess(
      request,
      response,
      await createCheckoutSession(
        tenant.organizationId,
        authenticationOf(request).userId,
        auditContextFromRequest(request),
      ),
    );
  },
);

billingRouter.post(
  '/portal',
  authenticate,
  withTenantForBilling,
  requirePermission('billing.manage'),
  requireCsrf,
  async (request, response) => {
    const tenant = tenantOf(request);
    respondSuccess(
      request,
      response,
      await createCustomerPortalSession(
        tenant.organizationId,
        authenticationOf(request).userId,
        auditContextFromRequest(request),
      ),
    );
  },
);

/** Mounted separately before express.json() so Stripe sees the exact raw payload. */
export const stripeWebhookHandler = async (request: Request, response: Response) => {
  const signature = request.header('stripe-signature');
  if (!signature) {
    throw new AppError(400, 'STRIPE_SIGNATURE_INVALID', 'Stripe webhook signature is required');
  }

  if (!Buffer.isBuffer(request.body)) {
    throw new AppError(400, 'STRIPE_SIGNATURE_INVALID', 'Stripe webhook body is invalid');
  }

  const event = constructStripeEvent(request.body, signature);
  const result = await processStripeEvent(event, auditContextFromRequest(request));
  respondSuccess(request, response, { received: true, duplicate: result.duplicate });
};
