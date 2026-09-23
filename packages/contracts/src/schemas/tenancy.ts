import { z } from 'zod';
import { apiEnvelopeSchema } from './api.js';
import { emailSchema } from './auth.js';
import {
  locationSummarySchema,
  membershipRoleSchema,
  membershipStatusSchema,
  membershipSummarySchema,
  organizationStatusSchema,
} from './organization.js';

export const invitationStatuses = ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'] as const;
export const auditActorTypes = ['USER', 'PLATFORM_ADMIN', 'SYSTEM', 'WEBHOOK'] as const;
/** Status transitions a membership accepts after it exists; `INVITED` is reached only through acceptance. */
export const memberStatusActions = ['ACTIVE', 'SUSPENDED', 'REMOVED'] as const;

export const invitationStatusSchema = z.enum(invitationStatuses);
export const auditActorTypeSchema = z.enum(auditActorTypes);
export const memberStatusActionSchema = z.enum(memberStatusActions);

/** 24-hour wall-clock time as stored in `BusinessHour`, for example `09:00`. */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour HH:MM time');

export const businessHourSchema = z.object({
  /** 0 is Sunday, matching the `BusinessHour.dayOfWeek` convention. */
  dayOfWeek: z.number().int().min(0).max(6),
  opensAt: timeOfDaySchema.nullable(),
  closesAt: timeOfDaySchema.nullable(),
  isClosed: z.boolean(),
});

export const updateOrganizationRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    legalName: z.string().trim().max(200).nullish(),
    registrationNumber: z.string().trim().max(80).nullish(),
    gstRegistrationNumber: z.string().trim().max(80).nullish(),
    defaultTimezone: z.string().trim().min(1).max(100).optional(),
    logoUrl: z.string().trim().max(500).nullish(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to update',
  });

const locationCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(30)
  .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers, and hyphens');

const receiptPrefixSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9]+$/, 'Use letters and numbers only');

const locationDetailFields = {
  name: z.string().trim().min(2).max(160).optional(),
  code: locationCodeSchema.optional(),
  phone: z.string().trim().max(40).nullish(),
  email: emailSchema.nullish(),
  addressLine1: z.string().trim().max(200).nullish(),
  addressLine2: z.string().trim().max(200).nullish(),
  city: z.string().trim().max(100).nullish(),
  postalCode: z.string().trim().max(30).nullish(),
  countryCode: z.string().trim().length(2).optional(),
  timezone: z.string().trim().min(1).max(100).optional(),
  pricesIncludeTax: z.boolean().optional(),
  receiptPrefix: receiptPrefixSchema.optional(),
  isActive: z.boolean().optional(),
};

export const createLocationRequestSchema = z.object({
  name: z.string().trim().min(2).max(160),
  code: locationCodeSchema.optional(),
  phone: locationDetailFields.phone,
  email: locationDetailFields.email,
  addressLine1: locationDetailFields.addressLine1,
  addressLine2: locationDetailFields.addressLine2,
  city: locationDetailFields.city,
  postalCode: locationDetailFields.postalCode,
  countryCode: locationDetailFields.countryCode,
  timezone: locationDetailFields.timezone,
  pricesIncludeTax: locationDetailFields.pricesIncludeTax,
  receiptPrefix: locationDetailFields.receiptPrefix,
});

/**
 * Currency, receipt counters, and organization scope are deliberately absent:
 * the sale transaction owns `nextReceiptNumber`, and currency changes are not
 * part of tenancy administration.
 */
export const updateLocationRequestSchema = z
  .object(locationDetailFields)
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to update',
  });

export const businessHoursRequestSchema = z
  .object({ hours: z.array(businessHourSchema) })
  .refine(
    (value) =>
      value.hours.length === 7 && new Set(value.hours.map((hour) => hour.dayOfWeek)).size === 7,
    { message: 'Provide exactly one entry for each weekday' },
  )
  .refine(
    (value) =>
      value.hours.every(
        (hour) =>
          hour.isClosed ||
          (hour.opensAt !== null && hour.closesAt !== null && hour.opensAt < hour.closesAt),
      ),
    { message: 'Open days need an opening time before the closing time' },
  );

export const inviteMemberRequestSchema = z.object({
  email: emailSchema,
  role: membershipRoleSchema,
});

export const changeMemberRoleRequestSchema = z.object({
  role: membershipRoleSchema,
});

export const changeMemberStatusRequestSchema = z.object({
  status: memberStatusActionSchema,
});

