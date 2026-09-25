import { z } from 'zod';
import { apiEnvelopeSchema } from './api.js';
import { subscriptionStatusSchema } from './organization.js';

const idSchema = z.string().trim().min(1).max(64);
const nullableDate = z.iso.datetime().nullable();

/** The tenant-safe view of a subscription. Stripe identifiers are never sent to salon users. */
export const subscriptionSummarySchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  provider: z.string().min(1),
  planCode: z.string().min(1),
  status: subscriptionStatusSchema,
  trialEndsAt: nullableDate,
  currentPeriodStartsAt: nullableDate,
  currentPeriodEndsAt: nullableDate,
  cancelledAt: nullableDate,
  hasStripeCustomer: z.boolean(),
  hasStripeSubscription: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const billingSummarySchema = z.object({
  subscription: subscriptionSummarySchema.nullable(),
  stripeConfigured: z.boolean(),
  checkoutEnabled: z.boolean(),
  customerPortalEnabled: z.boolean(),
  organizationStatus: z.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED']),
});

export const checkoutDataSchema = z.object({
  sessionId: z.string().min(1),
  checkoutUrl: z.string().url(),
});

export const customerPortalDataSchema = z.object({
  sessionId: z.string().min(1),
  portalUrl: z.string().url(),
});

export const billingSummaryResponseSchema = apiEnvelopeSchema(billingSummarySchema);
export const checkoutResponseSchema = apiEnvelopeSchema(checkoutDataSchema);
export const customerPortalResponseSchema = apiEnvelopeSchema(customerPortalDataSchema);

export type SubscriptionSummary = z.infer<typeof subscriptionSummarySchema>;
export type BillingSummary = z.infer<typeof billingSummarySchema>;
export type CheckoutData = z.infer<typeof checkoutDataSchema>;
export type CustomerPortalData = z.infer<typeof customerPortalDataSchema>;
