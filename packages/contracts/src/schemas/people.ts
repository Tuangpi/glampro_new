import { z } from 'zod';
import { apiEnvelopeSchema } from './api.js';
import { emailSchema } from './auth.js';
import { membershipRoleSchema, membershipStatusSchema } from './organization.js';
import { serviceSummarySchema, timeOfDaySchema } from './tenancy.js';

/**
 * Customers and staff contracts.
 *
 * A customer is a tenant-scoped profile: email, phone, and member number are
 * unique per organization when present, so two tenants can record the same
 * person without clashing. A staff profile is the salon-operational record for
 * one organization member — one profile per membership — so a person's name and
 * email stay on `User` rather than being copied here.
 *
 * Pricing is deliberately absent: services carry their own price in the catalog,
 * and visit history is derived from appointments and sales in later milestones.
 */

export const customerGenders = ['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED'] as const;

export const customerGenderSchema = z.enum(customerGenders);

/** Name, phone, and member-number fields mirror the Customer column widths. */
export const customerFirstNameSchema = z.string().trim().min(1).max(80);
export const customerLastNameSchema = z.string().trim().max(80);
export const customerPhoneSchema = z.string().trim().max(40);
export const customerMemberNumberSchema = z.string().trim().max(40);

/** Date-only values travel as `YYYY-MM-DD`, matching the `DATE` columns. */
export const dateOnlySchema = z.iso.date();

export const createCustomerRequestSchema = z.object({
  firstName: customerFirstNameSchema,
  lastName: customerLastNameSchema.nullish(),
  email: emailSchema.nullish(),
  phone: customerPhoneSchema.nullish(),
  dateOfBirth: dateOnlySchema.nullish(),
  gender: customerGenderSchema.nullish(),
  addressLine1: z.string().trim().max(200).nullish(),
  addressLine2: z.string().trim().max(200).nullish(),
  city: z.string().trim().max(100).nullish(),
  postalCode: z.string().trim().max(30).nullish(),
  countryCode: z.string().trim().length(2).optional(),
  memberNumber: customerMemberNumberSchema.nullish(),
  isActive: z.boolean().default(true),
});

/** Partial update: an explicit `null` clears an optional detail. */
export const updateCustomerRequestSchema = z
  .object({
    firstName: customerFirstNameSchema.optional(),
    lastName: customerLastNameSchema.nullish(),
    email: emailSchema.nullish(),
    phone: customerPhoneSchema.nullish(),
    dateOfBirth: dateOnlySchema.nullish(),
    gender: customerGenderSchema.nullish(),
    addressLine1: z.string().trim().max(200).nullish(),
    addressLine2: z.string().trim().max(200).nullish(),
    city: z.string().trim().max(100).nullish(),
    postalCode: z.string().trim().max(30).nullish(),
    countryCode: z.string().trim().length(2).optional(),
    memberNumber: customerMemberNumberSchema.nullish(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to update',
  });

/** `q` matches against name, email, phone, and member number. */
export const customerQuerySchema = z.object({
  q: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  isActive: z.stringbool().optional(),
});

export const createCustomerNoteRequestSchema = z.object({
  body: z.string().trim().min(1).max(1000),
});

export const customerSummarySchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  dateOfBirth: dateOnlySchema.nullable(),
  gender: customerGenderSchema.nullable(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  countryCode: z.string().length(2),
  memberNumber: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** The note author is null once the user is removed, so the timeline survives. */
export const customerNoteAuthorSchema = z.object({
  id: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().min(1),
});

export const customerNoteSummarySchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  customerId: z.string().min(1),
  body: z.string().min(1),
  createdAt: z.iso.datetime(),
  author: customerNoteAuthorSchema.nullable(),
});

/** The detail shape adds the notes timeline the customer screen renders. */
export const customerDetailSchema = customerSummarySchema.extend({
  notes: z.array(customerNoteSummarySchema),
});

export const customersDataSchema = z.object({ customers: z.array(customerSummarySchema) });
export const customerDataSchema = z.object({ customer: customerSummarySchema });
export const customerDetailDataSchema = z.object({ customer: customerDetailSchema });
export const customerNotesDataSchema = z.object({ notes: z.array(customerNoteSummarySchema) });
export const customerNoteDataSchema = z.object({ note: customerNoteSummarySchema });