export const acceptInvitationRequestSchema = z.object({
  token: z.string().trim().min(1).max(512),
});

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const organizationSettingsSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  status: organizationStatusSchema,
  legalName: z.string().nullable(),
  registrationNumber: z.string().nullable(),
  gstRegistrationNumber: z.string().nullable(),
  defaultCurrency: z.string().length(3),
  defaultTimezone: z.string().min(1),
  logoUrl: z.string().nullable(),
});

export const locationDetailSchema = locationSummarySchema.extend({
  phone: z.string().nullable(),
  email: z.string().nullable(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  countryCode: z.string().length(2),
  pricesIncludeTax: z.boolean(),
  receiptPrefix: z.string().min(1),
  nextReceiptNumber: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const memberSummarySchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  role: membershipRoleSchema,
  status: membershipStatusSchema,
  joinedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  isSelf: z.boolean(),
  user: z.object({
    id: z.string().min(1),
    email: z.string().min(1),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    avatarUrl: z.string().nullable(),
  }),
});

export const invitationSummarySchema = z.object({
  id: z.string().min(1),
  email: z.string().min(1),
  role: membershipRoleSchema,
  status: invitationStatusSchema,
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  invitedBy: z.object({
    id: z.string().min(1),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
  }),
});

export const auditLogEntrySchema = z.object({
  id: z.string().min(1),
  action: z.string().min(1),
  actorType: auditActorTypeSchema,
  actorUserId: z.string().nullable(),
  actor: z
    .object({
      id: z.string().min(1),
      email: z.string().min(1),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
    })
    .nullable(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  requestId: z.string().nullable(),
  ipAddress: z.string().nullable(),
  createdAt: z.iso.datetime(),
  metadata: z.unknown(),
});

export const auditLogPageSchema = z.object({
  items: z.array(auditLogEntrySchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export const locationsDataSchema = z.object({ locations: z.array(locationDetailSchema) });
export const locationDataSchema = z.object({ location: locationDetailSchema });
export const businessHoursDataSchema = z.object({ hours: z.array(businessHourSchema) });
export const membersDataSchema = z.object({ members: z.array(memberSummarySchema) });
export const memberDataSchema = z.object({ member: memberSummarySchema });
export const invitationsDataSchema = z.object({ invitations: z.array(invitationSummarySchema) });
export const invitationDataSchema = z.object({ invitation: invitationSummarySchema });
export const acceptedInvitationDataSchema = z.object({ membership: membershipSummarySchema });

export const organizationSettingsResponseSchema = apiEnvelopeSchema(organizationSettingsSchema);
export const locationsResponseSchema = apiEnvelopeSchema(locationsDataSchema);
export const locationResponseSchema = apiEnvelopeSchema(locationDataSchema);
export const businessHoursResponseSchema = apiEnvelopeSchema(businessHoursDataSchema);
export const membersResponseSchema = apiEnvelopeSchema(membersDataSchema);
export const memberResponseSchema = apiEnvelopeSchema(memberDataSchema);
export const invitationsResponseSchema = apiEnvelopeSchema(invitationsDataSchema);
export const invitationResponseSchema = apiEnvelopeSchema(invitationDataSchema);
export const acceptedInvitationResponseSchema = apiEnvelopeSchema(acceptedInvitationDataSchema);
export const auditLogResponseSchema = apiEnvelopeSchema(auditLogPageSchema);

export type InvitationStatus = z.infer<typeof invitationStatusSchema>;
export type MemberStatusAction = z.infer<typeof memberStatusActionSchema>;
export type BusinessHour = z.infer<typeof businessHourSchema>;
export type UpdateOrganizationRequest = z.infer<typeof updateOrganizationRequestSchema>;
export type CreateLocationRequest = z.infer<typeof createLocationRequestSchema>;
export type UpdateLocationRequest = z.infer<typeof updateLocationRequestSchema>;
export type BusinessHoursRequest = z.infer<typeof businessHoursRequestSchema>;
export type InviteMemberRequest = z.infer<typeof inviteMemberRequestSchema>;
export type ChangeMemberRoleRequest = z.infer<typeof changeMemberRoleRequestSchema>;
export type ChangeMemberStatusRequest = z.infer<typeof changeMemberStatusRequestSchema>;
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
export type OrganizationSettings = z.infer<typeof organizationSettingsSchema>;
export type LocationDetail = z.infer<typeof locationDetailSchema>;
export type MemberSummary = z.infer<typeof memberSummarySchema>;
export type InvitationSummary = z.infer<typeof invitationSummarySchema>;
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;
export type AuditLogPage = z.infer<typeof auditLogPageSchema>;
