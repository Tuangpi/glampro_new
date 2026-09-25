import { z } from 'zod';

export const platformRoles = ['USER', 'PLATFORM_ADMIN'] as const;
export const membershipRoles = [
  'ORG_OWNER',
  'ORG_ADMIN',
  'MANAGER',
  'RECEPTIONIST',
  'STAFF',
] as const;
export const membershipStatuses = ['INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED'] as const;
export const organizationStatuses = [
  'TRIAL',
  'ACTIVE',
  'PAST_DUE',
  'SUSPENDED',
  'CANCELLED',
] as const;
export const subscriptionStatuses = [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'PAUSED',
  'CANCELLED',
  'INCOMPLETE',
] as const;

export const platformOrganizationActions = ['SUSPEND', 'ACTIVATE', 'CANCEL'] as const;
export const platformSubscriptionActions = ['PAUSE', 'RESUME', 'CANCEL'] as const;

export const platformRoleSchema = z.enum(platformRoles);
export const membershipRoleSchema = z.enum(membershipRoles);
export const membershipStatusSchema = z.enum(membershipStatuses);
export const organizationStatusSchema = z.enum(organizationStatuses);
export const subscriptionStatusSchema = z.enum(subscriptionStatuses);
export const platformOrganizationActionSchema = z.enum(platformOrganizationActions);
export const platformSubscriptionActionSchema = z.enum(platformSubscriptionActions);

export const organizationSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  status: organizationStatusSchema,
  currency: z.string().length(3),
  timezone: z.string().min(1),
});

export const membershipSummarySchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  role: membershipRoleSchema,
  status: membershipStatusSchema,
  organization: organizationSummarySchema,
});

export const locationSummarySchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  name: z.string().min(1),
  code: z.string().min(1),
  timezone: z.string().min(1),
  currency: z.string().length(3),
  isActive: z.boolean(),
});

export type PlatformRole = z.infer<typeof platformRoleSchema>;
export type MembershipRole = z.infer<typeof membershipRoleSchema>;
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;
export type OrganizationStatus = z.infer<typeof organizationStatusSchema>;
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;
export type PlatformOrganizationAction = z.infer<typeof platformOrganizationActionSchema>;
export type PlatformSubscriptionAction = z.infer<typeof platformSubscriptionActionSchema>;
export type OrganizationSummary = z.infer<typeof organizationSummarySchema>;
export type MembershipSummary = z.infer<typeof membershipSummarySchema>;
export type LocationSummary = z.infer<typeof locationSummarySchema>;