export type CustomerGender = z.infer<typeof customerGenderSchema>;
export type CustomerSummary = z.infer<typeof customerSummarySchema>;
export type CustomerDetail = z.infer<typeof customerDetailSchema>;
export type CustomerRequest = z.infer<typeof createCustomerRequestSchema>;
export type UpdateCustomerRequest = z.infer<typeof updateCustomerRequestSchema>;
export type CustomerQuery = z.infer<typeof customerQuerySchema>;
export type CustomerNoteSummary = z.infer<typeof customerNoteSummarySchema>;
export type CreateCustomerNoteRequest = z.infer<typeof createCustomerNoteRequestSchema>;

/**
 * Staff: one profile per organization membership. `POST /staff` names an
 * existing membership, so onboarding a person stays in Settings → Members and
 * the profile only adds what the roster needs.
 */

export const staffColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Use a hex colour such as #6144E4');

export const staffMemberSchema = z.object({
  membershipId: z.string().min(1),
  role: membershipRoleSchema,
  status: membershipStatusSchema,
  userId: z.string().min(1),
  email: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  avatarUrl: z.string().nullable(),
});

/** `membershipId` is fixed at creation; a profile never moves between members. */
export const createStaffProfileRequestSchema = z
  .object({
    membershipId: z.string().trim().min(1).max(64),
    displayName: z.string().trim().max(160).nullish(),
    jobTitle: z.string().trim().max(120).nullish(),
    bio: z.string().trim().max(500).nullish(),
    color: staffColorSchema.nullish(),
    isBookable: z.boolean().default(true),
    hireDate: dateOnlySchema.nullish(),
    endDate: dateOnlySchema.nullish(),
    isActive: z.boolean().default(true),
  })
  .refine(
    (value) => value.hireDate == null || value.endDate == null || value.endDate >= value.hireDate,
    { message: 'The end date cannot be before the hire date' },
  );

export const updateStaffProfileRequestSchema = z
  .object({
    displayName: z.string().trim().max(160).nullish(),
    jobTitle: z.string().trim().max(120).nullish(),
    bio: z.string().trim().max(500).nullish(),
    color: staffColorSchema.nullish(),
    isBookable: z.boolean().optional(),
    hireDate: dateOnlySchema.nullish(),
    endDate: dateOnlySchema.nullish(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to update',
  })
  .refine(
    (value) => value.hireDate == null || value.endDate == null || value.endDate >= value.hireDate,
    { message: 'The end date cannot be before the hire date' },
  );

export const staffQuerySchema = z.object({
  serviceId: z.string().trim().min(1).max(64).optional(),
  isActive: z.stringbool().optional(),
});

/** Replaces the whole assignment set, matching the schedule replacement style. */
export const replaceStaffServicesRequestSchema = z.object({
  serviceIds: z.array(z.string().trim().min(1).max(64)).max(200),
});

export const staffScheduleEntrySchema = z.object({
  /** 0 is Sunday, matching the `StaffSchedule.dayOfWeek` convention. */
  dayOfWeek: z.number().int().min(0).max(6),
  startsAt: timeOfDaySchema.nullable(),
  endsAt: timeOfDaySchema.nullable(),
  isWorking: z.boolean(),
});

/** A full week in one request, validated the same way as business hours. */
export const staffScheduleRequestSchema = z
  .object({ schedule: z.array(staffScheduleEntrySchema) })
  .refine(
    (value) =>
      value.schedule.length === 7 &&
      new Set(value.schedule.map((entry) => entry.dayOfWeek)).size === 7,
    { message: 'Provide exactly one entry for each weekday' },
  )
  .refine(
    (value) =>
      value.schedule.every(
        (entry) =>
          !entry.isWorking ||
          (entry.startsAt !== null && entry.endsAt !== null && entry.startsAt < entry.endsAt),
      ),
    { message: 'Working days need a start time before the end time' },
  );

export const staffTimeOffRequestSchema = z
  .object({
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    reason: z.string().trim().max(255).nullish(),
  })
  .refine((value) => value.startsAt < value.endsAt, {
    message: 'The end of the absence must be after its start',
  });

export const staffProfileSummarySchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  membershipId: z.string().min(1),
  displayName: z.string().nullable(),
  jobTitle: z.string().nullable(),
  bio: z.string().nullable(),
  color: z.string().nullable(),
  isBookable: z.boolean(),
  hireDate: dateOnlySchema.nullable(),
  endDate: dateOnlySchema.nullable(),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  member: staffMemberSchema,
});

