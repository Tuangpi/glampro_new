import { z } from 'zod';
import { apiEnvelopeSchema } from './api.js';
import {
  organizationStatusSchema,
  platformOrganizationActionSchema,
  platformSubscriptionActionSchema,
  subscriptionStatusSchema,
} from './organization.js';
import { subscriptionSummarySchema } from './billing.js';

const idSchema = z.string().trim().min(1).max(64);

export const platformOrganizationQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  status: organizationStatusSchema.optional(),
  subscriptionStatus: subscriptionStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const platformOrganizationActionRequestSchema = z.object({
  action: platformOrganizationActionSchema,
  reason: z.string().trim().min(2).max(500),
});

export const platformSubscriptionActionRequestSchema = z.object({
  action: platformSubscriptionActionSchema,
  reason: z.string().trim().min(2).max(500),
});

export const platformOrganizationSummarySchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  slug: z.string().min(1),
  status: organizationStatusSchema,
  currency: z.string().length(3),
  timezone: z.string().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  memberCount: z.number().int().nonnegative(),
  activeLocationCount: z.number().int().nonnegative(),
  subscription: subscriptionSummarySchema.nullable(),
});

export const platformOrganizationPageSchema = z.object({
  organizations: z.array(platformOrganizationSummarySchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export const platformOverviewSchema = z.object({
  organizations: z.object({
    total: z.number().int().nonnegative(),
    trial: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    pastDue: z.number().int().nonnegative(),
    suspended: z.number().int().nonnegative(),
    cancelled: z.number().int().nonnegative(),
  }),
  subscriptions: z.object({
    trialing: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    pastDue: z.number().int().nonnegative(),
    paused: z.number().int().nonnegative(),
    incomplete: z.number().int().nonnegative(),
    cancelled: z.number().int().nonnegative(),
  }),
  recentOrganizations: z.array(platformOrganizationSummarySchema),
});

export const platformOrganizationActionDataSchema = z.object({
  organization: platformOrganizationSummarySchema,
});

export const platformSubscriptionActionDataSchema = z.object({
  subscription: subscriptionSummarySchema.nullable(),
});

export const platformOverviewResponseSchema = apiEnvelopeSchema(platformOverviewSchema);
export const platformOrganizationsResponseSchema = apiEnvelopeSchema(
  platformOrganizationPageSchema,
);
export const platformOrganizationActionResponseSchema = apiEnvelopeSchema(
  platformOrganizationActionDataSchema,
);
export const platformSubscriptionActionResponseSchema = apiEnvelopeSchema(
  platformSubscriptionActionDataSchema,
);

export type PlatformOrganizationQuery = z.infer<typeof platformOrganizationQuerySchema>;
export type PlatformOrganizationActionRequest = z.infer<
  typeof platformOrganizationActionRequestSchema
>;
export type PlatformSubscriptionActionRequest = z.infer<
  typeof platformSubscriptionActionRequestSchema
>;
export type PlatformOrganizationSummary = z.infer<typeof platformOrganizationSummarySchema>;
export type PlatformOrganizationPage = z.infer<typeof platformOrganizationPageSchema>;
export type PlatformOverview = z.infer<typeof platformOverviewSchema>;