export const staffScheduleSummarySchema = staffScheduleEntrySchema.extend({
  id: z.string().min(1),
});

export const staffTimeOffSummarySchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  staffProfileId: z.string().min(1),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  reason: z.string().nullable(),
  createdById: z.string().nullable(),
  createdBy: customerNoteAuthorSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** Everything the staff detail screen shows, in one response. */
export const staffProfileDetailSchema = staffProfileSummarySchema.extend({
  services: z.array(serviceSummarySchema),
  schedule: z.array(staffScheduleSummarySchema),
  timeOff: z.array(staffTimeOffSummarySchema),
});

export const staffProfilesDataSchema = z.object({
  staffProfiles: z.array(staffProfileSummarySchema),
});

/**
 * Members who can still join the roster: active memberships without a profile.
 * `staff.manage` does not imply `members.manage`, so the screen cannot read the
 * member list from Settings and asks the staff module instead.
 */
export const staffCandidatesDataSchema = z.object({ candidates: z.array(staffMemberSchema) });

export const staffProfileDataSchema = z.object({ staffProfile: staffProfileSummarySchema });
export const staffProfileDetailDataSchema = z.object({ staffProfile: staffProfileDetailSchema });
export const staffServicesDataSchema = z.object({ services: z.array(serviceSummarySchema) });
export const staffScheduleDataSchema = z.object({ schedule: z.array(staffScheduleSummarySchema) });
/** List of absence windows, and the single row returned by a create. */
export const staffTimeOffDataSchema = z.object({ timeOff: z.array(staffTimeOffSummarySchema) });
export const staffTimeOffEntryDataSchema = z.object({ timeOff: staffTimeOffSummarySchema });

export type StaffMember = z.infer<typeof staffMemberSchema>;
export type StaffCandidate = z.infer<typeof staffMemberSchema>;
export type StaffProfileSummary = z.infer<typeof staffProfileSummarySchema>;
export type StaffProfileDetail = z.infer<typeof staffProfileDetailSchema>;
export type StaffProfileRequest = z.infer<typeof createStaffProfileRequestSchema>;
export type UpdateStaffProfileRequest = z.infer<typeof updateStaffProfileRequestSchema>;
export type StaffQuery = z.infer<typeof staffQuerySchema>;
export type ReplaceStaffServicesRequest = z.infer<typeof replaceStaffServicesRequestSchema>;
export type StaffScheduleEntry = z.infer<typeof staffScheduleEntrySchema>;
export type StaffScheduleSummary = z.infer<typeof staffScheduleSummarySchema>;
export type StaffScheduleRequest = z.infer<typeof staffScheduleRequestSchema>;
export type StaffTimeOffSummary = z.infer<typeof staffTimeOffSummarySchema>;
export type StaffTimeOffRequest = z.infer<typeof staffTimeOffRequestSchema>;

export const customersResponseSchema = apiEnvelopeSchema(customersDataSchema);
export const customerResponseSchema = apiEnvelopeSchema(customerDataSchema);
export const customerDetailResponseSchema = apiEnvelopeSchema(customerDetailDataSchema);
export const customerNotesResponseSchema = apiEnvelopeSchema(customerNotesDataSchema);
export const customerNoteResponseSchema = apiEnvelopeSchema(customerNoteDataSchema);
export const staffProfilesResponseSchema = apiEnvelopeSchema(staffProfilesDataSchema);
export const staffCandidatesResponseSchema = apiEnvelopeSchema(staffCandidatesDataSchema);
export const staffProfileResponseSchema = apiEnvelopeSchema(staffProfileDataSchema);
export const staffProfileDetailResponseSchema = apiEnvelopeSchema(staffProfileDetailDataSchema);
export const staffServicesResponseSchema = apiEnvelopeSchema(staffServicesDataSchema);
export const staffScheduleResponseSchema = apiEnvelopeSchema(staffScheduleDataSchema);
export const staffTimeOffResponseSchema = apiEnvelopeSchema(staffTimeOffDataSchema);
export const staffTimeOffEntryResponseSchema = apiEnvelopeSchema(staffTimeOffEntryDataSchema);
